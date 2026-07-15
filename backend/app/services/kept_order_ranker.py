from __future__ import annotations

import sqlite3

from app.services.evidence_aggregator import build_variant_evidence
from app.services.fit_predictor import predict_fit


def _normalize_inverse(value: float, cap: float) -> float:
    return max(0.0, min(1.0, 1.0 - value / cap))


def _normalize_rating(value: float) -> float:
    return max(0.0, min(1.0, (value - 3.0) / 2.0))


def _review_signal(conn: sqlite3.Connection, product_id: str) -> tuple[float, list[str]]:
    rows = conn.execute(
        """
        SELECT sentiment, rating, fact_id
        FROM reviews
        WHERE product_id = ?
        """,
        (product_id,),
    ).fetchall()
    if not rows:
        return 0.5, []

    sentiment_weights = {
        "positive": 1.0,
        "mixed": 0.62,
        "negative": 0.2,
    }
    values = [
        0.65 * sentiment_weights.get(row["sentiment"], 0.5)
        + 0.35 * _normalize_rating(float(row["rating"]))
        for row in rows
    ]
    return round(sum(values) / len(values), 3), [row["fact_id"] for row in rows[:4]]


def _variant_context(conn: sqlite3.Connection, variant_id: str) -> dict:
    row = conn.execute(
        """
        SELECT
          v.current_price,
          p.product_id,
          p.base_price,
          p.rating,
          p.rating_count,
          p.fabric,
          p.color_family,
          p.seller_id,
          sp.verification_status
        FROM variants v
        JOIN products p ON p.product_id = v.product_id
        LEFT JOIN seller_profiles sp ON sp.seller_id = p.seller_id
        WHERE v.variant_id = ?
        """,
        (variant_id,),
    ).fetchone()
    if not row:
        raise ValueError(f"Unknown variant_id: {variant_id}")
    return dict(row)


def rank_for_kept_order(
    conn: sqlite3.Connection,
    buyer_id: str,
    candidate_variant_ids: list[str],
    preferred_fit: str = "comfort",
) -> dict:
    candidates = []
    fact_ids: list[str] = []
    for variant_id in candidate_variant_ids:
        context = _variant_context(conn, variant_id)
        evidence = build_variant_evidence(conn, variant_id)
        fit = predict_fit(conn, buyer_id, variant_id, preferred_fit)
        review_signal, review_fact_ids = _review_signal(conn, context["product_id"])
        fit_match = 1.0 if fit["recommended_size"].lower() in variant_id else 0.72
        outcome_quality = _normalize_inverse(evidence["return_rate"], 0.45)
        expectation_match = 1.0 - min(evidence["color_mismatch_returns"] / max(evidence["delivered_orders_90d"], 1), 0.5)
        fulfilment = _normalize_inverse(evidence["median_dispatch_hours"], 72)
        seller_trust = {
            "verified": 1.0,
            "pending": 0.68,
            "restricted": 0.0,
        }.get(context.get("verification_status") or "restricted", 0.0)
        rating_signal = _normalize_rating(float(context["rating"]))
        price_value = _normalize_inverse(float(context["current_price"]), 1400)
        uncertainty_penalty = {"strong": 0.0, "medium": 0.08, "weak": 0.18, "unknown": 0.3}[evidence["evidence_strength"]]
        score = round(
            0.25 * fit_match
            + 0.22 * outcome_quality
            + 0.13 * expectation_match
            + 0.12 * fulfilment
            + 0.11 * seller_trust
            + 0.07 * review_signal
            + 0.05 * rating_signal
            + 0.05 * price_value
            - uncertainty_penalty,
            4,
        )
        candidate_fact_ids = list(dict.fromkeys(evidence["fact_ids"] + fit["fact_ids"] + review_fact_ids))
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
                    "seller_trust": round(seller_trust, 3),
                    "review_signal": round(review_signal, 3),
                    "rating_signal": round(rating_signal, 3),
                    "price_value": round(price_value, 3),
                    "uncertainty_penalty": uncertainty_penalty,
                },
                "fact_ids": candidate_fact_ids,
            }
        )

    candidates.sort(key=lambda item: item["score"], reverse=True)
    winner = candidates[0]
    alternative = candidates[1] if len(candidates) > 1 else None
    factor_labels = {
        "fit_match": "Size is more consistent",
        "outcome_quality": "Fewer avoidable returns",
        "expectation_match": "Customer expectation matches better",
        "fulfilment_reliability": "Seller dispatch is reliable",
        "seller_trust": "Seller verification is stronger",
        "review_signal": "Reviews support the SKU details",
        "rating_signal": "Rating quality is stronger",
        "price_value": "Price is reasonable for this cluster",
    }
    top_factors = [
        factor_labels[key]
        for key, _ in sorted(
            (
                (key, value)
                for key, value in winner["factors"].items()
                if key != "uncertainty_penalty"
            ),
            key=lambda item: item[1],
            reverse=True,
        )[:3]
    ]
    return {
        "winner": winner["variant_id"],
        "alternative": alternative["variant_id"] if alternative else None,
        "winner_label": "Best match for you",
        "top_factors": top_factors,
        "uncertainty": "medium" if winner["score"] < 0.72 else "high",
        "candidates": candidates,
        "fact_ids": list(dict.fromkeys(fact_ids))[:12],
    }
