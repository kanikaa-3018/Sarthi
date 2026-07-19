import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { sourceHealth } from "./domain.js";
import { generateGroundedAgentAnswer } from "./agent.js";
import { id } from "./crypto.js";
import { withoutId } from "./format.js";
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
    return { ...row, prescreen: await adminPrescreenSuggestion("seller_application", row) };
  }));
  const verificationDocuments = await Promise.all(documents.map(async (doc: any) => {
    const row = { ...withoutId(doc), seller_name: sellerMap.get(doc.seller_id)?.name ?? "" };
    return { ...row, prescreen: await adminPrescreenSuggestion("verification_document", row) };
  }));
  const listingDrafts = await Promise.all(drafts.map(async (draft: any) => {
    const row = {
      ...withoutId(draft),
      seller_name: sellerMap.get(draft.seller_id)?.name ?? "",
      verification_status: profileMap.get(draft.seller_id)?.verification_status ?? null
    };
    return { ...row, prescreen: await adminPrescreenSuggestion("listing_draft", row) };
  }));
  const sellerProofAssets = await Promise.all(proofAssets.map(async (asset: any) => {
    const product = productMap.get(asset.product_id);
    const row = {
      ...withoutId(asset),
      seller_name: sellerMap.get(asset.seller_id)?.name ?? "",
      product_title: product?.title ?? asset.product_id,
      product_image_url: product?.image_url ?? null,
      open_request_count: await c.proofRequests.countDocuments({
        seller_id: asset.seller_id,
        product_id: asset.product_id,
        attribute: asset.attribute,
        status: { $in: ["open", "submitted"] }
      })
    };
    return { ...row, prescreen: await adminPrescreenSuggestion("proof_asset", row) };
  }));
  const activeQueue = buildActiveReviewQueue(sellerApplications, verificationDocuments, listingDrafts, sellerProofAssets);
  const sellerDossiers = buildSellerDossiers({
    sellers,
    profiles,
    applications: sellerApplications,
    documents: verificationDocuments,
    drafts: listingDrafts,
    proofAssets: sellerProofAssets,
    activeQueue
  });
  const summary = buildAdminSummary(activeQueue, sellerApplications, verificationDocuments, listingDrafts, sellerProofAssets, health);
  const automationPlan = await buildAdminAutomationPlan(summary, activeQueue, sellerDossiers);
  return {
    summary,
    source_health: health,
    automation_plan: automationPlan,
    active_queue: activeQueue,
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
  if (appDoc) {
    const missingDocuments = await missingRequiredDocuments(db, appDoc.seller_id);
    if (missingDocuments.length) {
      throwBadRequest(`Approve required documents first: ${missingDocuments.map(labelize).join(", ")}.`);
    }
    await Promise.all([
      c.sellerApplications.updateOne({ application_id: applicationId }, { $set: { status: "approved" } }),
      c.sellerProfiles.updateOne(
        { seller_id: appDoc.seller_id },
        { $set: { verification_status: "verified", gst_status: "verified", kyc_status: "verified", data_access_level: "aggregate_only", last_verified_at: nowIso() } }
      ),
      recordAdminEvent(db, account, "seller_application_approved", "seller_application", applicationId, appDoc.seller_id, "approved", notes)
    ]);
  }
  return adminQueue(db);
}

export async function approveSellerDocument(db: Db, account: any, documentId: string, notes: string) {
  const c = collections(db);
  const document = await c.sellerVerificationDocuments.findOne({ document_id: documentId });
  if (document) {
    await Promise.all([
      c.sellerVerificationDocuments.updateOne(
        { document_id: documentId },
        { $set: { status: "approved", reviewed_at: nowIso(), notes } }
      ),
      updateProfileAfterDocumentDecision(db, document.seller_id, document.document_type, "approved"),
      recordAdminEvent(db, account, "seller_document_approved", "verification_document", documentId, document.seller_id, "approved", notes)
    ]);
    await maybePromoteSellerVerification(db, document.seller_id, account, notes);
  }
  return adminQueue(db);
}

export async function rejectSellerDocument(db: Db, account: any, documentId: string, notes: string) {
  const c = collections(db);
  const document = await c.sellerVerificationDocuments.findOne({ document_id: documentId });
  if (document) {
    await Promise.all([
      c.sellerVerificationDocuments.updateOne(
        { document_id: documentId },
        { $set: { status: "rejected", reviewed_at: nowIso(), notes } }
      ),
      updateProfileAfterDocumentDecision(db, document.seller_id, document.document_type, "rejected"),
      recordAdminEvent(db, account, "seller_document_rejected", "verification_document", documentId, document.seller_id, "rejected", notes)
    ]);
  }
  return adminQueue(db);
}

export async function rejectSellerApplication(db: Db, account: any, applicationId: string, notes: string) {
  const c = collections(db);
  const appDoc = await c.sellerApplications.findOne({ application_id: applicationId });
  if (appDoc) {
    await Promise.all([
      c.sellerApplications.updateOne({ application_id: applicationId }, { $set: { status: "rejected" } }),
      c.sellerProfiles.updateOne({ seller_id: appDoc.seller_id }, { $set: { verification_status: "restricted", restricted_reason: notes } }),
      recordAdminEvent(db, account, "seller_application_rejected", "seller_application", applicationId, appDoc.seller_id, "rejected", notes)
    ]);
  }
  return adminQueue(db);
}

export async function approveListingDraft(db: Db, account: any, draftId: string, notes: string) {
  const c = collections(db);
  const draft = await c.listingDrafts.findOne({ draft_id: draftId });
  if (draft) {
    if (draft.status === "approved") {
      await recordAdminEvent(db, account, "listing_draft_approval_skipped", "listing_draft", draftId, draft.seller_id, "already_approved", notes);
      return adminQueue(db);
    }
    const product_id = id("product");
    const cluster_id = draft.target_cluster_id ?? id("cluster");
    const variant_id = `${product_id}_xl`;
    const catalogFactId = id("fact_catalog");
    const priceFactId = id("fact_price");
    const inventoryFactId = id("fact_inventory");
    const seller = await c.sellers.findOne({ seller_id: draft.seller_id });
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
      { draft_id: draftId },
      { $set: { status: "approved", readiness_status: "evidence_building", updated_at: nowIso() } }
    );
    await recordAdminEvent(db, account, "listing_draft_approved", "listing_draft", draftId, draft.seller_id, "approved", notes);
  }
  return adminQueue(db);
}

export async function requestListingRevision(db: Db, account: any, draftId: string, notes: string) {
  const c = collections(db);
  const draft = await c.listingDrafts.findOne({ draft_id: draftId });
  if (draft) {
    await Promise.all([
      c.listingDrafts.updateOne({ draft_id: draftId }, { $set: { status: "needs_revision", updated_at: nowIso() } }),
      recordAdminEvent(db, account, "listing_revision_requested", "listing_draft", draftId, draft.seller_id, "revision", notes)
    ]);
  }
  return adminQueue(db);
}

export async function approveSellerEvidenceAsset(db: Db, account: any, proofId: string, notes: string) {
  const c = collections(db);
  const asset = await c.sellerEvidenceAssets.findOne({ proof_id: proofId });
  if (asset) {
    await Promise.all([
      c.sellerEvidenceAssets.updateOne(
        { proof_id: proofId },
        { $set: { status: "verified", reviewed_at: nowIso(), review_notes: notes } }
      ),
      c.proofRequests.updateMany(
        {
          seller_id: asset.seller_id,
          product_id: asset.product_id,
          attribute: asset.attribute,
          resolution_proof_id: proofId,
          status: { $in: ["open", "submitted"] }
        },
        { $set: { status: "resolved", resolved_at: nowIso(), updated_at: nowIso() } }
      ),
      c.facts.updateOne(
        { fact_id: asset.fact_id },
        { $set: { summary: `${labelize(asset.attribute)} proof approved by reviewer.` } }
      ),
      asset.proof_type === "measurement_chart"
        ? c.variants.updateMany(
          { product_id: asset.product_id, measurement_proof_id: proofId },
          { $set: { measurement_status: "verified", measurement_reviewed_at: nowIso() } }
        )
        : Promise.resolve(),
      recordAdminEvent(db, account, "seller_proof_approved", "seller_evidence_asset", proofId, asset.seller_id, "approved", notes)
    ]);
  }
  return adminQueue(db);
}

export async function rejectSellerEvidenceAsset(db: Db, account: any, proofId: string, notes: string) {
  const c = collections(db);
  const asset = await c.sellerEvidenceAssets.findOne({ proof_id: proofId });
  if (asset) {
    await Promise.all([
      c.sellerEvidenceAssets.updateOne(
        { proof_id: proofId },
        { $set: { status: "rejected", reviewed_at: nowIso(), review_notes: notes } }
      ),
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
            updated_at: nowIso(),
            rejected_proof_id: proofId,
            rejection_notes: notes,
            resolution_proof_id: null
          }
        }
      ),
      asset.proof_type === "measurement_chart"
        ? c.variants.updateMany(
          { product_id: asset.product_id, measurement_proof_id: proofId },
          { $set: { measurement_status: "rejected", measurement_reviewed_at: nowIso(), measurement_rejection_notes: notes } }
        )
        : Promise.resolve(),
      recordAdminEvent(db, account, "seller_proof_rejected", "seller_evidence_asset", proofId, asset.seller_id, "rejected", notes)
    ]);
  }
  return adminQueue(db);
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

async function adminPrescreenSuggestion(itemType: AdminPrescreenItemType, item: any) {
  const deterministic = deterministicAdminPrescreen(itemType, item);
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
  return {
    ...deterministic,
    observe: grounded.title || deterministic.observe,
    reason: grounded.summary || deterministic.reason,
    learn: grounded.reasons?.[1] ?? deterministic.learn,
    agent_provider: grounded.source
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
      : "Document evidence needs a reviewer check because this prototype stores references and hashes, not a production KYC provider response.",
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
  const evidence = [
    evidenceItem("Status", item.status, item.proof_id),
    evidenceItem("Product", item.product_title, item.product_id),
    evidenceItem("Attribute", item.attribute, item.proof_id),
    evidenceItem("Buyer asks", item.open_request_count, item.proof_id),
    evidenceItem("Asset", item.asset_url ? "present" : "missing", item.proof_id)
  ];
  let risk = item.status === "submitted" ? 24 : 12;
  if (!item.asset_url) risk += 35;
  if (!item.title || String(item.title).length < 4) risk += 12;
  if (!item.description || String(item.description).length < 8) risk += 14;
  if (item.status === "rejected") risk += 30;
  const suggestedAction = item.status === "submitted" && risk <= 42 ? "approve" : item.status === "submitted" ? "manual_check" : "manual_check";
  return buildPrescreen({
    queue_item_id: item.proof_id,
    item_type: "proof_asset",
    risk,
    suggested_action: suggestedAction,
    observe: `${item.seller_name || item.seller_id} submitted ${labelize(item.attribute)} proof for ${item.product_title}.`,
    reason: suggestedAction === "approve"
      ? "The proof has a usable title, description, and asset reference. Reviewer can approve if the image/video matches the claim."
      : "Reviewer should inspect the asset before this proof becomes buyer-trusted.",
    act: suggestedAction === "approve" ? "Approve proof and close matching buyer proof requests." : "Review proof manually or reject with a clear seller note.",
    learn: "Approval changes buyer proof status and adds the verified proof to future trust checks.",
    evidence,
    checks: [
      policyCheck("Asset present", Boolean(item.asset_url), "Proof media or document reference is required."),
      policyCheck("Title explains proof", Boolean(item.title && String(item.title).length >= 8), "Title should name the proof clearly."),
      policyCheck("Description explains claim", Boolean(item.description && String(item.description).length >= 24), "Description should say what buyer doubt this proof answers."),
      policyCheck("Proof type fits claim", proofTypeFitsAttribute(item.attribute, item.proof_type), `${labelize(item.attribute)} should use ${recommendedProofType(item.attribute)}.`),
      policyCheck("Buyer demand exists", Number(item.open_request_count ?? 0) > 0, "Proof tied to repeated buyer asks should be reviewed first.", Number(item.open_request_count ?? 0) > 0 ? "pass" : "warn")
    ]
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

async function buildAdminAutomationPlan(summary: any, activeQueue: any[], sellerDossiers: any[]) {
  const fallback = deterministicAutomationPlan(summary, activeQueue, sellerDossiers);
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
  return {
    headline: grounded.title || fallback.headline,
    summary: grounded.summary || fallback.summary,
    next_steps: grounded.reasons?.length ? grounded.reasons.slice(0, 4) : fallback.next_steps,
    first_queue_item_id: fallback.first_queue_item_id,
    blocked_count: summary.blocked_items,
    can_batch_count: fallback.can_batch_count,
    caution: grounded.caution ?? fallback.caution,
    agent_provider: grounded.source
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

function sortByPrescreenRisk(a: any, b: any) {
  return (b.prescreen?.risk_score ?? 0) - (a.prescreen?.risk_score ?? 0);
}

function labelize(value: string) {
  return String(value ?? "").replace(/_/g, " ");
}
