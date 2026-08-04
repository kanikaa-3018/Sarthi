export type AiGeneratedProvider = "bedrock" | "gemini";
export type AiAnswerProvider = AiGeneratedProvider | "deterministic_fallback" | "fallback_after_llm_error";

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
  image_urls?: string[];
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
  media_evidence?: ProductMediaEvidence;
  quality_signals?: ProductQualitySignals;
  buyer_trust?: ProductFeedTrust;
};

export type ProductMediaEvidence = {
  image_count: number;
  angle_labels: string[];
  verification_status: "verified_gallery" | "limited_gallery" | string;
  source: string;
  issues: string[];
  warnings?: string[];
  quality_score?: number;
  clarity_score?: number;
  gallery_readiness?: "complete" | "needs_more_media" | string;
  human_model_required?: boolean;
  required_assets?: Array<{
    key: string;
    label: string;
    status: "present" | "linked" | "missing" | "not_required" | string;
    required: boolean;
    detail: string;
  }>;
  missing_angles?: string[];
  reviewer_photo_count?: number;
  buyer_copy?: string;
  checked_at: string;
};

export type ProductQualitySignals = {
  size_chart_available: boolean;
  measurement_tolerance_cm: number | null;
  fabric_proof_status: "available" | "requested" | "catalog_only" | string;
  color_proof_status: "available" | "daylight_check_needed" | string;
  return_window_days: number;
  cod_available: boolean;
  proof_priority: string[];
};

export type ProductFeedTrust = {
  status: ProductTrustState["status"];
  confidence: ProductTrustState["confidence"];
  can_recommend: boolean;
  headline: string;
  buyer_guidance: string;
  reasons: string[];
  missing_data: string[];
  source_status: SourceHealth["overall_status"] | "unknown";
  seller_status: SellerVerification["verification_status"];
  evidence_strength: VariantEvidence["evidence_strength"];
  delivered_orders_90d: number;
  open_proof_count: number;
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
  selected_variant_id?: string | null;
  selected_size?: string | null;
  candidates: Array<{
    variant_id: string;
    product_id?: string;
    seller_id?: string;
    score: number;
    score_percent?: number;
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
      integrity_penalty?: number;
    };
    fair_start_policy?: {
      verification_gate: "passed" | "pending" | "restricted" | string;
      eligible: boolean;
      limited_evidence: boolean;
      proof_first_ranking: boolean;
      boost: number;
      score_cap: number;
      delivered_orders_90d: number;
      kept_rate: number | null;
      confidence_growth: string;
      buyer_label: string;
    };
    score_integrity_guard?: {
      guard_version: string;
      status: "clear" | "watch" | "blocked" | string;
      applied_penalty: number;
      score_cap: number | null;
      adjusted_score: number;
      adjusted_score_percent?: number;
      source_health_status: string;
      previous_score?: {
        variant_id: string;
        average: number;
        latest: number;
        sample_size: number;
        last_seen_at: string | null;
      } | null;
      reasons: Array<{
        key: string;
        label: string;
        detail: string;
        severity: "low" | "medium" | "high" | string;
        penalty: number;
        score_cap?: number;
        fact_ids?: string[];
      }>;
    };
    score_breakdown?: {
      formula: string;
      confidence_source?: AiAnswerProvider;
      prompt_version?: string;
      score: number;
      score_percent: number;
      raw_adjusted_score?: number;
      adjusted_score: number;
      adjusted_score_percent: number;
      weight_sum: number;
      items: Array<{
        key: string;
        label: string;
        weight: number;
        confidence: number;
        contribution: number;
        rationale: string;
      }>;
      adjustments: {
        uncertainty_penalty: number;
        fair_start_boost: number;
        score_cap?: number;
        integrity_penalty?: number;
        integrity_cap?: number | null;
      };
      guardrails?: Array<{
        key: string;
        label: string;
        detail: string;
        severity: "low" | "medium" | "high" | string;
        penalty: number;
        score_cap?: number;
        fact_ids?: string[];
      }>;
      scoring_context: {
        item_category: string;
        locality: string;
        season_hint: string;
        priority: string;
      };
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
    | "offer"
    | "proof"
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

export type KnowledgeGraphEvidencePath = {
  path_id: "product_score_path" | "buyer_fit_path" | "offer_timer_path" | string;
  title: string;
  audience: "buyer" | "admin" | string;
  summary: string;
  status: string;
  node_ids: string[];
  edge_ids: string[];
  fact_ids: string[];
  steps: Array<{
    label: string;
    node_id: string;
    detail: string;
  }>;
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
    offer?: OfferCheck;
  };
  proof_coverage?: Record<ProofAttribute, ProofCoverageItem>;
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
    graph_engine?: "mongodb_projection" | string;
    neo4j_projection?: {
      enabled: boolean;
      status: "disabled" | "projected" | "unavailable";
      engine: "mongodb_projection" | "neo4j_projection";
      projected_nodes?: number;
      projected_edges?: number;
      error?: string;
    };
    similarity?: SimilaritySummary | null;
    source_health: SourceHealth;
    fact_count: number;
    cache?: {
      status: "hit" | "miss";
      cache_key: string;
      cache_version: string;
      evidence_version: string;
      ttl_seconds: number;
    };
  };
  ranking: RankingResult | null;
  selected_product_id: string | null;
  selected_variant_id?: string | null;
  selected_size?: string | null;
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  seller_context: SellerGraphContext[];
  evidence_paths?: KnowledgeGraphEvidencePath[];
  fact_ids: string[];
  chat_suggestions: string[];
};

export type KnowledgeGraphAnswer = {
  query: string;
  title: string;
  summary: string;
  reasons: string[];
  caution?: string | null;
  unsupported?: boolean;
  support_reason?: string;
  intent?: string;
  verdict?: "safe" | "needs_check" | "avoid" | "cannot_answer";
  confidence?: "low" | "medium" | "high";
  evidence_used?: string[];
  missing_evidence?: string[];
  next_action?: EvidenceAnswerAction | null;
  matched_node_ids: string[];
  highlighted_edge_ids: string[];
  matched_path_ids?: string[];
  fact_ids: string[];
  follow_up_questions: string[];
};

export type EvidenceAnswerAction = {
  type: string;
  label: string;
  reason: string;
  attribute?: ProofAttribute | string | null;
  product_id?: string | null;
  variant_id?: string | null;
  seller_id?: string | null;
  request_id?: string | null;
  request_status?: "none" | "open" | "submitted" | "resolved" | "missing_product_context" | "not_applicable" | string;
  request_count?: number;
  privacy_note?: string;
  disabled?: boolean;
};

export type KnowledgeGraphChatResponse = {
  trace_id: string;
  answer: KnowledgeGraphAnswer;
  graph_path: GraphPath;
  evidence_paths?: KnowledgeGraphEvidencePath[];
  agent?: {
    provider: AiAnswerProvider;
  };
  retrieval?: {
    source:
      | "atlas_vector_search"
      | "local_embedding_fallback"
      | "lexical_fallback"
      | "lexical_fallback_after_vector_error"
      | "disabled_no_ai_provider"
      | "disabled_no_gemini_key";
    embedding_provider?: AiGeneratedProvider;
    result_count: number;
    error?: string;
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
  similarity?: SimilaritySummary | null;
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
  truth_card: SkuTruthCard;
  fit_confidence_layer: FitConfidenceLayer;
  keep_confidence: KeepConfidenceResponse;
  graph_paths: GraphPath[];
  privacy: PrivacySummary;
};

export type ProofAttribute = "transparency" | "fabric" | "color" | "size" | "measurement" | "packaging" | "offer" | "seller";

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

export type TruthCardTone = "positive" | "watch" | "risk" | "low" | "medium" | "high" | string;

export type SkuTruthCardFact = {
  key: string;
  label: string;
  value?: string | number | null;
  detail: string;
  action?: string;
  severity?: "high" | "medium" | "low" | string;
  tone?: TruthCardTone;
  fact_ids: string[];
};

export type SkuTruthCard = {
  title: string;
  status: ProductTrustState["status"];
  confidence: ProductTrustState["confidence"];
  can_recommend: boolean;
  headline: string;
  guidance: string;
  verified: SkuTruthCardFact[];
  missing: SkuTruthCardFact[];
  changed_recently: SkuTruthCardFact[];
  score_reason: {
    band: ProductTrustState["confidence"];
    headline: string;
    summary: string;
    positive: string[];
    caution: string[];
    fact_ids: string[];
  };
  pending_seller_proof: Array<{
    request_id: string;
    attribute: ProofAttribute;
    label: string;
    status: ProofRequest["status"];
    demand: number;
    detail: string;
    fact_ids: string[];
  }>;
  unsafe_claims: Array<{
    claim: string;
    reason: string;
    action: string;
    severity: "high" | "medium" | "low" | string;
    fact_ids: string[];
  }>;
  primary_action: string;
  privacy_note: string;
};

export type FitConfidenceLayer = {
  selected_size: string;
  recommended_size: string;
  fit_subscore: {
    label: "Runs small" | "True to size" | "Runs loose" | string;
    score: number;
    tone: "positive" | "watch" | "risk" | string;
    summary: string;
    fact_ids: string[];
  };
  size_risk: {
    level: "low" | "watch" | "risk" | string;
    title: string;
    summary: string;
    selected_size: string;
    safer_size: string;
    selected_return_rate: number;
    safer_return_rate: number | null;
    fact_ids: string[];
  };
  reviewer_fit_summary: {
    title: string;
    summary: string;
    matched_profile_size: string;
    credible_fit_reviews: number;
    total_fit_reviews: number;
    selected_keep_rate: number;
    safer_keep_rate: number | null;
    fact_ids: string[];
  };
  seller_measurement_proof: {
    status: "verified" | "submitted" | "missing" | string;
    label: string;
    summary: string;
    proof_type: ProofCoverageItem["recommended_proof_type"] | string;
    pending_request_id: string | null;
    fact_ids: string[];
  };
  family_profiles: Array<{
    profile_id: string;
    label: string;
    relationship: string;
    active: boolean;
    recommended_size: string;
    recommended_variant_id: string;
    privacy_scope: string;
    summary: string;
  }>;
  claim_warning: {
    unsafe: boolean;
    claim: string;
    reason: string;
    action: string;
    fact_ids: string[];
  };
  size_options: Array<{
    variant_id: string;
    size: string;
    delivered_orders: number;
    kept_orders: number;
    returns: number;
    keep_rate: number;
    return_rate: number;
    tight_fit_return_rate: number;
    loose_fit_return_rate: number;
    fact_ids: string[];
  }>;
  privacy_note: string;
};

export type ProofRequest = {
  request_id: string;
  seller_id: string;
  product_id: string;
  variant_id: string | null;
  attribute: ProofAttribute;
  status: "open" | "submitted" | "resolved" | "dismissed";
  request_count: number;
  buyer_question?: string | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
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
  truth_card: SkuTruthCard;
  fit_confidence_layer: FitConfidenceLayer;
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
    similarity?: SimilaritySummary;
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

export type TrustRunStep = {
  key: string;
  label: string;
  status: "done" | "watch" | "blocked" | string;
  value: string;
  summary: string;
  tools: string[];
  fact_ids: string[];
};

export type TrustRunResponse = {
  run_id: string;
  trace_id: string;
  workflow_version: string;
  buyer_id: string;
  created_at: string;
  input_product: Product;
  recommended_product: Product;
  recommended_variant: Variant;
  summary: {
    headline: string;
    body: string;
    confidence: "low" | "medium" | "high" | "blocked";
    score_percent: number;
    fact_count: number;
    seller_count: number;
    next_step: string;
  };
  steps: TrustRunStep[];
  comparison: CompareResponse;
  decision: RegretDecisionResponse;
  sku_truth_passport: SkuTruthPassport;
  checkout_confidence: CartConfidenceResponse;
  wishlist: WishlistIntentResponse | null;
  seller_signal: ProofRequest | null;
  agent: {
    mode: string;
    tools_used: string[];
    deterministic_fallback: boolean;
  };
  privacy: {
    buyer_profile_shared_with_seller: boolean;
    seller_receives: string;
    private_fit_scope: string;
  };
  graph_path: GraphPath;
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

export type GeminiRuntimeStatus = {
  enabled: boolean;
  provider: string;
  model: string;
  active_model: string | null;
  embedding_model: string;
  active_embedding_model: string | null;
  key_present: boolean;
  status: "disabled" | "configured" | "temporarily_unavailable";
  last_error: string | null;
  capabilities?: Record<string, { status: string; last_error: string | null }>;
};

export type BedrockRuntimeStatus = {
  enabled: boolean;
  provider: "bedrock";
  region: string;
  text_models: string[];
  vision_models: string[];
  embedding_model: string;
  embedding_dimensions: number;
  active_model: string | null;
  status: "disabled" | "configured" | "temporarily_unavailable";
  last_error: string | null;
  capabilities: Record<string, {
    status: string;
    active_model: string | null;
    last_error: string | null;
  }>;
};

export type AiRuntimeStatus = {
  provider_order: AiGeneratedProvider[];
  primary_provider: AiGeneratedProvider | null;
  configured: boolean;
  available: boolean;
  capabilities: Record<"text" | "vision" | "embedding", {
    configured: boolean;
    available: boolean;
    provider_order: AiGeneratedProvider[];
    primary_provider: AiGeneratedProvider | null;
  }>;
  bedrock: BedrockRuntimeStatus;
  gemini: GeminiRuntimeStatus;
};

export type SystemReadiness = {
  app_env: string;
  data_mode: string;
  user_disclosure: string;
  source_health: SourceHealth;
  runtime_integrations?: {
    ai: AiRuntimeStatus;
    bedrock: BedrockRuntimeStatus;
    gemini: GeminiRuntimeStatus;
    neo4j: {
      enabled: boolean;
      status: "disabled" | "connected" | "unavailable";
      error?: string;
    };
    atlas_vector_search: {
      enabled: boolean;
      status: "disabled" | "ready_for_queries" | "waiting_for_ai_provider" | "waiting_for_gemini_key" | "local_embedding_fallback";
      atlas_status?: "ready_for_queries" | "index_missing" | "unsupported_mongodb" | "unavailable" | null;
      collection: string;
      index: string;
      index_exists?: boolean;
      embedding_model: string;
      embedding_dimensions: number;
      embedded_documents: number;
      error?: string | null;
    };
  };
  implemented_controls: string[];
  production_connectors: Array<{
    name: string;
    current_source: string;
    production_source: string;
    status: "adapter_required" | "provider_required" | "connected";
  }>;
  production_blockers: string[];
  can_compete_without_blockers: boolean;
};

export type AdminAiHealth = {
  ai: AiRuntimeStatus;
  bedrock: BedrockRuntimeStatus;
  gemini: GeminiRuntimeStatus;
  fallback: {
    enabled: boolean;
    active: boolean;
    reason: string;
  };
  source_health: {
    overall_status: SourceHealth["overall_status"];
    blocking: boolean;
    checked_sources: number;
  };
  contracts: Array<{
    task: string;
    schema: string;
    status: "covered" | "missing";
  }>;
};

export type AdminAiHealthTest = {
  ok: boolean;
  provider: AiAnswerProvider;
  answer: {
    title: string;
    summary: string;
    reasons: string[];
    caution: string | null;
    source: AiAnswerProvider;
  };
  checked_at: string;
  required_shape: string[];
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
  query?: string;
  title: string;
  summary: string;
  reasons: string[];
  caution?: string | null;
  primary_action?: EvidenceAnswerAction | null;
};

export type AgentResponse = {
  trace_id: string;
  intent: string[];
  answer: AgentAnswer;
  agent?: {
    provider: AiAnswerProvider;
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
  dark_pattern_shield: DarkPatternShield;
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
  cart_confidence?: CartConfidenceResponse;
  graph_path: GraphPath;
};

export type FitProfile = {
  profile_id: string;
  buyer_id: string;
  label: string;
  relationship: string;
  active: boolean;
  preferred_fit: string;
  size_map: Record<string, string>;
  notes: string[];
  privacy_scope: string;
  updated_at: string;
};

export type FitProfileResponse = {
  buyer_id: string;
  active_profile: FitProfile | null;
  profiles: FitProfile[];
  privacy: {
    buyer_visible: boolean;
    seller_visible: boolean;
    summary: string;
  };
};

export type ReasonChip = {
  key?: string;
  type?: string;
  label: string;
  value?: number;
  sentiment: "positive" | "watch" | "neutral";
};

export type SimilarityCandidate = {
  product_id: string;
  seller_id: string;
  cluster_id: string;
  title: string;
  image_url: string;
  score: number;
  deterministic_score?: number;
  ai_score?: number;
  visual_match?: "same_item" | "same_style" | "different_item" | "unclear";
  source?: "deterministic" | "bedrock" | "bedrock_cache" | "gemini" | "gemini_cache" | "deterministic_after_gemini_error" | "deterministic_after_ai_error";
  reasons: string[];
  match_signals?: string[];
  risk_flags?: string[];
};

export type SimilaritySummary = {
  seed_product_id?: string;
  comparable_product_ids?: string[];
  method: string;
  minimum_score?: number;
  distinct_seller_count: number;
  summary: string;
  candidates: SimilarityCandidate[];
  agent?: {
    provider: AiGeneratedProvider | "deterministic";
    used: boolean;
    status: "disabled" | "not_enough_candidates" | "used" | "cache_hit" | "error";
    prompt_version: string;
    candidate_count: number;
    image_inputs: number;
    error?: string;
  };
};

export type WishlistRadarEvent = {
  event_id: string;
  trace_id: string;
  intent_id: string;
  buyer_id: string;
  cluster_id: string;
  selected_product_id: string;
  recommended_product_id: string;
  recommended_variant_id: string;
  status: "better_option_found" | "saved_option_strong" | "needs_one_check";
  headline: string;
  summary: string;
  selected_score: number;
  recommended_score: number;
  delta: number;
  alerts: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    title: string;
    detail: string;
  }>;
  candidates: Array<{
    product: Product;
    variant: Variant | null;
    score: number;
    rank: number;
    is_saved_product: boolean;
    is_recommended: boolean;
    reason_chips: ReasonChip[];
    evidence: {
      return_rate: number;
      delivered_orders_90d: number;
      evidence_strength: "unknown" | "weak" | "medium" | "strong";
      seller_verification: string;
      review_reliability: string;
      offer_status: OfferCheck["status"];
    };
    fact_ids: string[];
  }>;
  next_best_action: {
    type: string;
    label: string;
    variant_id: string | null;
    reason: string;
  };
  fact_ids: string[];
  created_at: string;
  similarity?: SimilaritySummary;
};

export type WishlistIntentResponse = {
  intent: {
    intent_id: string;
    buyer_id: string;
    product_id: string;
    cluster_id: string;
    selected_variant_id: string;
    profile_id: string | null;
    target_price: number | null;
    status: "watching";
    created_at: string;
    updated_at: string;
    last_radar_event_id: string | null;
    comparable_product_ids?: string[];
    similarity?: SimilaritySummary;
  };
  radar: WishlistRadarEvent;
  seller_signal: ProofRequest | null;
  privacy: {
    seller_sees: string;
    buyer_profile_shared_with_seller: boolean;
  };
};

export type BuyerProofRequestActionResponse = {
  trace_id: string;
  request: ProofRequest;
  action: EvidenceAnswerAction;
  privacy: {
    seller_sees: string;
    buyer_profile_shared_with_seller: boolean;
    reviewer_scope: string;
  };
};

export type WishlistRadarResponse = {
  buyer_id: string;
  active_profile: FitProfile | null;
  count: number;
  radar: WishlistRadarEvent[];
  privacy: {
    buyer_profile_shared_with_seller: boolean;
    seller_receives: string;
  };
};

export type BuyerWishlistItem = {
  intent: WishlistIntentResponse["intent"];
  product: Product;
  variant: Variant | null;
  radar: WishlistRadarEvent | null;
};

export type BuyerWishlistResponse = {
  buyer_id: string;
  count: number;
  items: BuyerWishlistItem[];
};

export type BuyerProofLedgerItem = {
  request: ProofRequest;
  product: Product;
  variant: Variant | null;
  proof_asset: {
    proof_id: string;
    title: string;
    description: string;
    asset_url: string;
    proof_type: ProofCoverageItem["recommended_proof_type"];
    status: "submitted" | "verified" | "rejected";
    submitted_at: string;
    reviewed_at: string | null;
    review_notes: string | null;
    fact_id: string;
  } | null;
  status: "waiting_seller" | "admin_review" | "approved" | "needs_more_proof";
  status_label: string;
  next_step: string;
  buyer_summary: string;
  proof_quality: {
    score: number;
    label: string;
    verdict: string;
    checks: Array<{
      key: string;
      label: string;
      passed: boolean;
      detail: string;
    }>;
  };
  trust_impact: {
    before_score: number;
    expected_after_score: number;
    lift_points: number;
    confidence: "low" | "medium" | "high";
    reason: string;
  };
  proof_loop: {
    title: string;
    current_step: "waiting_seller" | "admin_review" | "approved" | "needs_more_proof" | string;
    closed_loop: boolean;
    aggregate_demand: {
      buyer_count: number;
      label: string;
      buyer_question: string;
    };
    seller_task: {
      label: string;
      status: "waiting" | "submitted" | string;
      proof_type: ProofCoverageItem["recommended_proof_type"] | string;
    };
    admin_review: {
      status: "not_submitted" | "submitted" | "verified" | "rejected" | string;
      reviewed_at: string | null;
      notes: string | null;
    };
    score_update: {
      before_score: number;
      after_score: number;
      lift_points: number;
      applied: boolean;
    };
    buyer_notification: {
      ready: boolean;
      message: string;
    };
    timeline: Array<{ label: string; done: boolean; at: string | null }>;
  };
  timeline: Array<{ label: string; done: boolean; at: string | null }>;
};

export type BuyerProofLedgerResponse = {
  buyer_id: string;
  count: number;
  summary: {
    waiting_seller: number;
    admin_review: number;
    approved: number;
    needs_more_proof: number;
  };
  items: BuyerProofLedgerItem[];
};

export type PaymentAssistOffer = {
  offer_id: string;
  label: string;
  amount_rupees: number;
  eligible: boolean;
  reason: string;
  payment_method: "upi" | "card" | "wallet" | "prepaid";
};

export type PaymentAssistCheck = {
  key: string;
  label: string;
  status: "passed" | "watch" | "blocked";
  detail: string;
};

export type PaymentAssistQuickFact = {
  key: string;
  label: string;
  value: string;
  status: "positive" | "neutral" | "warning" | "blocked" | string;
  detail: string;
};

export type PaymentAssistChoice = {
  mode: "prepaid" | "cod";
  label: string;
  recommended: boolean;
  enabled: boolean;
  confidence_score: number;
  headline: string;
  one_line: string;
  primary_benefit: string;
  buyer_outcome: string;
  marketplace_outcome: string;
  risk_label: string;
  cta: string;
  quick_facts?: PaymentAssistQuickFact[];
  checks: PaymentAssistCheck[];
  next_step: string;
};

export type CheckoutConfidenceDecision = {
  mode: "prepaid_confident" | "cod_cautious" | string;
  recommended_mode: "prepaid" | "cod";
  confidence: "low" | "medium" | "high" | string;
  headline: string;
  payment_reason: string;
  prepaid_reason: string;
  cod_reason: string;
  buyer_next_step: string;
  address_prompt: string;
  refund_expectation: {
    locked_before_payment: boolean;
    message: string;
  };
  payment_choice: {
    forced: boolean;
    message: string;
  };
  safeguards: PaymentAssistCheck[];
  factors: PaymentAssistCheck[];
};

export type PaymentAssist = {
  recommended_mode: "prepaid" | "cod";
  confidence_label: string;
  title: string;
  summary: string;
  cart_value_rupees: number;
  total_prepaid_benefit_rupees: number;
  reward_points: number;
  reward_value_rupees: number;
  payment_economics?: {
    online_savings_rupees: number;
    instant_discount_rupees: number;
    reward_points: number;
    reward_value_rupees: number;
    cod_extra_charge_rupees: number;
    cod_available: boolean;
    buyer_benefit_copy: string;
    company_benefit_copy: string;
    cod_caution_copy: string;
  };
  payment_choices?: PaymentAssistChoice[];
  best_offer: PaymentAssistOffer | null;
  offers: PaymentAssistOffer[];
  safety_checks: PaymentAssistCheck[];
  dark_pattern_shield: DarkPatternShield;
  checkout_confidence: CheckoutConfidenceDecision;
  buyer_next_step: string;
  agent_actions: Array<{
    label: string;
    detail: string;
    done: boolean;
  }>;
};

export type CartConfidenceResponse = {
  trace_id: string;
  buyer_id: string;
  active_profile: FitProfile | null;
  overall_score: number;
  confidence_band: "low" | "medium" | "high";
  bracket_alerts: Array<{
    product_id: string;
    title: string;
    selected_sizes: string[];
    suggested_size: string;
    severity: "medium" | "high";
    message: string;
  }>;
  checkout_nudge: {
    code: "prepaid_safe_to_nudge" | "prepaid_after_one_check" | "cod_or_review_first";
    prepaid_recommended: boolean;
    title: string;
    message: string;
    trust_condition: string;
    company_benefit: string;
  };
  payment_assist?: PaymentAssist;
  line_items: Array<{
    product: Product;
    variant: Variant;
    quantity: number;
    selected_size: string;
    suggested_size: string | null;
    keep_confidence: KeepConfidenceResponse;
    offer: OfferCheck;
    score: number;
    confidence_band: "low" | "medium" | "high";
    reason_chips: ReasonChip[];
    interventions: Array<{
      type: string;
      label: string;
      reason: string;
      variant_id?: string;
    }>;
    fact_ids: string[];
  }>;
  fact_ids: string[];
  graph_path: GraphPath;
  snapshot_id: string;
};

export type ExpectationContractItem = {
  dimension: "fit" | "fabric" | "color" | "dispatch" | "offer" | "packaging" | "delivery" | "return" | "unknown";
  claim: string;
  confidence: "unknown" | "weak" | "medium" | "strong" | "low" | "high";
  buyer_action: string;
  fact_ids: string[];
  source?: string;
  status?: "locked" | "watch" | "proof_pending" | string;
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
  locked_expectations?: {
    expected_size: string | null;
    recommended_size: string | null;
    expected_fabric: string | null;
    expected_color: string | null;
    delivery_promise: string | null;
    return_eligibility: {
      enabled: boolean;
      window_days: number;
      buyer_copy: string;
    };
    offer_price_proof: {
      status: string;
      latest_price: number | null;
      reference_price: number | null;
      price_delta: number | null;
      buyer_copy: string;
    };
  };
  score_state?: {
    locked_score_percent?: number;
    outcome_score_percent?: number;
    last_outcome_delta_points?: number;
    last_outcome_status?: string;
    evidence_strength?: string;
    delivered_orders_90d?: number;
    update_rule?: string;
    last_updated_at?: string;
  };
  post_delivery_loop?: {
    buyer_action: string;
    kept_effect: string;
    return_effect: string;
    seller_visibility: string;
  };
  created_at: string;
  completed_at: string | null;
  outcome_order_id: string | null;
  broken_dimension: string | null;
  checkout_order_id?: string | null;
  order_status?: "placed" | "placed_pending_feedback" | string | null;
  placed_at?: string | null;
  payment_mode?: "cod" | "prepaid" | null;
  payment_reward_points?: number;
  payment_reward_value_rupees?: number;
  payment_offer_savings_rupees?: number;
  payment_assist_summary?: string | null;
  buying_for_someone_else?: boolean;
  fit_memory_excluded?: boolean;
  wearer_label?: string | null;
  seller_root_cause_task_id?: string | null;
  fact_id: string;
};

export type ReturnAlternativeResponse = {
  trace_id: string;
  buyer_id: string;
  variant_id: string;
  issue: {
    reason: string;
    severity: "minor" | "major";
    buyer_preference: "exchange_ok" | "refund_only";
    questions: string[];
  };
  suggestion: {
    type: "exchange_size" | "local_alteration" | "continue_return";
    title: string;
    summary: string;
    primary_action: string;
    recommended: boolean;
    confidence: "low" | "medium" | "high";
    reasons: string[];
    caution?: string | null;
    suggested_size?: string | null;
  };
  agent: {
    provider: AiAnswerProvider;
  };
  evidence: {
    product_title: string;
    seller_name: string;
    selected_size: string;
    recommended_size: string;
    delivered_orders_90d: number;
    return_rate: number;
    fact_ids: string[];
  };
  graph_path: GraphPath;
};

export type OutcomeResponse = {
  outcome: {
    order_id: string;
    fact_id: string;
    created_at: string;
    status: string;
    buying_for_someone_else?: boolean;
    fit_memory_excluded?: boolean;
    memory_update: {
      updated: boolean;
      reason?: string;
      memory_id?: string;
      retained_size?: string;
    };
  };
  expectation_contract: ExpectationContract | null;
  score_update?: {
    before_score_percent: number;
    after_score_percent: number;
    delta_points: number;
    direction: "improved" | "reduced" | "stable" | string;
    reason: string;
    buyer_copy: string;
  } | null;
  seller_root_cause_task?: {
    task_id: string;
    product_id: string;
    product_title?: string;
    variant_id: string;
    dimension: string;
    attribute: string;
    buyer_count: number;
    priority: "high" | "medium" | "low" | string;
    title: string;
    rationale: string;
    seller_action: string;
    recommended_proof_type: string;
    buyer_notification_preview: string;
  } | null;
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
  controls?: Array<{
    key: string;
    label: string;
    enabled: boolean;
    action: string;
    detail: string;
  }>;
  data_use_panel?: Array<{
    key: string;
    label: string;
    status: string;
    used_for: string;
    retention: string;
  }>;
  seller_visibility?: string[];
  admin_visibility?: string[];
  ai_minimization?: string[];
};

export type ReviewEvidencePassage = {
  text: string;
  rating: number;
  fact_id: string;
  credibility_weight?: number;
  credibility_flags?: string[];
  verified_purchase?: boolean;
  down_weight_reasons?: ReviewDownWeightReason[];
};

export type ReviewDownWeightReason = {
  key: string;
  label: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

export type ReviewCredibilitySummary = {
  review_count: number;
  credible_review_count: number;
  raw_average: number | null;
  weighted_average: number | null;
  rating_gap?: number | null;
  average_weight: number;
  low_weight_review_count: number;
  reliability: "unknown" | "weak" | "mixed" | "strong";
  flags: Array<{ flag: string; count: number }>;
  rating_comparison?: {
    raw_rating: number | null;
    trusted_rating: number | null;
    gap: number | null;
    headline: string;
    summary: string;
  };
  review_spike?: {
    status: "unknown" | "normal" | "watch" | string;
    recent_review_count: number;
    window_days: number;
    share_recent: number;
    message: string;
    fact_ids: string[];
  };
  downweighted_reviews?: Array<{
    review_id: string;
    attribute: string;
    rating: number;
    text: string;
    trusted_weight: number;
    verified_purchase: boolean;
    reviewer_context: {
      age_bucket: "new" | "recent" | "established" | string;
      return_risk: "normal" | "watch" | "high" | string;
    };
    down_weight_reasons: ReviewDownWeightReason[];
    explanation: string;
    created_at: string | null;
    fact_id: string;
  }>;
  visible_review_checks?: Array<{
    key: string;
    label: string;
    value: string;
    status: "good" | "watch" | string;
    detail: string;
  }>;
  trust_answer?: string;
  fact_ids: string[];
};

export type DarkPatternCheck = {
  key:
    | "repeating_countdown_timer"
    | "fake_scarcity"
    | "sudden_price_hike_before_discount"
    | "drip_pricing"
    | "basket_sneaking"
    | "forced_prepaid"
    | "misleading_only_today_offer"
    | "hidden_return_conditions"
    | string;
  label: string;
  status: "clear" | "watch" | "blocked";
  severity: "none" | "low" | "medium" | "high" | string;
  buyer_copy: string;
  evidence: string;
  decision_effect: string;
  fact_ids: string[];
  product_id?: string;
  variant_id?: string;
  product_title?: string;
};

export type DarkPatternShield = {
  shield_version: string;
  status: "clear" | "watch" | "blocked";
  headline: string;
  plain_copy: string;
  buyer_guidance?: string;
  risk_count: number;
  blocked_count: number;
  watch_count: number;
  checks: DarkPatternCheck[];
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
  products_checked?: Array<{
    product_id: string;
    variant_id: string | null;
    title: string;
    seller_name: string;
    image_url: string;
    last_activity_at: string;
    last_action: string;
    status: string;
    score_delta_points?: number;
    reasons: string[];
    signals: string[];
  }>;
  proof_activity?: {
    requested_count: number;
    waiting_seller_count: number;
    seller_responded_count: number;
    admin_review_count: number;
    approved_count: number;
    needs_more_proof_count: number;
    seller_responses: Array<{
      request_id: string;
      product_id: string;
      title: string;
      attribute: string;
      status: string;
      status_label: string;
      buyer_summary: string;
      updated_at: string;
    }>;
  };
  score_improvements?: Array<{
    request_id: string;
    product_id: string;
    title: string;
    attribute: string;
    status: string;
    before_score: number;
    after_score: number;
    lift_points: number;
    applied: boolean;
    message: string;
    updated_at: string;
  }>;
  source_freshness?: {
    overall_status: SourceHealth["overall_status"] | "unknown";
    blocking: boolean;
    confidence_rule: string;
    categories: Array<{
      key: string;
      label: string;
      status: DataSourceStatus["effective_status"] | "unknown";
      fresh: boolean;
      hours_since_sync: number | null;
      last_synced_at: string | null;
      detail: string;
    }>;
  };
  privacy: PrivacySummary;
  recent_memory: FitMemory[];
  recent_expectation_contracts: ExpectationContract[];
  guardrails: string[];
};

export type BuyerOrderItem = {
  order_id: string;
  checkout_order_id?: string | null;
  contract_id: string | null;
  buyer_id: string;
  variant_id: string;
  product: Product;
  variant: Variant;
  status: "placed" | "placed_pending_feedback" | "delivered_needs_feedback" | "delivered_kept" | "returned" | "rto" | "exchanged" | string;
  return_reason: string | null;
  corrected_return_reason?: string | null;
  correction_note?: string | null;
  corrected_at?: string | null;
  buying_for_someone_else?: boolean;
  fit_memory_excluded?: boolean;
  wearer_label?: string | null;
  payment_mode?: "cod" | "prepaid" | null;
  payment_reward_points?: number;
  payment_reward_value_rupees?: number;
  payment_offer_savings_rupees?: number;
  payment_assist_summary?: string | null;
  created_at: string;
  fact_id: string | null;
  can_submit_outcome: boolean;
};

export type BuyerOrdersResponse = {
  buyer_id: string;
  pending_feedback: number;
  orders: BuyerOrderItem[];
};

export type CheckoutOrderResponse = {
  checkout_order_id: string;
  order: BuyerOrderItem | null;
  expectation_contract: ExpectationContract | null;
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
  current_rating: number | null;
  rating_count: number;
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
  seller_all_listings?: SellerPanelListing[];
  action_board?: SellerActionBoard;
  competing_listings: SellerPanelListing[];
  privacy_guard: {
    safe_for_seller: boolean;
    summary: string;
  };
  fact_ids: string[];
};

export type SellerActionBoard = {
  headline: string;
  summary: string;
  reasons: string[];
  agent: {
    provider: AiAnswerProvider;
  };
  rating_plan?: {
    title: string;
    summary: string;
    steps: string[];
  };
  cards: Array<{
    product_id: string;
    product_title: string;
    image_url: string;
    priority: "high" | "medium" | "low";
    issue: string;
    action: string;
    why: string;
    issue_summary?: string;
    buyer_impact?: string;
    next_step?: string;
    rating_lift?: string;
    trust_steps?: string[];
    proof_type: ProofCoverageItem["recommended_proof_type"];
    metric: string;
    score: number;
  }>;
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
  age_hours?: number;
  response_sla_hours?: number;
  sla_state?: "ok" | "due_today" | "breached";
  trust_lift_points?: number;
  buyer_impact?: string;
  fact_ids: string[];
  rejected_proof_id?: string | null;
  rejection_note?: string | null;
  root_cause_task_id?: string;
  proof_loop?: {
    title: string;
    aggregate_demand: string;
    seller_action: string;
    admin_gate: string;
    buyer_notification_preview: string;
    steps: Array<{ key: string; label: string; done: boolean }>;
  };
};

export type SellerEvidenceCoachResponse = {
  seller_id: string;
  open_task_count: number;
  resolved_request_count: number;
  proof_nav: {
    approved_count: number;
    in_review_count: number;
    rejected_count: number;
    products_with_proof: number;
    trust_lift_points: number;
    rating_forecast: string;
  };
  proof_assets: Array<{
    proof_id: string;
    product_id: string;
    product_title: string;
    product_image_url: string | null;
    attribute: ProofAttribute;
    proof_type: ProofCoverageItem["recommended_proof_type"];
    status: "submitted" | "verified" | "rejected";
    quality_score: number;
    quality_label: string;
    trust_lift_points: number;
    submitted_at: string;
    reviewed_at: string | null;
    review_notes: string | null;
    proof_loop?: {
      title: string;
      aggregate_demand: string;
      seller_action: string;
      admin_gate: string;
      buyer_notification_preview: string;
      steps: Array<{ key: string; label: string; done: boolean }>;
    };
  }>;
  proof_agent: {
    mode: "agentic_proof_triage_v1" | string;
    provider: AiAnswerProvider;
    headline: string;
    summary: string;
    selected_task_key: string | null;
    selected_product_id: string | null;
    selected_attribute: ProofAttribute | string | null;
    recommended_action: string;
    reasoning: string[];
    playbook: Array<{
      label: string;
      detail: string;
      tool: string;
      status: "done" | "next" | "blocked";
    }>;
    tools: Array<{
      key: string;
      label: string;
      status: "done" | "next" | "blocked";
      detail: string;
    }>;
    metrics: {
      waiting_buyers: number;
      urgent_tasks: number;
      breached_tasks: number;
      open_trust_lift: number;
      visible_trust_lift: number;
      submitted_count: number;
      approved_count: number;
      rejected_count: number;
      resolved_requests: number;
    };
    guardrail: string;
  };
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
  reviewed_at?: string | null;
  review_notes?: string | null;
  revision_acknowledged_at?: string | null;
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

export type AdminProofAsset = {
  proof_id: string;
  seller_id: string;
  seller_name: string;
  product_id: string;
  product_title: string;
  product_image_url: string | null;
  attribute: ProofAttribute;
  proof_type: ProofCoverageItem["recommended_proof_type"];
  title: string;
  description: string;
  asset_url: string;
  status: "submitted" | "verified" | "rejected";
  created_at: string;
  submitted_at?: string;
  reviewed_at: string | null;
  review_notes: string | null;
  open_request_count: number;
  buyer_doubt_examples?: string[];
  fact_id: string;
};

export type AdminProofQualityPrescreen = {
  score: number;
  decision: "approve" | "ask_revision" | "reject";
  headline: string;
  summary: string;
  reviewer_instruction: string;
  human_final: true;
  buyer_doubt: string;
  claim_checked: string;
  trust_lift_ready: boolean;
  detected_issues: string[];
  visual_match: {
    score: number;
    tone: "pass" | "warn" | "fail";
    label: string;
    summary: string;
    detail?: string;
    reference_image_url?: string | null;
    requires_human_check?: boolean;
  };
  checks: Array<{
    key: "relevance" | "clarity" | "measurement_readability" | "claim_match" | "human_decision";
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
};

export type AdminTriageBucket =
  | "fast_review"
  | "manual_review"
  | "senior_review"
  | "seller_fix"
  | "reuse_standard"
  | "stored_only";

export type AdminTriageView = {
  headline: string;
  summary: string;
  stored_count: number;
  reviewer_queue_count: number;
  filtered_count: number;
  pipeline: Array<{
    key: string;
    label: string;
    count: number;
    detail: string;
  }>;
  buckets: Array<{
    key: AdminTriageBucket;
    label: string;
    count: number;
    detail: string;
  }>;
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

export type AdminPrescreenSuggestion = {
  queue_item_id: string;
  item_type: "seller_application" | "verification_document" | "listing_draft" | "proof_asset";
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  suggested_action: "approve" | "reject" | "approve_document" | "reject_document" | "publish" | "request_revision" | "manual_check";
  confidence: "low" | "medium" | "high";
  route_to: "standard_review" | "senior_reviewer";
  observe: string;
  reason: string;
  act: string;
  learn: string;
  evidence: Array<{ label: string; value: string; source_id: string }>;
  checks: Array<{ label: string; status: "pass" | "warn" | "fail"; detail: string }>;
  proof_quality?: AdminProofQualityPrescreen;
  triage_bucket?: AdminTriageBucket;
  triage_label?: string;
  triage_reason?: string;
  fact_ids: string[];
  agent_provider: AiAnswerProvider;
};

export type AdminStoredEvidenceItem = {
  id: string;
  item_type: AdminPrescreenSuggestion["item_type"];
  seller_id: string;
  seller_name: string;
  title: string;
  subtitle: string;
  status: string;
  submitted_at: string | null;
  triage_bucket: AdminTriageBucket;
  triage_label: string;
  triage_reason: string;
  review_visibility: "reviewer_queue" | "auto_reviewed" | "ai_bypassed" | "completed";
  suggested_action: AdminPrescreenSuggestion["suggested_action"];
  risk_score: number;
  risk_level: AdminPrescreenSuggestion["risk_level"];
  confidence: AdminPrescreenSuggestion["confidence"];
  agent_provider: AiAnswerProvider;
  asset_url: string | null;
  product_image_url: string | null;
  reference: string | null;
  open_request_count: number;
};

export type AdminQueueItem = {
  queue_item_id: string;
  item_type: "seller_application" | "verification_document" | "listing_draft" | "proof_asset";
  seller_id: string;
  seller_name: string;
  title: string;
  subtitle: string;
  status: string;
  risk_score: number;
  risk_level: "low" | "medium" | "high";
  suggested_action: AdminPrescreenSuggestion["suggested_action"];
  route_to: "standard_review" | "senior_reviewer";
  confidence: "low" | "medium" | "high";
  submitted_at: string | null;
  age_hours: number;
  sla_hours: number;
  sla_state: "ok" | "due_today" | "breached";
  buyer_impact: string;
  trust_impact_points: number;
  blocker: string | null;
  primary_action: string;
  evidence: Array<{ label: string; value: string; source_id: string }>;
  agent_provider: AiAnswerProvider;
  triage_bucket: AdminTriageBucket;
  triage_label?: string;
  triage_reason?: string;
  reviewer_visible?: boolean;
  case_file?: AdminReviewCaseFile | null;
};

export type AdminReviewSignal = {
  label: string;
  detail: string;
  severity: "low" | "medium" | "high";
  fact_ids: string[];
};

export type AdminReviewCaseFile = {
  case_id: string;
  title: string;
  item_type: AdminQueueItem["item_type"];
  trigger: string;
  primary_question: string;
  stage: string;
  recommendation: {
    action: string;
    confidence: "low" | "medium" | "high";
    why: string;
  };
  evidence_path: Array<{
    label: string;
    detail: string;
    status: "pass" | "warn" | "fail";
    source_type: string;
    fact_ids: string[];
  }>;
  evidence_agrees: AdminReviewSignal[];
  evidence_conflicts: AdminReviewSignal[];
  evidence_missing: AdminReviewSignal[];
  score_simulation: {
    current_score: number;
    next_if_approved: number;
    next_if_rejected: number;
    buyer_label_after_approval: string;
    remaining_blockers: string[];
  };
  seller_tasks: Array<{
    task_id: string;
    title: string;
    detail: string;
    priority: "low" | "medium" | "high" | string;
    owner: "seller" | "admin" | string;
    reason: string;
  }>;
  tool_chain: Array<{
    key: string;
    label: string;
    status: "pass" | "warn" | "fail";
    detail: string;
  }>;
  human_guardrails: string[];
  audit_timeline: Array<{
    label: string;
    detail: string;
    status: "done" | "current" | "next" | string;
    timestamp: string | null;
  }>;
  marketplace_impact?: Array<{
    actor: string;
    label: string;
    value: string;
    detail: string;
  }>;
};

export type AdminSellerDossier = {
  seller_id: string;
  seller_name: string;
  verification_status: "verified" | "pending" | "restricted" | string;
  gst_status: string;
  kyc_status: string;
  open_review_items: number;
  highest_risk_score: number;
  route_to: "standard_review" | "senior_reviewer";
  pending_documents: string[];
  approved_document_count: number;
  rejected_document_count: number;
  submitted_draft_count: number;
  submitted_proof_count: number;
  resolved_proof_count: number;
  buyer_requests_waiting: number;
  next_action: string;
  last_activity_at: string | null;
};

export type AdminReviewQueue = {
  summary: {
    active_count: number;
    pending_applications: number;
    document_checks: number;
    submitted_drafts: number;
    proof_reviews: number;
    blocked_items: number;
    senior_routed: number;
    breached_sla_count: number;
    suggested_actions: number;
    buyer_requests_waiting: number;
    trust_lift_pending: number;
    auto_reviewed_count?: number;
    fast_review_count?: number;
    reusable_standard_count?: number;
    stored_evidence_count?: number;
    source_status: SourceHealth["overall_status"];
    source_blocking: boolean;
  };
  source_health: SourceHealth;
  trust_ops: {
    headline: string;
    summary: string;
    case_count: number;
    contradiction_count: number;
    seller_task_count: number;
    fast_clear_count: number;
    human_review_count: number;
    impact_points_waiting: number;
    lanes: Array<{
      key: string;
      label: string;
      count: number;
      detail: string;
    }>;
    top_cases: Array<{
      queue_item_id: string;
      seller_id: string;
      seller_name: string;
      title: string;
      trigger: string;
      risk_score: number;
      conflicts: number;
      trust_impact_points: number;
    }>;
    guardrails: string[];
    seller_scope: string;
  };
  automation_plan: {
    headline: string;
    summary: string;
    next_steps: string[];
    first_queue_item_id: string | null;
    blocked_count: number;
    can_batch_count: number;
    caution: string | null;
    agent_provider: AiAnswerProvider;
  };
  active_queue: AdminQueueItem[];
  seller_dossiers: AdminSellerDossier[];
  seller_applications: Array<AdminSellerApplication & { prescreen: AdminPrescreenSuggestion }>;
  documents: Array<AdminVerificationDocument & { prescreen: AdminPrescreenSuggestion }>;
  listing_drafts: Array<AdminListingDraft & { prescreen: AdminPrescreenSuggestion }>;
  proof_assets: Array<AdminProofAsset & { prescreen: AdminPrescreenSuggestion }>;
  audit_events: AdminAuditEvent[];
  triage?: AdminTriageView;
  stored_evidence?: AdminStoredEvidenceItem[];
};
