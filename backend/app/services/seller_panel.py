from __future__ import annotations

import sqlite3
from statistics import median

from app.repositories.catalog import get_cluster_products
from app.services.data_contracts import SELLER_PANEL_SOURCE_IDS, list_data_sources, seller_verification, source_health_summary
from app.services.evidence_aggregator import build_variant_evidence, top_return_reason


QUALITY_WEIGHTS = {
    "kept_rate": 0.34,
    "fit_accuracy": 0.24,
    "color_match": 0.18,
    "dispatch": 0.14,
    "evidence_depth": 0.10,
}

EVIDENCE_DEPTH = {
    "unknown": 0.0,
    "weak": 0.35,
    "medium": 0.7,
    "strong": 1.0,
}


def list_sellers(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
          s.seller_id,
          s.name,
          s.median_dispatch_hours,
          COUNT(p.product_id) AS product_count,
          GROUP_CONCAT(DISTINCT p.cluster_id) AS cluster_ids
        FROM sellers s
        LEFT JOIN products p ON p.seller_id = s.seller_id
        GROUP BY s.seller_id, s.name, s.median_dispatch_hours
        ORDER BY s.name
        """
    ).fetchall()
    sellers: list[dict] = []
    for row in rows:
        seller = dict(row)
        seller["cluster_ids"] = seller["cluster_ids"].split(",") if seller["cluster_ids"] else []
        sellers.append(seller)
    return sellers


def build_seller_panel(
    conn: sqlite3.Connection,
    seller_id: str,
    cluster_id: str | None = None,
    size: str = "XL",
) -> dict:
    seller = _get_seller(conn, seller_id)
    if not seller:
        raise ValueError(f"Unknown seller_id: {seller_id}")

    target_cluster_id = cluster_id or _first_cluster_for_seller(conn, seller_id)
    if not target_cluster_id:
        raise ValueError(f"No listings found for seller_id: {seller_id}")

    products = get_cluster_products(conn, target_cluster_id)
    if not products:
        raise ValueError(f"Unknown cluster_id: {target_cluster_id}")

    all_listing_cards = [_listing_card(conn, product, size) for product in products]
    cluster_stats = _cluster_stats(all_listing_cards)
    ranked_cards = _rank_cards(all_listing_cards)
    seller_cards = [card for card in ranked_cards if card["seller"]["seller_id"] == seller_id]
    competitor_cards = [card for card in ranked_cards if card["seller"]["seller_id"] != seller_id]

    if not seller_cards:
        raise ValueError(f"Seller {seller_id} has no listings in cluster {target_cluster_id}")

    verification = seller_verification(conn, seller_id)
    source_health = source_health_summary(list_data_sources(conn, SELLER_PANEL_SOURCE_IDS))
    for card in ranked_cards:
        card["cluster_position"] = _cluster_position(card, ranked_cards)
        card["action_items"] = _action_items(card, cluster_stats, verification)

    return {
        "seller": seller,
        "seller_verification": verification,
        "data_freshness": source_health,
        "cluster": {
            "cluster_id": target_cluster_id,
            "label": _cluster_label(conn, target_cluster_id),
            "size": size,
            "listing_count": len(ranked_cards),
            "seller_count": len({card["seller"]["seller_id"] for card in ranked_cards}),
            "stats": cluster_stats,
        },
        "decision_policy": {
            "name": "Aggregate duplicate-listing quality policy",
            "weights": QUALITY_WEIGHTS,
            "inputs_used": [
                "variant-level kept/return outcomes",
                "return reasons",
                "seller dispatch median",
                "evidence denominator",
            ],
            "inputs_not_used": [
                "buyer personal fit memory",
                "buyer identity",
                "address, payment, contacts, gallery, or raw voice data",
            ],
        },
        "seller_listings": seller_cards,
        "competing_listings": competitor_cards,
        "privacy_guard": {
            "safe_for_seller": True,
            "summary": "Seller panel uses aggregate listing and fulfilment facts only. Personal buyer memory is not exposed or used.",
        },
        "fact_ids": _unique_fact_ids(ranked_cards)[:20],
    }


def _get_seller(conn: sqlite3.Connection, seller_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT
          s.seller_id,
          s.name,
          s.median_dispatch_hours,
          COUNT(p.product_id) AS product_count,
          GROUP_CONCAT(DISTINCT p.cluster_id) AS cluster_ids
        FROM sellers s
        LEFT JOIN products p ON p.seller_id = s.seller_id
        WHERE s.seller_id = ?
        GROUP BY s.seller_id, s.name, s.median_dispatch_hours
        """,
        (seller_id,),
    ).fetchone()
    if not row:
        return None
    seller = dict(row)
    seller["cluster_ids"] = seller["cluster_ids"].split(",") if seller["cluster_ids"] else []
    return seller


def _first_cluster_for_seller(conn: sqlite3.Connection, seller_id: str) -> str | None:
    row = conn.execute(
        """
        SELECT cluster_id
        FROM products
        WHERE seller_id = ?
        ORDER BY cluster_id
        LIMIT 1
        """,
        (seller_id,),
    ).fetchone()
    return row["cluster_id"] if row else None


def _cluster_label(conn: sqlite3.Connection, cluster_id: str) -> str:
    row = conn.execute(
        "SELECT label FROM duplicate_clusters WHERE cluster_id = ?",
        (cluster_id,),
    ).fetchone()
    return row["label"] if row else cluster_id


def _variant_for_product(conn: sqlite3.Connection, product_id: str, size: str) -> dict:
    row = conn.execute(
        """
        SELECT *
        FROM variants
        WHERE product_id = ? AND size = ?
        LIMIT 1
        """,
        (product_id, size),
    ).fetchone()
    if row:
        return dict(row)
    fallback = conn.execute(
        """
        SELECT *
        FROM variants
        WHERE product_id = ?
        ORDER BY size
        LIMIT 1
        """,
        (product_id,),
    ).fetchone()
    if not fallback:
        raise ValueError(f"No variants for product_id: {product_id}")
    return dict(fallback)


def _listing_card(conn: sqlite3.Connection, product: dict, size: str) -> dict:
    variant = _variant_for_product(conn, product["product_id"], size)
    evidence = build_variant_evidence(conn, variant["variant_id"])
    issue = top_return_reason(conn, variant["variant_id"])
    delivered = evidence["delivered_orders_90d"]
    color_match_rate = None
    if delivered:
        color_match_rate = round(1 - evidence["color_mismatch_returns"] / delivered, 3)
    score = _quality_score(evidence)
    return {
        "product": product,
        "variant": variant,
        "seller": {
            "seller_id": product["seller_id"],
            "name": product["seller_name"],
            "median_dispatch_hours": product.get("median_dispatch_hours"),
        },
        "quality_score": score,
        "decision_status": _decision_status(evidence, issue),
        "metrics": {
            "kept_rate": round(1 - evidence["return_rate"], 3) if delivered else None,
            "return_rate": evidence["return_rate"] if delivered else None,
            "fit_as_expected_rate": evidence["fit_as_expected_rate"] if evidence["fit_feedback_count"] else None,
            "color_match_rate": color_match_rate,
            "delivered_orders_90d": delivered,
            "returns_90d": evidence["returns_90d"],
            "color_mismatch_returns": evidence["color_mismatch_returns"],
            "median_dispatch_hours": evidence["median_dispatch_hours"],
            "evidence_strength": evidence["evidence_strength"],
        },
        "top_issue": issue,
        "fact_ids": list(dict.fromkeys(evidence["fact_ids"] + (issue["fact_ids"][:3] if issue else []))),
    }


def _quality_score(evidence: dict) -> int | None:
    delivered = evidence["delivered_orders_90d"]
    if delivered < 10:
        return None

    kept_rate = 1 - evidence["return_rate"]
    fit_accuracy = evidence["fit_as_expected_rate"]
    color_match = 1 - min(evidence["color_mismatch_returns"] / max(delivered, 1), 1)
    dispatch = max(0, min(1, 1 - evidence["median_dispatch_hours"] / 72))
    evidence_depth = EVIDENCE_DEPTH[evidence["evidence_strength"]]
    score = (
        QUALITY_WEIGHTS["kept_rate"] * kept_rate
        + QUALITY_WEIGHTS["fit_accuracy"] * fit_accuracy
        + QUALITY_WEIGHTS["color_match"] * color_match
        + QUALITY_WEIGHTS["dispatch"] * dispatch
        + QUALITY_WEIGHTS["evidence_depth"] * evidence_depth
    )
    return round(score * 100)


def _decision_status(evidence: dict, issue: dict | None) -> str:
    if evidence["delivered_orders_90d"] < 10:
        return "insufficient_evidence"
    if issue and issue["count"] >= 5:
        return "needs_seller_action"
    if evidence["return_rate"] >= 0.3:
        return "needs_seller_action"
    return "eligible_for_recommendation"


def _cluster_stats(cards: list[dict]) -> dict:
    known_cards = [card for card in cards if card["metrics"]["delivered_orders_90d"] >= 1]
    return_rates = [
        card["metrics"]["return_rate"]
        for card in known_cards
        if card["metrics"]["return_rate"] is not None
    ]
    dispatch_hours = [card["metrics"]["median_dispatch_hours"] for card in cards]
    delivered_total = sum(card["metrics"]["delivered_orders_90d"] for card in cards)
    return_total = sum(card["metrics"]["returns_90d"] for card in cards)
    return {
        "delivered_orders_90d": delivered_total,
        "returns_90d": return_total,
        "median_return_rate": round(median(return_rates), 3) if return_rates else None,
        "median_dispatch_hours": round(median(dispatch_hours), 1) if dispatch_hours else None,
        "minimum_orders_for_strong_decision": 25,
    }


def _rank_cards(cards: list[dict]) -> list[dict]:
    return sorted(
        cards,
        key=lambda card: (
            card["quality_score"] is not None,
            card["quality_score"] or 0,
            card["metrics"]["delivered_orders_90d"],
        ),
        reverse=True,
    )


def _cluster_position(card: dict, ranked_cards: list[dict]) -> int | None:
    if card["quality_score"] is None:
        return None
    scored = [ranked for ranked in ranked_cards if ranked["quality_score"] is not None]
    for index, ranked in enumerate(scored, start=1):
        if ranked["variant"]["variant_id"] == card["variant"]["variant_id"]:
            return index
    return None


def _action_items(card: dict, cluster_stats: dict, verification: dict) -> list[dict]:
    metrics = card["metrics"]
    issue = card["top_issue"]
    actions: list[dict] = []
    if verification["verification_status"] == "restricted":
        actions.append(
            {
                "priority": "high",
                "title": "Resolve seller account restriction",
                "rationale": verification["restricted_reason"] or "Seller account access is restricted.",
                "metric": verification["verification_status"],
                "fact_ids": [],
            }
        )
    elif verification["verification_status"] == "pending":
        actions.append(
            {
                "priority": "high",
                "title": "Complete seller verification",
                "rationale": "GST/KYC review is pending, so buyer-facing trust may be reduced.",
                "metric": f"GST {verification['gst_status']}, KYC {verification['kyc_status']}",
                "fact_ids": [],
            }
        )
    if metrics["delivered_orders_90d"] < 10:
        actions.append(
            {
                "priority": "high",
                "title": "Build evidence before strong placement",
                "rationale": "This listing has too few delivered orders for Sarthi to make a confident aggregate decision.",
                "metric": f"{metrics['delivered_orders_90d']} delivered orders",
                "fact_ids": card["fact_ids"][:3],
            }
        )
    if issue and issue["return_reason"] == "too_small":
        actions.append(
            {
                "priority": "high",
                "title": "Fix size expectation for this listing",
                "rationale": "Returns show buyers are finding this variant smaller than expected.",
                "metric": f"{issue['count']} too-small returns",
                "fact_ids": issue["fact_ids"][:3],
            }
        )
    if metrics["color_mismatch_returns"] >= 3:
        actions.append(
            {
                "priority": "medium",
                "title": "Add daylight and unfiltered color photos",
                "rationale": "Color mismatch returns can reduce buyer confidence even when reviews are positive.",
                "metric": f"{metrics['color_mismatch_returns']} color mismatch returns",
                "fact_ids": card["fact_ids"][:3],
            }
        )
    median_dispatch = cluster_stats["median_dispatch_hours"]
    if median_dispatch is not None and metrics["median_dispatch_hours"] > median_dispatch + 6:
        actions.append(
            {
                "priority": "medium",
                "title": "Improve dispatch SLA",
                "rationale": "This seller dispatch median is slower than the duplicate-cluster median.",
                "metric": f"{metrics['median_dispatch_hours']}h vs {median_dispatch}h cluster median",
                "fact_ids": card["fact_ids"][:3],
            }
        )
    if not actions:
        actions.append(
            {
                "priority": "low",
                "title": "Maintain listing quality",
                "rationale": "Current aggregate evidence is strong enough for buyer-side recommendation eligibility.",
                "metric": f"Quality score {card['quality_score']}",
                "fact_ids": card["fact_ids"][:3],
            }
        )
    return actions[:3]


def _unique_fact_ids(cards: list[dict]) -> list[str]:
    fact_ids: list[str] = []
    for card in cards:
        fact_ids.extend(card["fact_ids"])
        for action in card.get("action_items", []):
            fact_ids.extend(action["fact_ids"])
    return list(dict.fromkeys(fact_ids))
