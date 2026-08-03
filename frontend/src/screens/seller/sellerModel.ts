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

export type SellerProofPacket = {
  task: SellerEvidenceCoachTask;
  taskKey: string;
  title: string;
  productTitle: string;
  proofType: string;
  buyerDemand: number;
  trustLift: number;
  target: string;
  prefillTitle: string;
  prefillDescription: string;
  checklist: string[];
  reviewerGate: string;
};

export type SellerBulkProofGroup = {
  key: string;
  title: string;
  detail: string;
  productCount: number;
  buyerDemand: number;
  trustLift: number;
  taskKeys: string[];
  firstTask: SellerEvidenceCoachTask;
};

export type SellerListingSuggestion = {
  productId: string;
  title: string;
  reason: string;
  action: string;
  tone: "urgent" | "watch" | "stable";
};

export type SellerClaimRisk = {
  productId: string;
  title: string;
  issue: string;
  riskyClaim: string;
  saferClaim: string;
  evidenceNeeded: string;
  action: string;
  tone: "urgent" | "watch";
};

export type SellerAutomationActivity = {
  key: string;
  label: string;
  detail: string;
  status: "done" | "next" | "blocked";
};

export type SellerAutomationSummary = {
  headline: string;
  summary: string;
  stats: Array<{ label: string; value: string; detail: string }>;
  proofPacket: SellerProofPacket | null;
  bulkProofGroups: SellerBulkProofGroup[];
  rootCause: SellerListingSuggestion | null;
  listingSuggestions: SellerListingSuggestion[];
  claimRisks: SellerClaimRisk[];
  activity: SellerAutomationActivity[];
  demoStory: SellerAutomationActivity[];
  guardrail: string;
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

  const activeProofTaskKeys = new Set((input.coach?.tasks ?? []).map(proofKey));
  for (const asset of input.coach?.proof_assets.filter((item) => item.status === "rejected") ?? []) {
    if (activeProofTaskKeys.has(proofKey(asset))) continue;
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

  const selectedProofTaskKey = input.coach?.proof_agent?.selected_task_key ?? null;
  return actions.sort((first, second) =>
    sellerActionSortRank(first, selectedProofTaskKey) - sellerActionSortRank(second, selectedProofTaskKey) ||
    PRIORITY_RANK[first.priority] - PRIORITY_RANK[second.priority]
  );
}

function sellerActionSortRank(action: SellerActionItem, selectedProofTaskKey: string | null) {
  if (action.action.type === "verification") return -20;
  if (selectedProofTaskKey && action.proofTask && proofKey(action.proofTask) === selectedProofTaskKey) return -10;
  return PRIORITY_RANK[action.priority];
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
  const activeTaskKeys = new Set(tasks.map(proofKey));
  const currentAssetByKey = new Map<string, SellerProofAsset>();
  for (const asset of assets) {
    const key = proofKey(asset);
    if (!currentAssetByKey.has(key)) currentAssetByKey.set(key, asset);
  }
  return {
    openTasks: tasks,
    rejected: assets.filter((asset) => asset.status === "rejected" && !activeTaskKeys.has(proofKey(asset)) && currentAssetByKey.get(proofKey(asset))?.proof_id === asset.proof_id),
    inReview: assets.filter((asset) => asset.status === "submitted"),
    buyerVisible: assets.filter((asset) => asset.status === "verified")
  };
}

export function buildSellerAutomation(input: {
  actions: SellerActionItem[];
  productRows: SellerProductRow[];
  proofLanes: SellerProofLanes;
  coach: SellerEvidenceCoachResponse | null;
}): SellerAutomationSummary {
  const selectedTaskKey = input.coach?.proof_agent?.selected_task_key ?? null;
  const selectedTask = selectedTaskKey
    ? input.proofLanes.openTasks.find((task) => proofKey(task) === selectedTaskKey) ?? null
    : null;
  const firstProofTask = selectedTask
    ?? input.actions.find((action) => action.proofTask)?.proofTask
    ?? input.proofLanes.openTasks[0]
    ?? null;
  const proofPacket = firstProofTask ? proofPacketForTask(firstProofTask) : null;
  const bulkProofGroups = buildBulkProofGroups(input.proofLanes.openTasks);
  const listingSuggestions = buildListingSuggestions(input.productRows);
  const claimRisks = buildClaimRisks(input.productRows);
  const rootCause = listingSuggestions.find((item) => item.tone === "urgent") ?? listingSuggestions[0] ?? null;
  const waitingBuyers = input.proofLanes.openTasks.reduce((sum, task) => sum + Math.max(0, Number(task.buyer_demand ?? 0)), 0);
  const proofTasks = input.proofLanes.openTasks.length + input.proofLanes.rejected.length;
  const listingFixes = Math.max(listingSuggestions.length, claimRisks.length);
  const reviewerItems = input.proofLanes.inReview.length;
  const readyCount = Number(Boolean(proofPacket)) + bulkProofGroups.length + listingFixes + reviewerItems;
  const headline = proofPacket
    ? "Autopilot has one proof packet ready"
    : listingFixes
      ? "Autopilot found listing work to approve"
      : reviewerItems
        ? "Autopilot is waiting on reviewer decisions"
        : "Autopilot is monitoring seller trust";

  return {
    headline,
    summary: proofPacket
      ? `${proofPacket.productTitle} is the next seller-approved proof action. Nothing is published until TrustOps reviews it.`
      : listingFixes
        ? `${listingFixes} listing ${listingFixes === 1 ? "improvement is" : "improvements are"} ready for seller review.`
        : "No seller action is being taken automatically. Sarthi will surface buyer-proof demand when it appears.",
    stats: [
      { label: "Proof fixes", value: String(proofTasks), detail: waitingBuyers ? `${waitingBuyers} buyer asks` : "No buyer asks waiting" },
      { label: "Batch groups", value: String(bulkProofGroups.length), detail: bulkProofGroups.length ? "similar proof work" : "no repeat batch" },
      { label: "Listing fixes", value: String(listingFixes), detail: listingFixes ? "seller approval needed" : "claims look stable" },
      { label: "Reviewer gate", value: String(reviewerItems), detail: reviewerItems ? "already submitted" : "none in review" }
    ],
    proofPacket,
    bulkProofGroups,
    rootCause,
    listingSuggestions,
    claimRisks,
    activity: buildAutomationActivity(input.coach, proofPacket, bulkProofGroups, listingSuggestions),
    demoStory: buildDemoStory(input.coach, proofPacket, claimRisks, reviewerItems, readyCount),
    guardrail: "Sarthi prepares and ranks seller work. Sellers approve changes, and reviewers approve proof before buyer confidence changes."
  };
}

export function proofPacketForTask(task: SellerEvidenceCoachTask): SellerProofPacket {
  const proofType = proofTypeLabel(task.recommended_proof_type);
  const trustLift = proofTrustLift(task);
  return {
    task,
    taskKey: proofKey(task),
    title: `${proofType} packet`,
    productTitle: task.product_title,
    proofType,
    buyerDemand: Math.max(0, Number(task.buyer_demand ?? 0)),
    trustLift,
    target: proofTaskTarget(task),
    prefillTitle: `${proofType} for ${shortProductTitle(task.product_title)}`,
    prefillDescription: `${task.product_title}: ${proofType.toLowerCase()} for ${labelize(task.attribute).toLowerCase()} review. ${task.buyer_impact ?? proofTaskReason(task)}`,
    checklist: proofPacketChecklist(task),
    reviewerGate: "Reviewer approval is required before this proof appears to buyers."
  };
}

function proofKey(item: { product_id: string; attribute: string }) {
  return `${item.product_id}:${item.attribute}`;
}

function buildBulkProofGroups(tasks: SellerEvidenceCoachTask[]): SellerBulkProofGroup[] {
  const groups = new Map<string, SellerEvidenceCoachTask[]>();
  for (const task of tasks) {
    const key = `${task.attribute}:${task.recommended_proof_type}`;
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const buyerDemand = group.reduce((sum, task) => sum + Math.max(0, Number(task.buyer_demand ?? 0)), 0);
      const trustLift = group.reduce((sum, task) => sum + proofTrustLift(task), 0);
      const firstTask = group.sort((left, right) => Number(right.buyer_demand ?? 0) - Number(left.buyer_demand ?? 0))[0];
      return {
        key,
        title: `${labelize(firstTask.attribute)} proof batch`,
        detail: `${group.length} product${group.length === 1 ? "" : "s"}, ${buyerDemand} buyer ask${buyerDemand === 1 ? "" : "s"}, +${trustLift} trust after review`,
        productCount: group.length,
        buyerDemand,
        trustLift,
        taskKeys: group.map(proofKey),
        firstTask
      };
    })
    .filter((group) => group.productCount > 1 || group.buyerDemand >= 6)
    .sort((left, right) => right.buyerDemand - left.buyerDemand || right.trustLift - left.trustLift)
    .slice(0, 3);
}

function buildListingSuggestions(rows: SellerProductRow[]): SellerListingSuggestion[] {
  return rows
    .map((row): SellerListingSuggestion | null => {
      const issue = row.listing.top_issue;
      if (row.proofTask?.type === "broken_expectation" || issue) {
        const issueLabel = issue ? labelize(issue.return_reason).toLowerCase() : labelize(row.proofTask?.attribute ?? "proof").toLowerCase();
        return {
          productId: row.listing.product.product_id,
          title: shortProductTitle(row.listing.product.title),
          reason: issue ? `${issue.count} recent ${issue.count === 1 ? "return points" : "returns point"} to ${issueLabel}.` : row.concern,
          action: row.actionKind === "measurement" ? "Approve measurement correction" : "Approve proof-backed listing edit",
          tone: "urgent" as const
        };
      }
      if (row.state === "attention" || row.listing.metrics.evidence_strength === "weak" || row.listing.metrics.evidence_strength === "unknown") {
        return {
          productId: row.listing.product.product_id,
          title: shortProductTitle(row.listing.product.title),
          reason: row.concern,
          action: row.actionKind === "proof" ? "Attach proof before trust lift" : "Review listing promise",
          tone: "watch" as const
        };
      }
      return null;
    })
    .filter((item): item is SellerListingSuggestion => Boolean(item))
    .slice(0, 4);
}

function buildClaimRisks(rows: SellerProductRow[]): SellerClaimRisk[] {
  return rows
    .map((row): SellerClaimRisk | null => {
      if (row.state === "healthy" && row.listing.metrics.evidence_strength !== "weak") return null;
      const issue = row.listing.top_issue?.return_reason ?? row.proofTask?.attribute ?? "evidence";
      const template = claimRiskTemplate(issue, row.proofTask?.recommended_proof_type);
      return {
        productId: row.listing.product.product_id,
        title: shortProductTitle(row.listing.product.title),
        issue: template.issue,
        riskyClaim: template.riskyClaim,
        saferClaim: template.saferClaim,
        evidenceNeeded: template.evidenceNeeded,
        action: row.actionKind === "measurement" ? "Prepare size evidence" : row.actionKind === "proof" ? "Prepare proof packet" : "Review listing",
        tone: row.state === "attention" || row.proofTask?.priority === "high" ? "urgent" : "watch"
      };
    })
    .filter((item): item is SellerClaimRisk => Boolean(item))
    .slice(0, 4);
}

function claimRiskTemplate(issue: string, proofType?: SellerEvidenceCoachTask["recommended_proof_type"]) {
  if (issue === "too_large" || issue === "too_small" || issue === "size") {
    return {
      issue: "Fit expectation",
      riskyClaim: "Claiming exact fit without current measurements.",
      saferClaim: "Show verified chest and length values before promising fit.",
      evidenceNeeded: "Measurement chart"
    };
  }
  if (issue === "color_different" || issue === "color") {
    return {
      issue: "Colour expectation",
      riskyClaim: "Relying only on catalog colour photos.",
      saferClaim: "Add a daylight photo and describe colour plainly.",
      evidenceNeeded: proofType ? proofTypeLabel(proofType) : "Daylight photo"
    };
  }
  if (issue === "fabric_different" || issue === "fabric" || issue === "transparency") {
    return {
      issue: "Fabric expectation",
      riskyClaim: "Using broad fabric claims without close proof.",
      saferClaim: "Show texture, lining, and transparency where relevant.",
      evidenceNeeded: proofType ? proofTypeLabel(proofType) : "Fabric close-up"
    };
  }
  if (issue === "damaged" || issue === "wrong_item" || issue === "packaging") {
    return {
      issue: "Dispatch expectation",
      riskyClaim: "Assuming packaging quality is obvious to buyers.",
      saferClaim: "Show packing and variant labels before dispatch claims.",
      evidenceNeeded: proofType ? proofTypeLabel(proofType) : "Packaging photo"
    };
  }
  return {
    issue: "Evidence gap",
    riskyClaim: "Making a trust claim without reviewer-visible proof.",
    saferClaim: "Keep the promise factual and attach evidence first.",
    evidenceNeeded: proofType ? proofTypeLabel(proofType) : "Reviewer proof"
  };
}

function buildAutomationActivity(
  coach: SellerEvidenceCoachResponse | null,
  proofPacket: SellerProofPacket | null,
  groups: SellerBulkProofGroup[],
  suggestions: SellerListingSuggestion[]
): SellerAutomationActivity[] {
  const agent = coach?.proof_agent;
  const entries: SellerAutomationActivity[] = [
    {
      key: "demand",
      label: "Demand scanned",
      detail: agent ? `${agent.metrics.waiting_buyers} aggregate buyer asks checked without exposing identities.` : "Waiting for proof demand.",
      status: "done"
    }
  ];
  if (proofPacket) {
    entries.push({
      key: "packet",
      label: "Proof packet prepared",
      detail: `${proofPacket.proofType} is ready for ${shortProductTitle(proofPacket.productTitle)}.`,
      status: "next"
    });
  }
  if (groups.length) {
    entries.push({
      key: "bulk",
      label: "Bulk work grouped",
      detail: `${groups[0].title} can reduce repeated seller work.`,
      status: "next"
    });
  }
  if (suggestions.length) {
    entries.push({
      key: "listing",
      label: "Listing risk flagged",
      detail: `${suggestions[0].title}: ${suggestions[0].reason}`,
      status: "next"
    });
  }
  entries.push({
    key: "review",
    label: "Reviewer gate",
    detail: agent?.guardrail ?? "Reviewer approval is required before buyer confidence changes.",
    status: proofPacket ? "blocked" : "done"
  });
  return entries.slice(0, 5);
}

function buildDemoStory(
  coach: SellerEvidenceCoachResponse | null,
  proofPacket: SellerProofPacket | null,
  claimRisks: SellerClaimRisk[],
  reviewerItems: number,
  readyCount: number
): SellerAutomationActivity[] {
  const waitingBuyers = coach?.proof_agent?.metrics.waiting_buyers ?? proofPacket?.buyerDemand ?? 0;
  return [
    {
      key: "buyer-signal",
      label: "Buyer signal",
      detail: waitingBuyers ? `${waitingBuyers} aggregate asks become seller work, without exposing buyer identity.` : "Sarthi keeps watching for buyer-proof demand.",
      status: "done"
    },
    {
      key: "seller-work",
      label: "Seller work",
      detail: proofPacket ? `${proofPacket.proofType} packet is prepared with reviewer-safe copy.` : `${readyCount} seller tasks are ranked by impact.`,
      status: proofPacket || readyCount ? "next" : "done"
    },
    {
      key: "listing-risk",
      label: "Claim control",
      detail: claimRisks.length ? `${claimRisks.length} risky listing promises have safer proof-backed wording.` : "No risky product promise is currently flagged.",
      status: claimRisks.length ? "next" : "done"
    },
    {
      key: "reviewer-gate",
      label: "Trust gate",
      detail: reviewerItems ? `${reviewerItems} item${reviewerItems === 1 ? " is" : "s are"} already with reviewers.` : "Buyer-visible trust changes wait for reviewer approval.",
      status: proofPacket ? "blocked" : "done"
    }
  ];
}

function proofTrustLift(task: SellerEvidenceCoachTask): number {
  const fallbackByAttribute: Partial<Record<SellerEvidenceCoachTask["attribute"], number>> = {
    size: 7,
    fabric: 6,
    transparency: 6,
    color: 5,
    packaging: 4,
    offer: 3
  };
  const fallback = fallbackByAttribute[task.attribute] ?? 4;
  const demandBoost = Math.min(3, Math.max(0, Number(task.buyer_demand ?? 0) - 1));
  return Math.max(1, Number(task.trust_lift_points ?? fallback + demandBoost));
}

function proofTaskTarget(task: SellerEvidenceCoachTask): string {
  const age = Number(task.age_hours ?? 0);
  const slaHours = Number(task.response_sla_hours ?? (task.priority === "high" ? 12 : 24));
  if (!age || !slaHours) return task.priority === "high" ? "Today" : "This week";
  const remaining = Math.round(slaHours - age);
  if (remaining <= 0) return "SLA breached";
  if (remaining < 24) return `${remaining}h left`;
  return `${Math.round(remaining / 24)}d left`;
}

function proofPacketChecklist(task: SellerEvidenceCoachTask): string[] {
  const common = [
    "Use the same product and variant buyers will receive.",
    "Avoid edited catalog photos; reviewers need real evidence.",
    "Keep buyer identity and private fit memory out of the proof."
  ];
  if (task.recommended_proof_type === "measurement_chart") {
    return ["Show chest and length values clearly.", "Mention tight/loose fit only if the measurements support it.", ...common.slice(2)];
  }
  if (task.recommended_proof_type === "fabric_closeup") {
    return ["Capture close fabric texture in natural light.", "Show lining or transparency honestly if relevant.", ...common.slice(1)];
  }
  if (task.recommended_proof_type === "daylight_photo") {
    return ["Show the actual colour in daylight.", "Keep filters, studio tint, and heavy edits out.", ...common.slice(0, 1)];
  }
  if (task.recommended_proof_type === "packaging_photo") {
    return ["Show product and dispatch packaging together.", "Keep address or buyer data hidden.", ...common.slice(0, 1)];
  }
  return common;
}

function shortProductTitle(title: string): string {
  return title.split("-")[0].trim();
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
