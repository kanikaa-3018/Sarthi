from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


EvidenceStrength = Literal["unknown", "weak", "medium", "strong"]
OfferStatus = Literal["verified_price_drop", "no_need_to_rush", "not_enough_history"]
Confidence = Literal["low", "medium", "high"]
FitPreference = Literal["comfort", "regular"]
Language = Literal[
    "hinglish",
    "english",
    "hindi",
    "bengali",
    "tamil",
    "telugu",
    "marathi",
    "gujarati",
    "kannada",
    "malayalam",
    "odia",
    "punjabi",
    "assamese",
]


class FactRef(BaseModel):
    fact_id: str
    source_type: str
    summary: str


class VariantEvidence(BaseModel):
    sku_id: str
    variant_id: str
    delivered_orders_90d: int
    returns_90d: int
    return_rate: float
    fit_feedback_count: int
    fit_as_expected_rate: float
    color_mismatch_returns: int
    median_dispatch_hours: int
    evidence_strength: EvidenceStrength
    fact_ids: list[str]
    last_updated_at: str


class FitPrediction(BaseModel):
    buyer_id: str
    variant_id: str
    recommended_size: str
    confidence: Confidence
    reasons: list[str]
    fact_ids: list[str]


class RankedCandidate(BaseModel):
    variant_id: str
    score: float
    factors: dict[str, float]
    fact_ids: list[str]


class RankingResult(BaseModel):
    winner: str
    alternative: str | None
    winner_label: str = "Best match for you"
    top_factors: list[str]
    uncertainty: Confidence
    candidates: list[RankedCandidate]
    fact_ids: list[str]


class OfferCheck(BaseModel):
    variant_id: str
    status: OfferStatus
    message: str
    fact_ids: list[str]


class CompareRequest(BaseModel):
    buyer_id: str
    cluster_id: str
    preferred_fit: FitPreference = "comfort"


class AgentQueryRequest(BaseModel):
    buyer_id: str
    query: str
    language: Language = "hinglish"
    product_id: str | None = None
    cluster_id: str | None = None
    selected_variant_id: str | None = None


class AgentAnswer(BaseModel):
    title: str
    summary: str
    reasons: list[str] = Field(max_length=3)
    caution: str | None = None
    primary_action: dict[str, str] | None = None


class AgentQueryResponse(BaseModel):
    trace_id: str
    intent: list[str]
    answer: AgentAnswer
    fact_ids: list[str]
