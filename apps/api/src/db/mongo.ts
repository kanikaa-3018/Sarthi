import { MongoClient, type Collection, type Db } from "mongodb";
import { env } from "../config/env.js";

let client: MongoClient | null = null;
let database: Db | null = null;

export type Collections = {
  buyers: Collection;
  buyerReviewProfiles: Collection;
  buyerFitProfiles: Collection;
  sellers: Collection;
  sellerProfiles: Collection;
  accounts: Collection;
  sessions: Collection;
  dataSources: Collection;
  clusters: Collection;
  products: Collection;
  variants: Collection;
  reviews: Collection;
  outcomes: Collection;
  priceEvents: Collection;
  campaigns: Collection;
  inventorySnapshots: Collection;
  fitMemory: Collection;
  facts: Collection;
  proofRequests: Collection;
  sellerEvidenceAssets: Collection;
  sellerApplications: Collection;
  sellerVerificationDocuments: Collection;
  listingDrafts: Collection;
  auditTraces: Collection;
  expectationContracts: Collection;
  adminAuditEvents: Collection;
  llmCache: Collection;
  trustScoreSnapshots: Collection;
  featureWeights: Collection;
  wishlistIntents: Collection;
  trustRadarEvents: Collection;
  cartConfidenceSnapshots: Collection;
};

export async function connectMongo() {
  if (database) return database;
  client = new MongoClient(env.mongoUri, {
    appName: "sarthi-api"
  });
  await client.connect();
  database = client.db(env.mongoDbName);
  await ensureIndexes(database);
  return database;
}

export function getDb() {
  if (!database) {
    throw new Error("MongoDB is not connected. Call connectMongo() first.");
  }
  return database;
}

export function collections(db = getDb()): Collections {
  return {
    buyers: db.collection("buyers"),
    buyerReviewProfiles: db.collection("buyer_review_profiles"),
    buyerFitProfiles: db.collection("buyer_fit_profiles"),
    sellers: db.collection("sellers"),
    sellerProfiles: db.collection("seller_profiles"),
    accounts: db.collection("accounts"),
    sessions: db.collection("auth_sessions"),
    dataSources: db.collection("data_sources"),
    clusters: db.collection("product_clusters"),
    products: db.collection("products"),
    variants: db.collection("skus"),
    reviews: db.collection("reviews"),
    outcomes: db.collection("order_outcomes"),
    priceEvents: db.collection("price_events"),
    campaigns: db.collection("campaign_events"),
    inventorySnapshots: db.collection("inventory_snapshots"),
    fitMemory: db.collection("fit_memory"),
    facts: db.collection("fact_records"),
    proofRequests: db.collection("proof_requests"),
    sellerEvidenceAssets: db.collection("seller_evidence_assets"),
    sellerApplications: db.collection("seller_applications"),
    sellerVerificationDocuments: db.collection("seller_verification_documents"),
    listingDrafts: db.collection("listing_drafts"),
    auditTraces: db.collection("agent_traces"),
    expectationContracts: db.collection("expectation_contracts"),
    adminAuditEvents: db.collection("admin_audit_events"),
    llmCache: db.collection("llm_cache"),
    trustScoreSnapshots: db.collection("trust_score_snapshots"),
    featureWeights: db.collection("feature_weights"),
    wishlistIntents: db.collection("wishlist_intents"),
    trustRadarEvents: db.collection("trust_radar_events"),
    cartConfidenceSnapshots: db.collection("cart_confidence_snapshots")
  };
}

export async function closeMongo() {
  await client?.close();
  client = null;
  database = null;
}

async function ensureIndexes(db: Db) {
  const c = collections(db);
  await Promise.all([
    c.buyers.createIndex({ buyer_id: 1 }, { unique: true }),
    c.buyerReviewProfiles.createIndex({ buyer_id: 1 }, { unique: true }),
    c.buyerReviewProfiles.createIndex({ risk_band: 1 }),
    c.buyerFitProfiles.createIndex({ profile_id: 1 }, { unique: true }),
    c.buyerFitProfiles.createIndex({ buyer_id: 1, active: -1 }),
    c.sellers.createIndex({ seller_id: 1 }, { unique: true }),
    c.accounts.createIndex({ username: 1 }, { unique: true }),
    c.sessions.createIndex({ token_hash: 1 }, { unique: true }),
    c.sessions.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    c.products.createIndex({ product_id: 1 }, { unique: true }),
    c.products.createIndex({ cluster_id: 1 }),
    c.products.createIndex({ title: "text", category: "text", fabric: "text", color_family: "text" }),
    c.variants.createIndex({ variant_id: 1 }, { unique: true }),
    c.variants.createIndex({ product_id: 1 }),
    c.outcomes.createIndex({ variant_id: 1 }),
    c.outcomes.createIndex({ buyer_id: 1 }),
    c.reviews.createIndex({ product_id: 1 }),
    c.reviews.createIndex({ reviewer_buyer_id: 1 }),
    c.priceEvents.createIndex({ variant_id: 1 }),
    c.proofRequests.createIndex({ seller_id: 1, status: 1 }),
    c.sellerEvidenceAssets.createIndex({ product_id: 1, attribute: 1 }),
    c.auditTraces.createIndex({ trace_id: 1 }, { unique: true }),
    c.llmCache.createIndex({ cache_key: 1 }, { unique: true }),
    c.llmCache.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
    c.trustScoreSnapshots.createIndex({ buyer_id: 1, created_at: -1 }),
    c.trustScoreSnapshots.createIndex({ cluster_id: 1, variant_id: 1, created_at: -1 }),
    c.featureWeights.createIndex({ category: 1, active: 1 }),
    c.wishlistIntents.createIndex({ intent_id: 1 }, { unique: true }),
    c.wishlistIntents.createIndex({ buyer_id: 1, status: 1, updated_at: -1 }),
    c.wishlistIntents.createIndex({ buyer_id: 1, product_id: 1, status: 1 }),
    c.trustRadarEvents.createIndex({ event_id: 1 }, { unique: true }),
    c.trustRadarEvents.createIndex({ buyer_id: 1, created_at: -1 }),
    c.trustRadarEvents.createIndex({ intent_id: 1, created_at: -1 }),
    c.cartConfidenceSnapshots.createIndex({ snapshot_id: 1 }, { unique: true }),
    c.cartConfidenceSnapshots.createIndex({ buyer_id: 1, created_at: -1 })
  ]);
}
