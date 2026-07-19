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
  buyer_trust?: ProductFeedTrust;
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
    };
    score_breakdown?: {
      formula: string;
      confidence_source?: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
      prompt_version?: string;
      score: number;
      score_percent: number;
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
      };
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
  retrieval?: {
    source: "atlas_vector_search" | "lexical_fallback" | "lexical_fallback_after_vector_error" | "disabled_no_gemini_key";
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
  runtime_integrations?: {
    gemini: {
      enabled: boolean;
      provider: string;
      model: string;
      embedding_model: string;
      status: "disabled" | "configured" | "temporarily_unavailable";
      last_error: string | null;
    };
    neo4j: {
      enabled: boolean;
      status: "disabled" | "connected" | "unavailable";
      error?: string;
    };
    atlas_vector_search: {
      enabled: boolean;
      status: "disabled" | "ready_for_queries" | "waiting_for_gemini_key" | "index_missing" | "unsupported_mongodb" | "unavailable";
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
  source?: "deterministic" | "gemini" | "gemini_cache" | "deterministic_after_gemini_error";
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
    provider: "gemini" | "deterministic";
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
  status: "passed" | "watch";
  detail: string;
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
  best_offer: PaymentAssistOffer | null;
  offers: PaymentAssistOffer[];
  safety_checks: PaymentAssistCheck[];
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
    provider: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
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
    provider: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
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
  fact_ids: string[];
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
  }>;
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
  fact_id: string;
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
  fact_ids: string[];
  agent_provider: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
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
  agent_provider: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
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
    source_status: SourceHealth["overall_status"];
    source_blocking: boolean;
  };
  source_health: SourceHealth;
  automation_plan: {
    headline: string;
    summary: string;
    next_steps: string[];
    first_queue_item_id: string | null;
    blocked_count: number;
    can_batch_count: number;
    caution: string | null;
    agent_provider: "gemini" | "deterministic_fallback" | "fallback_after_llm_error";
  };
  active_queue: AdminQueueItem[];
  seller_dossiers: AdminSellerDossier[];
  seller_applications: Array<AdminSellerApplication & { prescreen: AdminPrescreenSuggestion }>;
  documents: Array<AdminVerificationDocument & { prescreen: AdminPrescreenSuggestion }>;
  listing_drafts: Array<AdminListingDraft & { prescreen: AdminPrescreenSuggestion }>;
  proof_assets: Array<AdminProofAsset & { prescreen: AdminPrescreenSuggestion }>;
  audit_events: AdminAuditEvent[];
};
