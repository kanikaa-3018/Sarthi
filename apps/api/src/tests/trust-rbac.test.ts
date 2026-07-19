import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Db } from "mongodb";
import { assertBuyer, assertSeller, requireRole } from "../middleware/auth.js";
import { aggregateConfidenceScore } from "../services/confidenceScoring.js";
import { tokenHash } from "../services/crypto.js";
import { trustState } from "../services/domain.js";
import { assertSellerOwnsProduct, correctSellerMeasurement, createListingDraft, submitSellerDocument, submitSellerEvidence } from "../services/sellerOperations.js";

function dbWith(tables: Record<string, any[]>): Db {
  return {
    collection(name: string) {
      const rows = tables[name] ?? [];
      return {
        findOne(query: Record<string, unknown> = {}) {
          return Promise.resolve(rows.find((row) => matches(row, query)) ?? null);
        },
        find(query: Record<string, unknown> = {}) {
          const selected = rows.filter((row) => matches(row, query));
          return {
            sort() {
              return this;
            },
            limit() {
              return this;
            },
            project() {
              return this;
            },
            toArray() {
              return Promise.resolve(selected);
            }
          };
        },
        insertOne(document: Record<string, unknown>) {
          rows.push(document);
          return Promise.resolve({ acknowledged: true, insertedId: document._id ?? document.document_id ?? document.proof_id ?? document.fact_id });
        },
        updateOne(query: Record<string, unknown>, update: Record<string, any>) {
          const row = rows.find((item) => matches(item, query));
          if (row && update.$set) {
            Object.assign(row, update.$set);
          }
          return Promise.resolve({ acknowledged: true, matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0 });
        },
        updateMany(query: Record<string, unknown>, update: Record<string, any>) {
          const selected = rows.filter((item) => matches(item, query));
          if (update.$set) {
            selected.forEach((row) => Object.assign(row, update.$set));
          }
          return Promise.resolve({ acknowledged: true, matchedCount: selected.length, modifiedCount: selected.length });
        },
        countDocuments(query: Record<string, unknown> = {}) {
          return Promise.resolve(rows.filter((row) => matches(row, query)).length);
        }
      };
    }
  } as unknown as Db;
}

function matches(row: Record<string, any>, query: Record<string, any>) {
  return Object.entries(query).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "$gt" in expected) {
      return row[key] > expected.$gt;
    }
    if (expected && typeof expected === "object" && "$ne" in expected) {
      return row[key] !== expected.$ne;
    }
    if (expected && typeof expected === "object" && "$in" in expected) {
      return expected.$in.includes(row[key]);
    }
    return row[key] === expected;
  });
}

function operationalDb(overrides: Record<string, any> = {}) {
  return dbWith({
    sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
    seller_profiles: [{
      seller_id: "seller_a",
      verification_status: "verified",
      gst_status: "verified",
      kyc_status: "verified",
      ...overrides
    }],
    data_sources: [{
      source_id: "orders",
      status: "operational",
      last_synced_at: new Date().toISOString(),
      freshness_sla_hours: 24
    }]
  });
}

const product = {
  product_id: "product_a",
  seller_id: "seller_a"
};

const usefulEvidence = {
  evidence_strength: "strong",
  delivered_orders_90d: 42,
  return_rate: 0.08
};

describe("weighted confidence score", () => {
  it("uses sum(w_i * c_i) / sum(w_i) and floors the percentage", () => {
    const score = aggregateConfidenceScore([
      { key: "seller", label: "Seller", weight: 2, confidence: 0.5, rationale: "verified" },
      { key: "returns", label: "Returns", weight: 3, confidence: 0.8, rationale: "low returns" }
    ]);

    assert.equal(score.formula, "sum(w_i * c_i) / sum(w_i)");
    assert.equal(score.weight_sum, 5);
    assert.equal(score.score, 0.68);
    assert.equal(score.score_percent, 68);
  });

  it("clamps invalid confidence values and keeps every active signal weighted", () => {
    const score = aggregateConfidenceScore([
      { key: "low", label: "Low", weight: 0, confidence: -2, rationale: "bad input" },
      { key: "high", label: "High", weight: 2.4, confidence: 2, rationale: "bad input" }
    ]);

    assert.equal(score.weight_sum, 3);
    assert.equal(score.score_percent, 66);
    assert.deepEqual(score.items.map((item) => item.weight), [1, 2]);
    assert.deepEqual(score.items.map((item) => item.confidence), [0, 1]);
  });
});

describe("trust abstention gates", () => {
  it("blocks recommendation when a seller is restricted", async () => {
    const state = await trustState(operationalDb({ verification_status: "restricted" }), product, usefulEvidence);

    assert.equal(state.status, "seller_restricted");
    assert.equal(state.can_recommend, false);
    assert.equal(state.missing_data.includes("seller_verification"), true);
  });

  it("abstains when seller verification is still pending", async () => {
    const state = await trustState(operationalDb({ verification_status: "pending" }), product, usefulEvidence);

    assert.equal(state.status, "seller_verification_pending");
    assert.equal(state.can_recommend, false);
  });

  it("abstains when evidence sources are stale", async () => {
    const db = dbWith({
      sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
      seller_profiles: [{ seller_id: "seller_a", verification_status: "verified" }],
      data_sources: [{
        source_id: "orders",
        status: "operational",
        last_synced_at: new Date(Date.now() - 48 * 36e5).toISOString(),
        freshness_sla_hours: 1
      }]
    });
    const state = await trustState(db, product, usefulEvidence);

    assert.equal(state.status, "data_degraded");
    assert.equal(state.can_recommend, false);
  });

  it("keeps confidence low when order evidence is too small", async () => {
    const state = await trustState(operationalDb(), product, {
      evidence_strength: "weak",
      delivered_orders_90d: 4,
      return_rate: 0
    });

    assert.equal(state.status, "limited_evidence");
    assert.equal(state.can_recommend, false);
  });

  it("allows a cautious recommendation when returns are high but evidence exists", async () => {
    const state = await trustState(operationalDb(), product, {
      evidence_strength: "medium",
      delivered_orders_90d: 18,
      return_rate: 0.24
    });

    assert.equal(state.status, "specific_caution");
    assert.equal(state.can_recommend, true);
    assert.equal(state.confidence, "medium");
  });

  it("recommends when seller, source freshness, and SKU outcomes are usable", async () => {
    const state = await trustState(operationalDb(), product, usefulEvidence);

    assert.equal(state.status, "ready_to_buy");
    assert.equal(state.can_recommend, true);
    assert.equal(state.confidence, "high");
  });
});

describe("RBAC ownership checks", () => {
  it("stops unauthenticated role checks with 401 before route logic", async () => {
    await assert.rejects(
      () => requireRole(dbWith({ sessions: [], accounts: [] }), { headers: {} } as any, {} as any, "seller"),
      (error: any) => error.statusCode === 401 && /Authentication required/.test(error.message)
    );
  });

  it("stops wrong-role access with 403 before route logic", async () => {
    const token = "buyer-token";
    const db = dbWith({
      auth_sessions: [{
        token_hash: tokenHash(token),
        revoked_at: null,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        account_id: "acct_buyer"
      }],
      accounts: [{
        account_id: "acct_buyer",
        username: "buyer",
        display_name: "Buyer",
        role: "buyer",
        buyer_id: "buyer_asha",
        seller_id: null,
        disabled: 0
      }]
    });

    await assert.rejects(
      () => requireRole(db, { headers: { authorization: `Bearer ${token}` } } as any, {} as any, "seller"),
      (error: any) => error.statusCode === 403 && /seller role required/.test(error.message)
    );
  });

  it("allows a buyer to read only their own buyer scope", () => {
    assert.doesNotThrow(() => assertBuyer({ role: "buyer", buyer_id: "buyer_asha" }, "buyer_asha"));
  });

  it("rejects cross-buyer access", () => {
    assert.throws(
      () => assertBuyer({ role: "buyer", buyer_id: "buyer_asha" }, "buyer_neha"),
      (error: any) => error.statusCode === 403 && /another buyer/.test(error.message)
    );
  });

  it("allows a seller to read only their own seller scope", () => {
    assert.doesNotThrow(() => assertSeller({ role: "seller", seller_id: "seller_a" }, "seller_a"));
  });

  it("rejects cross-seller access", () => {
    assert.throws(
      () => assertSeller({ role: "seller", seller_id: "seller_a" }, "seller_b"),
      (error: any) => error.statusCode === 403 && /another seller/.test(error.message)
    );
  });

  it("prevents sellers from editing another seller's product", async () => {
    const db = dbWith({
      products: [{ product_id: "product_a", seller_id: "seller_a" }]
    });

    await assert.doesNotReject(() => assertSellerOwnsProduct(db, "seller_a", "product_a"));
    await assert.rejects(
      () => assertSellerOwnsProduct(db, "seller_b", "product_a"),
      (error: any) => error.statusCode === 403 && /another seller listing/.test(error.message)
    );
  });

  it("rejects a proof upload when the proof type does not match the buyer doubt", async () => {
    const db = dbWith({
      products: [{ product_id: "product_a", seller_id: "seller_a" }]
    });

    await assert.rejects(
      () => submitSellerEvidence(db, "seller_a", {
        product_id: "product_a",
        attribute: "size",
        proof_type: "daylight_photo",
        title: "Daylight color photo",
        description: "This proof tries to answer a size doubt with a color photo.",
        asset_url: "https://example.test/proof.jpg"
      }),
      (error: any) => error.statusCode === 400 && /measurement chart/.test(error.message)
    );
  });

  it("rejects unsupported seller proof asset references", async () => {
    const db = dbWith({
      products: [{ product_id: "product_a", seller_id: "seller_a" }]
    });

    await assert.rejects(
      () => submitSellerEvidence(db, "seller_a", {
        product_id: "product_a",
        attribute: "fabric",
        proof_type: "fabric_closeup",
        title: "Fabric close-up proof",
        description: "This fabric proof has a long enough seller explanation for review.",
        asset_url: "local-file-on-seller-laptop.jpg"
      }),
      (error: any) => error.statusCode === 400 && /asset/.test(error.message)
    );
  });

  it("rejects insecure seller proof URLs", async () => {
    const db = dbWith({
      products: [{ product_id: "product_a", seller_id: "seller_a" }]
    });

    await assert.rejects(
      () => submitSellerEvidence(db, "seller_a", {
        product_id: "product_a",
        attribute: "color",
        proof_type: "daylight_photo",
        title: "Daylight color proof",
        description: "This color proof has a long enough seller explanation for review.",
        asset_url: "http://example.test/proof.jpg"
      }),
      (error: any) => error.statusCode === 400 && /secure https/.test(error.message)
    );
  });

  it("rejects listing drafts without a real product image reference", async () => {
    await assert.rejects(
      () => createListingDraft(dbWith({}), "seller_a", {
        title: "Blue cotton kurti",
        category: "women_kurtis",
        garment_type: "kurti",
        fabric: "cotton",
        color_family: "blue",
        base_price: 459,
        image_url: "local-file-on-seller-laptop.jpg"
      }),
      (error: any) => error.statusCode === 400 && /Listing image/.test(error.message)
    );
  });

  it("rejects listing drafts with insecure product image URLs", async () => {
    await assert.rejects(
      () => createListingDraft(dbWith({}), "seller_a", {
        title: "Blue cotton kurti",
        category: "women_kurtis",
        garment_type: "kurti",
        fabric: "cotton",
        color_family: "blue",
        base_price: 459,
        image_url: "http://example.test/product.jpg"
      }),
      (error: any) => error.statusCode === 400 && /Listing image/.test(error.message)
    );
  });

  it("stores seller documents only after validating type, name, and file bytes", async () => {
    const file = Buffer.from("%PDF-1.4\nseller verification proof file\n%%EOF\n");
    const tables: Record<string, any[]> = {
      sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
      seller_profiles: [{ seller_id: "seller_a", verification_status: "pending" }],
      seller_applications: [],
      seller_verification_documents: [],
      listing_drafts: []
    };

    await submitSellerDocument(dbWith(tables), "seller_a", {
      document_type: "gst_certificate",
      reference: "  GSTIN12345  ",
      file_name: "gst-proof.pdf",
      mime_type: "application/pdf",
      content_base64: file.toString("base64")
    });

    const document = tables.seller_verification_documents[0];
    assert.equal(document.reference, "GSTIN12345");
    assert.equal(document.file_name, "gst-proof.pdf");
    assert.equal(document.file_size_bytes, file.length);
    assert.equal(document.sha256, crypto.createHash("sha256").update(file).digest("hex"));
  });

  it("rejects unsafe seller document uploads", async () => {
    const file = Buffer.from("%PDF-1.4\nseller verification proof file\n%%EOF\n");
    const db = dbWith({
      sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
      seller_profiles: [{ seller_id: "seller_a", verification_status: "pending" }],
      seller_applications: [],
      seller_verification_documents: [],
      listing_drafts: []
    });

    await assert.rejects(
      () => submitSellerDocument(db, "seller_a", {
        document_type: "gst_certificate",
        reference: "GSTIN12345",
        file_name: "../gst-proof.jpg",
        mime_type: "application/pdf",
        content_base64: file.toString("base64")
      }),
      (error: any) => error.statusCode === 400 && /file name/.test(error.message)
    );
  });

  it("persists seller measurement corrections as admin-review evidence", async () => {
    const tables: Record<string, any[]> = {
      products: [{ product_id: "product_a", seller_id: "seller_a", title: "Blue cotton kurti" }],
      skus: [
        { variant_id: "product_a_l", product_id: "product_a", size: "L" },
        { variant_id: "product_a_xl", product_id: "product_a", size: "XL" }
      ],
      seller_evidence_assets: [],
      proof_requests: [{ request_id: "proof_req_1", seller_id: "seller_a", product_id: "product_a", attribute: "size", status: "open" }],
      fact_records: []
    };
    const db = dbWith(tables);

    const result = await correctSellerMeasurement(db, "seller_a", "product_a", { l_chest: 38, xl_chest: 41 });

    assert.equal(result.status, "pending_evidence_review");
    assert.equal(result.resolved_open_requests, 1);
    assert.equal(tables.skus[0].chest_inches, 38);
    assert.equal(tables.skus[1].chest_inches, 41);
    assert.equal(tables.skus[0].measurement_status, "pending_admin_review");
    assert.equal(tables.seller_evidence_assets[0].proof_type, "measurement_chart");
    assert.equal(tables.seller_evidence_assets[0].status, "submitted");
    assert.equal(tables.proof_requests[0].status, "submitted");
    assert.equal(tables.fact_records[0].source_type, "seller_measurement_correction");
  });

  it("rejects invalid seller measurement corrections", async () => {
    const db = dbWith({
      products: [{ product_id: "product_a", seller_id: "seller_a" }]
    });

    await assert.rejects(
      () => correctSellerMeasurement(db, "seller_a", "product_a", { l_chest: 41, xl_chest: 40 }),
      (error: any) => error.statusCode === 400 && /XL chest/.test(error.message)
    );
  });
});
