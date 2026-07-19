import type {
  ListingDraft,
  SellerActionBoard,
  SellerEvidenceCoachResponse,
  SellerEvidenceCoachTask,
  SellerOnboardingResponse,
  SellerPanelListing,
  SellerPanelResponse
} from "../../types/api";

export type SellerRoute = "today" | "products" | "new" | "proofs" | "market";
export type SellerActionType = "verification" | "proof" | "product" | "draft" | "new";

export type SellerActionItem = {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  reason: string;
  meta: string;
  actionLabel: string;
  action: { type: SellerActionType; id?: string };
  proofTask?: SellerEvidenceCoachTask;
};

export type SellerProductRow = {
  listing: SellerPanelListing;
  state: "attention" | "review" | "healthy";
  status: string;
  concern: string;
  evidence: string;
  position: string;
  actionLabel: string;
  actionKind: "proof" | "measurement" | "market";
  proofTask?: SellerEvidenceCoachTask;
};

export type SellerProofAsset = SellerEvidenceCoachResponse["proof_assets"][number];

export type SellerProofLanes = {
  openTasks: SellerEvidenceCoachTask[];
  rejected: SellerProofAsset[];
  inReview: SellerProofAsset[];
  buyerVisible: SellerProofAsset[];
};

export type MarketDimension = {
  label: string;
  yourValue: string;
  marketValue: string;
  tone: "good" | "neutral" | "watch";
};

export type MarketComparison = {
  position: string;
  reason: string;
  dimensions: MarketDimension[];
  recommendation: SellerActionItem;
};

const PRIORITY_RANK = { high: 0, medium: 1, low: 2 } as const;

export function parseSellerRoute(pathname: string, search = ""): SellerRoute {
  const normalized = pathname.replace(/\/$/, "") || "/seller";
  if (normalized === "/seller/products") return "products";
  if (normalized === "/seller/new") return "new";
  if (normalized === "/seller/proofs") return "proofs";
  if (
    normalized === "/seller/market" ||
    normalized.startsWith("/seller/trust-coach") ||
    normalized.startsWith("/seller/listing-lab") ||
    normalized.startsWith("/seller/rating-forecast") ||
    normalized.startsWith("/seller/copilot") ||
    normalized.startsWith("/seller/autopilot")
  ) {
    return "market";
  }

  const legacyTab = new URLSearchParams(search).get("tab");
  if (legacyTab === "products") return "products";
  if (legacyTab === "add_product") return "new";
  if (legacyTab === "proofs_submitted") return "proofs";
  if (legacyTab === "performance") return "market";
  return "today";
}

export function routePath(route: SellerRoute): string {
  if (route === "today") return "/seller";
  return `/seller/${route}`;
}

export function buildSellerActions(input: {
  onboarding: SellerOnboardingResponse | null;
  panel: SellerPanelResponse | null;
  coach: SellerEvidenceCoachResponse | null;
}): SellerActionItem[] {
  const actions: SellerActionItem[] = [];
  const verification = input.onboarding?.seller_verification ?? input.panel?.seller_verification;
  if (verification && verification.verification_status !== "verified") {
    actions.push({
      id: "verification",
      priority: "high",
      title: "Complete seller verification",
      reason: verification.restricted_reason || "Buyer visibility stays blocked until the required seller documents are approved.",
      meta: labelize(verification.verification_status),
      actionLabel: "Review verification",
      action: { type: "verification" }
    });
  }

  for (const asset of input.coach?.proof_assets.filter((item) => item.status === "rejected") ?? []) {
    actions.push({
      id: `rejected-${asset.proof_id}`,
      priority: "high",
      title: `Replace rejected ${proofTypeLabel(asset.proof_type)}`,
      reason: asset.review_notes || "The reviewer needs clearer proof for this product.",
      meta: asset.product_title,
      actionLabel: "Open proof requests",
      action: { type: "proof", id: asset.product_id }
    });
  }

  for (const task of input.coach?.tasks ?? []) {
    actions.push({
      id: `proof-${task.product_id}-${task.attribute}`,
      priority: task.priority,
      title: task.title,
      reason: proofTaskReason(task),
      meta: `${task.product_title} · ${task.buyer_demand} buyer ${task.buyer_demand === 1 ? "ask" : "asks"}`,
      actionLabel: "Upload proof",
      action: { type: "proof", id: task.product_id },
      proofTask: task
    });
  }

  const taskProductIds = new Set((input.coach?.tasks ?? []).map((task) => task.product_id));
  for (const card of input.panel?.action_board?.cards ?? []) {
    if (taskProductIds.has(card.product_id)) continue;
    actions.push(actionFromBoard(card));
  }

  for (const draft of input.onboarding?.listing_drafts ?? []) {
    if (draft.status !== "draft" && draft.status !== "needs_revision") continue;
    actions.push(actionFromDraft(draft));
  }

  if (!actions.length && !(input.panel?.seller.product_count || input.onboarding?.seller.product_count)) {
    actions.push({
      id: "first-listing",
      priority: "low",
      title: "Create your first listing",
      reason: "Add clear product facts and a current image before sending the listing for review.",
      meta: "No live products",
      actionLabel: "New listing",
      action: { type: "new" }
    });
  }

  return actions.sort((first, second) => PRIORITY_RANK[first.priority] - PRIORITY_RANK[second.priority]);
}

function actionFromBoard(card: SellerActionBoard["cards"][number]): SellerActionItem {
  return {
    id: `product-${card.product_id}`,
    priority: card.priority,
    title: card.action || card.issue,
    reason: card.why || card.issue_summary || "This product has a buyer trust issue that needs review.",
    meta: card.product_title,
    actionLabel: "Review product",
    action: { type: "product", id: card.product_id }
  };
}

function actionFromDraft(draft: ListingDraft): SellerActionItem {
  const revision = draft.status === "needs_revision";
  return {
    id: `draft-${draft.draft_id}`,
    priority: revision ? "medium" : "low",
    title: revision ? "Revise listing draft" : "Finish listing draft",
    reason: revision ? "A reviewer requested changes before this listing can continue." : "The listing is saved but has not been sent for review.",
    meta: draft.title,
    actionLabel: revision ? "Fix listing" : "Review draft",
    action: { type: "draft", id: draft.draft_id }
  };
}

export function buildProductRows(
  listings: SellerPanelListing[],
  tasks: SellerEvidenceCoachTask[]
): SellerProductRow[] {
  return listings.map((listing) => {
    const requestedTask = tasks.find((item) => item.product_id === listing.product.product_id);
    const task = requestedTask ?? proofTaskFromIssue(listing);
    const firstAction = listing.action_items[0];
    const attention = Boolean(task || listing.decision_status === "needs_seller_action" || firstAction?.priority === "high");
    const review = !attention && listing.decision_status === "insufficient_evidence";
    const actionKind = requestedTask?.recommended_proof_type === "measurement_chart"
      ? "measurement"
      : task
        ? "proof"
        : "market";
    return {
      listing,
      state: attention ? "attention" : review ? "review" : "healthy",
      status: attention ? "Needs action" : review ? "Evidence building" : "Healthy",
      concern: task?.title || (listing.top_issue ? labelize(listing.top_issue.return_reason) : null) || firstAction?.title || "No active buyer concern",
      evidence: `${labelize(listing.metrics.evidence_strength)} evidence`,
      position: listing.cluster_position ? `#${listing.cluster_position} in comparable listings` : "Position unavailable",
      actionLabel: actionKind === "measurement" ? "Update measurements" : actionKind === "proof" ? "Upload proof" : "Market compare",
      actionKind,
      proofTask: task
    };
  });
}

function proofTaskFromIssue(listing: SellerPanelListing): SellerEvidenceCoachTask | undefined {
  const issue = listing.top_issue;
  if (!issue) return undefined;
  const proofByReason: Record<string, {
    attribute: SellerEvidenceCoachTask["attribute"];
    proofType: SellerEvidenceCoachTask["recommended_proof_type"];
    title: string;
  }> = {
    too_large: { attribute: "size", proofType: "measurement_chart", title: "Clarify product measurements" },
    too_small: { attribute: "size", proofType: "measurement_chart", title: "Clarify product measurements" },
    color_different: { attribute: "color", proofType: "daylight_photo", title: "Show the product's real colour" },
    fabric_different: { attribute: "fabric", proofType: "fabric_closeup", title: "Show the actual fabric" },
    damaged: { attribute: "packaging", proofType: "packaging_photo", title: "Show how the product is packed" },
    wrong_item: { attribute: "packaging", proofType: "packaging_photo", title: "Show product and dispatch labels" }
  };
  const proof = proofByReason[issue.return_reason];
  if (!proof) return undefined;
  return {
    type: "broken_expectation",
    priority: "high",
    product_id: listing.product.product_id,
    product_title: listing.product.title,
    attribute: proof.attribute,
    title: proof.title,
    rationale: `Evidence from ${issue.count} recent ${issue.count === 1 ? "return" : "returns"} indicates ${labelize(issue.return_reason).toLowerCase()}. Add evidence that a reviewer can check.`,
    recommended_proof_type: proof.proofType,
    buyer_demand: issue.count,
    first_seen_at: "",
    last_seen_at: "",
    fact_ids: issue.fact_ids
  };
}

export function buildProofLanes(coach: SellerEvidenceCoachResponse | null): SellerProofLanes {
  const tasks = [...(coach?.tasks ?? [])].sort((first, second) => PRIORITY_RANK[first.priority] - PRIORITY_RANK[second.priority]);
  const assets = coach?.proof_assets ?? [];
  return {
    openTasks: tasks,
    rejected: assets.filter((asset) => asset.status === "rejected"),
    inReview: assets.filter((asset) => asset.status === "submitted"),
    buyerVisible: assets.filter((asset) => asset.status === "verified")
  };
}

export function buildMarketComparison(
  listing: SellerPanelListing,
  competitors: SellerPanelListing[],
  actions: SellerActionItem[]
): MarketComparison {
  const pool = competitors.filter((candidate) => candidate.product.product_id !== listing.product.product_id);
  const strongerEvidence = pool.filter((candidate) => evidenceRank(listing.metrics.evidence_strength) > evidenceRank(candidate.metrics.evidence_strength)).length;
  const position = pool.length
    ? strongerEvidence > 0
      ? `Stronger evidence than ${strongerEvidence} of ${pool.length} comparable listings`
      : "Evidence is level with or behind comparable listings"
    : "Comparable listing evidence is not available";
  const clusterReturnRates = pool.map((candidate) => candidate.metrics.return_rate).filter(isNumber);
  const clusterRatings = pool.map((candidate) => candidate.product.rating).filter((rating) => Number.isFinite(rating) && rating > 0);
  const clusterFitRates = pool.map((candidate) => candidate.metrics.fit_as_expected_rate).filter(isNumber);
  const clusterDispatch = pool.map((candidate) => candidate.metrics.median_dispatch_hours).filter(isNumber);
  const recommendation = actions.find((action) => action.action.id === listing.product.product_id) ?? {
    id: `market-${listing.product.product_id}`,
    priority: "low" as const,
    title: "Keep product evidence current",
    reason: "No urgent proof or return issue is open for this product.",
    meta: listing.product.title,
    actionLabel: "View product",
    action: { type: "product" as const, id: listing.product.product_id }
  };

  return {
    position,
    reason: listing.action_items[0]?.rationale || "Position uses available product outcomes, dispatch, and evidence strength.",
    dimensions: [
      {
        label: "Price",
        yourValue: formatMoney(listing.variant.current_price),
        marketValue: pool.length ? `From ${formatMoney(Math.min(...pool.map((item) => item.variant.current_price)))}` : "Not available",
        tone: "neutral"
      },
      {
        label: "Buyer rating",
        yourValue: listing.product.rating_count
          ? `${listing.product.rating.toFixed(1)} from ${listing.product.rating_count.toLocaleString("en-IN")} ratings`
          : "No ratings yet",
        marketValue: clusterRatings.length ? `${average(clusterRatings).toFixed(1)} average` : "Not available",
        tone: listing.product.rating_count ? compareHigher(listing.product.rating, clusterRatings) : "neutral"
      },
      {
        label: "Return behavior",
        yourValue: formatPercent(listing.metrics.return_rate),
        marketValue: clusterReturnRates.length ? `${formatPercent(average(clusterReturnRates))} average` : "Not available",
        tone: compareLower(listing.metrics.return_rate, clusterReturnRates)
      },
      {
        label: "Fit feedback",
        yourValue: formatPercent(listing.metrics.fit_as_expected_rate),
        marketValue: clusterFitRates.length ? `${formatPercent(average(clusterFitRates))} average` : "Not available",
        tone: compareHigher(listing.metrics.fit_as_expected_rate, clusterFitRates)
      },
      {
        label: "Dispatch",
        yourValue: `${listing.metrics.median_dispatch_hours} hours`,
        marketValue: clusterDispatch.length ? `${Math.round(average(clusterDispatch))} hours average` : "Not available",
        tone: compareLower(listing.metrics.median_dispatch_hours, clusterDispatch)
      },
      {
        label: "Evidence",
        yourValue: labelize(listing.metrics.evidence_strength),
        marketValue: pool.length
          ? strongerEvidence > 0
            ? `${strongerEvidence} listings have weaker evidence`
            : "No comparable listing has weaker evidence"
          : "Not available",
        tone: listing.metrics.evidence_strength === "strong" ? "good" : "watch"
      }
    ],
    recommendation
  };
}

function compareLower(value: number | null, comparison: number[]): MarketDimension["tone"] {
  if (!isNumber(value) || !comparison.length) return "neutral";
  return value <= average(comparison) ? "good" : "watch";
}

function compareHigher(value: number | null, comparison: number[]): MarketDimension["tone"] {
  if (!isNumber(value) || !comparison.length) return "neutral";
  return value >= average(comparison) ? "good" : "watch";
}

function evidenceRank(value: SellerPanelListing["metrics"]["evidence_strength"]): number {
  return { unknown: 0, weak: 1, medium: 2, strong: 3 }[value];
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function formatPercent(value: number | null): string {
  return isNumber(value) ? `${Math.round(value * 100)}%` : "Not enough data";
}

export function formatMoney(value: number): string {
  return `₹${Math.round(value).toLocaleString("en-IN")}`;
}

export function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter: string) => letter.toUpperCase());
}

export function proofTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    daylight_photo: "Daylight photo",
    fabric_closeup: "Fabric close-up",
    measurement_chart: "Measurement chart",
    packaging_photo: "Packaging photo",
    seller_note: "Seller note"
  };
  return labels[value] ?? labelize(value);
}

export function proofTaskReason(task: SellerEvidenceCoachTask): string {
  if (/buyer doubt\(s\).*aggregate proof/i.test(task.rationale)) {
    return `${task.buyer_demand} buyer ${task.buyer_demand === 1 ? "request is" : "requests are"} waiting for verifiable product evidence.`;
  }
  return task.rationale.replace(/\bbuyer doubt\(s\)\b/gi, task.buyer_demand === 1 ? "buyer question" : "buyer questions");
}

export function proofTaskContext(task: SellerEvidenceCoachTask): "buyer-request" | "return-signal" | "rejected-proof" {
  if (task.type === "missing_buyer_proof") return "buyer-request";
  return task.fact_ids.length ? "return-signal" : "rejected-proof";
}
