import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { reviewCredibilitySummary, sourceHealth } from "./domain.js";
import { generateGroundedAgentAnswer } from "./agent.js";
import { isGeneratedProvider } from "./ai.js";
import { id } from "./crypto.js";
import { withoutId } from "./format.js";
import { llmCacheKey, readLlmCache, writeLlmCache } from "./llmCache.js";
import { proofQualityPrescreen, proofQualityRiskDelta } from "./proofQuality.js";
import { nowIso } from "./time.js";

const REQUIRED_SELLER_DOCUMENTS = ["gst_certificate", "address_proof", "bank_proof"];

export async function adminQueue(db: Db) {
  const c = collections(db);
  const [applications, sellers, profiles, documents, drafts, proofAssets, products, auditEvents, health] = await Promise.all([
    c.sellerApplications.find({}).sort({ created_at: -1 }).toArray(),
    c.sellers.find({}).toArray(),
    c.sellerProfiles.find({}).toArray(),
    c.sellerVerificationDocuments.find({}).sort({ submitted_at: -1 }).toArray(),
    c.listingDrafts.find({}).sort({ updated_at: -1 }).toArray(),
    c.sellerEvidenceAssets.find({}).sort({ created_at: -1 }).toArray(),
    c.products.find({}).project({ product_id: 1, title: 1, image_url: 1 }).toArray(),
    c.adminAuditEvents.find({}).sort({ created_at: -1 }).limit(50).toArray(),
    sourceHealth(db)
  ]);
  const sellerMap = new Map(sellers.map((seller: any) => [seller.seller_id, seller]));
  const profileMap = new Map(profiles.map((profile: any) => [profile.seller_id, profile]));
  const productMap = new Map(products.map((product: any) => [product.product_id, product]));
  const sellerApplications = await Promise.all(applications.map(async (app: any) => {
    const row = {
      ...withoutId(app),
      seller_name: sellerMap.get(app.seller_id)?.name ?? app.business_name,
      verification_status: profileMap.get(app.seller_id)?.verification_status ?? null
    };
    return { ...row, prescreen: await adminPrescreenSuggestion(db, "seller_application", row) };
  }));
  const verificationDocuments = await Promise.all(documents.map(async (doc: any) => {
    const row = { ...withoutId(doc), seller_name: sellerMap.get(doc.seller_id)?.name ?? "" };
    return { ...row, prescreen: await adminPrescreenSuggestion(db, "verification_document", row) };
  }));
  const listingDrafts = await Promise.all(drafts.map(async (draft: any) => {
    const row = {
      ...withoutId(draft),
      seller_name: sellerMap.get(draft.seller_id)?.name ?? "",
      verification_status: profileMap.get(draft.seller_id)?.verification_status ?? null
    };
    return { ...row, prescreen: await adminPrescreenSuggestion(db, "listing_draft", row) };
  }));
  const sellerProofAssets = await Promise.all(proofAssets.map(async (asset: any) => {
    const product = productMap.get(asset.product_id);
    const linkedRequests = await c.proofRequests.find({
      seller_id: asset.seller_id,
      product_id: asset.product_id,
      attribute: asset.attribute,
      status: { $in: ["open", "submitted"] }
    }).sort({ updated_at: -1 }).limit(4).toArray();
    const openRequestCount = linkedRequests.reduce((sum: number, request: any) =>
      sum + Math.max(1, Number(request.request_count ?? 0)), 0);
    const row = {
      ...withoutId(asset),
      seller_name: sellerMap.get(asset.seller_id)?.name ?? "",
      product_title: product?.title ?? asset.product_id,
      product_image_url: product?.image_url ?? null,
      open_request_count: openRequestCount,
      buyer_doubt_examples: linkedRequests
        .map((request: any) => request.buyer_question)
        .filter(Boolean)
        .slice(0, 3)
    };
    return { ...row, prescreen: await adminPrescreenSuggestion(db, "proof_asset", row) };
  }));
  const activeQueue = buildActiveReviewQueue(sellerApplications, verificationDocuments, listingDrafts, sellerProofAssets);
  const caseFiles = await buildAdminCaseFiles(db, activeQueue, {
    applications: sellerApplications,
    documents: verificationDocuments,
    drafts: listingDrafts,
    proofAssets: sellerProofAssets,
    profiles: profileMap
  });
  const activeQueueWithCases = activeQueue.map((item: any) => ({
    ...item,
    case_file: caseFiles.get(item.queue_item_id) ?? null
  }));
  const sellerDossiers = buildSellerDossiers({
    sellers,
    profiles,
    applications: sellerApplications,
    documents: verificationDocuments,
    drafts: listingDrafts,
    proofAssets: sellerProofAssets,
    activeQueue: activeQueueWithCases
  });
  const summary = buildAdminSummary(activeQueueWithCases, sellerApplications, verificationDocuments, listingDrafts, sellerProofAssets, health);
  const trustOps = buildTrustOpsSummary(summary, activeQueueWithCases, sellerDossiers);
  const automationPlan = await buildAdminAutomationPlan(db, summary, activeQueueWithCases, sellerDossiers);
  return {
    summary,
    source_health: health,
    trust_ops: trustOps,
    automation_plan: automationPlan,
    active_queue: activeQueueWithCases,
    seller_dossiers: sellerDossiers,
    seller_applications: sellerApplications.sort(sortByPrescreenRisk),
    documents: verificationDocuments.sort(sortByPrescreenRisk),
    listing_drafts: listingDrafts.sort(sortByPrescreenRisk),
    proof_assets: sellerProofAssets.sort(sortByPrescreenRisk),
    audit_events: auditEvents.map(withoutId)
  };
}

export async function approveSellerApplication(db: Db, account: any, applicationId: string, notes: string) {
  const c = collections(db);
  const appDoc = await c.sellerApplications.findOne({ application_id: applicationId });
  if (!appDoc) throwNotFound("Seller application not found");
  if (appDoc.status !== "pending_review") {
    throwBadRequest("Seller application is not waiting for reviewer approval.");
  }
  const missingDocuments = await missingRequiredDocuments(db, appDoc.seller_id);
  if (missingDocuments.length) {
    throwBadRequest(`Approve required documents first: ${missingDocuments.map(labelize).join(", ")}.`);
  }
  const reviewedAt = nowIso();
  const applicationUpdate = await c.sellerApplications.updateOne(
    { application_id: applicationId, status: "pending_review" },
    { $set: { status: "approved", reviewed_at: reviewedAt } }
  );
  if (!applicationUpdate.matchedCount) {
    throwBadRequest("Seller application was already reviewed.");
  }
  await Promise.all([
    c.sellerProfiles.updateOne(
      { seller_id: appDoc.seller_id },
      { $set: { verification_status: "verified", gst_status: "verified", kyc_status: "verified", data_access_level: "aggregate_only", last_verified_at: reviewedAt } }
    ),
    recordAdminEvent(db, account, "seller_application_approved", "seller_application", applicationId, appDoc.seller_id, "approved", notes)
  ]);
  return adminQueue(db);
}

export async function approveSellerDocument(db: Db, account: any, documentId: string, notes: string) {
  const c = collections(db);
  const document = await c.sellerVerificationDocuments.findOne({ document_id: documentId });
  if (!document) throwNotFound("Verification document not found");
  if (!["submitted", "under_review"].includes(document.status)) {
    throwBadRequest("Verification document is not waiting for review.");
  }
  const reviewedAt = nowIso();
  const documentUpdate = await c.sellerVerificationDocuments.updateOne(
    { document_id: documentId, status: { $in: ["submitted", "under_review"] } },
    { $set: { status: "approved", reviewed_at: reviewedAt, notes } }
  );
  if (!documentUpdate.matchedCount) {
    throwBadRequest("Verification document was already reviewed.");
  }
  await Promise.all([
    updateProfileAfterDocumentDecision(db, document.seller_id, document.document_type, "approved"),
    recordAdminEvent(db, account, "seller_document_approved", "verification_document", documentId, document.seller_id, "approved", notes)
  ]);
  await maybePromoteSellerVerification(db, document.seller_id, account, notes);
  return adminQueue(db);
}

export async function rejectSellerDocument(db: Db, account: any, documentId: string, notes: string) {
  const c = collections(db);
  const document = await c.sellerVerificationDocuments.findOne({ document_id: documentId });
  if (!document) throwNotFound("Verification document not found");
  if (!["submitted", "under_review"].includes(document.status)) {
    throwBadRequest("Verification document is not waiting for review.");
  }
  const reviewedAt = nowIso();
  const documentUpdate = await c.sellerVerificationDocuments.updateOne(
    { document_id: documentId, status: { $in: ["submitted", "under_review"] } },
    { $set: { status: "rejected", reviewed_at: reviewedAt, notes } }
  );
  if (!documentUpdate.matchedCount) {
    throwBadRequest("Verification document was already reviewed.");
  }
  await Promise.all([
    updateProfileAfterDocumentDecision(db, document.seller_id, document.document_type, "rejected"),
    recordAdminEvent(db, account, "seller_document_rejected", "verification_document", documentId, document.seller_id, "rejected", notes)
  ]);
  return adminQueue(db);
}

export async function rejectSellerApplication(db: Db, account: any, applicationId: string, notes: string) {
  const c = collections(db);
  const appDoc = await c.sellerApplications.findOne({ application_id: applicationId });
  if (!appDoc) throwNotFound("Seller application not found");
  if (appDoc.status !== "pending_review") {
    throwBadRequest("Seller application is not waiting for reviewer rejection.");
  }
  const applicationUpdate = await c.sellerApplications.updateOne(
    { application_id: applicationId, status: "pending_review" },
    { $set: { status: "rejected", reviewed_at: nowIso() } }
  );
  if (!applicationUpdate.matchedCount) {
    throwBadRequest("Seller application was already reviewed.");
  }
  await Promise.all([
    c.sellerProfiles.updateOne({ seller_id: appDoc.seller_id }, { $set: { verification_status: "restricted", restricted_reason: notes } }),
    recordAdminEvent(db, account, "seller_application_rejected", "seller_application", applicationId, appDoc.seller_id, "rejected", notes)
  ]);
  return adminQueue(db);
}

export async function approveListingDraft(db: Db, account: any, draftId: string, notes: string) {
  const c = collections(db);
  const draft = await c.listingDrafts.findOne({ draft_id: draftId });
  if (!draft) throwNotFound("Listing draft not found");
  if (draft.status === "approved") {
    await recordAdminEvent(db, account, "listing_draft_approval_skipped", "listing_draft", draftId, draft.seller_id, "already_approved", notes);
    return adminQueue(db);
  }
  if (draft.status !== "submitted") {
    throwBadRequest("Listing draft must be submitted before admin approval.");
  }
  const [seller, sellerProfile] = await Promise.all([
    c.sellers.findOne({ seller_id: draft.seller_id }),
    c.sellerProfiles.findOne({ seller_id: draft.seller_id })
  ]);
  if (!seller) {
    throwBadRequest("Listing draft seller does not exist.");
  }
  if (sellerProfile?.verification_status !== "verified") {
    throwBadRequest("Seller verification must be approved before publishing a listing.");
  }
  const reviewStartedAt = nowIso();
  const claim = await c.listingDrafts.updateOne(
    { draft_id: draftId, status: "submitted" },
    { $set: { status: "publishing", publishing_started_at: reviewStartedAt, updated_at: reviewStartedAt } }
  );
  if (!claim.matchedCount) {
    throwBadRequest("Listing draft is already being reviewed or was already reviewed.");
  }
  const product_id = id("product");
  const cluster_id = draft.target_cluster_id ?? id("cluster");
  const variant_id = `${product_id}_xl`;
  const catalogFactId = id("fact_catalog");
  const priceFactId = id("fact_price");
  const inventoryFactId = id("fact_inventory");
  const existingCluster = await c.clusters.findOne({ cluster_id });
  if (!existingCluster) {
    await c.clusters.insertOne({
      cluster_id,
      label: `${draft.color_family} ${draft.garment_type}`.replace(/\s+/g, " ").trim(),
      category: draft.category
    });
  }
  await Promise.all([
    c.products.insertOne({
      product_id,
      cluster_id,
      seller_id: draft.seller_id,
      title: draft.title,
      category: draft.category,
      garment_type: draft.garment_type,
      fabric: draft.fabric,
      color_family: draft.color_family,
      base_price: draft.base_price,
      image_url: draft.image_url,
      rating: 4.0,
      rating_count: 0,
      commerce_badge: "New seller",
      delivery_text: "Delivery after seller confirmation",
      is_sarthi_eligible: 1,
      seller_name: seller?.name,
      taxonomy_attributes: [
        { field_name: "category", display_name: "Category", value: draft.category },
        { field_name: "generic_name", display_name: "Generic Name", value: draft.garment_type },
        { field_name: "fabric", display_name: "Fabric", value: draft.fabric },
        { field_name: "color", display_name: "Color", value: draft.color_family }
      ],
      source_refs: {
        listing_draft_id: draftId,
        approved_by: account.account_id
      }
    }),
    c.variants.insertOne({ variant_id, product_id, size: "XL", current_price: draft.base_price, stock: 10 }),
    c.facts.insertMany([
      {
        fact_id: catalogFactId,
        source_table: "products",
        source_id: product_id,
        source_type: "catalog_listing",
        summary: `${draft.title} was approved into buyer catalog after admin review.`,
        created_at: nowIso(),
        expires_at: null
      },
      {
        fact_id: priceFactId,
        source_table: "price_events",
        source_id: variant_id,
        source_type: "seller_price",
        summary: `Approved listing price is Rs ${draft.base_price}.`,
        created_at: nowIso(),
        expires_at: null
      },
      {
        fact_id: inventoryFactId,
        source_table: "inventory_snapshots",
        source_id: variant_id,
        source_type: "seller_inventory",
        summary: "New approved listing starts with 10 units available.",
        created_at: nowIso(),
        expires_at: null
      }
    ]),
    c.priceEvents.insertOne({
      variant_id,
      price: draft.base_price,
      event_type: "listing_approved",
      created_at: nowIso(),
      fact_id: priceFactId
    }),
    c.inventorySnapshots.insertOne({
      variant_id,
      available_to_promise: 10,
      sales_velocity_24h: 0,
      captured_at: nowIso(),
      fact_id: inventoryFactId
    })
  ]);
  await c.listingDrafts.updateOne(
    { draft_id: draftId, status: "publishing" },
    {
      $set: {
        status: "approved",
        readiness_status: "evidence_building",
        reviewed_at: nowIso(),
        review_notes: notes,
        approved_product_id: product_id,
        approved_variant_id: variant_id,
        updated_at: nowIso()
      }
    }
  );
  await recordAdminEvent(db, account, "listing_draft_approved", "listing_draft", draftId, draft.seller_id, "approved", notes);
  return adminQueue(db);
}

export async function requestListingRevision(db: Db, account: any, draftId: string, notes: string) {
  const c = collections(db);
  const draft = await c.listingDrafts.findOne({ draft_id: draftId });
  if (!draft) throwNotFound("Listing draft not found");
  if (!["submitted", "publishing"].includes(draft.status)) {
    throwBadRequest("Only a submitted listing draft can be sent back for revision.");
  }
  const reviewedAt = nowIso();
  const draftUpdate = await c.listingDrafts.updateOne(
    { draft_id: draftId, status: { $in: ["submitted", "publishing"] } },
    { $set: { status: "needs_revision", reviewed_at: reviewedAt, review_notes: notes, updated_at: reviewedAt } }
  );
  if (!draftUpdate.matchedCount) {
    throwBadRequest("Listing draft was already reviewed.");
  }
  await Promise.all([
    upsertAdminRootCauseTask(db, {
      seller_id: draft.seller_id,
      product_id: draft.product_id ?? draft.target_product_id ?? draft.draft_id,
      product_title: draft.title,
      variant_id: draft.variant_id ?? null,
      attribute: draft.fabric ? "fabric" : draft.color_family ? "color" : "listing_quality",
      dimension: "listing_revision",
      priority: "medium",
      title: "Fix listing before buyer trust can improve",
      rationale: notes || "Admin requested clearer catalog facts before publishing.",
      seller_action: revisionTaskAction(draft, notes),
      recommended_proof_type: draft.fabric ? "fabric_closeup" : "seller_note",
      buyer_count: 1,
      buyer_notification_preview: "Listing confidence will update after the seller fixes the reviewer note.",
      fact_ids: [draft.fact_id].filter(Boolean)
    }),
    recordAdminEvent(db, account, "listing_revision_requested", "listing_draft", draftId, draft.seller_id, "revision", notes)
  ]);
  return adminQueue(db);
}

export async function approveSellerEvidenceAsset(db: Db, account: any, proofId: string, notes: string) {
  const c = collections(db);
  const asset = await c.sellerEvidenceAssets.findOne({ proof_id: proofId });
  if (!asset) throwNotFound("Seller proof asset not found");
  if (asset.status !== "submitted") {
    throwBadRequest("Seller proof asset is not waiting for review.");
  }
  const reviewedAt = nowIso();
  const assetUpdate = await c.sellerEvidenceAssets.updateOne(
    { proof_id: proofId, status: "submitted" },
    { $set: { status: "verified", reviewed_at: reviewedAt, review_notes: notes } }
  );
  if (!assetUpdate.matchedCount) {
    throwBadRequest("Seller proof asset was already reviewed.");
  }
  await Promise.all([
    c.proofRequests.updateMany(
      {
        seller_id: asset.seller_id,
        product_id: asset.product_id,
        attribute: asset.attribute,
        resolution_proof_id: proofId,
        status: { $in: ["open", "submitted"] }
      },
      { $set: { status: "resolved", resolved_at: reviewedAt, updated_at: reviewedAt } }
    ),
    c.facts.updateOne(
      { fact_id: asset.fact_id },
      { $set: { summary: `${labelize(asset.attribute)} proof approved by reviewer.` } }
    ),
    asset.proof_type === "measurement_chart"
      ? applyMeasurementReview(db, asset, proofId, "verified", reviewedAt, notes)
      : Promise.resolve(),
    recordAdminEvent(db, account, "seller_proof_approved", "seller_evidence_asset", proofId, asset.seller_id, "approved", notes)
  ]);
  return adminQueue(db);
}

export async function rejectSellerEvidenceAsset(db: Db, account: any, proofId: string, notes: string) {
  const c = collections(db);
  const asset = await c.sellerEvidenceAssets.findOne({ proof_id: proofId });
  if (!asset) throwNotFound("Seller proof asset not found");
  if (asset.status !== "submitted") {
    throwBadRequest("Seller proof asset is not waiting for review.");
  }
  const reviewedAt = nowIso();
  const assetUpdate = await c.sellerEvidenceAssets.updateOne(
    { proof_id: proofId, status: "submitted" },
    { $set: { status: "rejected", reviewed_at: reviewedAt, review_notes: notes } }
  );
  if (!assetUpdate.matchedCount) {
    throwBadRequest("Seller proof asset was already reviewed.");
  }
  await Promise.all([
    c.proofRequests.updateMany(
      {
        seller_id: asset.seller_id,
        product_id: asset.product_id,
        attribute: asset.attribute,
        resolution_proof_id: proofId,
        status: "submitted"
      },
      {
        $set: {
          status: "open",
          updated_at: reviewedAt,
          rejected_proof_id: proofId,
          rejection_notes: notes,
          resolution_proof_id: null
        }
      }
    ),
    asset.proof_type === "measurement_chart"
      ? applyMeasurementReview(db, asset, proofId, "rejected", reviewedAt, notes)
      : Promise.resolve(),
    upsertAdminRootCauseTask(db, {
      seller_id: asset.seller_id,
      product_id: asset.product_id,
      product_title: asset.product_title ?? asset.product_id,
      variant_id: asset.variant_id ?? null,
      attribute: asset.attribute,
      dimension: "proof_rejected",
      priority: "high",
      title: `Replace rejected ${labelize(asset.attribute)} proof`,
      rationale: notes || "Admin rejected the current proof because it did not safely support the buyer-facing claim.",
      seller_action: `Upload ${labelize(recommendedProofType(asset.attribute))} that clearly answers the ${labelize(asset.attribute)} concern.`,
      recommended_proof_type: recommendedProofType(asset.attribute),
      buyer_count: 1,
      buyer_notification_preview: `Proof is still pending for ${labelize(asset.attribute)}. Confidence will not improve until replacement proof is approved.`,
      fact_ids: [asset.fact_id].filter(Boolean)
    }),
    recordAdminEvent(db, account, "seller_proof_rejected", "seller_evidence_asset", proofId, asset.seller_id, "rejected", notes)
  ]);
  return adminQueue(db);
}

async function applyMeasurementReview(
  db: Db,
  asset: any,
  proofId: string,
  status: "verified" | "rejected",
  reviewedAt: string,
  notes: string
) {
  const c = collections(db);
  if (status === "verified") {
    if (!Number.isFinite(asset.measurements?.l_chest_inches) || !Number.isFinite(asset.measurements?.xl_chest_inches)) {
      throwBadRequest("Measurement proof does not contain reviewable L and XL measurements.");
    }
    await Promise.all([
      c.variants.updateOne(
        { product_id: asset.product_id, size: "L", measurement_proof_id: proofId },
        {
          $set: {
            chest_inches: asset.measurements?.l_chest_inches,
            pending_chest_inches: null,
            measurement_status: "verified",
            measurement_reviewed_at: reviewedAt,
            measurement_rejection_notes: null
          }
        }
      ),
      c.variants.updateOne(
        { product_id: asset.product_id, size: "XL", measurement_proof_id: proofId },
        {
          $set: {
            chest_inches: asset.measurements?.xl_chest_inches,
            pending_chest_inches: null,
            measurement_status: "verified",
            measurement_reviewed_at: reviewedAt,
            measurement_rejection_notes: null
          }
        }
      )
    ]);
    return;
  }

  await c.variants.updateMany(
    { product_id: asset.product_id, measurement_proof_id: proofId },
    {
      $set: {
        pending_chest_inches: null,
        measurement_status: "rejected",
        measurement_reviewed_at: reviewedAt,
        measurement_rejection_notes: notes
      }
    }
  );
}

async function upsertAdminRootCauseTask(db: Db, input: any) {
  const c = collections(db);
  const now = nowIso();
  const query = {
    seller_id: input.seller_id,
    product_id: input.product_id,
    variant_id: input.variant_id ?? null,
    dimension: input.dimension,
    status: "open"
  };
  const taskPatch = {
    seller_id: input.seller_id,
    product_id: input.product_id,
    product_title: input.product_title ?? input.product_id,
    variant_id: input.variant_id ?? null,
    attribute: input.attribute,
    dimension: input.dimension,
    priority: input.priority ?? "medium",
    title: input.title,
    rationale: input.rationale,
    seller_action: input.seller_action,
    recommended_proof_type: input.recommended_proof_type ?? recommendedProofType(input.attribute),
    buyer_count: Math.max(1, Number(input.buyer_count ?? 1)),
    buyer_notification_preview: input.buyer_notification_preview,
    fact_ids: input.fact_ids ?? [],
    status: "open",
    source: "admin_review",
    updated_at: now
  };
  await c.sellerRootCauseTasks.updateOne(
    query,
    {
      $setOnInsert: { task_id: id("root_cause_task"), first_seen_at: now, created_at: now },
      $set: taskPatch
    },
    { upsert: true }
  );
}

function revisionTaskAction(draft: any, notes: string) {
  const lower = String(notes ?? "").toLowerCase();
  if (lower.includes("size") || lower.includes("measurement")) return "Add a readable size chart and resubmit the listing.";
  if (lower.includes("image") || lower.includes("photo")) return "Upload a clearer product image that shows the actual item.";
  if (lower.includes("fabric") || draft.fabric) return "Clarify fabric claim and add supporting fabric proof.";
  if (lower.includes("price")) return "Correct price and offer details before resubmitting.";
  return "Fix the reviewer note and resubmit the listing for TrustOps review.";
}

async function buildAdminCaseFiles(
  db: Db,
  activeQueue: any[],
  lookup: {
    applications: any[];
    documents: any[];
    drafts: any[];
    proofAssets: any[];
    profiles: Map<string, any>;
  }
) {
  const rowsById = new Map<string, any>();
  lookup.applications.forEach((item) => rowsById.set(item.application_id, item));
  lookup.documents.forEach((item) => rowsById.set(item.document_id, item));
  lookup.drafts.forEach((item) => rowsById.set(item.draft_id, item));
  lookup.proofAssets.forEach((item) => rowsById.set(item.proof_id, item));

  const caseEntries = await Promise.all(activeQueue.map(async (queueItem) => {
    const row = rowsById.get(queueItem.queue_item_id) ?? {};
    return [queueItem.queue_item_id, await buildAdminCaseFile(db, queueItem, row, lookup.profiles)] as const;
  }));
  return new Map(caseEntries);
}

async function buildAdminCaseFile(db: Db, queueItem: any, row: any, profiles: Map<string, any>) {
  const profile = profiles.get(queueItem.seller_id) ?? {};
  const productId = row.product_id ?? row.target_product_id ?? null;
  const productContext = productId ? await adminProductContext(db, productId) : null;
  const proofQuality = row.prescreen?.proof_quality ?? null;
  const conflicts = adminContradictions(queueItem, row, productContext, profile);
  const missing = adminMissingEvidence(queueItem, row, productContext, profile);
  const agrees = adminAgreementSignals(queueItem, row, productContext, profile);
  const scoreSimulation = adminScoreSimulation(queueItem, row, productContext, proofQuality, missing);
  const sellerTasks = await adminSellerTasks(db, queueItem, row, productContext, conflicts, missing);
  const evidencePath = adminEvidencePath(queueItem, row, productContext, profile, proofQuality, scoreSimulation);
  const toolChain = adminToolChain(queueItem, productContext, proofQuality);

  return {
    case_id: `case_${queueItem.queue_item_id}`,
    title: queueItem.title,
    item_type: queueItem.item_type,
    trigger: adminCaseTrigger(queueItem, row),
    primary_question: adminPrimaryQuestion(queueItem, row),
    stage: queueItem.status,
    recommendation: {
      action: queueItem.primary_action,
      confidence: queueItem.confidence,
      why: queueItem.blocker ?? row.prescreen?.reason ?? queueItem.buyer_impact
    },
    evidence_path: evidencePath,
    evidence_agrees: agrees,
    evidence_conflicts: conflicts,
    evidence_missing: missing,
    score_simulation: scoreSimulation,
    seller_tasks: sellerTasks,
    tool_chain: toolChain,
    human_guardrails: adminHumanGuardrails(queueItem, conflicts, missing),
    audit_timeline: adminAuditTimeline(queueItem, row, scoreSimulation)
  };
}

async function adminProductContext(db: Db, productId: string) {
  const c = collections(db);
  const product = await c.products.findOne({ product_id: productId });
  const variants = await c.variants.find({ product_id: productId }).toArray();
  const variantIds = variants.map((variant: any) => variant.variant_id);
  const [reviews, outcomes, proofRequests, proofAssets, rootTasks, credibility] = await Promise.all([
    c.reviews.find({ product_id: productId }).toArray(),
    variantIds.length ? c.outcomes.find({ variant_id: { $in: variantIds } }).toArray() : Promise.resolve([]),
    c.proofRequests.find({ product_id: productId }).toArray(),
    c.sellerEvidenceAssets.find({ product_id: productId }).toArray(),
    c.sellerRootCauseTasks.find({ product_id: productId, status: "open" }).sort({ updated_at: -1 }).limit(4).toArray(),
    reviewCredibilitySummary(db, productId)
  ]);
  const delivered = outcomes.length;
  const returned = outcomes.filter((outcome: any) => outcome.status === "returned" || outcome.return_reason).length;
  const returnRate = delivered ? returned / delivered : null;
  const topReturn = topReturnReason(outcomes);
  return {
    product,
    variants,
    reviews,
    outcomes,
    proof_requests: proofRequests,
    proof_assets: proofAssets,
    root_tasks: rootTasks,
    credibility,
    delivered,
    returned,
    return_rate: returnRate,
    top_return_reason: topReturn
  };
}

function adminEvidencePath(queueItem: any, row: any, context: any, profile: any, proofQuality: any, scoreSimulation: any) {
  const product = context?.product;
  const reviewGap = Number(context?.credibility?.rating_gap ?? 0);
  return [
    {
      label: "Trigger",
      detail: adminCaseTrigger(queueItem, row),
      status: queueItem.blocker ? "warn" : "pass",
      source_type: "queue",
      fact_ids: []
    },
    {
      label: "Seller",
      detail: `Verification is ${labelize(profile?.verification_status ?? row.verification_status ?? "pending")}.`,
      status: (profile?.verification_status ?? row.verification_status) === "verified" ? "pass" : "warn",
      source_type: "seller_profile",
      fact_ids: []
    },
    {
      label: "Product",
      detail: product ? `${product.title} at Rs ${product.base_price}.` : queueItem.subtitle,
      status: product ? "pass" : "warn",
      source_type: "products",
      fact_ids: product?.fact_ids ?? []
    },
    {
      label: "SKU outcomes",
      detail: context ? `${context.delivered} delivered, ${percent(context.return_rate)} returns${context.top_return_reason ? `, top issue ${labelize(context.top_return_reason.reason)}` : ""}.` : "No SKU outcome data is connected to this item.",
      status: context?.return_rate == null ? "warn" : context.return_rate > 0.18 ? "fail" : "pass",
      source_type: "order_outcomes",
      fact_ids: context?.top_return_reason?.fact_ids ?? []
    },
    {
      label: "Reviews",
      detail: context ? `${context.credibility.review_count} reviews, trusted rating ${context.credibility.weighted_average ?? "not ready"}, raw gap ${reviewGap.toFixed(2)}.` : "No product review context needed for this item.",
      status: reviewGap >= 0.35 ? "warn" : "pass",
      source_type: "reviews",
      fact_ids: context?.credibility?.fact_ids ?? []
    },
    {
      label: "Proof",
      detail: proofQuality ? `${proofQuality.score}/100: ${proofQuality.headline}` : context ? `${context.proof_assets.length} proof upload(s), ${context.proof_requests.length} proof request(s).` : "No proof upload attached.",
      status: proofQuality ? proofQualityStatus(proofQuality.decision) : context?.proof_assets?.length ? "pass" : "warn",
      source_type: "seller_evidence_assets",
      fact_ids: [row.fact_id].filter(Boolean)
    },
    {
      label: "Score impact",
      detail: `Approve: ${scoreSimulation.current_score} -> ${scoreSimulation.next_if_approved}. Reject: ${scoreSimulation.next_if_rejected}.`,
      status: scoreSimulation.remaining_blockers.length ? "warn" : "pass",
      source_type: "trust_score_simulation",
      fact_ids: []
    }
  ];
}

function adminContradictions(queueItem: any, row: any, context: any, profile: any) {
  const conflicts: any[] = [];
  const raw = Number(context?.credibility?.raw_average ?? 0);
  const trusted = Number(context?.credibility?.weighted_average ?? 0);
  const productRating = Number(context?.product?.rating ?? 0);
  const reviewGap = Number(context?.credibility?.rating_gap ?? 0);
  const returnRate = Number(context?.return_rate ?? 0);

  if (reviewGap >= 0.35) {
    conflicts.push(signal("Raw rating is stronger than trusted rating", `Raw ${raw}/5 becomes trusted ${trusted}/5 after reviewer credibility weights.`, "medium", context?.credibility?.fact_ids));
  }
  if (productRating >= 4.2 && returnRate >= 0.18) {
    conflicts.push(signal("High product rating conflicts with returns", `${productRating}/5 rating is visible, but SKU return rate is ${percent(returnRate)}.`, "high", context?.top_return_reason?.fact_ids));
  }
  if ((profile?.verification_status ?? row.verification_status) !== "verified" && productRating >= 4.2) {
    conflicts.push(signal("Product looks strong but seller is not verified", "Buyer-facing score cannot become strong until seller verification clears.", "high"));
  }
  if (row.prescreen?.proof_quality?.decision === "approve") {
    const attributeReviews = (context?.reviews ?? []).filter((review: any) => review.attribute === row.attribute);
    const negativeTrusted = attributeReviews.filter((review: any) => review.sentiment === "negative" && Number(review.credibility_weight ?? 0.6) >= 0.55);
    if (negativeTrusted.length) {
      conflicts.push(signal("Proof helps but trusted reviews still disagree", `${negativeTrusted.length} trusted review(s) still mention ${labelize(row.attribute)} concern.`, "medium", negativeTrusted.map((review: any) => review.fact_id)));
    }
  }
  if (queueItem.blocker) {
    conflicts.push(signal("Policy blocker exists", queueItem.blocker, "high"));
  }
  return conflicts.slice(0, 4);
}

function adminMissingEvidence(queueItem: any, row: any, context: any, profile: any) {
  const missing: any[] = [];
  if ((profile?.verification_status ?? row.verification_status) !== "verified" && ["seller_application", "listing_draft"].includes(queueItem.item_type)) {
    missing.push(signal("Seller verification not complete", "Do not let this item create a strong buyer recommendation yet.", "high"));
  }
  if (queueItem.item_type === "verification_document" && !row.sha256) {
    missing.push(signal("Document hash missing", "Reviewer cannot rely on duplicate/tamper checks without the file hash.", "high"));
  }
  if (queueItem.item_type === "listing_draft") {
    if (!row.image_url) missing.push(signal("Product image missing", "A buyer-facing listing needs a reviewable product image.", "medium"));
    if (!row.target_cluster_id) missing.push(signal("Cluster mapping missing", "Duplicate product detection needs a target cluster.", "medium"));
  }
  if (queueItem.item_type === "proof_asset") {
    if (row.prescreen?.proof_quality?.decision !== "approve") {
      missing.push(signal("Proof not ready for trust lift", row.prescreen?.proof_quality?.reviewer_instruction ?? "Reviewer should ask for clearer proof.", "high", [row.fact_id].filter(Boolean)));
    }
    if (row.attribute === "size" && !(context?.variants ?? []).some((variant: any) => variant.measurement_status === "verified")) {
      missing.push(signal("Verified size measurements missing", "Size confidence should stay cautious until measurement proof is approved.", "medium"));
    }
  }
  if (context && !context.outcomes.length) {
    missing.push(signal("Outcome evidence is thin", "Score must carry a limited-evidence label until real orders accumulate.", "medium"));
  }
  return missing.slice(0, 4);
}

function adminAgreementSignals(queueItem: any, row: any, context: any, profile: any) {
  const agrees: any[] = [];
  if ((profile?.verification_status ?? row.verification_status) === "verified") {
    agrees.push(signal("Seller verification gate passed", "Seller identity is eligible for buyer-facing trust once item evidence also passes.", "low"));
  }
  if (context?.delivered > 0) {
    agrees.push(signal("SKU outcomes are connected", `${context.delivered} delivered order(s) are available for return analysis.`, "low", context.top_return_reason?.fact_ids));
  }
  if (context?.credibility?.reliability && context.credibility.reliability !== "unknown") {
    agrees.push(signal("Review credibility computed", `${context.credibility.review_count} review(s) weighted as ${context.credibility.reliability}.`, "low", context.credibility.fact_ids));
  }
  if (row.prescreen?.proof_quality?.decision === "approve") {
    agrees.push(signal("Proof quality has no hard blocker", `${row.prescreen.proof_quality.score}/100 proof quality, still requiring human visual confirmation.`, "low", [row.fact_id].filter(Boolean)));
  }
  if (!queueItem.blocker && queueItem.confidence === "high") {
    agrees.push(signal("Fast-review candidate", "No blocker is currently preventing a standard reviewer decision.", "low"));
  }
  return agrees.slice(0, 4);
}

function adminScoreSimulation(queueItem: any, row: any, context: any, proofQuality: any, missing: any[]) {
  const productRatingSignal = context?.product?.rating ? Math.round((Number(context.product.rating) / 5) * 20) : 10;
  const returnSignal = context?.return_rate == null ? 12 : Math.max(0, Math.round((1 - Number(context.return_rate)) * 25));
  const reviewSignal = context?.credibility?.weighted_average ? Math.round((Number(context.credibility.weighted_average) / 5) * 20) : 10;
  const proofSignal = proofQuality ? Math.round(Number(proofQuality.score) * 0.2) : queueItem.item_type === "proof_asset" ? 8 : 12;
  const sellerSignal = queueItem.blocker ? 6 : 14;
  const current = clampScore(productRatingSignal + returnSignal + reviewSignal + proofSignal + sellerSignal - Math.round(queueItem.risk_score * 0.15));
  const trustLift = Math.max(0, Number(queueItem.trust_impact_points ?? 0));
  const approvalPenalty = missing.filter((item) => item.severity === "high").length * 4;
  return {
    current_score: current,
    next_if_approved: clampScore(current + trustLift - approvalPenalty),
    next_if_rejected: clampScore(current - Math.max(6, Math.round(trustLift / 2))),
    buyer_label_after_approval: missing.some((item) => item.severity === "high")
      ? "Limited evidence stays visible"
      : current + trustLift >= 74
        ? "Can move toward safer choice"
        : "Confidence improves but remains cautious",
    remaining_blockers: missing.map((item) => item.label).slice(0, 3)
  };
}

async function adminSellerTasks(db: Db, queueItem: any, row: any, context: any, conflicts: any[], missing: any[]) {
  const existing = (context?.root_tasks ?? []).map((task: any) => ({
    task_id: task.task_id,
    title: task.title ?? "Resolve open seller task",
    detail: task.seller_action ?? task.rationale ?? "Seller action is required before trust can improve.",
    priority: task.priority ?? "medium",
    owner: "seller",
    reason: task.rationale ?? "Open task from buyer outcome or admin review."
  }));
  const generated = [...conflicts, ...missing].slice(0, 3).map((item, index) => ({
    task_id: `suggested_${queueItem.queue_item_id}_${index + 1}`,
    title: sellerTaskTitle(queueItem, row, item),
    detail: sellerTaskDetail(row, item),
    priority: item.severity === "high" ? "high" : "medium",
    owner: "seller",
    reason: item.detail
  }));
  return uniqueTasks([...existing, ...generated]).slice(0, 4);
}

function sellerTaskTitle(queueItem: any, row: any, item: any) {
  if (queueItem.item_type === "proof_asset") return `Fix ${labelize(row.attribute ?? "proof")} proof`;
  if (queueItem.item_type === "listing_draft") return "Fix listing evidence";
  if (queueItem.item_type === "verification_document") return "Fix verification document";
  return item.label;
}

function sellerTaskDetail(row: any, item: any) {
  if (row.attribute) return `Upload ${labelize(recommendedProofType(row.attribute))} or clarify the ${labelize(row.attribute)} claim.`;
  return item.detail;
}

function adminToolChain(queueItem: any, context: any, proofQuality: any) {
  return [
    tool("queue_triage", "Queue triage", "pass", "Ranks case by SLA, risk, blocker, and buyer impact."),
    tool("seller_gate", "Seller gate", queueItem.blocker && queueItem.item_type !== "proof_asset" ? "warn" : "pass", "Checks verification and policy blockers."),
    tool("product_evidence_loader", "Product evidence", context ? "pass" : "warn", context ? "Loaded product, SKU, review, proof, and outcome context." : "This review item is not product-specific."),
    tool("review_credibility", "Review credibility", context?.credibility?.review_count ? "pass" : "warn", context ? `${context.credibility.review_count} review(s) weighted.` : "No review weighting needed."),
    tool("proof_quality", "Proof quality", proofQuality ? proofQualityStatus(proofQuality.decision) : "warn", proofQuality ? `${proofQuality.score}/100 prescreen. Human remains final.` : "No proof upload attached."),
    tool("impact_simulator", "Impact simulator", "pass", "Projects buyer trust label before the reviewer decides."),
    tool("seller_task_generator", "Seller task generator", "pass", "Creates or suggests seller tasks from missing/conflicting evidence.")
  ];
}

function adminHumanGuardrails(queueItem: any, conflicts: any[], missing: any[]) {
  return [
    "AI cannot approve, reject, publish, restrict, or raise score without reviewer action.",
    "High-risk blockers and conflicting evidence stay human-led.",
    "Buyer private data is not shown to seller or used in admin notes.",
    "Score lift is allowed only after verified evidence or successful outcome data.",
    conflicts.length || missing.some((item) => item.severity === "high")
      ? "Do not fast-clear this case until the highlighted conflict or missing evidence is handled."
      : "Fast review is allowed only after opening the actual file/proof once."
  ];
}

function adminAuditTimeline(queueItem: any, row: any, scoreSimulation: any) {
  return [
    {
      label: "Case opened",
      detail: adminCaseTrigger(queueItem, row),
      status: "done",
      timestamp: queueItem.submitted_at
    },
    {
      label: "Agent prescreen",
      detail: row.prescreen?.observe ?? "Rules prescreen generated.",
      status: "done",
      timestamp: row.updated_at ?? row.submitted_at ?? row.created_at
    },
    {
      label: "Human review",
      detail: queueItem.primary_action,
      status: "current",
      timestamp: null
    },
    {
      label: "After decision",
      detail: `Buyer confidence can become ${scoreSimulation.buyer_label_after_approval.toLowerCase()}.`,
      status: "next",
      timestamp: null
    }
  ];
}

function buildTrustOpsSummary(summary: any, activeQueue: any[], sellerDossiers: any[]) {
  const contradictionCount = activeQueue.reduce((sum, item) => sum + Number(item.case_file?.evidence_conflicts?.length ?? 0), 0);
  const taskCount = activeQueue.reduce((sum, item) => sum + Number(item.case_file?.seller_tasks?.length ?? 0), 0);
  const fastClearCount = activeQueue.filter((item) => item.confidence === "high" && item.route_to === "standard_review" && !item.blocker && !(item.case_file?.evidence_conflicts?.length)).length;
  const topCases = activeQueue.slice(0, 4).map((item) => ({
    queue_item_id: item.queue_item_id,
    seller_id: item.seller_id,
    seller_name: item.seller_name,
    title: item.title,
    trigger: item.case_file?.trigger ?? item.buyer_impact,
    risk_score: item.risk_score,
    conflicts: item.case_file?.evidence_conflicts?.length ?? 0,
    trust_impact_points: item.trust_impact_points
  }));
  return {
    headline: activeQueue.length ? "TrustOps copilot is case-ready" : "TrustOps queue is clear",
    summary: activeQueue.length
      ? `${activeQueue.length} active case(s), ${contradictionCount} contradiction(s), and ${taskCount} seller task suggestion(s) are grounded in queue evidence.`
      : "No active admin work is waiting.",
    case_count: activeQueue.length,
    contradiction_count: contradictionCount,
    seller_task_count: taskCount,
    fast_clear_count: fastClearCount,
    human_review_count: activeQueue.length - fastClearCount,
    impact_points_waiting: summary.trust_lift_pending,
    lanes: [
      { key: "fast_clear", label: "Fast clear", count: fastClearCount, detail: "High-confidence cases after one visual check." },
      { key: "contradiction", label: "Contradictions", count: contradictionCount, detail: "Evidence disagrees and needs judgment." },
      { key: "seller_tasks", label: "Seller tasks", count: taskCount, detail: "Fixes generated from review blockers." },
      { key: "human_gate", label: "Human gate", count: activeQueue.length - fastClearCount, detail: "Cases that cannot be automated." }
    ],
    top_cases: topCases,
    guardrails: [
      "Admin copilot ranks and explains; it never makes the final decision.",
      "Every case links to evidence, missing data, or a safe unsupported state.",
      "Seller tasks use aggregate buyer demand and do not expose buyer identity."
    ],
    seller_scope: `${sellerDossiers.filter((seller) => seller.open_review_items > 0).length} seller(s) need attention.`
  };
}

function adminCaseTrigger(queueItem: any, row: any) {
  if (queueItem.item_type === "proof_asset") {
    const requests = Number(row.open_request_count ?? 0);
    return requests > 0
      ? `${requests} buyer proof request${requests === 1 ? "" : "s"} need ${labelize(row.attribute)} evidence.`
      : `Seller submitted ${labelize(row.attribute)} proof for reviewer verification.`;
  }
  if (queueItem.item_type === "listing_draft") return "Seller submitted a product draft that can enter the buyer feed only after TrustOps review.";
  if (queueItem.item_type === "verification_document") return `${labelize(row.document_type ?? "document")} was submitted for seller verification.`;
  return "Seller verification is waiting for document and identity review.";
}

function adminPrimaryQuestion(queueItem: any, row: any) {
  if (queueItem.item_type === "proof_asset") return `Does this proof safely support the ${labelize(row.attribute)} claim buyers asked about?`;
  if (queueItem.item_type === "listing_draft") return "Can this listing go live without misleading buyers or duplicating weak catalog data?";
  if (queueItem.item_type === "verification_document") return "Does this document safely support seller verification?";
  return "Can this seller become eligible for buyer-facing trust?";
}

function signal(label: string, detail: string, severity: "low" | "medium" | "high" = "medium", factIds: string[] = []) {
  return { label, detail, severity, fact_ids: factIds.filter(Boolean) };
}

function tool(key: string, label: string, status: "pass" | "warn" | "fail", detail: string) {
  return { key, label, status, detail };
}

function proofQualityStatus(decision: string): "pass" | "warn" | "fail" {
  if (decision === "approve") return "pass";
  if (decision === "reject") return "fail";
  return "warn";
}

function topReturnReason(outcomes: any[]) {
  const counts = new Map<string, { count: number; fact_ids: string[] }>();
  for (const outcome of outcomes) {
    if (!outcome.return_reason) continue;
    const current = counts.get(outcome.return_reason) ?? { count: 0, fact_ids: [] };
    current.count += 1;
    if (outcome.fact_id) current.fact_ids.push(outcome.fact_id);
    counts.set(outcome.return_reason, current);
  }
  const [reason, value] = [...counts.entries()].sort((left, right) => right[1].count - left[1].count)[0] ?? [];
  return reason ? { reason, count: value.count, fact_ids: value.fact_ids.slice(0, 4) } : null;
}

function uniqueTasks(tasks: any[]) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = `${task.title}-${task.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "unknown";
  return `${Math.round(Number(value) * 100)}%`;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function recordAdminEvent(db: Db, account: any, action: string, targetType: string, targetId: string, sellerId: string | null, decision: string, notes: string) {
  await collections(db).adminAuditEvents.insertOne({
    event_id: id("admin_event"),
    actor_account_id: account.account_id,
    actor_name: account.display_name,
    action,
    target_type: targetType,
    target_id: targetId,
    seller_id: sellerId,
    decision,
    notes,
    created_at: nowIso()
  });
}

async function missingRequiredDocuments(db: Db, sellerId: string) {
  const docs = await collections(db).sellerVerificationDocuments.find({ seller_id: sellerId }).toArray();
  return REQUIRED_SELLER_DOCUMENTS.filter((type) =>
    !docs.some((doc: any) => doc.document_type === type && doc.status === "approved")
  );
}

async function updateProfileAfterDocumentDecision(db: Db, sellerId: string, documentType: string, decision: "approved" | "rejected") {
  const c = collections(db);
  const set: Record<string, string | null> = {};
  if (documentType === "gst_certificate") {
    set.gst_status = decision === "approved" ? "verified" : "pending_review";
  }
  if (["pan_card", "address_proof", "bank_proof"].includes(documentType)) {
    set.kyc_status = decision === "approved" ? "under_review" : "under_review";
  }
  if (decision === "rejected") {
    set.verification_status = "pending";
  }
  if (Object.keys(set).length) {
    await c.sellerProfiles.updateOne({ seller_id: sellerId }, { $set: set });
  }
}

async function maybePromoteSellerVerification(db: Db, sellerId: string, account: any, notes: string) {
  const c = collections(db);
  const [application, missing] = await Promise.all([
    c.sellerApplications.findOne({ seller_id: sellerId, status: "approved" }, { sort: { created_at: -1 } }),
    missingRequiredDocuments(db, sellerId)
  ]);
  if (!application || missing.length) return;
  await Promise.all([
    c.sellerProfiles.updateOne(
      { seller_id: sellerId },
      { $set: { verification_status: "verified", gst_status: "verified", kyc_status: "verified", data_access_level: "aggregate_only", last_verified_at: nowIso(), restricted_reason: null } }
    ),
    recordAdminEvent(db, account, "seller_verification_completed", "seller_profile", sellerId, sellerId, "verified", notes)
  ]);
}

type AdminPrescreenItemType = "seller_application" | "verification_document" | "listing_draft" | "proof_asset";

async function adminPrescreenSuggestion(db: Db, itemType: AdminPrescreenItemType, item: any) {
  const deterministic = deterministicAdminPrescreen(itemType, item);
  if (!needsLiveAdminPrescreen(itemType, item)) {
    return { ...deterministic, agent_provider: "deterministic_fallback" };
  }
  const cacheKey = llmCacheKey("admin_prescreen", adminPrescreenCachePayload(itemType, item, deterministic));
  const cached = await readLlmCache(db, cacheKey);
  if (cached) {
    return { ...deterministic, ...cached };
  }
  const grounded = await generateGroundedAgentAnswer({
    task: "admin_prescreen",
    query: `Pre-screen ${itemType} ${deterministic.queue_item_id}`,
    context: {
      item_type: itemType,
      item,
      deterministic,
      guardrail: "Human reviewer must make the final decision. Agent only suggests action with evidence."
    },
    fallback: {
      title: deterministic.observe,
      summary: deterministic.reason,
      reasons: [deterministic.act, deterministic.learn],
      caution: deterministic.route_to === "senior_reviewer" ? "Route to senior reviewer before accepting." : null
    }
  });
  const prescreen = {
    ...deterministic,
    observe: grounded.title || deterministic.observe,
    reason: grounded.summary || deterministic.reason,
    learn: grounded.reasons?.[1] ?? deterministic.learn,
    agent_provider: grounded.source
  };
  if (isGeneratedProvider(grounded.source)) {
    await writeLlmCache(db, cacheKey, "admin_prescreen", {
      observe: prescreen.observe,
      reason: prescreen.reason,
      learn: prescreen.learn,
      agent_provider: prescreen.agent_provider
    });
  }
  return prescreen;
}

function needsLiveAdminPrescreen(itemType: AdminPrescreenItemType, item: any) {
  if (itemType === "seller_application") return item.status === "pending_review";
  if (itemType === "verification_document") return ["submitted", "under_review"].includes(item.status);
  if (itemType === "listing_draft") return item.status === "submitted";
  if (itemType === "proof_asset") return item.status === "submitted";
  return false;
}

function adminPrescreenCachePayload(itemType: AdminPrescreenItemType, item: any, deterministic: any) {
  return {
    item_type: itemType,
    item_id: deterministic.queue_item_id,
    seller_id: item.seller_id,
    status: item.status,
    updated_at: item.updated_at ?? item.submitted_at ?? item.created_at ?? item.reviewed_at ?? null,
    verification_status: item.verification_status ?? null,
    document_type: item.document_type ?? null,
    proof_type: item.proof_type ?? null,
    attribute: item.attribute ?? null,
    draft_readiness: item.readiness_status ?? null,
    open_request_count: item.open_request_count ?? null,
    risk_score: deterministic.risk_score,
    suggested_action: deterministic.suggested_action,
    checks: deterministic.checks.map((check: any) => [check.label, check.status]),
    proof_quality: deterministic.proof_quality ? {
      score: deterministic.proof_quality.score,
      decision: deterministic.proof_quality.decision,
      checks: deterministic.proof_quality.checks.map((check: any) => [check.key, check.status])
    } : null
  };
}

function deterministicAdminPrescreen(itemType: AdminPrescreenItemType, item: any) {
  if (itemType === "seller_application") return sellerApplicationPrescreen(item);
  if (itemType === "listing_draft") return listingDraftPrescreen(item);
  if (itemType === "proof_asset") return proofAssetPrescreen(item);
  return documentPrescreen(item);
}

function sellerApplicationPrescreen(item: any) {
  const evidence = [
    evidenceItem("GST", item.gst_number, item.application_id),
    evidenceItem("Pickup", item.pickup_pincode, item.application_id),
    evidenceItem("Support", item.support_contact, item.application_id),
    evidenceItem("Verification", item.verification_status ?? "not started", item.seller_id)
  ];
  let risk = item.status === "pending_review" ? 25 : 10;
  if (!looksLikeGstin(item.gst_number)) risk += 18;
  if (!/^\d{6}$/.test(String(item.pickup_pincode ?? ""))) risk += 14;
  if (!String(item.support_contact ?? "").includes("@") && String(item.support_contact ?? "").replace(/\D/g, "").length < 10) risk += 14;
  if (item.verification_status === "restricted") risk += 35;
  const suggestedAction = item.status !== "pending_review"
    ? "manual_check"
    : risk <= 42
      ? "approve"
      : risk >= 70
        ? "reject"
        : "manual_check";
  return buildPrescreen({
    queue_item_id: item.application_id,
    item_type: "seller_application",
    risk,
    suggested_action: suggestedAction,
    observe: `${item.business_name} identity details are ready for reviewer check.`,
    reason: risk <= 42
      ? "Business identity, pickup pincode, and support contact look coherent enough for standard approval."
      : "Some seller identity fields need a human check before buyer trust eligibility is granted.",
    act: suggestedAction === "approve" ? "Accept suggestion to approve seller verification." : suggestedAction === "reject" ? "Reject only with clear review notes." : "Review documents and seller details manually.",
    learn: "The final reviewer decision is written to the admin audit trail.",
    evidence,
    checks: [
      policyCheck("GST format", looksLikeGstin(item.gst_number), "GST reference should be a coherent alphanumeric identifier."),
      policyCheck("Pickup pincode", /^\d{6}$/.test(String(item.pickup_pincode ?? "")), "Pickup location must be a 6 digit pincode."),
      policyCheck("Support contact", String(item.support_contact ?? "").includes("@") || String(item.support_contact ?? "").replace(/\D/g, "").length >= 10, "Support contact must be reachable for buyer or ops escalation."),
      policyCheck("Not restricted", item.verification_status !== "restricted", "Restricted sellers cannot be approved without escalation.")
    ]
  });
}

function listingDraftPrescreen(item: any) {
  const evidence = [
    evidenceItem("Status", item.status, item.draft_id),
    evidenceItem("Seller", item.verification_status ?? "missing", item.seller_id),
    evidenceItem("Readiness", item.readiness_status, item.draft_id),
    evidenceItem("Price", `Rs ${item.base_price}`, item.draft_id)
  ];
  let risk = item.status === "submitted" ? 20 : 35;
  if (item.verification_status !== "verified") risk += 35;
  if (!item.image_url) risk += 12;
  if (!item.fabric || String(item.fabric).length < 3) risk += 12;
  if (!item.color_family || String(item.color_family).length < 3) risk += 8;
  if (!Number.isFinite(Number(item.base_price)) || Number(item.base_price) < 100) risk += 18;
  if (!item.target_cluster_id) risk += 8;
  const suggestedAction = item.status === "submitted" && item.verification_status === "verified" && risk <= 45
    ? "publish"
    : item.status === "submitted"
      ? "request_revision"
      : "manual_check";
  return buildPrescreen({
    queue_item_id: item.draft_id,
    item_type: "listing_draft",
    risk,
    suggested_action: suggestedAction,
    observe: `${item.title} is ${item.status} with ${item.readiness_status} readiness.`,
    reason: suggestedAction === "publish"
      ? "Seller is verified and catalog facts are coherent enough to publish with limited-evidence status."
      : "Publishing should wait until seller verification and listing facts are cleaner.",
    act: suggestedAction === "publish" ? "Accept suggestion to publish into the buyer catalog." : "Request revision with specific missing facts.",
    learn: "Approved drafts create catalog, SKU, price, inventory, fact, and audit records.",
    evidence,
    checks: [
      policyCheck("Seller verified", item.verification_status === "verified", "Only verified sellers can publish buyer-facing listings."),
      policyCheck("Submitted by seller", item.status === "submitted", "Draft must be intentionally submitted before reviewer action."),
      policyCheck("Image present", Boolean(item.image_url), "A product image is required before publishing."),
      policyCheck("Core catalog facts", Boolean(item.fabric && item.color_family && item.garment_type), "Fabric, color, and garment type must be present."),
      policyCheck("Sensible price", Number.isFinite(Number(item.base_price)) && Number(item.base_price) >= 100, "Price should be a usable positive listing price."),
      policyCheck("Cluster mapped", Boolean(item.target_cluster_id), "Cluster match helps prevent duplicate catalog sprawl.", Boolean(item.target_cluster_id) ? "pass" : "warn")
    ]
  });
}

function documentPrescreen(item: any) {
  const evidence = [
    evidenceItem("Document", item.document_type, item.document_id),
    evidenceItem("Reference", item.reference, item.document_id),
    evidenceItem("File", item.file_name, item.document_id),
    evidenceItem("Hash", item.sha256 ? item.sha256.slice(0, 12) : "missing", item.document_id)
  ];
  let risk = item.status === "submitted" || item.status === "under_review" ? 24 : 12;
  if (!item.sha256) risk += 42;
  if (!item.reference || String(item.reference).length < 5) risk += 20;
  if (item.status === "rejected") risk += 30;
  const suggestedAction = (item.status === "submitted" || item.status === "under_review") && risk <= 32
    ? "approve_document"
    : risk >= 70
      ? "reject_document"
      : "manual_check";
  return buildPrescreen({
    queue_item_id: item.document_id,
    item_type: "verification_document",
    risk,
    suggested_action: suggestedAction,
    observe: `${item.seller_name || item.seller_id} submitted ${item.document_type}.`,
    reason: suggestedAction === "approve_document"
      ? "Document metadata has a reference, file name, size, and hash. Reviewer should confirm the content matches the seller."
      : "Document evidence needs a reviewer check because the current integration stores references and hashes until a managed KYC provider is connected.",
    act: suggestedAction === "approve_document" ? "Approve this document if the opened file matches the seller identity." : "Review the reference and seller application together.",
    learn: "Document status explains the seller verification decision in the audit trail.",
    evidence,
    checks: [
      policyCheck("Hash captured", Boolean(item.sha256), "Document hash is needed for duplicate and tamper checks."),
      policyCheck("Reference present", Boolean(item.reference && String(item.reference).length >= 5), "Reference should identify what the file claims."),
      policyCheck("File metadata", Boolean(item.file_name && item.file_size_bytes), "File name and size must be recorded."),
      policyCheck("Reviewable status", ["submitted", "under_review"].includes(item.status), "Only submitted documents need reviewer action.", ["submitted", "under_review"].includes(item.status) ? "pass" : "warn")
    ]
  });
}

function proofAssetPrescreen(item: any) {
  const quality = proofQualityPrescreen(item);
  const evidence = [
    evidenceItem("Status", item.status, item.proof_id),
    evidenceItem("Product", item.product_title, item.product_id),
    evidenceItem("Attribute", item.attribute, item.proof_id),
    evidenceItem("Buyer asks", item.open_request_count, item.proof_id),
    evidenceItem("Asset", item.asset_url ? "present" : "missing", item.proof_id),
    evidenceItem("Copilot score", `${quality.score}/100`, item.proof_id),
    evidenceItem("Copilot decision", quality.decision, item.proof_id)
  ];
  let risk = item.status === "submitted" ? 24 : 12;
  if (!item.asset_url) risk += 35;
  if (!item.title || String(item.title).length < 4) risk += 12;
  if (!item.description || String(item.description).length < 8) risk += 14;
  if (item.status === "rejected") risk += 30;
  risk += proofQualityRiskDelta(quality);
  const suggestedAction = item.status === "submitted" && quality.decision === "approve" && risk <= 42
    ? "approve"
    : "manual_check";
  return buildPrescreen({
    queue_item_id: item.proof_id,
    item_type: "proof_asset",
    risk,
    suggested_action: suggestedAction,
    observe: `${item.seller_name || item.seller_id} submitted ${labelize(item.attribute)} proof for ${item.product_title}.`,
    reason: suggestedAction === "approve"
      ? quality.summary
      : `${quality.summary} Final approval, rejection, or revision stays with the reviewer.`,
    act: suggestedAction === "approve"
      ? "Inspect the asset once, then approve only if the visible proof matches the product claim."
      : quality.reviewer_instruction,
    learn: "Approval changes buyer proof status and adds the verified proof to future trust checks; rejection reopens seller proof demand.",
    evidence,
    checks: quality.checks,
    proof_quality: quality
  });
}

function buildPrescreen(input: {
  queue_item_id: string;
  item_type: AdminPrescreenItemType;
  risk: number;
  suggested_action: string;
  observe: string;
  reason: string;
  act: string;
  learn: string;
  evidence: Array<{ label: string; value: string; source_id: string }>;
  checks?: Array<{ label: string; status: string; detail: string }>;
  proof_quality?: any;
}) {
  const riskScore = Math.max(0, Math.min(100, Math.round(input.risk)));
  return {
    queue_item_id: input.queue_item_id,
    item_type: input.item_type,
    risk_score: riskScore,
    risk_level: riskScore >= 70 ? "high" : riskScore >= 45 ? "medium" : "low",
    suggested_action: input.suggested_action,
    confidence: riskScore <= 35 || riskScore >= 75 ? "high" : riskScore >= 55 ? "medium" : "low",
    route_to: riskScore >= 70 ? "senior_reviewer" : "standard_review",
    observe: input.observe,
    reason: input.reason,
    act: input.act,
    learn: input.learn,
    evidence: input.evidence,
    checks: input.checks ?? [],
    ...(input.proof_quality ? { proof_quality: input.proof_quality } : {}),
    fact_ids: []
  };
}

function evidenceItem(label: string, value: unknown, sourceId: string) {
  return {
    label,
    value: String(value ?? "missing"),
    source_id: sourceId
  };
}

function buildActiveReviewQueue(applications: any[], documents: any[], drafts: any[], proofAssets: any[]) {
  const items = [
    ...applications
      .filter((item) => item.status === "pending_review")
      .map((item) => reviewQueueItem({
        item,
        queue_item_id: item.application_id,
        item_type: "seller_application",
        title: item.business_name,
        subtitle: "Seller verification blocks buyer-facing trust",
        submitted_at: item.created_at,
        sla_hours: 48,
        buyer_impact: "Seller cannot earn trusted status until this is cleared.",
        trust_impact_points: 12,
        blocker: "Required documents must be approved before seller approval.",
        primary_action: item.prescreen.suggested_action === "approve" ? "Approve seller" : "Review seller dossier"
      })),
    ...documents
      .filter((item) => ["submitted", "under_review"].includes(item.status))
      .map((item) => reviewQueueItem({
        item,
        queue_item_id: item.document_id,
        item_type: "verification_document",
        title: labelize(item.document_type),
        subtitle: `${item.seller_name || item.seller_id} document check`,
        submitted_at: item.submitted_at ?? item.uploaded_at,
        sla_hours: 24,
        buyer_impact: "Required document can unblock seller verification.",
        trust_impact_points: REQUIRED_SELLER_DOCUMENTS.includes(item.document_type) ? 6 : 2,
        blocker: item.sha256 ? null : "File hash is missing.",
        primary_action: item.prescreen.suggested_action === "approve_document" ? "Approve document" : "Inspect document"
      })),
    ...drafts
      .filter((item) => item.status === "submitted")
      .map((item) => reviewQueueItem({
        item,
        queue_item_id: item.draft_id,
        item_type: "listing_draft",
        title: item.title,
        subtitle: `${item.seller_name || item.seller_id} listing draft`,
        submitted_at: item.submitted_at ?? item.updated_at,
        sla_hours: 24,
        buyer_impact: item.verification_status === "verified"
          ? "Can publish as limited-evidence catalog stock."
          : "Blocked from buyer feed until seller verification clears.",
        trust_impact_points: item.verification_status === "verified" ? 8 : 0,
        blocker: item.verification_status === "verified" ? null : `Seller verification is ${labelize(item.verification_status ?? "missing")}.`,
        primary_action: item.verification_status === "verified" ? "Publish listing" : "Request revision"
      })),
    ...proofAssets
      .filter((item) => item.status === "submitted")
      .map((item) => reviewQueueItem({
        item,
        queue_item_id: item.proof_id,
        item_type: "proof_asset",
        title: item.title || item.product_title,
        subtitle: `${labelize(item.attribute)} proof for ${item.product_title}`,
        submitted_at: item.submitted_at ?? item.created_at,
        sla_hours: 12,
        buyer_impact: `${item.open_request_count} buyer proof request(s) can be resolved.`,
        trust_impact_points: proofTrustLift(item.attribute, item.open_request_count),
        blocker: proofTypeFitsAttribute(item.attribute, item.proof_type) ? null : `Expected ${recommendedProofType(item.attribute)} proof.`,
        primary_action: item.prescreen.suggested_action === "approve" ? "Approve proof" : "Inspect proof"
      }))
  ];
  return items.sort((a, b) =>
    slaRank(b.sla_state) - slaRank(a.sla_state) ||
    b.risk_score - a.risk_score ||
    b.trust_impact_points - a.trust_impact_points ||
    b.age_hours - a.age_hours
  );
}

function reviewQueueItem(input: {
  item: any;
  queue_item_id: string;
  item_type: string;
  title: string;
  subtitle: string;
  submitted_at: string | null;
  sla_hours: number;
  buyer_impact: string;
  trust_impact_points: number;
  blocker: string | null;
  primary_action: string;
}) {
  const age = ageHours(input.submitted_at);
  const sla_state = age > input.sla_hours ? "breached" : age > input.sla_hours * 0.75 ? "due_today" : "ok";
  return {
    queue_item_id: input.queue_item_id,
    item_type: input.item_type,
    seller_id: input.item.seller_id,
    seller_name: input.item.seller_name ?? input.item.business_name ?? input.item.seller_id,
    title: input.title,
    subtitle: input.subtitle,
    status: input.item.status,
    risk_score: input.item.prescreen?.risk_score ?? 0,
    risk_level: input.item.prescreen?.risk_level ?? "low",
    suggested_action: input.item.prescreen?.suggested_action ?? "manual_check",
    route_to: input.item.prescreen?.route_to ?? "standard_review",
    confidence: input.item.prescreen?.confidence ?? "low",
    submitted_at: input.submitted_at,
    age_hours: age,
    sla_hours: input.sla_hours,
    sla_state,
    buyer_impact: input.buyer_impact,
    trust_impact_points: input.trust_impact_points,
    blocker: input.blocker,
    primary_action: input.primary_action,
    evidence: input.item.prescreen?.evidence ?? [],
    agent_provider: input.item.prescreen?.agent_provider ?? "deterministic_fallback"
  };
}

function buildAdminSummary(activeQueue: any[], applications: any[], documents: any[], drafts: any[], proofAssets: any[], health: any) {
  const proofReviews = proofAssets.filter((item) => item.status === "submitted");
  return {
    active_count: activeQueue.length,
    pending_applications: applications.filter((item) => item.status === "pending_review").length,
    document_checks: documents.filter((item) => ["submitted", "under_review"].includes(item.status)).length,
    submitted_drafts: drafts.filter((item) => item.status === "submitted").length,
    proof_reviews: proofReviews.length,
    blocked_items: activeQueue.filter((item) => item.blocker).length,
    senior_routed: activeQueue.filter((item) => item.route_to === "senior_reviewer").length,
    breached_sla_count: activeQueue.filter((item) => item.sla_state === "breached").length,
    suggested_actions: activeQueue.filter((item) => item.suggested_action !== "manual_check").length,
    buyer_requests_waiting: proofReviews.reduce((sum, item) => sum + Number(item.open_request_count ?? 0), 0),
    trust_lift_pending: activeQueue.reduce((sum, item) => sum + Number(item.trust_impact_points ?? 0), 0),
    source_status: health.overall_status,
    source_blocking: Boolean(health.blocking)
  };
}

async function buildAdminAutomationPlan(db: Db, summary: any, activeQueue: any[], sellerDossiers: any[]) {
  const fallback = deterministicAutomationPlan(summary, activeQueue, sellerDossiers);
  const cachePayload = adminAutomationCachePayload(summary, activeQueue, sellerDossiers, fallback);
  const cacheKey = llmCacheKey("admin_automation", cachePayload);
  const cached = await readLlmCache(db, cacheKey);
  if (cached) {
    return { ...fallback, ...cached };
  }
  const grounded = await generateGroundedAgentAnswer({
    task: "admin_automation",
    query: "Create a short admin review triage plan",
    context: {
      guardrail: "Do not approve, reject, publish, or close anything automatically. Only rank work and draft reviewer-safe next steps.",
      summary,
      active_queue: activeQueue.slice(0, 8).map((item) => ({
        id: item.queue_item_id,
        type: item.item_type,
        seller: item.seller_name,
        title: item.title,
        status: item.status,
        risk_score: item.risk_score,
        sla_state: item.sla_state,
        blocker: item.blocker,
        buyer_impact: item.buyer_impact,
        suggested_action: item.suggested_action
      })),
      seller_blockers: sellerDossiers
        .filter((seller) => seller.open_review_items > 0 || seller.pending_documents.length)
        .slice(0, 6)
        .map((seller) => ({
          seller_id: seller.seller_id,
          seller_name: seller.seller_name,
          verification_status: seller.verification_status,
          pending_documents: seller.pending_documents,
          next_action: seller.next_action
        }))
    },
    fallback: {
      title: fallback.headline,
      summary: fallback.summary,
      reasons: fallback.next_steps,
      caution: fallback.caution
    }
  });
  const plan = {
    headline: grounded.title || fallback.headline,
    summary: grounded.summary || fallback.summary,
    next_steps: grounded.reasons?.length ? grounded.reasons.slice(0, 4) : fallback.next_steps,
    first_queue_item_id: fallback.first_queue_item_id,
    blocked_count: summary.blocked_items,
    can_batch_count: fallback.can_batch_count,
    caution: grounded.caution ?? fallback.caution,
    agent_provider: grounded.source
  };
  if (isGeneratedProvider(grounded.source)) {
    await writeLlmCache(db, cacheKey, "admin_automation", {
      headline: plan.headline,
      summary: plan.summary,
      next_steps: plan.next_steps,
      caution: plan.caution,
      agent_provider: plan.agent_provider
    });
  }
  return plan;
}

function adminAutomationCachePayload(summary: any, activeQueue: any[], sellerDossiers: any[], fallback: any) {
  return {
    summary: {
      active_count: summary.active_count,
      blocked_items: summary.blocked_items,
      breached_sla_count: summary.breached_sla_count,
      suggested_actions: summary.suggested_actions,
      source_status: summary.source_status,
      source_blocking: summary.source_blocking
    },
    first_queue_item_id: fallback.first_queue_item_id,
    queue: activeQueue.slice(0, 8).map((item) => ({
      id: item.queue_item_id,
      type: item.item_type,
      seller_id: item.seller_id,
      status: item.status,
      risk_score: item.risk_score,
      suggested_action: item.suggested_action,
      route_to: item.route_to,
      blocker: item.blocker,
      sla_state: item.sla_state
    })),
    sellers: sellerDossiers
      .filter((seller) => seller.open_review_items > 0 || seller.pending_documents.length)
      .slice(0, 8)
      .map((seller) => ({
        seller_id: seller.seller_id,
        verification_status: seller.verification_status,
        open_review_items: seller.open_review_items,
        pending_documents: seller.pending_documents
      }))
  };
}

function deterministicAutomationPlan(summary: any, activeQueue: any[], sellerDossiers: any[]) {
  const first = activeQueue[0] ?? null;
  const blockedSeller = sellerDossiers.find((seller) => seller.pending_documents.length);
  const reviewableDocuments = activeQueue.filter((item) => item.item_type === "verification_document" && !item.blocker).length;
  const reviewableProofs = activeQueue.filter((item) => item.item_type === "proof_asset" && !item.blocker).length;
  const nextSteps = first
    ? [
        `${first.title}: ${first.blocker ? `clear blocker first - ${first.blocker}` : first.primary_action}.`,
        blockedSeller ? `${blockedSeller.seller_name}: finish ${blockedSeller.pending_documents.map(labelize).join(", ")} before seller approval.` : "No seller approval blocker is currently ahead of the queue.",
        reviewableDocuments ? `${reviewableDocuments} document check(s) can be cleared before touching seller approval.` : "No batchable document checks are ready.",
        reviewableProofs ? `${reviewableProofs} proof review(s) can unlock buyer-facing trust after media check.` : "No proof batch is ready."
      ]
    : ["No active reviewer work. Keep source health and audit trail monitored."];
  return {
    headline: first ? "Start with the oldest blocked review" : "Review queue is clear",
    summary: first
      ? `${summary.active_count} active item(s), ${summary.breached_sla_count} SLA breach(es), and ${summary.blocked_items} policy blocker(s).`
      : "No active application, document, listing, or proof item is waiting.",
    next_steps: nextSteps,
    first_queue_item_id: first?.queue_item_id ?? null,
    can_batch_count: reviewableDocuments + reviewableProofs,
    caution: summary.source_blocking ? "Evidence source freshness is stale, so keep strong trust decisions cautious." : null
  };
}

function buildSellerDossiers(input: {
  sellers: any[];
  profiles: any[];
  applications: any[];
  documents: any[];
  drafts: any[];
  proofAssets: any[];
  activeQueue: any[];
}) {
  const ids = new Set<string>();
  for (const list of [input.sellers, input.profiles, input.applications, input.documents, input.drafts, input.proofAssets]) {
    for (const item of list) if (item.seller_id) ids.add(item.seller_id);
  }
  return [...ids].map((sellerId) => {
    const seller = input.sellers.find((item) => item.seller_id === sellerId);
    const profile = input.profiles.find((item) => item.seller_id === sellerId);
    const applications = input.applications.filter((item) => item.seller_id === sellerId);
    const documents = input.documents.filter((item) => item.seller_id === sellerId);
    const drafts = input.drafts.filter((item) => item.seller_id === sellerId);
    const proofAssets = input.proofAssets.filter((item) => item.seller_id === sellerId);
    const activeItems = input.activeQueue.filter((item) => item.seller_id === sellerId);
    const missingDocs = profile?.verification_status === "verified"
      ? []
      : REQUIRED_SELLER_DOCUMENTS.filter((type) =>
          !documents.some((doc) => doc.document_type === type && doc.status === "approved")
        );
    const maxRisk = Math.max(0, ...activeItems.map((item) => item.risk_score));
    return {
      seller_id: sellerId,
      seller_name: seller?.name ?? applications[0]?.seller_name ?? documents[0]?.seller_name ?? sellerId,
      verification_status: profile?.verification_status ?? "pending",
      gst_status: profile?.gst_status ?? "pending_review",
      kyc_status: profile?.kyc_status ?? "under_review",
      open_review_items: activeItems.length,
      highest_risk_score: maxRisk,
      route_to: maxRisk >= 70 ? "senior_reviewer" : "standard_review",
      pending_documents: missingDocs,
      approved_document_count: documents.filter((item) => item.status === "approved").length,
      rejected_document_count: documents.filter((item) => item.status === "rejected").length,
      submitted_draft_count: drafts.filter((item) => item.status === "submitted").length,
      submitted_proof_count: proofAssets.filter((item) => item.status === "submitted").length,
      resolved_proof_count: proofAssets.filter((item) => item.status === "verified").length,
      buyer_requests_waiting: proofAssets
        .filter((item) => item.status === "submitted")
        .reduce((sum, item) => sum + Number(item.open_request_count ?? 0), 0),
      next_action: sellerNextAction(profile, missingDocs, activeItems),
      last_activity_at: latestIso([
        ...applications.map((item) => item.created_at),
        ...documents.map((item) => item.submitted_at ?? item.uploaded_at),
        ...drafts.map((item) => item.updated_at),
        ...proofAssets.map((item) => item.submitted_at ?? item.created_at)
      ])
    };
  }).sort((a, b) =>
    b.open_review_items - a.open_review_items ||
    b.highest_risk_score - a.highest_risk_score ||
    String(b.last_activity_at ?? "").localeCompare(String(a.last_activity_at ?? ""))
  );
}

function sellerNextAction(profile: any, missingDocs: string[], activeItems: any[]) {
  if (profile?.verification_status === "restricted") return "Resolve seller restriction before other work.";
  if (missingDocs.length) return `Review required docs: ${missingDocs.map(labelize).join(", ")}.`;
  const first = activeItems[0];
  if (first) return first.primary_action;
  if (profile?.verification_status !== "verified") return "Review seller application.";
  return "No active TrustOps blocker.";
}

function policyCheck(label: string, passed: boolean, detail: string, passedStatus: "pass" | "warn" = "pass") {
  return {
    label,
    status: passed ? passedStatus : "fail",
    detail
  };
}

function looksLikeGstin(value: unknown) {
  const normalized = String(value ?? "").replace(/\s+/g, "").toUpperCase();
  return /^[0-9A-Z]{12,15}$/.test(normalized);
}

function recommendedProofType(attribute: string) {
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

function proofTypeFitsAttribute(attribute: string, proofType: string) {
  return recommendedProofType(attribute) === proofType;
}

function proofTrustLift(attribute: string, buyerDemand: number) {
  const base: Record<string, number> = {
    size: 7,
    fabric: 6,
    transparency: 6,
    color: 5,
    packaging: 4,
    offer: 3
  };
  return Math.min(18, (base[attribute] ?? 4) + Math.max(0, Number(buyerDemand ?? 0) - 1));
}

function ageHours(isoValue: string | null) {
  if (!isoValue) return 0;
  const time = new Date(isoValue).getTime();
  if (!Number.isFinite(time)) return 0;
  return Number(Math.max(0, (Date.now() - time) / 36e5).toFixed(1));
}

function slaRank(value: string) {
  if (value === "breached") return 2;
  if (value === "due_today") return 1;
  return 0;
}

function latestIso(values: Array<string | null | undefined>) {
  const valid = values
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  return valid[0] ?? null;
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

function sortByPrescreenRisk(a: any, b: any) {
  return (b.prescreen?.risk_score ?? 0) - (a.prescreen?.risk_score ?? 0);
}

function labelize(value: string) {
  return String(value ?? "").replace(/_/g, " ");
}
