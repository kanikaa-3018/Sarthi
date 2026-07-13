from __future__ import annotations

import sqlite3

from app.services.evidence_aggregator import build_variant_evidence
from app.services.fit_predictor import predict_fit


def _normalize_inverse(value: float, cap: float) -> float:
    return max(0.0, min(1.0, 1.0 - value / cap))


def rank_for_kept_order(
    conn: sqlite3.Connection,
    buyer_id: str,
    candidate_variant_ids: list[str],
    preferred_fit: str = "comfort",
) -> dict:
    candidates = []
    fact_ids: list[str] = []
    for variant_id in candidate_variant_ids:
        evidence = build_variant_evidence(conn, variant_id)
        fit = predict_fit(conn, buyer_id, variant_id, preferred_fit)
        fit_match = 1.0 if fit["recommended_size"].lower() in variant_id else 0.72
        outcome_quality = _normalize_inverse(evidence["return_rate"], 0.45)
        expectation_match = 1.0 - min(evidence["color_mismatch_returns"] / max(evidence["delivered_orders_90d"], 1), 0.5)
        fulfilment = _normalize_inverse(evidence["median_dispatch_hours"], 72)
        uncertainty_penalty = {"strong": 0.0, "medium": 0.08, "weak": 0.18, "unknown": 0.3}[evidence["evidence_strength"]]
        score = round(
            0.35 * fit_match
            + 0.25 * outcome_quality
            + 0.15 * expectation_match
            + 0.15 * fulfilment
            + 0.10 * 0.8
            - uncertainty_penalty,
            4,
        )
        candidate_fact_ids = list(dict.fromkeys(evidence["fact_ids"] + fit["fact_ids"]))
        fact_ids.extend(candidate_fact_ids)
        candidates.append(
            {
                "variant_id": variant_id,
                "score": score,
                "factors": {
                    "fit_match": round(fit_match, 3),
                    "outcome_quality": round(outcome_quality, 3),
                    "expectation_match": round(expectation_match, 3),
                    "fulfilment_reliability": round(fulfilment, 3),
                    "uncertainty_penalty": uncertainty_penalty,
                },
                "fact_ids": candidate_fact_ids,
            }
        )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    winner = candidates[0]
    alternative = candidates[1] if len(candidates) > 1 else None
    return {
        "winner": winner["variant_id"],
        "alternative": alternative["variant_id"] if alternative else None,
        "winner_label": "Best match for you",
        "top_factors": [
            "Size is more consistent",
            "Fewer avoidable returns",
            "Seller dispatch is reliable",
        ],
        "uncertainty": "medium" if winner["score"] < 0.72 else "high",
        "candidates": candidates,
        "fact_ids": list(dict.fromkeys(fact_ids))[:12],
    }

