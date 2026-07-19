import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import type { Db } from "mongodb";
import { assertBuyer, assertSeller, requireRole } from "../middleware/auth.js";
import { aggregateConfidenceScore } from "../services/confidenceScoring.js";
import { tokenHash } from "../services/crypto.js";
import { trustState } from "../services/domain.js";
import { approveListingDraft, approveSellerEvidenceAsset } from "../services/adminOperations.js";
import { markCheckoutOrderDelivered, recordOrderOutcome } from "../services/buyerOperations.js";
import { assertSellerOwnsProduct, correctSellerMeasurement, createListingDraft, submitListingDraft, submitSellerDocument, submitSellerEvidence, updateListingDraft } from "../services/sellerOperations.js";

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
        insertMany(documents: Array<Record<string, unknown>>) {
          rows.push(...documents);
          return Promise.resolve({ acknowledged: true, insertedCount: documents.length });
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

  it("blocks duplicate proof submissions while a matching proof is under review", async () => {
    const tables: Record<string, any[]> = {
      products: [{ product_id: "product_a", seller_id: "seller_a" }],
      seller_evidence_assets: [{
        proof_id: "proof_existing",
        seller_id: "seller_a",
        product_id: "product_a",
        attribute: "fabric",
        proof_type: "fabric_closeup",
        status: "submitted"
      }],
      proof_requests: [{ request_id: "proof_req_1", seller_id: "seller_a", product_id: "product_a", attribute: "fabric", status: "open" }],
      fact_records: []
    };

    await assert.rejects(
      () => submitSellerEvidence(dbWith(tables), "seller_a", {
        product_id: "product_a",
        attribute: "fabric",
        proof_type: "fabric_closeup",
        title: "Fabric close-up proof",
        description: "This fabric proof has a long enough seller explanation for review.",
        asset_url: "seeded://proofs/fabric-closeup.jpg"
      }),
      (error: any) => error.statusCode === 400 && /already with the reviewer/.test(error.message)
    );

    assert.equal(tables.seller_evidence_assets.length, 1);
    assert.equal(tables.proof_requests[0].status, "open");
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
        { variant_id: "product_a_l", product_id: "product_a", size: "L", chest_inches: 36 },
        { variant_id: "product_a_xl", product_id: "product_a", size: "XL", chest_inches: 39 }
      ],
      seller_evidence_assets: [],
      proof_requests: [{ request_id: "proof_req_1", seller_id: "seller_a", product_id: "product_a", attribute: "size", status: "open" }],
      fact_records: []
    };
    const db = dbWith(tables);

    const result = await correctSellerMeasurement(db, "seller_a", "product_a", { l_chest: 38, xl_chest: 41 });

    assert.equal(result.status, "pending_evidence_review");
    assert.equal(result.resolved_open_requests, 1);
    assert.equal(tables.skus[0].chest_inches, 36);
    assert.equal(tables.skus[1].chest_inches, 39);
    assert.equal(tables.skus[0].pending_chest_inches, 38);
    assert.equal(tables.skus[1].pending_chest_inches, 41);
    assert.equal(tables.skus[0].measurement_status, "pending_admin_review");
    assert.equal(tables.seller_evidence_assets[0].proof_type, "measurement_chart");
    assert.equal(tables.seller_evidence_assets[0].status, "submitted");
    assert.equal(tables.proof_requests[0].status, "submitted");
    assert.equal(tables.fact_records[0].source_type, "seller_measurement_correction");

    await approveSellerEvidenceAsset(db, adminAccount(), tables.seller_evidence_assets[0].proof_id, "Measurement chart is readable");
    assert.equal(tables.skus[0].chest_inches, 38);
    assert.equal(tables.skus[1].chest_inches, 41);
    assert.equal(tables.skus[0].pending_chest_inches, null);
    assert.equal(tables.skus[1].measurement_status, "verified");
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

  it("blocks a buyer from completing another buyer's expectation contract", async () => {
    const tables: Record<string, any[]> = {
      expectation_contracts: [{
        contract_id: "contract_a",
        buyer_id: "buyer_a",
        product_id: "product_a",
        variant_id: "variant_a",
        status: "active",
        order_status: "delivered_needs_feedback",
        outcome_order_id: null
      }],
      order_outcomes: [],
      fact_records: []
    };

    await assert.rejects(
      () => recordOrderOutcome(dbWith(tables), {
        buyer_id: "buyer_b",
        variant_id: "variant_a",
        status: "returned",
        return_reason: "too_small",
        contract_id: "contract_a"
      }),
      (error: any) => error.statusCode === 400 && /does not belong/.test(error.message)
    );

    assert.equal(tables.expectation_contracts[0].status, "active");
    assert.equal(tables.expectation_contracts[0].outcome_order_id, null);
    assert.equal(tables.order_outcomes.length, 0);
  });

  it("allows contract feedback only after delivery", async () => {
    const tables: Record<string, any[]> = {
      expectation_contracts: [{
        contract_id: "contract_a",
        buyer_id: "buyer_a",
        product_id: "product_a",
        variant_id: "variant_a",
        status: "active",
        order_status: "placed",
        checkout_order_id: "checkout_a",
        outcome_order_id: null
      }],
      order_outcomes: [],
      fact_records: []
    };

    await assert.rejects(
      () => recordOrderOutcome(dbWith(tables), {
        buyer_id: "buyer_a",
        variant_id: "variant_a",
        status: "delivered_kept",
        contract_id: "contract_a"
      }),
      (error: any) => error.statusCode === 400 && /after delivery/.test(error.message)
    );

    assert.equal(tables.expectation_contracts[0].status, "active");
    assert.equal(tables.order_outcomes.length, 0);
  });

  it("completes a delivered expectation contract once for the owning buyer", async () => {
    const tables: Record<string, any[]> = {
      buyers: [{ buyer_id: "buyer_a", joined_at: new Date(Date.now() - 60 * 86400000).toISOString(), fit_memory_enabled: false }],
      buyer_review_profiles: [],
      reviews: [],
      fit_memory: [],
      expectation_contracts: [{
        contract_id: "contract_a",
        buyer_id: "buyer_a",
        product_id: "product_a",
        variant_id: "variant_a",
        status: "active",
        order_status: "delivered_needs_feedback",
        outcome_order_id: null,
        fact_id: "fact_contract"
      }],
      order_outcomes: [],
      fact_records: []
    };

    const result = await recordOrderOutcome(dbWith(tables), {
      buyer_id: "buyer_a",
      variant_id: "variant_a",
      status: "delivered_kept",
      contract_id: "contract_a"
    });

    assert.equal(result.expectation_contract.status, "kept");
    assert.equal(result.expectation_contract.order_status, "feedback_submitted");
    assert.equal(tables.expectation_contracts[0].status, "kept");
    assert.equal(tables.order_outcomes.length, 1);

    await assert.rejects(
      () => recordOrderOutcome(dbWith(tables), {
        buyer_id: "buyer_a",
        variant_id: "variant_a",
        status: "returned",
        return_reason: "too_small",
        contract_id: "contract_a"
      }),
      (error: any) => error.statusCode === 400 && /already been completed/.test(error.message)
    );
  });

  it("moves placed checkout orders to delivered feedback before closing the contract", async () => {
    const tables: Record<string, any[]> = {
      buyers: [{ buyer_id: "buyer_a", joined_at: new Date(Date.now() - 60 * 86400000).toISOString(), fit_memory_enabled: false }],
      buyer_review_profiles: [],
      reviews: [],
      fit_memory: [],
      sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
      products: [{ product_id: "product_a", seller_id: "seller_a", title: "Blue cotton kurti", color_family: "blue" }],
      skus: [{ variant_id: "variant_a", product_id: "product_a", size: "XL", current_price: 459 }],
      expectation_contracts: [{
        contract_id: "contract_a",
        buyer_id: "buyer_a",
        product_id: "product_a",
        variant_id: "variant_a",
        status: "active",
        order_status: "placed",
        checkout_order_id: "checkout_a",
        outcome_order_id: null,
        placed_at: "2026-01-01T00:00:00.000Z",
        fact_id: "fact_contract"
      }],
      order_outcomes: [],
      fact_records: []
    };
    const db = dbWith(tables);

    const delivered = await markCheckoutOrderDelivered(db, "buyer_a", "contract_a");
    assert.equal(delivered.pending_feedback, 1);
    const deliveredOrder = delivered.orders[0];
    assert.ok(deliveredOrder);
    assert.equal(deliveredOrder.status, "delivered_needs_feedback");
    assert.equal(deliveredOrder.can_submit_outcome, true);

    await assert.rejects(
      () => markCheckoutOrderDelivered(db, "buyer_b", "contract_a"),
      (error: any) => error.statusCode === 404 && /not found/.test(error.message)
    );

    await recordOrderOutcome(db, {
      buyer_id: "buyer_a",
      variant_id: "variant_a",
      status: "delivered_kept",
      contract_id: "contract_a"
    });

    const closed = await markCheckoutOrderDelivered(db, "buyer_a", "contract_a").catch((error) => error);
    assert.equal(closed.statusCode, 400);
    assert.equal(tables.expectation_contracts[0].order_status, "feedback_submitted");
    assert.equal(tables.order_outcomes.length, 1);
  });

  it("does not publish listing drafts from unverified sellers", async () => {
    const tables: Record<string, any[]> = listingReviewTables({
      seller_profiles: [{ seller_id: "seller_a", verification_status: "pending" }]
    });

    await assert.rejects(
      () => approveListingDraft(dbWith(tables), adminAccount(), "draft_a", "Looks okay"),
      (error: any) => error.statusCode === 400 && /Seller verification/.test(error.message)
    );

    assert.equal(tables.products.length, 0);
    assert.equal(tables.skus.length, 0);
    assert.equal(tables.listing_drafts[0].status, "submitted");
  });

  it("publishes a submitted listing draft only for a verified seller", async () => {
    const tables: Record<string, any[]> = listingReviewTables();

    await approveListingDraft(dbWith(tables), adminAccount(), "draft_a", "Approved for catalog");

    assert.equal(tables.products.length, 1);
    assert.equal(tables.skus.length, 1);
    assert.equal(tables.listing_drafts[0].status, "approved");
    assert.equal(tables.listing_drafts[0].approved_product_id, tables.products[0].product_id);

    await approveListingDraft(dbWith(tables), adminAccount(), "draft_a", "Approve again");
    assert.equal(tables.products.length, 1);
    assert.equal(tables.skus.length, 1);
  });

  it("allows seller listing submission only from draft or revision state after verification", async () => {
    const verifiedTables: Record<string, any[]> = {
      sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
      seller_profiles: [{ seller_id: "seller_a", verification_status: "verified" }],
      seller_applications: [],
      seller_verification_documents: [],
      listing_drafts: [{ draft_id: "draft_a", seller_id: "seller_a", status: "draft", updated_at: "2026-01-01T00:00:00.000Z" }]
    };

    await submitListingDraft(dbWith(verifiedTables), "seller_a", "draft_a");
    assert.equal(verifiedTables.listing_drafts[0].status, "submitted");

    await assert.rejects(
      () => submitListingDraft(dbWith(verifiedTables), "seller_a", "draft_a"),
      (error: any) => error.statusCode === 400 && /Only draft/.test(error.message)
    );

    const pendingTables: Record<string, any[]> = {
      sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
      seller_profiles: [{ seller_id: "seller_a", verification_status: "pending" }],
      seller_applications: [],
      seller_verification_documents: [],
      listing_drafts: [{ draft_id: "draft_b", seller_id: "seller_a", status: "draft", updated_at: "2026-01-01T00:00:00.000Z" }]
    };

    await assert.rejects(
      () => submitListingDraft(dbWith(pendingTables), "seller_a", "draft_b"),
      (error: any) => error.statusCode === 400 && /Complete seller verification/.test(error.message)
    );
    assert.equal(pendingTables.listing_drafts[0].status, "draft");
  });

  it("lets sellers edit reviewer-returned drafts before resubmitting", async () => {
    const tables: Record<string, any[]> = {
      sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
      seller_profiles: [{ seller_id: "seller_a", verification_status: "verified" }],
      seller_applications: [],
      seller_verification_documents: [],
      product_clusters: [],
      products: [],
      listing_drafts: [{
        draft_id: "draft_revision",
        seller_id: "seller_a",
        status: "needs_revision",
        title: "Blue kurti",
        category: "women_kurtis",
        garment_type: "kurti",
        fabric: "cotton",
        color_family: "blue",
        base_price: 459,
        image_url: "seeded://products/blue-kurti.jpg",
        target_cluster_id: "cluster_old",
        readiness_status: "catalog_only",
        review_notes: "Title is too generic. Add fabric and fit detail.",
        updated_at: "2026-01-01T00:00:00.000Z",
        submitted_at: "2026-01-01T00:00:00.000Z"
      }]
    };
    const db = dbWith(tables);

    await updateListingDraft(db, "seller_a", "draft_revision", {
      title: "Blue cotton straight-fit kurti",
      base_price: 479,
      image_url: "seeded://products/blue-cotton-kurti.jpg"
    });

    assert.equal(tables.listing_drafts[0].title, "Blue cotton straight-fit kurti");
    assert.equal(tables.listing_drafts[0].base_price, 479);
    assert.equal(tables.listing_drafts[0].status, "needs_revision");
    assert.ok(tables.listing_drafts[0].revision_acknowledged_at);

    await submitListingDraft(db, "seller_a", "draft_revision");
    assert.equal(tables.listing_drafts[0].status, "submitted");
    assert.equal(tables.listing_drafts[0].review_notes, null);

    await assert.rejects(
      () => updateListingDraft(db, "seller_a", "draft_revision", { title: "Late edit" }),
      (error: any) => error.statusCode === 400 && /Only draft/.test(error.message)
    );
  });
});

function adminAccount() {
  return {
    account_id: "admin_1",
    username: "reviewer.admin",
    role: "admin",
    display_name: "Reviewer"
  };
}

function listingReviewTables(overrides: Record<string, any[]> = {}) {
  return {
    sellers: [{ seller_id: "seller_a", name: "NayiDisha Fashions" }],
    seller_profiles: [{ seller_id: "seller_a", verification_status: "verified", gst_status: "verified", kyc_status: "verified" }],
    seller_applications: [],
    seller_verification_documents: [],
    seller_evidence_assets: [],
    listing_drafts: [{
      draft_id: "draft_a",
      seller_id: "seller_a",
      status: "submitted",
      title: "Blue cotton kurti",
      category: "women_kurtis",
      garment_type: "kurti",
      fabric: "cotton",
      color_family: "blue",
      base_price: 459,
      image_url: "seed://products/blue-kurti.jpg",
      target_cluster_id: "cluster_a",
      updated_at: "2026-01-01T00:00:00.000Z"
    }],
    product_clusters: [],
    products: [],
    skus: [],
    fact_records: [],
    price_events: [],
    inventory_snapshots: [],
    admin_audit_events: [],
    data_sources: [],
    ...overrides
  };
}
