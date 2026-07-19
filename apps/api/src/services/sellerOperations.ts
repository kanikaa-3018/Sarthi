import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { id, sha256Bytes } from "./crypto.js";
import {
  avoidableIssue,
  publicProduct,
  sellerVerification,
  sourceHealth,
  variantEvidence,
  variantsForProduct
} from "./domain.js";
import { label, withoutId } from "./format.js";
import { aiConfigured, generateStructuredJson } from "./ai.js";
import type { GeneratedJson, StructuredGenerationInput } from "./aiTypes.js";
import { suggestClusterFromSimilarListings } from "./similarListings.js";
import { nowIso } from "./time.js";

export async function listSellers(db: Db) {
  const c = collections(db);
  const sellers = await c.sellers.find({}).toArray();
  return Promise.all(sellers.map(async (seller: any) => {
    const products = await c.products.find({ seller_id: seller.seller_id }).project({ cluster_id: 1, rating: 1, rating_count: 1 }).toArray();
    const rating = sellerRating(products);
    return {
      seller_id: seller.seller_id,
      name: seller.name,
      median_dispatch_hours: seller.median_dispatch_hours,
      current_rating: rating.current_rating,
      rating_count: rating.rating_count,
      product_count: products.length,
      cluster_ids: [...new Set(products.map((product: any) => product.cluster_id))]
    };
  }));
}

export async function sellerPanel(db: Db, sellerId: string, clusterId?: string) {
  const c = collections(db);
  const seller = await c.sellers.findOne({ seller_id: sellerId });
  const sellerProducts = await c.products.find({ seller_id: sellerId }).toArray();
  const firstProduct = sellerProducts[0];
  const selectedCluster = clusterId ?? firstProduct?.cluster_id ?? "cluster_floral_blue";
  const listings = await c.products.find({ cluster_id: selectedCluster }).toArray();
  const clusterCards = rankClusterCards(await Promise.all(listings.map((product: any) => listingCard(db, product))));
  const allSellerCards = await Promise.all(sellerProducts.map((product: any) => listingCard(db, product)));
  const coachTasks = await sellerEvidenceTasks(db, sellerId);
  const own = clusterCards.filter((card) => card.seller.seller_id === sellerId);
  const competitors = clusterCards.filter((card) => card.seller.seller_id !== sellerId);
  const cluster = await c.clusters.findOne({ cluster_id: selectedCluster });
  const rating = sellerRating(sellerProducts);
  return {
    seller: {
      seller_id: sellerId,
      name: seller?.name ?? "",
      median_dispatch_hours: seller?.median_dispatch_hours ?? 48,
      current_rating: rating.current_rating,
      rating_count: rating.rating_count,
      product_count: sellerProducts.length,
      cluster_ids: [...new Set(sellerProducts.map((product: any) => product.cluster_id))]
    },
    seller_verification: await sellerVerification(db, sellerId),
    data_freshness: await sourceHealth(db),
    cluster: {
      cluster_id: selectedCluster,
      label: cluster?.label ?? selectedCluster,
      size: "XL",
      listing_count: listings.length,
      seller_count: new Set(listings.map((item: any) => item.seller_id)).size,
      stats: {
        delivered_orders_90d: clusterCards.reduce((sum, card) => sum + card.metrics.delivered_orders_90d, 0),
        returns_90d: clusterCards.reduce((sum, card) => sum + card.metrics.returns_90d, 0),
        median_return_rate: median(clusterCards.map((card) => card.metrics.return_rate).filter((value) => value !== null) as number[]),
        median_dispatch_hours: median(clusterCards.map((card) => card.metrics.median_dispatch_hours)),
        minimum_orders_for_strong_decision: 30
      }
    },
    decision_policy: {
      name: "Sarthi weighted confidence score",
      weights: {
        sku_outcome: 18,
        seller_reliability: 15,
        seller_verification: 12,
        fit: 12,
        review_credibility: 12,
        product_rating: 10,
        proof: 8,
        offer: 6,
        dispatch: 5,
        price: 2
      },
      inputs_used: ["aggregate outcomes", "seller verification", "review credibility"],
      inputs_not_used: ["private buyer memory"]
    },
    seller_listings: own,
    seller_all_listings: allSellerCards,
    action_board: await sellerActionBoard(db, sellerId, allSellerCards, coachTasks),
    competing_listings: competitors,
    privacy_guard: {
      safe_for_seller: true,
      summary: "Seller view uses aggregate listing evidence only. Buyer memory and identity are not exposed."
    },
    fact_ids: [...new Set(clusterCards.flatMap((card) => card.fact_ids))].slice(0, 16)
  };
}

export async function listingCard(db: Db, product: any) {
  const c = collections(db);
  const seller = await c.sellers.findOne({ seller_id: product.seller_id });
  const variants = await variantsForProduct(db, product.product_id);
  const variant = variants.find((item: any) => item.size === "XL") ?? variants[0];
  const evidence = await variantEvidence(db, variant.variant_id);
  const topIssue = await topIssueForCard(db, variant.variant_id);
  const score = Math.round((1 - evidence.return_rate) * 55 + (product.rating / 5) * 25 + (seller?.median_dispatch_hours ? Math.max(0, 20 - seller.median_dispatch_hours / 4) : 8));
  return {
    product: publicProduct({ ...product, seller_name: seller?.name, median_dispatch_hours: seller?.median_dispatch_hours }),
    variant,
    seller: { seller_id: product.seller_id, name: seller?.name ?? "", median_dispatch_hours: seller?.median_dispatch_hours },
    quality_score: Math.max(0, Math.min(100, score)),
    decision_status: evidence.evidence_strength === "weak" ? "insufficient_evidence" : evidence.return_rate > 0.2 ? "needs_seller_action" : "eligible_for_recommendation",
    cluster_position: null,
    metrics: {
      kept_rate: evidence.delivered_orders_90d ? 1 - evidence.return_rate : null,
      return_rate: evidence.return_rate,
      fit_as_expected_rate: evidence.fit_as_expected_rate,
      color_match_rate: evidence.delivered_orders_90d ? 1 - evidence.color_mismatch_returns / evidence.delivered_orders_90d : null,
      delivered_orders_90d: evidence.delivered_orders_90d,
      returns_90d: evidence.returns_90d,
      color_mismatch_returns: evidence.color_mismatch_returns,
      median_dispatch_hours: evidence.median_dispatch_hours,
      evidence_strength: evidence.evidence_strength
    },
    top_issue: topIssue,
    action_items: topIssue ? [{
      priority: "high",
      title: `${label(topIssue.return_reason)} needs proof`,
      rationale: "Repeated buyer outcomes show an avoidable issue.",
      metric: topIssue.return_reason,
      fact_ids: topIssue.fact_ids
    }] : [],
    fact_ids: evidence.fact_ids
  };
}

export async function topIssueForCard(db: Db, variantId: string) {
  const issue = await avoidableIssue(db, variantId);
  return issue ? { return_reason: issue.reason, count: issue.count, fact_ids: issue.fact_ids } : null;
}

export async function sellerEvidenceCoach(db: Db, sellerId: string) {
  const c = collections(db);
  const tasks = await sellerEvidenceTasks(db, sellerId);
  const proofAssets = await c.sellerEvidenceAssets.find({ seller_id: sellerId }).sort({ created_at: -1 }).limit(24).toArray();
  const products = await c.products.find({ seller_id: sellerId }).project({ product_id: 1, title: 1, image_url: 1, cluster_id: 1 }).toArray();
  const productMap = new Map(products.map((product: any) => [product.product_id, product]));
  const proofStatusItems = proofAssets.map((asset: any) => {
    const product = productMap.get(asset.product_id);
    const quality = sellerProofQuality(asset);
    return {
      proof_id: asset.proof_id,
      product_id: asset.product_id,
      product_title: product?.title ?? asset.product_id,
      product_image_url: product?.image_url ?? null,
      attribute: asset.attribute,
      proof_type: asset.proof_type,
      status: asset.status,
      quality_score: quality.score,
      quality_label: quality.label,
      trust_lift_points: proofLiftPoints(asset.status, asset.attribute, quality.score),
      submitted_at: asset.submitted_at ?? asset.created_at,
      reviewed_at: asset.reviewed_at ?? null,
      review_notes: asset.review_notes ?? null
    };
  });
  const approved = proofStatusItems.filter((item) => item.status === "verified");
  const inReview = proofStatusItems.filter((item) => item.status === "submitted");
  const rejected = proofStatusItems.filter((item) => item.status === "rejected");
  const trustLift = proofStatusItems.reduce((sum, item) => sum + item.trust_lift_points, 0);
  return {
    seller_id: sellerId,
    open_task_count: tasks.length,
    resolved_request_count: await c.proofRequests.countDocuments({ seller_id: sellerId, status: "resolved" }),
    proof_nav: {
      approved_count: approved.length,
      in_review_count: inReview.length,
      rejected_count: rejected.length,
      products_with_proof: new Set(proofStatusItems.map((item) => item.product_id)).size,
      trust_lift_points: trustLift,
      rating_forecast: trustLift >= 16
        ? "Strong proof coverage can protect rating across repeat buyer doubts."
        : trustLift >= 8
          ? "Approved proof can improve buyer confidence on the checked products."
          : tasks.length
            ? "Submit the open proof tasks to unlock visible trust lift."
            : "Keep proof fresh so trust does not fall when buyer doubts appear."
    },
    proof_assets: proofStatusItems,
    tasks,
    privacy_guard: {
      safe_for_seller: true,
      summary: "Only aggregate proof demand is shown. No buyer identity or fit memory is exposed."
    }
  };
}

async function sellerEvidenceTasks(db: Db, sellerId: string) {
  const c = collections(db);
  const requests = await c.proofRequests.find({ seller_id: sellerId, status: "open" }).toArray();
  return Promise.all(requests.map(async (request: any) => {
    const product = await c.products.findOne({ product_id: request.product_id });
    return {
      type: "missing_buyer_proof",
      priority: request.request_count >= 3 ? "high" : "medium",
      product_id: request.product_id,
      product_title: product?.title ?? request.product_id,
      attribute: request.attribute,
      title: `${label(request.attribute)} proof requested`,
      rationale: `${request.request_count} buyer doubt(s) need aggregate proof before stronger trust.`,
      recommended_proof_type: recommendationForAttribute(request.attribute),
      buyer_demand: request.request_count,
      first_seen_at: request.created_at,
      last_seen_at: request.updated_at,
      fact_ids: [request.fact_id]
    };
  }));
}

async function sellerActionBoard(db: Db, sellerId: string, listings: any[], tasks: any[]) {
  const cards = listings
    .map((listing) => sellerActionCard(listing, tasks.find((task) => task.product_id === listing.product.product_id) ?? null))
    .sort((left, right) => priorityRank(left.priority) - priorityRank(right.priority) || left.score - right.score);
  const fallback = fallbackSellerCoach(cards, tasks.length);
  const aiCoach = await generateSellerCoach(cards, tasks.length);
  const productCoach = new Map((aiCoach.cards ?? fallback.cards).map((item: any) => [item.product_id, item]));
  const enrichedCards = cards.map((card) => ({
    ...card,
    ...mergeProductCoach(fallbackProductCoach(card), productCoach.get(card.product_id))
  }));

  return {
    headline: aiCoach.headline ?? fallback.headline,
    summary: aiCoach.summary ?? fallback.summary,
    reasons: aiCoach.reasons?.length ? aiCoach.reasons : fallback.reasons,
    agent: {
      provider: aiCoach.provider
    },
    rating_plan: aiCoach.rating_plan ?? fallback.rating_plan,
    cards: enrichedCards
  };
}

export async function generateSellerCoach(
  cards: any[],
  openProofRequests: number,
  generate: (input: StructuredGenerationInput) => Promise<GeneratedJson | null> = generateStructuredJson
) {
  const fallback = fallbackSellerCoach(cards, openProofRequests);
  try {
    const topCards = cards.slice(0, 8);
    const generated = await generate({
      capability: "text",
      systemInstruction: [
        "You are Sarthi seller coach for a Meesho-style marketplace.",
        "Use only the provided JSON evidence. Do not invent numbers, policies, guarantees, or offers.",
        "Write for small sellers who need direct practical steps, not analytics jargon.",
        "For each product, explain the issue in one short sentence, why buyers care, and the next proof/action.",
        "Do not promise a star rating increase; describe trust signal, return-risk, and approval impact only.",
        "Return JSON only with keys: headline, summary, reasons, product_coaching, rating_plan.",
        "product_coaching must be an array of objects with keys: product_id, issue_summary, buyer_impact, next_step, rating_lift, trust_steps.",
        "rating_plan must have keys: title, summary, steps, and should be framed as trust-building guidance."
      ].join(" "),
      userText: JSON.stringify({
        task: "seller_coach",
        open_proof_requests: openProofRequests,
        products: topCards.map((card) => ({
          product_id: card.product_id,
          title: card.product_title,
          priority: card.priority,
          issue: card.issue,
          action: card.action,
          metric: card.metric,
          score: card.score,
          proof_type: card.proof_type,
          evidence_reason: card.why
        }))
      }),
      schemaName: "sarthi_seller_coach",
      schemaDescription: "Grounded seller coaching for only the supplied products",
      schema: {
        type: "object",
        properties: {
          headline: { type: "string" },
          summary: { type: "string" },
          reasons: { type: "array", items: { type: "string" } },
          product_coaching: {
            type: "array",
            items: {
              type: "object",
              properties: {
                product_id: { type: "string" },
                issue_summary: { type: "string" },
                buyer_impact: { type: "string" },
                next_step: { type: "string" },
                rating_lift: { type: "string" },
                trust_steps: { type: "array", items: { type: "string" } }
              },
              required: ["product_id", "issue_summary", "buyer_impact", "next_step", "rating_lift", "trust_steps"]
            }
          },
          rating_plan: {
            type: "object",
            properties: {
              title: { type: "string" },
              summary: { type: "string" },
              steps: { type: "array", items: { type: "string" } }
            },
            required: ["title", "summary", "steps"]
          }
        },
        required: ["headline", "summary", "reasons", "product_coaching", "rating_plan"]
      },
      maxTokens: 900
    });
    const parsed = generated?.value;
    if (!generated || !parsed) {
      return {
        ...fallback,
        provider: aiConfigured("text") ? "fallback_after_llm_error" as const : "deterministic_fallback" as const
      };
    }
    const knownProductIds = new Set(topCards.map((card) => card.product_id));
    const parsedCards = Array.isArray(parsed.product_coaching)
      ? parsed.product_coaching
        .map((item: any) => normalizeProductCoach(item))
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .filter((item) => knownProductIds.has(item.product_id))
      : [];
    return {
      headline: cleanText(parsed.headline, fallback.headline),
      summary: cleanText(parsed.summary, fallback.summary),
      reasons: cleanList(parsed.reasons, fallback.reasons, 4),
      cards: parsedCards.length ? parsedCards : fallback.cards,
      rating_plan: normalizeRatingPlan(parsed.rating_plan, fallback.rating_plan),
      provider: generated.provider
    };
  } catch {
    return { ...fallback, provider: "fallback_after_llm_error" as const };
  }
}

function fallbackSellerCoach(cards: any[], openProofRequests: number) {
  const highPriority = cards.filter((card) => card.priority === "high").length;
  const topCard = cards[0];
  return {
    headline: topCard ? "Fix the products blocking buyer trust" : "Keep proof ready for new listings",
    summary: topCard
      ? `${highPriority} urgent product(s) need proof or correction. Start with ${shortTitle(topCard.product_title)}.`
      : "No urgent buyer doubt is open. Keep size, fabric, colour, and dispatch proof fresh.",
    reasons: cards.slice(0, 3).map((card) => `${shortTitle(card.product_title)}: ${card.issue} -> ${card.action}`),
    cards: cards.map((card) => fallbackProductCoach(card)),
    rating_plan: {
      title: "How to raise buyer trust",
      summary: openProofRequests
        ? `${openProofRequests} buyer proof request(s) are open. Closing them should improve trust faster than adding more generic photos.`
        : "Ratings improve when buyers receive what the listing clearly promised.",
      steps: [
        "Upload proof for the highest-demand product first.",
        "Fix size charts where returns mention fit.",
        "Add daylight colour and fabric close-up photos for listings with doubts.",
        "Keep dispatch promise realistic so prepaid buyers feel safe."
      ]
    }
  };
}

function fallbackProductCoach(card: any) {
  return {
    product_id: card.product_id,
    issue_summary: `${card.issue} is the main signal holding this listing back.`,
    buyer_impact: card.why,
    next_step: card.action,
    rating_lift: ratingLiftText(card),
    trust_steps: trustStepsForCard(card)
  };
}

function normalizeProductCoach(item: any) {
  if (!item || typeof item.product_id !== "string") return null;
  return {
    product_id: item.product_id,
    issue_summary: cleanText(item.issue_summary, ""),
    buyer_impact: cleanText(item.buyer_impact, ""),
    next_step: cleanText(item.next_step, ""),
    rating_lift: cleanText(item.rating_lift, ""),
    trust_steps: cleanList(item.trust_steps, [], 3)
  };
}

function mergeProductCoach(fallback: any, ai: any) {
  if (!ai) return fallback;
  return {
    product_id: fallback.product_id,
    issue_summary: safeCoachText(ai.issue_summary, fallback.issue_summary),
    buyer_impact: safeCoachText(ai.buyer_impact, fallback.buyer_impact),
    next_step: safeCoachText(ai.next_step, fallback.next_step),
    rating_lift: safeCoachText(ai.rating_lift, fallback.rating_lift, 12),
    trust_steps: Array.isArray(ai.trust_steps) && ai.trust_steps.length
      ? ai.trust_steps.map((step: unknown) => safeCoachText(step, "")).filter(Boolean).slice(0, 3)
      : fallback.trust_steps
  };
}

function normalizeRatingPlan(value: any, fallback: any) {
  if (!value || typeof value !== "object") return fallback;
  return {
    title: cleanText(value.title, fallback.title),
    summary: cleanText(value.summary, fallback.summary),
    steps: cleanList(value.steps, fallback.steps, 4)
  };
}

function cleanText(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 180) : fallback;
}

function safeCoachText(value: unknown, fallback: string, minLength = 4) {
  const text = cleanText(value, fallback)
    .replace(/\bsarees?\b/gi, "product")
    .replace(/\blehenga(s)?\b/gi, "product")
    .replace(/\bjeans\b/gi, "product");
  return text.length >= minLength ? text : fallback;
}

function cleanList(value: unknown, fallback: string[], maxItems: number) {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => cleanText(item, ""))
    .filter(Boolean)
    .slice(0, maxItems);
  return cleaned.length ? cleaned : fallback;
}

function ratingLiftText(card: any) {
  if (card.priority === "high") return "Can reduce avoidable return risk on this product.";
  if (card.priority === "medium") return "Can improve buyer confidence before this becomes a return pattern.";
  return "Keeps trust stable while new evidence grows.";
}

function trustStepsForCard(card: any) {
  if (card.proof_type === "measurement_chart") {
    return ["Show chest and length clearly", "Mention if fit runs tight or loose", "Update XL/L values before next sale"];
  }
  if (card.proof_type === "fabric_closeup") {
    return ["Upload close fabric photo", "Mention lining or transparency honestly", "Keep same fabric proof on all variants"];
  }
  if (card.proof_type === "daylight_photo") {
    return ["Upload daylight colour photo", "Avoid heavy filters", "Show front and sleeve colour together"];
  }
  return ["Keep listing promise clear", "Add latest proof", "Watch returns after the change"];
}

function shortTitle(title: string) {
  return title.split("-")[0].trim();
}

function sellerActionCard(listing: any, task: any | null) {
  const topIssue = listing.top_issue;
  const returnRate = listing.metrics.return_rate;
  const fitRate = listing.metrics.fit_as_expected_rate;
  const colorRate = listing.metrics.color_match_rate;
  const score = listing.quality_score ?? 0;
  if (task) {
    return {
      product_id: listing.product.product_id,
      product_title: listing.product.title,
      image_url: listing.product.image_url,
      priority: task.priority,
      issue: `${label(task.attribute)} doubt`,
      action: `Add ${proofTypeLabel(task.recommended_proof_type)}`,
      why: `${task.buyer_demand} buyer request(s) are waiting for proof before trust can improve.`,
      proof_type: task.recommended_proof_type,
      metric: `${task.buyer_demand} asks`,
      score
    };
  }
  if (topIssue) {
    return {
      product_id: listing.product.product_id,
      product_title: listing.product.title,
      image_url: listing.product.image_url,
      priority: "high",
      issue: label(topIssue.return_reason),
      action: topIssue.return_reason.includes("size") ? "Fix size chart" : "Add clear product proof",
      why: `${topIssue.count} return issue(s) show this is hurting buyer confidence.`,
      proof_type: topIssue.return_reason.includes("size") ? "measurement_chart" : "daylight_photo",
      metric: `${topIssue.count} returns`,
      score
    };
  }
  if (returnRate !== null && returnRate > 0.18) {
    return {
      product_id: listing.product.product_id,
      product_title: listing.product.title,
      image_url: listing.product.image_url,
      priority: "medium",
      issue: "High returns",
      action: "Check product photos and dispatch promise",
      why: `${Math.round(returnRate * 100)}% return rate is above the safe band.`,
      proof_type: "seller_note",
      metric: `${Math.round(returnRate * 100)}% returns`,
      score
    };
  }
  if (fitRate !== null && fitRate < 0.86) {
    return {
      product_id: listing.product.product_id,
      product_title: listing.product.title,
      image_url: listing.product.image_url,
      priority: "medium",
      issue: "Fit confusion",
      action: "Upload measurement chart",
      why: `Only ${Math.round(fitRate * 100)}% fit feedback is positive.`,
      proof_type: "measurement_chart",
      metric: `${Math.round(fitRate * 100)}% fit ok`,
      score
    };
  }
  if (colorRate !== null && colorRate < 0.9) {
    return {
      product_id: listing.product.product_id,
      product_title: listing.product.title,
      image_url: listing.product.image_url,
      priority: "medium",
      issue: "Colour mismatch",
      action: "Upload daylight photo",
      why: `Colour match is ${Math.round(colorRate * 100)}%, so buyers need clearer photos.`,
      proof_type: "daylight_photo",
      metric: `${Math.round(colorRate * 100)}% colour`,
      score
    };
  }
  if (listing.metrics.evidence_strength === "weak" || listing.metrics.evidence_strength === "unknown") {
    return {
      product_id: listing.product.product_id,
      product_title: listing.product.title,
      image_url: listing.product.image_url,
      priority: "low",
      issue: "New data",
      action: "Add proof early",
      why: "Evidence is thin, so proof helps buyers trust this listing faster.",
      proof_type: "fabric_closeup",
      metric: `${listing.metrics.delivered_orders_90d} orders`,
      score
    };
  }
  return {
    product_id: listing.product.product_id,
    product_title: listing.product.title,
    image_url: listing.product.image_url,
    priority: "low",
    issue: "Stable",
    action: "Keep proof fresh",
    why: "Listing is stable. Keep size, fabric, and colour proof updated.",
    proof_type: "seller_note",
    metric: `${Math.round((listing.metrics.kept_rate ?? 0) * 100)}% kept`,
    score
  };
}

export async function submitSellerEvidence(db: Db, sellerId: string, body: any) {
  const c = collections(db);
  const product = await c.products.findOne({ product_id: body.product_id });
  if (!product || product.seller_id !== sellerId) {
    const error = new Error("Cannot submit proof for another seller listing");
    (error as any).statusCode = 403;
    throw error;
  }
  validateSellerEvidenceUpload(body);
  const proof_id = id("proof");
  const fact_id = id("fact_proof");
  await c.sellerEvidenceAssets.insertOne({
    proof_id,
    seller_id: sellerId,
    product_id: body.product_id,
    attribute: body.attribute,
    proof_type: body.proof_type,
    title: body.title,
    description: body.description,
    asset_url: body.asset_url,
    status: "submitted",
    created_at: nowIso(),
    submitted_at: nowIso(),
    reviewed_at: null,
    review_notes: null,
    fact_id
  });
  const update = await c.proofRequests.updateMany(
    { seller_id: sellerId, product_id: body.product_id, attribute: body.attribute, status: "open" },
    { $set: { status: "submitted", resolution_proof_id: proof_id, updated_at: nowIso() } }
  );
  await c.facts.insertOne({
    fact_id,
    source_table: "seller_evidence_assets",
    source_id: proof_id,
    source_type: "seller_proof",
    summary: `${label(body.attribute)} proof submitted by seller for admin review.`,
    created_at: nowIso(),
    expires_at: null
  });
  return {
    proof_id,
    seller_id: sellerId,
    product_id: body.product_id,
    attribute: body.attribute,
    proof_type: body.proof_type,
    status: "submitted",
    fact_id,
    resolved_open_requests: update.modifiedCount,
    submitted_for_review: true
  };
}

export async function sellerOnboarding(db: Db, sellerId: string) {
  const c = collections(db);
  const sellerList = await listSellers(db);
  const seller = sellerList.find((item) => item.seller_id === sellerId) ?? {
    seller_id: sellerId,
    name: "",
    median_dispatch_hours: 48,
    current_rating: null,
    rating_count: 0,
    product_count: 0,
    cluster_ids: []
  };
  const [application, documents, drafts, verification] = await Promise.all([
    c.sellerApplications.findOne({ seller_id: sellerId }, { sort: { created_at: -1 } }),
    c.sellerVerificationDocuments.find({ seller_id: sellerId }).toArray(),
    c.listingDrafts.find({ seller_id: sellerId }).toArray(),
    sellerVerification(db, sellerId)
  ]);
  const missingDocs = ["gst_certificate", "address_proof", "bank_proof"].filter((type) => !documents.some((doc: any) => doc.document_type === type));
  return {
    seller: { ...seller, product_count: seller.product_count },
    seller_verification: verification,
    application: application ? withoutId(application) : null,
    documents: documents.map(withoutId),
    listing_drafts: drafts.map(withoutId),
    policy: {
      buyer_feed_blocked_until: ["seller verification approved", "listing draft approved"],
      personal_buyer_data_used: false,
      new_listing_default: "limited_evidence"
    },
    next_actions: [
      ...missingDocs.map((doc) => ({ priority: "high", title: `Upload ${label(doc)}`, detail: "Required for seller verification.", blocked: true })),
      ...(verification.verification_status !== "verified" ? [{ priority: "high", title: "Wait for admin verification", detail: "Buyer-facing trust remains limited until approval.", blocked: true }] : [])
    ]
  };
}

export async function submitSellerDocument(db: Db, sellerId: string, body: any) {
  const file = validateSellerDocumentUpload(body);
  const document = {
    document_id: id("doc"),
    seller_id: sellerId,
    document_type: body.document_type,
    reference: String(body.reference ?? "").trim(),
    file_name: file.fileName,
    mime_type: file.mimeType,
    file_size_bytes: file.size,
    sha256: sha256Bytes(file.buffer),
    storage_uri: `mongodb-atlas/seller_documents/${sellerId}/${file.fileName}`,
    uploaded_at: nowIso(),
    status: "submitted",
    submitted_at: nowIso(),
    reviewed_at: null,
    notes: "Submitted for TrustOps review."
  };
  await collections(db).sellerVerificationDocuments.insertOne(document);
  return sellerOnboarding(db, sellerId);
}

export async function createListingDraft(db: Db, sellerId: string, body: any) {
  if (!isRecognizedProductImage(String(body.image_url ?? ""))) {
    throwBadRequest("Listing image must be an uploaded image, https URL, seeded image, or seller asset reference.");
  }
  const verification = await sellerVerification(db, sellerId);
  const draft = {
    draft_id: id("draft"),
    seller_id: sellerId,
    ...body,
    target_cluster_id: await suggestCluster(db, body),
    status: "draft",
    readiness_status: verification.verification_status === "verified" ? "catalog_only" : "blocked_seller_verification",
    created_at: nowIso(),
    updated_at: nowIso(),
    submitted_at: null
  };
  await collections(db).listingDrafts.insertOne(draft);
  return sellerOnboarding(db, sellerId);
}

export async function submitListingDraft(db: Db, sellerId: string, draftId: string) {
  await collections(db).listingDrafts.updateOne(
    { draft_id: draftId, seller_id: sellerId },
    { $set: { status: "submitted", updated_at: nowIso(), submitted_at: nowIso() } }
  );
  return sellerOnboarding(db, sellerId);
}

export async function correctSellerMeasurement(db: Db, sellerId: string, productId: string, body: { l_chest: number; xl_chest: number }) {
  await assertSellerOwnsProduct(db, sellerId, productId);
  if (!Number.isFinite(body.l_chest) || !Number.isFinite(body.xl_chest) || body.l_chest <= 0 || body.xl_chest <= body.l_chest) {
    throwBadRequest("XL chest measurement must be greater than L chest measurement.");
  }
  const c = collections(db);
  const proof_id = id("measurement_fix");
  const fact_id = id("fact_measurement_fix");
  const submittedAt = nowIso();
  const measurements = {
    l_chest_inches: Number(body.l_chest.toFixed(1)),
    xl_chest_inches: Number(body.xl_chest.toFixed(1))
  };

  const [lUpdate, xlUpdate] = await Promise.all([
    c.variants.updateOne(
      { product_id: productId, size: "L" },
      {
        $set: {
          chest_inches: measurements.l_chest_inches,
          measurement_status: "pending_admin_review",
          measurement_updated_at: submittedAt,
          measurement_proof_id: proof_id
        }
      }
    ),
    c.variants.updateOne(
      { product_id: productId, size: "XL" },
      {
        $set: {
          chest_inches: measurements.xl_chest_inches,
          measurement_status: "pending_admin_review",
          measurement_updated_at: submittedAt,
          measurement_proof_id: proof_id
        }
      }
    )
  ]);

  if (!lUpdate.matchedCount || !xlUpdate.matchedCount) {
    throwBadRequest("Both L and XL variants are required before submitting a size correction.");
  }

  await c.sellerEvidenceAssets.insertOne({
    proof_id,
    seller_id: sellerId,
    product_id: productId,
    attribute: "size",
    proof_type: "measurement_chart",
    title: "Updated L and XL chest measurements",
    description: `Seller corrected L chest to ${measurements.l_chest_inches} in and XL chest to ${measurements.xl_chest_inches} in for admin review.`,
    asset_url: `seller-asset://measurement-correction/${proof_id}`,
    status: "submitted",
    created_at: submittedAt,
    submitted_at: submittedAt,
    reviewed_at: null,
    review_notes: null,
    fact_id,
    measurements
  });

  const requests = await c.proofRequests.updateMany(
    { seller_id: sellerId, product_id: productId, attribute: "size", status: "open" },
    { $set: { status: "submitted", resolution_proof_id: proof_id, updated_at: submittedAt } }
  );

  await c.facts.insertOne({
    fact_id,
    source_table: "seller_evidence_assets",
    source_id: proof_id,
    source_type: "seller_measurement_correction",
    summary: `Seller submitted updated size measurements for admin review: L ${measurements.l_chest_inches} in, XL ${measurements.xl_chest_inches} in.`,
    created_at: submittedAt,
    expires_at: null
  });

  return {
    ok: true,
    status: "pending_evidence_review",
    proof_id,
    fact_id,
    product_id: productId,
    measurements,
    resolved_open_requests: requests.modifiedCount
  };
}

export async function assertSellerOwnsProduct(db: Db, sellerId: string, productId: string) {
  const product = await collections(db).products.findOne({ product_id: productId });
  if (!product || product.seller_id !== sellerId) {
    const error = new Error("Cannot edit another seller listing");
    (error as any).statusCode = 403;
    throw error;
  }
}

function recommendationForAttribute(attribute: string) {
  const map: Record<string, string> = {
    transparency: "daylight_photo",
    fabric: "fabric_closeup",
    color: "daylight_photo",
    size: "measurement_chart",
    packaging: "packaging_photo",
    offer: "seller_note"
  };
  return map[attribute] ?? "seller_note";
}

function validateSellerEvidenceUpload(body: any) {
  const expectedProofType = recommendationForAttribute(body.attribute);
  if (body.proof_type !== expectedProofType) {
    throwBadRequest(`${label(body.attribute)} proof must use ${proofTypeLabel(expectedProofType)}.`);
  }
  if (!isRecognizedProofAsset(String(body.asset_url ?? ""))) {
    throwBadRequest("Proof asset must be an uploaded file, secure https URL, seeded proof, or seller asset reference.");
  }
}

function isRecognizedProofAsset(value: string) {
  return value.startsWith("https://") ||
    value.startsWith("seller-asset://") ||
    value.startsWith("seeded://") ||
    value.startsWith("uploaded://") ||
    isRecognizedDataAsset(value, ["image/jpeg", "image/png", "image/webp", "application/pdf"], 2_750_000);
}

function isRecognizedProductImage(value: string) {
  return value.startsWith("https://") ||
    value.startsWith("seller-asset://") ||
    value.startsWith("seeded://") ||
    value.startsWith("uploaded://") ||
    isRecognizedDataAsset(value, ["image/jpeg", "image/png", "image/webp"], 1_750_000);
}

function validateSellerDocumentUpload(body: any) {
  const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
  const mimeType = String(body.mime_type ?? "").trim().toLowerCase();
  if (!allowedMimeTypes.includes(mimeType)) {
    throwBadRequest("Seller document must be a PDF, JPG, PNG, or WebP file.");
  }
  const fileName = safeSellerFileName(body.file_name);
  const lowerFileName = fileName.toLowerCase();
  const extensionMatches = (
    (mimeType === "application/pdf" && lowerFileName.endsWith(".pdf")) ||
    (mimeType === "image/jpeg" && /\.(jpg|jpeg)$/.test(lowerFileName)) ||
    (mimeType === "image/png" && lowerFileName.endsWith(".png")) ||
    (mimeType === "image/webp" && lowerFileName.endsWith(".webp"))
  );
  if (!extensionMatches) {
    throwBadRequest("Seller document file extension must match its file type.");
  }
  const content = String(body.content_base64 ?? "").replace(/\s+/g, "");
  if (!isValidBase64Content(content)) {
    throwBadRequest("Seller document file could not be verified or is larger than 2.5 MB.");
  }
  const buffer = Buffer.from(content, "base64");
  if (buffer.length < 32 || buffer.length > 2_500_000 || buffer.toString("base64").replace(/=+$/, "") !== content.replace(/=+$/, "")) {
    throwBadRequest("Seller document file could not be verified or is larger than 2.5 MB.");
  }
  return { fileName, mimeType, size: buffer.length, buffer };
}

function safeSellerFileName(value: unknown) {
  const fileName = String(value ?? "").trim();
  if (
    !fileName ||
    fileName.includes("/") ||
    fileName.includes("\\") ||
    fileName.includes("..") ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}$/.test(fileName)
  ) {
    throwBadRequest("Seller document file name is not safe for review storage.");
  }
  return fileName;
}

function isRecognizedDataAsset(value: string, allowedMimeTypes: string[], maxBytes: number) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match || !allowedMimeTypes.includes(match[1])) return false;
  const content = match[2].replace(/\s+/g, "");
  if (!isValidBase64Content(content)) return false;
  const buffer = Buffer.from(content, "base64");
  return buffer.length > 0 &&
    buffer.length <= maxBytes &&
    buffer.toString("base64").replace(/=+$/, "") === content.replace(/=+$/, "");
}

function isValidBase64Content(value: string) {
  return value.length > 0 && value.length % 4 !== 1 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function throwBadRequest(message: string): never {
  const error = new Error(message);
  (error as any).statusCode = 400;
  throw error;
}

function sellerProofQuality(asset: any) {
  const hasAsset = Boolean(asset.asset_url);
  const hasTitle = Boolean(asset.title && String(asset.title).length >= 8);
  const hasDescription = Boolean(asset.description && String(asset.description).length >= 24);
  const reviewed = asset.status === "verified";
  const score = Math.max(0, Math.min(100,
    (hasAsset ? 28 : 0) +
    (hasTitle ? 18 : 0) +
    (hasDescription ? 24 : 0) +
    (reviewed ? 30 : asset.status === "submitted" ? 12 : 0)
  ));
  return {
    score,
    label: score >= 82 ? "Strong proof" : score >= 55 ? "Needs review" : "Weak proof"
  };
}

function proofLiftPoints(status: string, attribute: string, qualityScore: number) {
  const attributeBase: Record<string, number> = {
    size: 7,
    fabric: 6,
    transparency: 6,
    color: 5,
    packaging: 4,
    offer: 3
  };
  const base = attributeBase[attribute] ?? 4;
  const multiplier = status === "verified" ? 1 : status === "submitted" ? 0.45 : 0.1;
  return Math.floor(base * multiplier * Math.max(0.4, qualityScore / 100));
}

function rankClusterCards(cards: any[]) {
  const ranked = [...cards].sort((left, right) => (right.quality_score ?? 0) - (left.quality_score ?? 0));
  return cards.map((card) => ({
    ...card,
    cluster_position: ranked.findIndex((item) => item.variant.variant_id === card.variant.variant_id) + 1
  }));
}

function proofTypeLabel(value: string) {
  const map: Record<string, string> = {
    daylight_photo: "daylight photo",
    fabric_closeup: "fabric close-up",
    measurement_chart: "measurement chart",
    packaging_photo: "packaging photo",
    seller_note: "seller note"
  };
  return map[value] ?? label(value).toLowerCase();
}

function priorityRank(priority: string) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

async function suggestCluster(db: Db, draft: any) {
  const similarCluster = await suggestClusterFromSimilarListings(db, draft);
  if (similarCluster) return similarCluster;
  const category = draft.category ?? "misc";
  const garmentType = draft.garment_type ?? "product";
  const colorFamily = draft.color_family ?? "mixed";
  const cluster = await collections(db).clusters.findOne({ category });
  return cluster?.cluster_id ?? `cluster_${category}_${garmentType}_${colorFamily}`.replaceAll(" ", "_").toLowerCase();
}

function sellerRating(products: any[]) {
  const rated = products.filter((product) => typeof product.rating === "number");
  const ratingCount = rated.reduce((sum, product) => sum + Number(product.rating_count ?? 0), 0);
  if (!rated.length) {
    return { current_rating: null as number | null, rating_count: 0 };
  }
  const weighted = rated.reduce((sum, product) => {
    const count = Math.max(1, Number(product.rating_count ?? 0));
    return sum + Number(product.rating) * count;
  }, 0);
  const denominator = rated.reduce((sum, product) => sum + Math.max(1, Number(product.rating_count ?? 0)), 0);
  return {
    current_rating: Number((weighted / Math.max(1, denominator)).toFixed(1)),
    rating_count: ratingCount
  };
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(3));
}
