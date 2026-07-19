import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { generateGroundedAgentAnswer } from "./agent.js";
import { expectationContract } from "./contracts.js";
import { id } from "./crypto.js";
import { computeCartConfidence } from "./decisionEngine.js";
import { createTrace, graphPath, productForVariant, productWithSeller, skuPassport } from "./domain.js";
import { label, withoutId } from "./format.js";
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

export async function buyerOrders(db: Db, buyerId: string) {
  const c = collections(db);
  const [outcomes, contracts] = await Promise.all([
    c.outcomes.find({ buyer_id: buyerId }).sort({ created_at: -1 }).limit(12).toArray(),
    c.expectationContracts.find({ buyer_id: buyerId }).sort({ created_at: -1 }).limit(8).toArray()
  ]);
  const completedContractIds = new Set(
    contracts
      .filter((contract: any) => contract.outcome_order_id || contract.status === "kept" || contract.status === "broken")
      .map((contract: any) => contract.contract_id)
  );

  const pendingContracts = contracts.filter((contract: any) =>
    contract.status === "active" && !contract.outcome_order_id && !completedContractIds.has(contract.contract_id)
  );

  const pending = await Promise.all(
    pendingContracts.map(async (contract: any) => {
      const status = contract.order_status ?? (contract.checkout_order_id ? "placed" : "delivered_needs_feedback");
      const canSubmitOutcome = status === "delivered_needs_feedback";
      return orderCardForVariant(db, {
        order_id: `pending_${contract.contract_id}`,
        buyer_id: buyerId,
        variant_id: contract.variant_id,
        status,
        return_reason: null,
        created_at: contract.placed_at ?? contract.created_at,
        fact_id: contract.fact_id,
        contract_id: contract.contract_id,
        can_submit_outcome: canSubmitOutcome,
        checkout_order_id: contract.checkout_order_id ?? null,
        payment_mode: contract.payment_mode ?? null,
        buying_for_someone_else: Boolean(contract.buying_for_someone_else),
        fit_memory_excluded: Boolean(contract.fit_memory_excluded),
        wearer_label: contract.wearer_label ?? null
      });
    })
  );

  const completed = await Promise.all(
    outcomes.map((outcome: any) => orderCardForVariant(db, {
      ...outcome,
      contract_id: null,
      can_submit_outcome: false
    }))
  );

  const orders = [...pending, ...completed]
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    buyer_id: buyerId,
    pending_feedback: pending.filter(Boolean).filter((order: any) => order.can_submit_outcome).length,
    orders
  };
}

export async function markCheckoutOrderDelivered(db: Db, buyerId: string, contractId: string) {
  const c = collections(db);
  const contract = await c.expectationContracts.findOne({ contract_id: contractId, buyer_id: buyerId });
  if (!contract) {
    throwNotFound("Checkout order not found");
  }
  if (!contract.checkout_order_id) {
    throwBadRequest("Only checkout orders can be marked delivered.");
  }
  if (contract.status !== "active" || contract.outcome_order_id) {
    throwBadRequest("Order feedback is already closed for this checkout.");
  }
  if (contract.order_status === "delivered_needs_feedback") {
    return buyerOrders(db, buyerId);
  }
  if (contract.order_status !== "placed") {
    throwBadRequest("Only placed orders can be marked delivered.");
  }
  const deliveredAt = nowIso();
  const update = await c.expectationContracts.updateOne(
    {
      contract_id: contractId,
      buyer_id: buyerId,
      status: "active",
      order_status: "placed",
      outcome_order_id: null
    },
    { $set: { order_status: "delivered_needs_feedback", delivered_at: deliveredAt, updated_at: deliveredAt } }
  );
  if (!update.matchedCount) {
    throwBadRequest("Order delivery state changed. Refresh orders and try again.");
  }
  return buyerOrders(db, buyerId);
}

export async function correctOrderOutcome(db: Db, buyerId: string, orderId: string, body: any) {
  const c = collections(db);
  const existing = await c.outcomes.findOne({ order_id: orderId, buyer_id: buyerId });
  if (!existing) {
    throw new Error("Order outcome not found");
  }

  const correctedReason = normalizeReturnReason(body.return_reason ?? existing.return_reason ?? "too_small");
  const correction = {
    previous_return_reason: existing.return_reason ?? null,
    corrected_return_reason: correctedReason,
    correction_note: body.correction_note ?? null,
    corrected_at: nowIso()
  };
  await c.outcomes.updateOne(
    { order_id: orderId, buyer_id: buyerId },
    {
      $set: {
        return_reason: correctedReason,
        corrected_return_reason: correctedReason,
        correction_note: correction.correction_note,
        corrected_at: correction.corrected_at
      },
      $push: { correction_history: correction } as any
    }
  );

  const profile = await refreshBuyerReviewProfile(db, buyerId);
  const updated = await c.outcomes.findOne({ order_id: orderId, buyer_id: buyerId });
  return {
    buyer_id: buyerId,
    order_id: orderId,
    outcome: updated ? withoutId(updated) : null,
    correction,
    graph_sync: {
      available: true,
      reviewer_credibility_weight: profile.credibility_weight
    }
  };
}

export async function buyerWishlist(db: Db, buyerId: string) {
  const c = collections(db);
  const intents = await c.wishlistIntents.find({ buyer_id: buyerId, status: "watching" }).sort({ updated_at: -1 }).limit(24).toArray();
  const items = await Promise.all(intents.map(async (intent: any) => {
    const [product, variant, radar] = await Promise.all([
      productForVariant(db, intent.selected_variant_id).then((selectedProduct) => selectedProduct ?? productForProductId(db, intent.product_id)),
      c.variants.findOne({ variant_id: intent.selected_variant_id }),
      intent.last_radar_event_id
        ? c.trustRadarEvents.findOne({ event_id: intent.last_radar_event_id })
        : c.trustRadarEvents.findOne({ intent_id: intent.intent_id }, { sort: { created_at: -1 } })
    ]);
    if (!product) return null;
    return {
      intent: withoutId(intent),
      product,
      variant: variant ? withoutId(variant) : null,
      radar: radar ? withoutId(radar) : null
    };
  }));
  return {
    buyer_id: buyerId,
    count: items.filter(Boolean).length,
    items: items.filter(Boolean)
  };
}

export async function buyerProofLedger(db: Db, buyerId: string) {
  const c = collections(db);
  const requests = await c.proofRequests.find({ buyer_id: buyerId }).sort({ updated_at: -1 }).limit(24).toArray();
  const items = await Promise.all(requests.map(async (request: any) => {
    const [product, variant, proofAsset] = await Promise.all([
      productWithSeller(db, request.product_id),
      request.variant_id ? c.variants.findOne({ variant_id: request.variant_id }) : null,
      request.resolution_proof_id
        ? c.sellerEvidenceAssets.findOne({ proof_id: request.resolution_proof_id })
        : c.sellerEvidenceAssets.findOne(
            {
              seller_id: request.seller_id,
              product_id: request.product_id,
              attribute: request.attribute,
              status: { $in: ["submitted", "verified", "rejected"] }
            },
            { sort: { created_at: -1 } }
          )
    ]);
    if (!product) return null;
    const status = proofStatus(request, proofAsset);
    const proofQuality = proofQualityAssessment(request, proofAsset);
    const trustImpact = proofTrustImpact(request, proofAsset, status, proofQuality.score);
    return {
      request: {
        request_id: request.request_id,
        seller_id: request.seller_id,
        product_id: request.product_id,
        variant_id: request.variant_id ?? null,
        attribute: request.attribute,
        status: request.status,
        request_count: request.request_count,
        buyer_question: request.buyer_question ?? null,
        created_at: request.created_at,
        updated_at: request.updated_at,
        resolved_at: request.resolved_at ?? null,
        fact_id: request.fact_id
      },
      product,
      variant: variant ? withoutId(variant) : null,
      proof_asset: proofAsset ? {
        proof_id: proofAsset.proof_id,
        title: proofAsset.title,
        description: proofAsset.description,
        asset_url: proofAsset.asset_url,
        proof_type: proofAsset.proof_type,
        status: proofAsset.status,
        submitted_at: proofAsset.submitted_at ?? proofAsset.created_at,
        reviewed_at: proofAsset.reviewed_at ?? null,
        review_notes: proofAsset.review_notes ?? null,
        fact_id: proofAsset.fact_id
      } : null,
      status,
      status_label: proofStatusLabel(status),
      next_step: proofNextStep(status),
      proof_quality: proofQuality,
      trust_impact: trustImpact,
      buyer_summary: proofBuyerSummary(status, request, proofAsset, trustImpact.lift_points),
      timeline: proofTimeline(request, proofAsset)
    };
  }));
  const cleanItems = items.filter(Boolean);
  return {
    buyer_id: buyerId,
    count: cleanItems.length,
    summary: {
      waiting_seller: cleanItems.filter((item: any) => item.status === "waiting_seller").length,
      admin_review: cleanItems.filter((item: any) => item.status === "admin_review").length,
      approved: cleanItems.filter((item: any) => item.status === "approved").length,
      needs_more_proof: cleanItems.filter((item: any) => item.status === "needs_more_proof").length
    },
    items: cleanItems
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

export async function returnAlternativeAssistant(db: Db, body: any) {
  const c = collections(db);
  const buyerId = body.buyer_id;
  const variantId = body.variant_id;
  const reason = normalizeReturnReason(body.return_reason);
  const severity = body.severity === "major" ? "major" : "minor";
  const preference = body.buyer_preference === "refund_only" ? "refund_only" : "exchange_ok";
  const [product, variant] = await Promise.all([
    productForVariant(db, variantId),
    c.variants.findOne({ variant_id: variantId })
  ]);
  if (!product || !variant) {
    throw new Error("Return context not found");
  }

  const passport = await skuPassport(db, buyerId, product.product_id, variantId);
  const nextSize = sizeAlternative(variant.size, reason, passport.fit.recommended_size);
  const canSuggestExchange = preference === "exchange_ok" && severity === "minor" && Boolean(nextSize) && ["too_small", "too_large"].includes(reason);
  const canSuggestAlteration = preference === "exchange_ok" && severity === "minor" && reason === "too_large";
  const legitimateReturn = severity === "major"
    || ["damaged", "color_different", "fabric_different", "wrong_item", "delivery_late"].includes(reason)
    || preference === "refund_only";

  const deterministic = canSuggestExchange
    ? {
        type: "exchange_size",
        title: `Try size ${nextSize} exchange`,
        summary: `This looks like a minor fit issue. An even exchange to size ${nextSize} may solve it without a full return.`,
        primary_action: "Choose exchange",
        recommended: true,
        confidence: "medium"
      }
    : canSuggestAlteration
      ? {
          type: "local_alteration",
          title: "Small alteration may work",
          summary: "If the fabric and color are okay, a small local alteration can be easier than a full return.",
          primary_action: "Mark as kept after alteration",
          recommended: true,
          confidence: "low"
        }
      : {
          type: "continue_return",
          title: legitimateReturn ? "Full return is valid" : "Return is still available",
          summary: legitimateReturn
            ? "Sarthi will not push an alternative when the product is damaged, wrong, delayed, or clearly not usable."
            : "No safer alternative is backed strongly enough, so continuing the return is reasonable.",
          primary_action: "Continue return",
          recommended: false,
          confidence: legitimateReturn ? "high" : "medium"
        };

  const factIds = [...new Set([...(passport.fact_ids ?? []), ...(passport.avoidable_issue?.fact_ids ?? [])])].slice(0, 10);
  const grounded = await generateGroundedAgentAnswer({
    task: "return_assistant",
    query: `Buyer selected return reason ${reason}, severity ${severity}, preference ${preference}.`,
    context: {
      product: {
        product_id: product.product_id,
        title: product.title,
        seller_name: product.seller_name,
        fabric: product.fabric,
        color: product.color_family
      },
      selected_size: variant.size,
      return_reason: reason,
      severity,
      buyer_preference: preference,
      suggested_size: nextSize,
      fit: passport.fit,
      outcome_evidence: passport.outcome_evidence,
      avoidable_issue: passport.avoidable_issue,
      guardrail: "Never discourage a legitimate return. Suggest exchange or alteration only for minor size/fit issues. For damaged, wrong item, material, appearance, or delivery problems, allow the return path clearly."
    },
    fallback: {
      title: deterministic.title,
      summary: deterministic.summary,
      reasons: [
        `${passport.outcome_evidence.delivered_orders_90d} SKU outcomes were checked.`,
        ["too_small", "too_large"].includes(reason)
          ? `Selected size is ${variant.size}; fit guidance points to ${passport.fit.recommended_size}.`
          : `Issue type is ${label(reason).toLowerCase()}, so Sarthi treats this as a product or delivery mismatch rather than a fit preference.`,
        "Private buyer memory is not shared with the seller."
      ],
      caution: deterministic.recommended ? "If the product is damaged or wrong, continue the return." : null
    }
  });
  const trace = await createTrace(db, {
    buyer_id: buyerId,
    product_id: product.product_id,
    variant_id: variantId,
    intent: ["return_alternative_assistant"],
    tools_used: ["skuPassport", "returnGuardrail", grounded.source],
    fact_ids: factIds,
    graph_paths: [graphPath(variantId, factIds)]
  });

  return {
    trace_id: trace.trace_id,
    buyer_id: buyerId,
    variant_id: variantId,
    issue: {
      reason,
      severity,
      buyer_preference: preference,
      questions: [
        "Is the issue small or is the product unusable?",
        "Would a replacement or exchange solve it?",
        "Is the item otherwise okay?"
      ]
    },
    suggestion: {
      ...deterministic,
      title: grounded.title || deterministic.title,
      summary: grounded.summary || deterministic.summary,
      reasons: grounded.reasons,
      caution: grounded.caution,
      suggested_size: nextSize
    },
    agent: { provider: grounded.source },
    evidence: {
      product_title: product.title,
      seller_name: product.seller_name,
      selected_size: variant.size,
      recommended_size: passport.fit.recommended_size,
      delivered_orders_90d: passport.outcome_evidence.delivered_orders_90d,
      return_rate: passport.outcome_evidence.return_rate,
      fact_ids: factIds
    },
    graph_path: graphPath(variantId, factIds)
  };
}

export async function recordOrderOutcome(db: Db, body: any) {
  const c = collections(db);
  const allowedStatuses = new Set(["delivered_kept", "returned", "exchanged"]);
  if (!allowedStatuses.has(body.status)) {
    throwBadRequest("Order outcome status is not supported.");
  }
  let contract: any = null;
  if (body.contract_id) {
    contract = await c.expectationContracts.findOne({
      contract_id: body.contract_id,
      buyer_id: body.buyer_id
    });
    if (!contract) {
      throwBadRequest("Order proof contract does not belong to this buyer.");
    }
    if (contract.variant_id !== body.variant_id) {
      throwBadRequest("Order outcome does not match the locked product proof.");
    }
    if (contract.status !== "active" || contract.outcome_order_id) {
      throwBadRequest("Order proof contract has already been completed.");
    }
    const orderStatus = contract.order_status ?? (contract.checkout_order_id ? "placed" : "delivered_needs_feedback");
    if (orderStatus !== "delivered_needs_feedback") {
      throwBadRequest("Order feedback is available only after delivery.");
    }
  }

  const order_id = id("order");
  const fact_id = id("fact_order");
  const createdAt = nowIso();
  if (body.contract_id && contract) {
    const status = body.status === "returned" || body.status === "exchanged" ? "broken" : "kept";
    const broken_dimension = body.return_reason?.includes("fabric")
      ? "fabric"
      : body.return_reason?.includes("color")
        ? "color"
        : body.return_reason?.includes("small") || body.return_reason?.includes("large")
          ? "fit"
          : body.return_reason?.includes("delivery")
            ? "delivery"
            : body.return_reason?.includes("damaged")
              ? "packaging"
              : body.return_reason?.includes("wrong")
                ? "unknown"
                : null;
    const contractUpdate = await c.expectationContracts.updateOne(
      {
        contract_id: body.contract_id,
        buyer_id: body.buyer_id,
        variant_id: body.variant_id,
        status: "active",
        outcome_order_id: null
      },
      { $set: { status, completed_at: createdAt, outcome_order_id: order_id, broken_dimension, order_status: "feedback_submitted" } }
    );
    if (!contractUpdate.matchedCount) {
      throwBadRequest("Order proof contract has already been completed.");
    }
    contract = { ...contract, status, completed_at: createdAt, outcome_order_id: order_id, broken_dimension, order_status: "feedback_submitted" };
  }

  await c.outcomes.insertOne({
    order_id,
    buyer_id: body.buyer_id,
    variant_id: body.variant_id,
    status: body.status,
    return_reason: body.return_reason ?? null,
    buying_for_someone_else: Boolean(body.buying_for_someone_else),
    fit_memory_excluded: Boolean(body.buying_for_someone_else),
    contract_id: body.contract_id ?? null,
    created_at: createdAt,
    fact_id
  });
  await c.facts.insertOne({
    fact_id,
    source_table: "order_outcomes",
    source_id: order_id,
    source_type: "order_outcome",
    summary: `${body.status} outcome for ${body.variant_id}`,
    created_at: createdAt,
    expires_at: null
  });

  const reviewerProfile = await refreshBuyerReviewProfile(db, body.buyer_id);
  let memoryUpdate = { updated: false, reason: "memory disabled" } as any;
  const buyer = await c.buyers.findOne({ buyer_id: body.buyer_id });
  if (body.buying_for_someone_else) {
    memoryUpdate = { updated: false, reason: "excluded because this purchase was for someone else" };
  } else if (buyer?.fit_memory_enabled && body.status === "delivered_kept") {
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

  return {
    outcome: {
      order_id,
      fact_id,
      created_at: createdAt,
      status: body.status,
      buying_for_someone_else: Boolean(body.buying_for_someone_else),
      fit_memory_excluded: Boolean(body.buying_for_someone_else),
      memory_update: memoryUpdate
    },
    expectation_contract: contract ? withoutId(contract) : null,
    graph_sync: { available: true, reviewer_credibility_weight: reviewerProfile.credibility_weight },
    memory: (await c.fitMemory.find({ buyer_id: body.buyer_id }).toArray()).map(withoutId)
  };
}

export async function placeCheckoutOrder(db: Db, body: any) {
  const c = collections(db);
  let contract: any = body.contract_id
    ? await c.expectationContracts.findOne({ contract_id: body.contract_id, buyer_id: body.buyer_id })
    : null;
  const product = await productForVariant(db, body.variant_id);
  if (!product) {
    throw new Error("Checkout product not found");
  }

  if (!contract) {
    const passport = await skuPassport(db, body.buyer_id, product.product_id, body.variant_id);
    contract = expectationContract(body.buyer_id, product.product_id, body.variant_id, passport);
    await c.expectationContracts.insertOne(contract);
  }

  if (contract.variant_id !== body.variant_id) {
    throw new Error("Checkout order does not match the locked product proof");
  }

  const placedAt = nowIso();
  const checkoutOrderId = contract.checkout_order_id ?? id("checkout_order");
  const paymentMode = body.payment_mode === "prepaid" ? "prepaid" : "cod";
  const cartConfidence = await computeCartConfidence(db, body.buyer_id, {
    payment_mode: paymentMode,
    items: [{ variant_id: body.variant_id, quantity: 1 }]
  });
  const paymentAssist = cartConfidence.payment_assist ?? null;
  const prepaidRewardPoints = paymentMode === "prepaid" ? paymentAssist?.reward_points ?? 0 : 0;
  const prepaidRewardValue = paymentMode === "prepaid" ? paymentAssist?.reward_value_rupees ?? 0 : 0;
  const prepaidOfferSavings = paymentMode === "prepaid" ? paymentAssist?.total_prepaid_benefit_rupees ?? 0 : 0;
  const buyingForSomeoneElse = Boolean(body.buying_for_someone_else);
  const wearerLabel = typeof body.wearer_label === "string" && body.wearer_label.trim()
    ? body.wearer_label.trim().slice(0, 40)
    : buyingForSomeoneElse
      ? "Someone else"
      : "Myself";
  await c.expectationContracts.updateOne(
    { contract_id: contract.contract_id, buyer_id: body.buyer_id },
    {
      $set: {
        checkout_order_id: checkoutOrderId,
        order_status: "placed",
        placed_at: placedAt,
        payment_mode: paymentMode,
        payment_reward_points: prepaidRewardPoints,
        payment_reward_value_rupees: prepaidRewardValue,
        payment_offer_savings_rupees: prepaidOfferSavings,
        payment_assist_summary: paymentAssist?.summary ?? null,
        buying_for_someone_else: buyingForSomeoneElse,
        fit_memory_excluded: buyingForSomeoneElse,
        wearer_label: wearerLabel
      }
    }
  );
  const updated = await c.expectationContracts.findOne({ contract_id: contract.contract_id, buyer_id: body.buyer_id });
  const order = await orderCardForVariant(db, {
    order_id: `pending_${contract.contract_id}`,
    checkout_order_id: checkoutOrderId,
    buyer_id: body.buyer_id,
    variant_id: body.variant_id,
    status: "placed",
    return_reason: null,
    created_at: updated?.placed_at ?? placedAt,
    fact_id: updated?.fact_id ?? contract.fact_id,
    contract_id: contract.contract_id,
    can_submit_outcome: false,
    payment_mode: paymentMode,
    payment_reward_points: prepaidRewardPoints,
    payment_reward_value_rupees: prepaidRewardValue,
    payment_offer_savings_rupees: prepaidOfferSavings,
    payment_assist_summary: paymentAssist?.summary ?? null,
    buying_for_someone_else: buyingForSomeoneElse,
    fit_memory_excluded: buyingForSomeoneElse,
    wearer_label: wearerLabel
  });
  return {
    checkout_order_id: checkoutOrderId,
    order,
    expectation_contract: updated ? withoutId(updated) : null
  };
}

async function orderCardForVariant(db: Db, order: any) {
  const c = collections(db);
  const [product, variant] = await Promise.all([
    productForVariant(db, order.variant_id),
    c.variants.findOne({ variant_id: order.variant_id })
  ]);
  if (!product || !variant) return null;
  return {
    order_id: order.order_id,
    contract_id: order.contract_id ?? null,
    buyer_id: order.buyer_id,
    variant_id: order.variant_id,
    product,
    variant: withoutId(variant),
    status: order.status,
    return_reason: order.return_reason ?? null,
    corrected_return_reason: order.corrected_return_reason ?? null,
    correction_note: order.correction_note ?? null,
    corrected_at: order.corrected_at ?? null,
    buying_for_someone_else: Boolean(order.buying_for_someone_else),
    fit_memory_excluded: Boolean(order.fit_memory_excluded),
    wearer_label: order.wearer_label ?? null,
    payment_mode: order.payment_mode ?? null,
    payment_reward_points: order.payment_reward_points ?? 0,
    payment_reward_value_rupees: order.payment_reward_value_rupees ?? 0,
    payment_offer_savings_rupees: order.payment_offer_savings_rupees ?? 0,
    payment_assist_summary: order.payment_assist_summary ?? null,
    checkout_order_id: order.checkout_order_id ?? null,
    created_at: order.created_at,
    fact_id: order.fact_id ?? null,
    can_submit_outcome: Boolean(order.can_submit_outcome)
  };
}

async function productForProductId(db: Db, productId: string) {
  return productWithSeller(db, productId);
}

function normalizeReturnReason(value: string) {
  const allowed = new Set(["too_small", "too_large", "color_different", "fabric_different", "damaged", "delivery_late", "wrong_item"]);
  return allowed.has(value) ? value : "too_small";
}

function throwBadRequest(message: string): never {
  const error = new Error(message);
  (error as any).statusCode = 400;
  throw error;
}

function throwNotFound(message: string): never {
  const error = new Error(message);
  (error as any).statusCode = 404;
  throw error;
}

function proofStatus(request: any, proofAsset: any) {
  if (proofAsset?.status === "verified" || request.status === "resolved") return "approved";
  if (proofAsset?.status === "rejected" || request.rejected_proof_id) return "needs_more_proof";
  if (proofAsset?.status === "submitted" || request.status === "submitted") return "admin_review";
  return "waiting_seller";
}

function proofStatusLabel(status: string) {
  if (status === "approved") return "Proof approved";
  if (status === "admin_review") return "Seller submitted, admin checking";
  if (status === "needs_more_proof") return "Needs better proof";
  return "Waiting for seller";
}

function proofNextStep(status: string) {
  if (status === "approved") return "You can use this proof while deciding.";
  if (status === "admin_review") return "Wait for reviewer approval before trusting it fully.";
  if (status === "needs_more_proof") return "Seller must upload clearer proof.";
  return "Sarthi has sent this as an aggregate seller task.";
}

function proofQualityAssessment(request: any, proofAsset: any) {
  const hasAsset = Boolean(proofAsset?.asset_url);
  const hasSpecificTitle = Boolean(proofAsset?.title && String(proofAsset.title).length >= 8);
  const hasUsefulDescription = Boolean(proofAsset?.description && String(proofAsset.description).length >= 24);
  const matchesAttribute = !proofAsset || proofAsset.attribute === request.attribute;
  const approved = proofAsset?.status === "verified";
  const rejected = proofAsset?.status === "rejected";
  const checks = [
    { key: "asset_present", label: "Proof file added", passed: hasAsset, detail: hasAsset ? "Seller attached a proof reference." : "Seller has not added proof yet." },
    { key: "claim_match", label: "Matches buyer doubt", passed: matchesAttribute, detail: matchesAttribute ? `Covers ${label(request.attribute)}.` : "Proof does not match the buyer doubt." },
    { key: "clear_description", label: "Clear explanation", passed: hasUsefulDescription, detail: hasUsefulDescription ? "Seller explained what the proof shows." : "Explanation is too thin." },
    { key: "reviewed", label: "Reviewer checked", passed: approved, detail: approved ? "Admin approved it." : rejected ? "Admin asked for better proof." : "Admin review is pending." }
  ];
  const rawScore = checks.reduce((sum, check) => sum + (check.passed ? 25 : 0), 0) + (hasSpecificTitle ? 5 : 0);
  const score = Math.max(0, Math.min(100, approved ? Math.max(rawScore, 88) : rejected ? Math.min(rawScore, 42) : rawScore));
  const labelText = score >= 82 ? "Strong proof" : score >= 55 ? "Useful but pending" : score > 0 ? "Weak proof" : "No proof yet";
  return {
    score,
    label: labelText,
    verdict: approved
      ? "Proof is good enough to improve buyer confidence."
      : rejected
        ? "Proof was not clear enough. Seller needs to improve it."
        : hasAsset
          ? "Proof is submitted, but wait for review before relying on it."
          : "Seller still needs to upload proof.",
    checks
  };
}

function proofTrustImpact(request: any, proofAsset: any, status: string, qualityScore: number) {
  const demandLift = Math.min(8, Math.max(1, Number(request.request_count ?? 1)));
  const attributeLift: Record<string, number> = {
    size: 7,
    fabric: 6,
    transparency: 6,
    color: 5,
    packaging: 4,
    offer: 3
  };
  const baseLift = attributeLift[request.attribute] ?? 4;
  const statusMultiplier = status === "approved" ? 1 : status === "admin_review" ? 0.55 : status === "needs_more_proof" ? 0.15 : 0.25;
  const lift = Math.floor((baseLift + demandLift) * statusMultiplier * Math.max(0.35, qualityScore / 100));
  const before = Math.max(35, Math.min(76, 54 + demandLift + Math.floor((request.request_count ?? 0) / 2)));
  const after = Math.max(before, Math.min(92, before + lift));
  return {
    before_score: before,
    expected_after_score: after,
    lift_points: after - before,
    confidence: status === "approved" ? "high" : status === "admin_review" ? "medium" : "low",
    reason: status === "approved"
      ? `${label(request.attribute)} proof is approved, so this doubt can stop blocking trust.`
      : status === "admin_review"
        ? "Seller has submitted proof. Trust lift waits for admin approval."
        : status === "needs_more_proof"
          ? "Current proof did not pass review, so trust lift stays limited."
          : "Estimated lift is pending until seller submits useful proof."
  };
}

function proofBuyerSummary(status: string, request: any, proofAsset: any, liftPoints: number) {
  if (status === "approved") {
    return `${label(request.attribute)} proof is approved. Estimated trust can improve by ${liftPoints} point${liftPoints === 1 ? "" : "s"}.`;
  }
  if (status === "admin_review") {
    return "Seller responded. Admin is checking if the proof is actually useful.";
  }
  if (status === "needs_more_proof") {
    return "Proof was not clear enough, so the seller must improve it.";
  }
  if (proofAsset) return "Proof exists but still needs a clean review trail.";
  return "Seller has not answered this proof request yet.";
}

function proofTimeline(request: any, proofAsset: any) {
  return [
    { label: "Buyer asked", done: true, at: request.created_at },
    { label: "Seller submitted", done: Boolean(proofAsset), at: proofAsset?.submitted_at ?? proofAsset?.created_at ?? null },
    { label: "Admin approved", done: proofAsset?.status === "verified" || request.status === "resolved", at: proofAsset?.reviewed_at ?? request.resolved_at ?? null }
  ];
}

function sizeAlternative(currentSize: string, reason: string, recommendedSize?: string | null) {
  const sizeOrder = ["XS", "S", "M", "L", "XL", "XXL", "3XL"];
  const currentIndex = sizeOrder.indexOf(String(currentSize).toUpperCase());
  const recommended = recommendedSize && recommendedSize !== currentSize ? recommendedSize : null;
  if (reason === "too_small") return recommended ?? sizeOrder[Math.min(sizeOrder.length - 1, currentIndex + 1)] ?? null;
  if (reason === "too_large") return recommended ?? sizeOrder[Math.max(0, currentIndex - 1)] ?? null;
  return null;
}
