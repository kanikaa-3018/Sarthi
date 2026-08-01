import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Db } from "mongodb";
import { env } from "../config/env.js";
import { buildSeedDocuments } from "../data/seed.js";
import { computeKeepConfidence, rankCluster, reviewCredibilitySummary, skuPassport, verifyOffer } from "../services/domain.js";
import { buyerProofLedger, recordOrderOutcome } from "../services/buyerOperations.js";
import { computeCartConfidence } from "../services/decisionEngine.js";
import { sellerEvidenceCoach } from "../services/sellerOperations.js";
import { runTrustRun } from "../services/trustRunAgent.js";

const collectionMap: Record<string, keyof ReturnType<typeof buildSeedDocuments>> = {
  buyers: "buyers",
  buyer_review_profiles: "buyerReviewProfiles",
  buyer_fit_profiles: "buyerFitProfiles",
  sellers: "sellers",
  seller_profiles: "sellerProfiles",
  product_clusters: "clusters",
  products: "products",
  skus: "variants",
  reviews: "reviews",
  order_outcomes: "outcomes",
  price_events: "priceEvents",
  campaign_events: "campaigns",
  inventory_snapshots: "inventorySnapshots",
  fit_memory: "fitMemory",
  fact_records: "facts",
  proof_requests: "proofRequests",
  seller_evidence_assets: "sellerEvidenceAssets",
  expectation_contracts: "expectationContracts",
  agent_traces: "auditTraces",
  trust_score_snapshots: "trustScoreSnapshots",
  feature_weights: "featureWeights",
  wishlist_intents: "wishlistIntents",
  trust_radar_events: "trustRadarEvents",
  cart_confidence_snapshots: "cartConfidenceSnapshots",
  llm_cache: "llmCache"
};

const originalProviderOrder = [...env.providerOrder];
const originalBedrockEnabled = env.bedrockEnabled;
const originalGeminiApiKey = env.geminiApiKey;

beforeEach(() => {
  env.providerOrder = [];
  env.bedrockEnabled = false;
  env.geminiApiKey = "";
});

afterEach(() => {
  env.providerOrder = [...originalProviderOrder];
  env.bedrockEnabled = originalBedrockEnabled;
  env.geminiApiKey = originalGeminiApiKey;
});

function seededDb(): Db {
  const docs = buildSeedDocuments();
  const tables: Record<string, any[]> = {};
  for (const [collectionName, docsKey] of Object.entries(collectionMap)) {
    tables[collectionName] = [...((docs as any)[docsKey] ?? [])];
  }

  return {
    collection(name: string) {
      const rows = tables[name] ?? (tables[name] = []);
      return {
        findOne(query: Record<string, unknown> = {}) {
          return Promise.resolve(rows.find((row) => matches(row, query)) ?? null);
        },
        find(query: Record<string, unknown> = {}) {
          let selected = rows.filter((row) => matches(row, query));
          const cursor = {
            sort(sortSpec: Record<string, 1 | -1> = {}) {
              selected = [...selected].sort((left, right) => compareRows(left, right, sortSpec));
              return cursor;
            },
            limit(limit: number) {
              selected = selected.slice(0, limit);
              return cursor;
            },
            project() {
              return cursor;
            },
            toArray() {
              return Promise.resolve([...selected]);
            }
          };
          return cursor;
        },
        insertOne(document: Record<string, unknown>) {
          rows.push(document);
          return Promise.resolve({ acknowledged: true, insertedId: document._id ?? document.trace_id ?? document.request_id });
        },
        insertMany(documents: Array<Record<string, unknown>>) {
          rows.push(...documents);
          return Promise.resolve({ acknowledged: true, insertedCount: documents.length });
        },
        updateOne(query: Record<string, unknown>, update: Record<string, any>, options: { upsert?: boolean } = {}) {
          let row = rows.find((item) => matches(item, query));
          if (!row && options.upsert) {
            row = { ...query };
            rows.push(row);
          }
          if (row) {
            if (update.$setOnInsert) Object.assign(row, update.$setOnInsert);
            if (update.$set) Object.assign(row, update.$set);
            if (update.$inc) {
              for (const [key, value] of Object.entries(update.$inc)) {
                row[key] = Number(row[key] ?? 0) + Number(value);
              }
            }
          }
          return Promise.resolve({ acknowledged: true, matchedCount: row ? 1 : 0, modifiedCount: row ? 1 : 0 });
        },
        countDocuments(query: Record<string, unknown> = {}) {
          return Promise.resolve(rows.filter((row) => matches(row, query)).length);
        }
      };
    }
  } as unknown as Db;
}

describe("trust run agent", () => {
  it("returns one coherent buyer decision, comparison, checkout check, seller signal, and trace", async () => {
    const run = await runTrustRun(seededDb(), "buyer_asha", {
      product_id: "kurti_1_2",
      profile_id: "fit_profile_asha_self",
      query: "Can I trust the fabric and seller before checkout?"
    });

    assert.equal(run.workflow_version, "trust_run_v1");
    assert.equal(run.comparison.selected_product_id, run.recommended_product.product_id);
    assert.equal(run.decision.selected.product.product_id, run.recommended_product.product_id);
    assert.equal(run.decision.selected.variant.variant_id, run.recommended_variant.variant_id);
    assert.equal(run.privacy.buyer_profile_shared_with_seller, false);
    assert.ok(run.summary.seller_count >= 2);
    assert.ok(run.summary.fact_count > 0);
    assert.ok(run.steps.some((step: any) => step.key === "review_credibility"));
    assert.ok(run.steps.some((step: any) => step.key === "checkout_readiness"));
    assert.ok(run.checkout_confidence.snapshot_id);
    assert.ok(run.wishlist?.radar.recommended_variant_id);
    assert.ok(run.trace_id.startsWith("trace_"));
  });

  it("builds a buyer-readable SKU truth card and apparel fit layer from passport facts", async () => {
    const passport = await skuPassport(seededDb(), "buyer_asha", "kurti_3_3", "kurti_3_3_l");

    assert.equal(passport.truth_card.title, "SKU Truth Card");
    assert.ok(passport.truth_card.verified.length > 0);
    assert.ok(Array.isArray(passport.truth_card.missing));
    assert.ok(passport.truth_card.changed_recently.length > 0);
    assert.ok(passport.truth_card.score_reason.headline);
    assert.ok(passport.truth_card.pending_seller_proof.some((proof: any) => proof.attribute === "size"));
    assert.ok(passport.truth_card.unsafe_claims.length > 0);

    assert.ok(["Runs small", "True to size", "Runs loose"].includes(passport.fit_confidence_layer.fit_subscore.label));
    assert.equal(passport.fit_confidence_layer.size_risk.selected_size, "L");
    assert.ok(passport.fit_confidence_layer.reviewer_fit_summary.summary);
    assert.equal(passport.fit_confidence_layer.seller_measurement_proof.status, "verified");
    assert.ok(passport.fit_confidence_layer.family_profiles.some((profile: any) => profile.label === "Mummy"));
    assert.ok(passport.fit_confidence_layer.size_options.length >= 3);
  });

  it("keeps buyer-owned size guidance stable across selected apparel sizes", async () => {
    const db = seededDb();
    const small = await computeKeepConfidence(db, "buyer_asha", "kurti_3_1_s");
    const medium = await computeKeepConfidence(db, "buyer_asha", "kurti_3_1_m");
    const large = await computeKeepConfidence(db, "buyer_asha", "kurti_3_1_l");
    const extraLarge = await computeKeepConfidence(db, "buyer_asha", "kurti_3_1_xl");

    assert.equal(small.recommended_size, "XL");
    assert.equal(medium.recommended_size, "XL");
    assert.equal(large.recommended_size, "XL");
    assert.equal(extraLarge.recommended_size, "XL");
    assert.ok(small.drivers.some((driver: any) => driver.type === "size_mismatch"));
    assert.ok(medium.drivers.some((driver: any) => driver.type === "size_mismatch"));
    assert.ok(extraLarge.drivers.some((driver: any) => driver.type === "fit_match"));
  });

  it("explains review credibility beyond raw ratings", async () => {
    const summary = await reviewCredibilitySummary(seededDb(), "kurti_3_3");

    assert.equal(summary.review_count > 0, true);
    assert.ok(summary.rating_comparison);
    assert.equal(typeof summary.rating_comparison.summary, "string");
    assert.ok(summary.visible_review_checks.some((check: any) => check.key === "verified_purchase"));
    assert.ok(summary.visible_review_checks.some((check: any) => check.key === "new_account"));
    assert.ok(summary.visible_review_checks.some((check: any) => check.key === "high_return"));
    assert.ok(summary.visible_review_checks.some((check: any) => check.key === "repeated_text"));
    assert.ok(summary.visible_review_checks.some((check: any) => check.key === "review_spike"));
    assert.ok(summary.review_spike.message);
    assert.ok(summary.trust_answer.includes("Normal ratings"));
    if (summary.downweighted_reviews.length) {
      assert.ok(summary.downweighted_reviews[0].down_weight_reasons.length > 0);
    }
  });

  it("returns proof loop status from buyer proof ledger", async () => {
    const ledger = await buyerProofLedger(seededDb(), "buyer_synth_01");
    const item = ledger.items[0];

    assert.ok(item);
    assert.equal(item.proof_loop.title, "Proof loop");
    assert.ok(item.proof_loop.aggregate_demand.buyer_count >= 1);
    assert.ok(item.proof_loop.seller_task.label.includes("proof"));
    assert.equal(typeof item.proof_loop.buyer_notification.message, "string");
    assert.ok(item.proof_loop.timeline.length >= 5);
  });

  it("turns offer checks into a dark pattern disruptor shield", async () => {
    const offer = await verifyOffer(seededDb(), "kurti_1_2_xl");
    const shield = offer.dark_pattern_shield;

    assert.equal(shield.shield_version, "dark_pattern_disruptor_v2");
    assert.ok(shield.checks.some((check: any) => check.key === "repeating_countdown_timer"));
    assert.ok(shield.checks.some((check: any) => check.key === "fake_scarcity"));
    assert.ok(shield.checks.some((check: any) => check.key === "sudden_price_hike_before_discount"));
    assert.ok(shield.checks.some((check: any) => check.key === "drip_pricing"));
    assert.ok(shield.checks.some((check: any) => check.key === "basket_sneaking"));
    assert.ok(shield.checks.some((check: any) => check.key === "forced_prepaid"));
    assert.ok(shield.checks.some((check: any) => check.key === "misleading_only_today_offer"));
    assert.ok(shield.checks.some((check: any) => check.key === "hidden_return_conditions"));
    assert.ok(shield.risk_count >= 3);
    assert.ok(shield.plain_copy.includes("Do not rush"));
  });

  it("explains checkout confidence without forcing prepaid", async () => {
    const confidence = await computeCartConfidence(seededDb(), "buyer_asha", {
      payment_mode: "cod",
      items: [{ variant_id: "kurti_1_3_xl", quantity: 1 }]
    });
    const assist = confidence.payment_assist;

    assert.ok(assist);
    assert.ok(assist.checkout_confidence.payment_reason);
    assert.ok(assist.checkout_confidence.safeguards.some((item: any) => item.key === "address_before_cod"));
    assert.ok(assist.checkout_confidence.safeguards.some((item: any) => item.key === "refund_lock"));
    assert.ok(assist.checkout_confidence.safeguards.some((item: any) => item.key === "no_forced_payment"));
    assert.ok(assist.safety_checks.some((item: any) => item.key === "checkout_shield"));
    assert.equal(assist.checkout_confidence.payment_choice.forced, false);
    assert.equal(assist.payment_choices.length, 2);
    assert.ok(assist.payment_choices.some((choice: any) => choice.mode === "prepaid" && choice.checks.some((check: any) => check.key === "offer_truth")));
    assert.ok(assist.payment_choices.some((choice: any) => choice.mode === "cod" && choice.checks.some((check: any) => check.key === "address")));
    assert.ok(assist.payment_choices.some((choice: any) => choice.mode === "prepaid" && choice.quick_facts.some((fact: any) => fact.key === "saving")));
    assert.ok(assist.payment_choices.some((choice: any) => choice.mode === "cod" && choice.quick_facts.some((fact: any) => fact.key === "charge")));
    assert.equal(typeof confidence.checkout_nudge.message, "string");
  });

  it("closes an expectation contract into score impact and seller root-cause work", async () => {
    const db = seededDb();
    const result = await recordOrderOutcome(db, {
      buyer_id: "buyer_asha",
      variant_id: "kurti_1_1_xl",
      contract_id: "contract_seed_pending_asha_1",
      status: "returned",
      return_reason: "fabric_different"
    });

    assert.equal(result.expectation_contract?.status, "broken");
    assert.equal(result.expectation_contract?.broken_dimension, "fabric");
    assert.ok(result.score_update);
    assert.equal(typeof result.score_update.after_score_percent, "number");
    assert.equal(result.seller_root_cause_task?.attribute, "fabric");
    assert.ok(result.seller_root_cause_task?.title.includes("fabric"));

    const coach = await sellerEvidenceCoach(db, (result.seller_root_cause_task as any).seller_id);
    assert.ok(coach.tasks.some((task: any) => task.root_cause_task_id === result.seller_root_cause_task?.task_id));
    assert.ok(coach.tasks.some((task: any) => task.proof_loop?.title === "Expectation contract loop"));
  });

  it("applies a fair-start policy with verification gate, boost, and score cap", async () => {
    const ranking = await rankCluster(seededDb(), "buyer_asha", "cluster_floral_blue");
    const candidate = ranking.candidates.find((item: any) => item.fair_start_policy?.limited_evidence);

    assert.ok(candidate);
    assert.equal(candidate.fair_start_policy.verification_gate, "passed");
    assert.equal(candidate.fair_start_policy.eligible, true);
    assert.ok(candidate.fair_start_policy.score_cap <= 0.76);
    assert.ok(candidate.score <= candidate.fair_start_policy.score_cap);
    assert.ok(candidate.score_breakdown.adjustments.score_cap);
    assert.ok(candidate.fair_start_policy.buyer_label.includes("limited evidence"));
  });
});

function matches(row: Record<string, any>, query: Record<string, any>) {
  return Object.entries(query).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === "object" && "$in" in expected) return expected.$in.includes(actual);
    if (expected && typeof expected === "object" && "$ne" in expected) return actual !== expected.$ne;
    if (expected && typeof expected === "object" && "$exists" in expected) return expected.$exists ? actual !== undefined : actual === undefined;
    return actual === expected;
  });
}

function compareRows(left: Record<string, any>, right: Record<string, any>, sortSpec: Record<string, 1 | -1>) {
  for (const [key, direction] of Object.entries(sortSpec)) {
    if (left[key] === right[key]) continue;
    return left[key] > right[key] ? direction : -direction;
  }
  return 0;
}
