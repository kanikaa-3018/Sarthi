export type Product = {
  product_id: string;
  cluster_id: string;
  seller_id: string;
  seller_name: string;
  title: string;
  category: string;
  garment_type: string;
  fabric: string;
  color_family: string;
  base_price: number;
  image_url: string;
  rating: number;
  rating_count: number;
  commerce_badge: string;
  delivery_text: string;
  is_sarthi_eligible: number;
  median_dispatch_hours?: number;
  source_refs?: Record<string, number | string>;
  taxonomy_attributes?: Array<{ field_name: string; display_name: string; value: string }>;
  seller_snapshot?: Record<string, number | string | boolean>;
  fulfillment?: Record<string, number | string | boolean>;
};

export type FeedResponse = {
  buyer_id: string;
  products: Product[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};

export type Variant = {
  variant_id: string;
  product_id: string;
  size: string;
  current_price: number;
  stock: number;
};

export type VariantEvidence = {
  sku_id: string;
  variant_id: string;
  delivered_orders_90d: number;
  returns_90d: number;
  return_rate: number;
  fit_feedback_count: number;
  fit_as_expected_rate: number;
  color_mismatch_returns: number;
  median_dispatch_hours: number;
  evidence_strength: "unknown" | "weak" | "medium" | "strong";
  fact_ids: string[];
  last_updated_at: string;
};

export type RankingResult = {
  winner: string;
  alternative: string | null;
  winner_label: string;
  top_factors: string[];
  uncertainty: "low" | "medium" | "high";
  candidates: Array<{
    variant_id: string;
    product_id?: string;
    seller_id?: string;
    score: number;
    factors: {
      fit_match: number;
      outcome_quality: number;
      expectation_match: number;
      fulfilment_reliability: number;
      seller_trust: number;
      review_signal: number;
      review_credibility?: number;
      rating_signal: number;
      price_value: number;
      proof_coverage?: number;
      offer_truth?: number;
      uncertainty_penalty: number;
      fair_start_boost?: number;
    };
    weight_version?: string;
    fact_ids: string[];
  }>;
  weighting?: {
    source: string;
    version: string;
    category: string;
    weights: Record<string, number>;
    raw_weights: Record<string, unknown>;
  };
  fact_ids: string[];
};

export type FitPrediction = {
  buyer_id: string;
  variant_id: string;
  recommended_size: string;
  confidence: "low" | "medium" | "high";
  reasons: string[];
  fact_ids: string[];
};

export type GraphPath = {
  path_type: string;
  available_from?: string;
  nodes: string[];
  relationships: string[];
  fact_ids: string[];
  summary: string;
};

export type KnowledgeGraphNode = {
  id: string;
  type:
    | "cluster"
    | "buyer_context"
    | "seller"
    | "product"
    | "sku"
    | "evidence"
    | "reviews"
    | "fabric"
    | "rating"
    | "price"
    | "return_reason";
  label: string;
  subtitle: string;
  status: string;
  score: number | null;
  fact_ids: string[];
  data: Record<string, any>;
};

export type KnowledgeGraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  weight: number;
  fact_ids: string[];
};

export type SellerGraphContext = {
  product: Product;
  seller: {
    seller_id: string;
    name: string;
    verification: SellerVerification;
  };
  variant: Variant;
  evidence: VariantEvidence;
  fit: FitPrediction;
  reviews: Array<{
    review_id: string;
    product_id: string;
    variant_id: string | null;
    attribute: string;
    sentiment: string;
    text: string;
    rating: number;
    fact_id: string;
  }>;
  top_return_reason: {
    return_reason: string;
    count: number;
    fact_ids: string[];
  } | null;
  price_context: {
    latest_price: number;
    campaign: Record<string, any> | null;
    inventory: Record<string, any> | null;
  };
  candidate: RankingResult["candidates"][number] | null;
  node_ids: Record<string, string>;
};

export type ClusterKnowledgeGraph = {
  buyer_id: string;
  cluster: {
    cluster_id: string;
    label: string;
    category: string;
    listing_count: number;
  };
  summary: {
    title: string;
    body: string;
    dynamic: boolean;
    source_health: SourceHealth;
    fact_count: number;
  };
  ranking: RankingResult | null;
  selected_product_id: string | null;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  seller_context: SellerGraphContext[];
  fact_ids: string[];
  chat_suggestions: string[];
};

export type KnowledgeGraphAnswer = {
  query: string;
  title: string;
  summary: string;
  reasons: string[];
  caution?: string | null;
  matched_node_ids: string[];
  highlighted_edge_ids: string[];
  fact_ids: string[];
  follow_up_questions: string[];
};

export type KnowledgeGraphChatResponse = {
  trace_id: string;
  answer: KnowledgeGraphAnswer;
  graph_path: GraphPath;
  agent?: {
    provider: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
  };
  cache?: {
    hit: boolean;
    cache_key: string;
  };
};

export type CompareResponse = {
  trace_id: string;
  selected_product_id: string;
  ranking: RankingResult;
  fit: FitPrediction;
  graph_path: GraphPath;
};

export type AvoidableIssue = {
  reason: string;
  title: string;
  action: string;
  count: number;
  fact_ids: string[];
};

export type KeepConfidenceDriver = {
  type: string;
  label: string;
  severity: "low" | "medium" | "high";
  positive: boolean;
  fact_ids: string[];
};

export type KeepConfidenceIntervention = {
  type: "change_size" | "check_proof" | "save_fit_memory" | "continue_checkout" | "limited_evidence";
  label: string;
  action: string;
  suggested_size?: string | null;
  target_variant_id?: string | null;
  reason: string;
  fact_ids: string[];
};

export type KeepConfidenceResponse = {
  trace_id: string;
  buyer_id: string;
  product_id: string;
  variant_id: string;
  selected_size: string | null;
  recommended_size: string;
  score: number;
  confidence_band: "low" | "medium" | "high";
  headline: string;
  summary: string;
  drivers: KeepConfidenceDriver[];
  interventions: KeepConfidenceIntervention[];
  fact_ids: string[];
  graph_path: GraphPath;
};

export type ProductDetailResponse = {
  buyer_id: string;
  product: Product;
  variants: Variant[];
  selected_variant: Variant;
  fit: FitPrediction;
  evidence: VariantEvidence;
  avoidable_issue: AvoidableIssue | null;
  review_evidence: {
    fabric: { fact_ids: string[]; passages: ReviewEvidencePassage[] };
    color: { fact_ids: string[]; passages: ReviewEvidencePassage[] };
    credibility_summary?: ReviewCredibilitySummary;
  };
  conflicts: Array<{
    type: string;
    severity: string;
    summary: string;
    action: string;
    fact_ids: string[];
  }>;
  trust_state: ProductTrustState;
  keep_confidence: KeepConfidenceResponse;
  graph_paths: GraphPath[];
  privacy: PrivacySummary;
};

export type ProofAttribute = "transparency" | "fabric" | "color" | "size" | "packaging" | "offer";

export type ProofCoverageItem = {
  attribute: ProofAttribute;
  sufficient: boolean;
  evidence_count: number;
  source_summary: string;
  recommended_proof_type: "daylight_photo" | "fabric_closeup" | "measurement_chart" | "packaging_photo" | "seller_note";
  fact_ids: string[];
};

export type EvidenceGap = {
  attribute: ProofAttribute;
  severity?: "high" | "medium" | "low";
  title: string;
  summary: string;
  recommended_proof_type: ProofCoverageItem["recommended_proof_type"];
  coverage?: ProofCoverageItem;
  fact_ids?: string[];
};

export type ProofRequest = {
  request_id: string;
  seller_id: string;
  product_id: string;
  variant_id: string | null;
  attribute: ProofAttribute;
  status: "open" | "resolved" | "dismissed";
  request_count: number;
  created_at: string;
  updated_at: string;
  fact_id: string;
};

export type SkuTruthPassport = {
  buyer_id: string;
  product: Product;
  variant: Variant;
  truth_summary: {
    headline: string;
    status: ProductTrustState["status"];
    confidence: ProductTrustState["confidence"];
    can_recommend: boolean;
    buyer_guidance: string;
  };
  outcome_evidence: VariantEvidence;
  fit: FitPrediction;
  avoidable_issue: AvoidableIssue | null;
  offer_truth: OfferCheck;
  review_evidence: ProductDetailResponse["review_evidence"];
  proof_coverage: Record<ProofAttribute, ProofCoverageItem>;
  evidence_gaps: EvidenceGap[];
  open_proof_requests: ProofRequest[];
  conflicts: ProductDetailResponse["conflicts"];
  trust_state: ProductTrustState;
  fact_ids: string[];
};

export type RegretDecisionResponse = {
  trace_id: string;
  buyer_id: string;
  context: {
    product_id: string;
    cluster_id: string;
    category: string;
    garment_type: string;
  };
  decision: {
    code:
      | "buy"
      | "buy_without_rush"
      | "buy_with_one_check"
      | "change_size"
      | "ask_seller_proof"
      | "low_evidence"
      | "skip";
    label: string;
    summary: string;
    primary_action: string;
    confidence: "low" | "medium" | "high" | "blocked";
  };
  selected: {
    product: Product;
    variant: Variant;
    recommended_size: string;
  };
  ranking: RankingResult;
  sku_truth_passport: SkuTruthPassport;
  missing_proof: EvidenceGap | null;
  proof_request: ProofRequest | null;
  graph_paths: GraphPath[];
  fact_ids: string[];
};

export type DataSourceStatus = {
  source_id: string;
  domain: string;
  display_name: string;
  owner_system: string;
  reliability: string;
  freshness_sla_hours: number;
  last_synced_at: string;
  status: "operational" | "degraded" | "stale" | "unavailable";
  notes: string;
  hours_since_sync: number;
  effective_status: "operational" | "degraded" | "stale" | "unavailable";
  fresh: boolean;
};

export type SourceHealth = {
  overall_status: "operational" | "degraded" | "stale" | "unavailable";
  blocking: boolean;
  sources: DataSourceStatus[];
};

export type SystemReadiness = {
  app_env: string;
  data_mode: string;
  user_disclosure: string;
  source_health: SourceHealth;
  implemented_controls: string[];
  production_connectors: Array<{
    name: string;
    prototype_source: string;
    production_source: string;
    status: "adapter_required" | "provider_required" | "connected";
  }>;
  production_blockers: string[];
  can_compete_without_blockers: boolean;
};

export type SellerVerification = {
  seller_id: string;
  seller_name: string | null;
  verification_status: "verified" | "pending" | "restricted";
  gst_status: string;
  kyc_status: string;
  pickup_pincode: string | null;
  categories: string[];
  support_contact: string | null;
  data_access_level: "aggregate_only" | "limited" | "restricted";
  restricted_reason: string | null;
  last_verified_at: string | null;
};

export type ProductTrustState = {
  status:
    | "ready_to_buy"
    | "limited_evidence"
    | "conflicting_evidence"
    | "seller_verification_pending"
    | "seller_restricted"
    | "data_degraded"
    | "specific_caution";
  confidence: "low" | "medium" | "high" | "blocked";
  can_recommend: boolean;
  headline: string;
  summary: string;
  buyer_guidance: string;
  reasons: string[];
  missing_data: string[];
  data_freshness: SourceHealth;
  seller_verification: SellerVerification;
};

export type AgentAnswer = {
  title: string;
  summary: string;
  reasons: string[];
  caution?: string | null;
  primary_action?: {
    type: string;
    variant_id: string;
    label: string;
  } | null;
};

export type AgentResponse = {
  trace_id: string;
  intent: string[];
  answer: AgentAnswer;
  agent?: {
    provider: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
  };
  cache?: {
    hit: boolean;
    cache_key: string;
  };
  fact_ids: string[];
};

export type OfferCheck = {
  variant_id: string;
  status: "verified_price_drop" | "no_need_to_rush" | "not_enough_history";
  message: string;
  buyer_guidance: string;
  truth_basis:
    | "price_drop"
    | "timer_reset"
    | "scarcity"
    | "no_verified_urgency"
    | "insufficient_history";
  price_evidence: {
    latest_price: number | null;
    reference_price: number | null;
    price_delta: number | null;
    price_event_count: number;
    current_price_age_days: number | null;
    points: Array<{
      price: number;
      event_type: string;
      created_at: string;
      fact_id: string;
    }>;
  };
  campaign_evidence: {
    campaign_id: string;
    start_at: string;
    end_at: string;
    timer_reset_count: number;
    fact_id: string;
  } | null;
  inventory_evidence: {
    available_to_promise: number;
    sales_velocity_24h: number;
    captured_at: string;
    fact_id: string;
  } | null;
  checks: Array<{
    key: "price_history" | "campaign_timer" | "inventory_pressure";
    label: string;
    status: "positive" | "neutral" | "caution";
    detail: string;
    fact_ids: string[];
  }>;
  fact_ids: string[];
};

export type CheckoutResponse = {
  trace_id: string;
  offer: OfferCheck;
  keep_confidence: KeepConfidenceResponse;
  graph_path: GraphPath;
};

export type ExpectationContractItem = {
  dimension: "fit" | "fabric" | "color" | "dispatch" | "offer" | "packaging" | "delivery" | "unknown";
  claim: string;
  confidence: "unknown" | "weak" | "medium" | "strong" | "low" | "high";
  buyer_action: string;
  fact_ids: string[];
};

export type ExpectationContract = {
  contract_id: string;
  buyer_id: string;
  product_id: string;
  variant_id: string;
  status: "active" | "kept" | "broken" | "expired";
  contract: {
    title: string;
    summary: string;
    items: ExpectationContractItem[];
    fact_ids: string[];
    privacy: {
      buyer_visible: boolean;
      seller_visible_as_aggregate_only: boolean;
      raw_private_memory_exposed: boolean;
    };
  };
  created_at: string;
  completed_at: string | null;
  outcome_order_id: string | null;
  broken_dimension: string | null;
  fact_id: string;
};

export type OutcomeResponse = {
  outcome: {
    order_id: string;
    fact_id: string;
    created_at: string;
    status: string;
    memory_update: {
      updated: boolean;
      reason?: string;
      memory_id?: string;
      retained_size?: string;
    };
  };
  expectation_contract: ExpectationContract | null;
  graph_sync: {
    available: boolean;
    reason?: string;
  };
  memory: FitMemory[];
};

export type FitMemory = {
  memory_id: string;
  buyer_id: string;
  category: string;
  anchor_variant_id: string;
  retained_size: string;
  preferred_fit: string;
  confidence: "low" | "medium" | "high";
  updated_at: string;
  fact_id: string;
};

export type PrivacySummary = {
  buyer_id: string;
  fit_memory_enabled: boolean;
  memory_record_count: number;
  used: string[];
  not_used: string[];
};

export type ReviewEvidencePassage = {
  text: string;
  rating: number;
  fact_id: string;
  credibility_weight?: number;
  credibility_flags?: string[];
};

export type ReviewCredibilitySummary = {
  review_count: number;
  credible_review_count: number;
  raw_average: number | null;
  weighted_average: number | null;
  average_weight: number;
  low_weight_review_count: number;
  reliability: "unknown" | "weak" | "mixed" | "strong";
  flags: Array<{ flag: string; count: number }>;
  fact_ids: string[];
};

export type BuyerDashboardResponse = {
  buyer_id: string;
  profile: {
    display_name: string;
    language: string;
    preferred_fit: string;
    joined_at: string | null;
  };
  activity: {
    kept_orders: number;
    returned_orders: number;
    rto_orders: number;
    total_outcomes: number;
    proof_requests_created: number;
    expectation_contracts: number;
  };
  review_credibility: {
    weight: number;
    risk_band: "trusted" | "watch" | "new_user" | "high_return";
    signals: string[];
    explanation: string;
  };
  checkout_guidance: {
    mode: "normal_prepaid_eligibility" | "balanced_checkout_guidance" | "extra_trust_steps";
    prepaid_nudge_allowed: boolean;
    message: string;
  };
  privacy: PrivacySummary;
  recent_memory: FitMemory[];
  recent_expectation_contracts: ExpectationContract[];
  guardrails: string[];
};

export type FactDetail = {
  fact_id: string;
  source_table: string;
  source_id: string;
  source_type: string;
  summary: string;
  created_at: string;
  expires_at: string | null;
};

export type AuditTrace = {
  trace_id: string;
  buyer_id: string;
  product_id: string | null;
  variant_id: string | null;
  intent: string[];
  tools_used: string[];
  fact_ids: string[];
  fact_details: FactDetail[];
  graph_paths: GraphPath[];
  created_at: string;
};

export type BuyerMemoryResponse = {
  buyer_id: string;
  memory: FitMemory[];
  privacy: PrivacySummary;
};

export type MemorySettingsResponse = {
  buyer_id: string;
  fit_memory_enabled: boolean;
  memory: FitMemory[];
};

export type DeleteMemoryResponse = {
  buyer_id: string;
  deleted_fit_memory_records: number;
  fit_memory_enabled: boolean;
};

export type Scenario = {
  scenario_id: string;
  title: string;
  description: string;
  buyer_id: string;
  cluster_id: string;
  product_id: string;
  variant_id: string;
  question: string;
  expected: string[];
  start: {
    screen: string;
    buyer_id: string;
    cluster_id: string;
    product_id: string;
    variant_id: string;
  };
  data_disclosure: string;
};

export type Seller = {
  seller_id: string;
  name: string;
  median_dispatch_hours: number;
  product_count: number;
  cluster_ids: string[];
};

export type SellerPanelListing = {
  product: Product;
  variant: Variant;
  seller: {
    seller_id: string;
    name: string;
    median_dispatch_hours?: number;
  };
  quality_score: number | null;
  decision_status: "eligible_for_recommendation" | "needs_seller_action" | "insufficient_evidence";
  cluster_position: number | null;
  metrics: {
    kept_rate: number | null;
    return_rate: number | null;
    fit_as_expected_rate: number | null;
    color_match_rate: number | null;
    delivered_orders_90d: number;
    returns_90d: number;
    color_mismatch_returns: number;
    median_dispatch_hours: number;
    evidence_strength: "unknown" | "weak" | "medium" | "strong";
  };
  top_issue: {
    return_reason: string;
    count: number;
    fact_ids: string[];
  } | null;
  action_items: Array<{
    priority: "high" | "medium" | "low";
    title: string;
    rationale: string;
    metric: string;
    fact_ids: string[];
  }>;
  fact_ids: string[];
};

export type SellerPanelResponse = {
  seller: Seller;
  seller_verification: SellerVerification;
  data_freshness: SourceHealth;
  cluster: {
    cluster_id: string;
    label: string;
    size: string;
    listing_count: number;
    seller_count: number;
    stats: {
      delivered_orders_90d: number;
      returns_90d: number;
      median_return_rate: number | null;
      median_dispatch_hours: number | null;
      minimum_orders_for_strong_decision: number;
    };
  };
  decision_policy: {
    name: string;
    weights: Record<string, number>;
    inputs_used: string[];
    inputs_not_used: string[];
  };
  seller_listings: SellerPanelListing[];
  competing_listings: SellerPanelListing[];
  privacy_guard: {
    safe_for_seller: boolean;
    summary: string;
  };
  fact_ids: string[];
};

export type SellerEvidenceCoachTask = {
  type: "missing_buyer_proof" | "broken_expectation";
  priority: "high" | "medium" | "low";
  product_id: string;
  product_title: string;
  attribute: ProofAttribute;
  title: string;
  rationale: string;
  recommended_proof_type: ProofCoverageItem["recommended_proof_type"];
  buyer_demand: number;
  first_seen_at: string;
  last_seen_at: string;
  fact_ids: string[];
};

export type SellerEvidenceCoachResponse = {
  seller_id: string;
  open_task_count: number;
  resolved_request_count: number;
  tasks: SellerEvidenceCoachTask[];
  privacy_guard: {
    safe_for_seller: boolean;
    summary: string;
  };
};

export type SellerEvidenceAssetResponse = {
  proof_id: string;
  seller_id: string;
  product_id: string;
  attribute: ProofAttribute;
  proof_type: ProofCoverageItem["recommended_proof_type"];
  status: "verified" | "submitted" | "rejected";
  fact_id: string;
  resolved_open_requests: number;
};

export type SellerVerificationDocument = {
  document_id: string;
  seller_id: string;
  document_type: "gst_certificate" | "pan_card" | "address_proof" | "bank_proof";
  reference: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  sha256: string;
  storage_uri: string;
  uploaded_at: string | null;
  status: "submitted" | "under_review" | "approved" | "rejected";
  submitted_at: string;
  reviewed_at: string | null;
  notes: string;
};

export type ListingDraft = {
  draft_id: string;
  seller_id: string;
  title: string;
  category: string;
  garment_type: string;
  fabric: string;
  color_family: string;
  base_price: number;
  image_url: string;
  target_cluster_id: string | null;
  status: "draft" | "submitted" | "needs_revision" | "approved";
  readiness_status:
    | "blocked_seller_verification"
    | "catalog_only"
    | "evidence_building"
    | "recommendation_eligible";
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};

export type SellerOnboardingResponse = {
  seller: Seller & { product_count: number };
  seller_verification: SellerVerification;
  application: {
    application_id: string;
    seller_id: string;
    business_name: string;
    gst_number: string;
    pickup_pincode: string;
    support_contact: string;
    status: "pending_review" | "approved" | "rejected";
    created_at: string;
  } | null;
  documents: SellerVerificationDocument[];
  listing_drafts: ListingDraft[];
  policy: {
    buyer_feed_blocked_until: string[];
    personal_buyer_data_used: boolean;
    new_listing_default: string;
  };
  next_actions: Array<{
    priority: "high" | "medium" | "low";
    title: string;
    detail: string;
    blocked: boolean;
  }>;
};

export type AuthAccount = {
  account_id: string;
  username: string;
  display_name: string;
  role: "buyer" | "seller" | "admin";
  buyer_id: string | null;
  seller_id: string | null;
};

export type AuthSession = {
  account: AuthAccount;
  access_token: string;
  token_type: "bearer";
  expires_at: string;
};

export type SellerSignupSession = AuthSession & {
  application: {
    application_id: string;
    verification_status: "pending";
    status: "pending_review";
  };
};

export type AdminSellerApplication = {
  application_id: string;
  seller_id: string;
  seller_name: string;
  business_name: string;
  gst_number: string;
  pickup_pincode: string;
  support_contact: string;
  status: "pending_review" | "approved" | "rejected";
  verification_status: "verified" | "pending" | "restricted" | null;
  created_at: string;
};

export type AdminVerificationDocument = SellerVerificationDocument & {
  seller_name: string;
};

export type AdminListingDraft = ListingDraft & {
  seller_name: string;
  verification_status: "verified" | "pending" | "restricted" | null;
};

export type AdminAuditEvent = {
  event_id: string;
  actor_account_id: string;
  actor_name: string;
  action: string;
  target_type: string;
  target_id: string;
  seller_id: string | null;
  decision: string;
  notes: string;
  created_at: string;
};

export type AdminReviewQueue = {
  seller_applications: AdminSellerApplication[];
  documents: AdminVerificationDocument[];
  listing_drafts: AdminListingDraft[];
  audit_events: AdminAuditEvent[];
};
