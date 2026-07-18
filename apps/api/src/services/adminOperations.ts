import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { id } from "./crypto.js";
import { withoutId } from "./format.js";
import { nowIso } from "./time.js";

export async function adminQueue(db: Db) {
  const c = collections(db);
  const [applications, sellers, profiles, documents, drafts, auditEvents] = await Promise.all([
    c.sellerApplications.find({}).sort({ created_at: -1 }).toArray(),
    c.sellers.find({}).toArray(),
    c.sellerProfiles.find({}).toArray(),
    c.sellerVerificationDocuments.find({}).sort({ submitted_at: -1 }).toArray(),
    c.listingDrafts.find({}).sort({ updated_at: -1 }).toArray(),
    c.adminAuditEvents.find({}).sort({ created_at: -1 }).limit(50).toArray()
  ]);
  const sellerMap = new Map(sellers.map((seller: any) => [seller.seller_id, seller]));
  const profileMap = new Map(profiles.map((profile: any) => [profile.seller_id, profile]));
  return {
    seller_applications: applications.map((app: any) => ({
      ...withoutId(app),
      seller_name: sellerMap.get(app.seller_id)?.name ?? app.business_name,
      verification_status: profileMap.get(app.seller_id)?.verification_status ?? null
    })),
    documents: documents.map((doc: any) => ({ ...withoutId(doc), seller_name: sellerMap.get(doc.seller_id)?.name ?? "" })),
    listing_drafts: drafts.map((draft: any) => ({
      ...withoutId(draft),
      seller_name: sellerMap.get(draft.seller_id)?.name ?? "",
      verification_status: profileMap.get(draft.seller_id)?.verification_status ?? null
    })),
    audit_events: auditEvents.map(withoutId)
  };
}

export async function approveSellerApplication(db: Db, account: any, applicationId: string, notes: string) {
  const c = collections(db);
  const appDoc = await c.sellerApplications.findOne({ application_id: applicationId });
  if (appDoc) {
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
