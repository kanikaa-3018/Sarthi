import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { id } from "./crypto.js";
import { productForVariant } from "./domain.js";
import { withoutId } from "./format.js";
import { nowIso } from "./time.js";

export async function buyerDashboard(db: Db, buyerId: string) {
  const c = collections(db);
  const buyer = await c.buyers.findOne({ buyer_id: buyerId });
  const profile = await refreshBuyerReviewProfile(db, buyerId);
  const [outcomes, proofRequests, contracts, latestMemory, expectationCount] = await Promise.all([
    c.outcomes.find({ buyer_id: buyerId }).sort({ created_at: -1 }).toArray(),
    c.proofRequests.countDocuments({ buyer_id: buyerId }),
    c.expectationContracts.find({ buyer_id: buyerId }).sort({ created_at: -1 }).limit(5).toArray(),
    c.fitMemory.find({ buyer_id: buyerId }).sort({ updated_at: -1 }).limit(3).toArray(),
    c.expectationContracts.countDocuments({ buyer_id: buyerId })
  ]);
  const kept = outcomes.filter((outcome: any) => outcome.status === "delivered_kept").length;
  const returned = outcomes.filter((outcome: any) => outcome.status === "returned").length;
  const rto = outcomes.filter((outcome: any) => outcome.status === "rto").length;
  const checkoutMode = profile.credibility_weight >= 0.75 && returned <= kept
    ? "normal_prepaid_eligibility"
    : profile.credibility_weight >= 0.55
      ? "balanced_checkout_guidance"
      : "extra_trust_steps";
  return {
    buyer_id: buyerId,
    profile: {
      display_name: buyer?.display_name ?? "Buyer",
      language: buyer?.language ?? "english",
      preferred_fit: buyer?.preferred_fit ?? "comfort",
      joined_at: buyer?.joined_at ?? null
    },
    activity: {
      kept_orders: kept,
      returned_orders: returned,
      rto_orders: rto,
      total_outcomes: outcomes.length,
      proof_requests_created: proofRequests,
      expectation_contracts: expectationCount
    },
    review_credibility: {
      weight: profile.credibility_weight,
      risk_band: profile.risk_band,
      signals: profile.risk_signals,
      explanation: "Sarthi gives lower review weight to very new users, repeated generic reviews, high returns, or high RTO behavior so product scores are harder to manipulate."
    },
    checkout_guidance: {
      mode: checkoutMode,
      prepaid_nudge_allowed: checkoutMode !== "extra_trust_steps",
      message: checkoutMode === "normal_prepaid_eligibility"
        ? "Prepaid can be nudged when product trust, offer truth, and refund clarity are strong."
        : checkoutMode === "balanced_checkout_guidance"
          ? "Prepaid can be shown with clear savings, but Sarthi should avoid pressure copy."
          : "Avoid strong prepaid nudges until cleaner order history and product evidence exist."
    },
    privacy: await privacySummary(db, buyerId),
    recent_memory: latestMemory.map(withoutId),
    recent_expectation_contracts: contracts.map(withoutId),
    guardrails: [
      "Buyer fit memory is not shown to sellers.",
      "Review weight affects aggregate scoring only; it does not block a buyer from shopping.",
      "Prepaid nudges require product trust and offer truth, not only user profile."
    ]
  };
}

export async function refreshBuyerReviewProfile(db: Db, buyerId: string) {
  const c = collections(db);
  const [buyer, existing, outcomes, reviewCount] = await Promise.all([
    c.buyers.findOne({ buyer_id: buyerId }),
    c.buyerReviewProfiles.findOne({ buyer_id: buyerId }),
    c.outcomes.find({ buyer_id: buyerId }).toArray(),
    c.reviews.countDocuments({ reviewer_buyer_id: buyerId })
  ]);
  const joinedAt = buyer?.joined_at ?? existing?.updated_at ?? nowIso();
  const marketplace_age_days = Math.max(0, Math.floor((Date.now() - new Date(joinedAt).getTime()) / 86400000));
  const completed = outcomes.filter((outcome: any) => ["delivered_kept", "returned", "exchanged"].includes(outcome.status));
  const kept = outcomes.filter((outcome: any) => outcome.status === "delivered_kept").length;
  const returned = outcomes.filter((outcome: any) => outcome.status === "returned").length;
  const rto = outcomes.filter((outcome: any) => outcome.status === "rto").length;
  const return_rate = completed.length ? Number((returned / completed.length).toFixed(3)) : existing?.return_rate ?? 0;
  const rto_rate = completed.length + rto ? Number((rto / (completed.length + rto)).toFixed(3)) : existing?.rto_rate ?? 0;
  const risk_signals = [
    ...(marketplace_age_days < 30 ? ["new_account"] : []),
    ...(completed.length < 3 ? ["thin_order_history"] : []),
    ...(return_rate > 0.45 ? ["high_return_rate"] : []),
    ...(rto_rate > 0.25 ? ["high_rto_rate"] : []),
    ...(existing?.risk_signals ?? []).filter((signal: string) => ["repeated_text_pattern"].includes(signal))
  ];
  let credibility_weight = 0.92;
  if (marketplace_age_days < 30) credibility_weight -= 0.22;
  if (completed.length < 3) credibility_weight -= 0.16;
  if (return_rate > 0.45) credibility_weight -= 0.28;
  if (rto_rate > 0.25) credibility_weight -= 0.16;
  if (risk_signals.includes("repeated_text_pattern")) credibility_weight -= 0.14;
  credibility_weight = Number(Math.max(0.2, Math.min(1, credibility_weight)).toFixed(2));
  const risk_band = credibility_weight >= 0.75 ? "trusted" : credibility_weight >= 0.55 ? "watch" : marketplace_age_days < 30 ? "new_user" : "high_return";
  const profile = {
    buyer_id: buyerId,
    marketplace_age_days,
    delivered_orders: kept,
    returned_orders: returned,
    rto_orders: rto,
    return_rate,
    rto_rate,
    review_count: reviewCount,
    verified_purchase_rate: completed.length ? 1 : 0,
    credibility_weight,
    risk_band,
    risk_signals,
    updated_at: nowIso()
  };
  await c.buyerReviewProfiles.updateOne({ buyer_id: buyerId }, { $set: profile }, { upsert: true });
  return profile;
}

export async function privacySummary(db: Db, buyerId: string) {
  const c = collections(db);
  const [buyer, count] = await Promise.all([
    c.buyers.findOne({ buyer_id: buyerId }),
    c.fitMemory.countDocuments({ buyer_id: buyerId })
  ]);
  return {
    buyer_id: buyerId,
    fit_memory_enabled: Boolean(buyer?.fit_memory_enabled),
    memory_record_count: count,
    used: buyer?.fit_memory_enabled ? ["fit memory for size guidance", "aggregate order outcomes"] : ["aggregate order outcomes"],
    not_used: ["seller cannot access buyer memory", "contacts", "SMS", "raw voice", "payment credentials"]
  };
}

export async function recordOrderOutcome(db: Db, body: any) {
  const c = collections(db);
  const order_id = id("order");
  const fact_id = id("fact_order");
  await c.outcomes.insertOne({
    order_id,
    buyer_id: body.buyer_id,
    variant_id: body.variant_id,
    status: body.status,
    return_reason: body.return_reason ?? null,
    created_at: nowIso(),
    fact_id
  });
  await c.facts.insertOne({
    fact_id,
    source_table: "order_outcomes",
    source_id: order_id,
    source_type: "order_outcome",
    summary: `${body.status} outcome for ${body.variant_id}`,
    created_at: nowIso(),
    expires_at: null
  });

  const reviewerProfile = await refreshBuyerReviewProfile(db, body.buyer_id);
  let memoryUpdate = { updated: false, reason: "memory disabled" } as any;
  const buyer = await c.buyers.findOne({ buyer_id: body.buyer_id });
  if (buyer?.fit_memory_enabled && body.status === "delivered_kept") {
    const product = await productForVariant(db, body.variant_id);
    const variant = await c.variants.findOne({ variant_id: body.variant_id });
    const memory_id = id("fit_memory");
    const memory = {
      memory_id,
      buyer_id: body.buyer_id,
      category: product?.category ?? "unknown",
      anchor_variant_id: body.variant_id,
      retained_size: variant?.size ?? "XL",
      preferred_fit: "comfort",
      confidence: "medium",
      updated_at: nowIso(),
      fact_id: id("fact_memory")
    };
    await c.fitMemory.insertOne(memory);
    memoryUpdate = { updated: true, memory_id, retained_size: memory.retained_size };
  }

  let contract: any = null;
  if (body.contract_id) {
    contract = await c.expectationContracts.findOne({ contract_id: body.contract_id });
    if (contract) {
      const status = body.status === "returned" ? "broken" : "kept";
      const broken_dimension = body.return_reason?.includes("fabric")
        ? "fabric"
        : body.return_reason?.includes("color")
          ? "color"
          : body.return_reason?.includes("small") || body.return_reason?.includes("large")
            ? "fit"
            : null;
      await c.expectationContracts.updateOne(
        { contract_id: body.contract_id },
        { $set: { status, completed_at: nowIso(), outcome_order_id: order_id, broken_dimension } }
      );
      contract = { ...contract, status, completed_at: nowIso(), outcome_order_id: order_id, broken_dimension };
    }
  }
  return {
    outcome: { order_id, fact_id, created_at: nowIso(), status: body.status, memory_update: memoryUpdate },
    expectation_contract: contract ? withoutId(contract) : null,
    graph_sync: { available: true, reviewer_credibility_weight: reviewerProfile.credibility_weight },
    memory: (await c.fitMemory.find({ buyer_id: body.buyer_id }).toArray()).map(withoutId)
  };
}
