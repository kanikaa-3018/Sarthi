from __future__ import annotations

import sqlite3
from statistics import median

from app.repositories.catalog import get_variant


def build_variant_evidence(conn: sqlite3.Connection, variant_id: str) -> dict:
    variant = get_variant(conn, variant_id)
    if not variant:
        raise ValueError(f"Unknown variant_id: {variant_id}")

    rows = conn.execute(
        """
        SELECT status, return_reason, fact_id
        FROM order_outcomes
        WHERE variant_id = ?
        """,
        (variant_id,),
    ).fetchall()
    rows = [dict(row) for row in rows]
    delivered = [row for row in rows if row["status"] in ("delivered_kept", "returned", "exchanged")]
    returns = [row for row in rows if row["status"] == "returned"]
    fit_feedback = [row for row in rows if row["return_reason"] in ("too_small", "too_large") or row["status"] == "delivered_kept"]
    fit_bad = [row for row in rows if row["return_reason"] in ("too_small", "too_large")]
    color_mismatch = [row for row in rows if row["return_reason"] == "color_different"]
    seller = conn.execute(
        """
        SELECT s.median_dispatch_hours
        FROM products p
        JOIN sellers s ON s.seller_id = p.seller_id
        WHERE p.product_id = ?
        """,
        (variant["product_id"],),
    ).fetchone()

    delivered_count = len(delivered)
    returns_count = len(returns)
    return_rate = round(returns_count / delivered_count, 3) if delivered_count else 0.0
    fit_count = len(fit_feedback)
    fit_as_expected = 1.0
    if fit_count:
        fit_as_expected = round((fit_count - len(fit_bad)) / fit_count, 3)

    evidence_strength = "unknown"
    if delivered_count >= 25:
        evidence_strength = "strong"
    elif delivered_count >= 10:
        evidence_strength = "medium"
    elif delivered_count >= 1:
        evidence_strength = "weak"

    fact_ids = [row["fact_id"] for row in rows[:8]]
    return {
        "sku_id": variant["product_id"],
        "variant_id": variant_id,
        "delivered_orders_90d": delivered_count,
        "returns_90d": returns_count,
        "return_rate": return_rate,
        "fit_feedback_count": fit_count,
        "fit_as_expected_rate": fit_as_expected,
        "color_mismatch_returns": len(color_mismatch),
        "median_dispatch_hours": int(seller["median_dispatch_hours"]) if seller else 999,
        "evidence_strength": evidence_strength,
        "fact_ids": fact_ids,
        "last_updated_at": "2026-07-13T14:32:00+05:30",
    }


def top_return_reason(conn: sqlite3.Connection, variant_id: str) -> dict | None:
    variant = get_variant(conn, variant_id)
    if not variant:
        return None
    row = conn.execute(
        """
        SELECT return_reason, COUNT(*) AS count, GROUP_CONCAT(fact_id) AS fact_ids
        FROM order_outcomes
        WHERE variant_id = ? AND status = 'returned' AND return_reason IS NOT NULL
        GROUP BY return_reason
        ORDER BY count DESC
        LIMIT 1
        """,
        (variant_id,),
    ).fetchone()
    if not row:
        return None
    return {
        "return_reason": row["return_reason"],
        "count": row["count"],
        "fact_ids": row["fact_ids"].split(",") if row["fact_ids"] else [],
    }


def evidence_conflicts(conn: sqlite3.Connection, variant_id: str) -> list[dict]:
    variant = get_variant(conn, variant_id)
    if not variant:
        return []
    conflicts: list[dict] = []
    color_returns = conn.execute(
        """
        SELECT COUNT(*) AS count, GROUP_CONCAT(fact_id) AS fact_ids
        FROM order_outcomes
        WHERE variant_id = ? AND status = 'returned' AND return_reason = 'color_different'
        """,
        (variant_id,),
    ).fetchone()
    color_reviews = conn.execute(
        """
        SELECT COUNT(*) AS count, GROUP_CONCAT(fact_id) AS fact_ids
        FROM reviews
        WHERE product_id = ? AND attribute = 'color' AND sentiment = 'positive'
        """,
        (variant["product_id"],),
    ).fetchone()
    if color_returns and color_reviews and color_returns["count"] >= 3 and color_reviews["count"] >= 1:
        return_fact_ids = color_returns["fact_ids"].split(",") if color_returns["fact_ids"] else []
        review_fact_ids = color_reviews["fact_ids"].split(",") if color_reviews["fact_ids"] else []
        conflicts.append(
            {
                "type": "color_review_return_conflict",
                "severity": "medium",
                "summary": "Reviews praise color, but recent returns mention color mismatch.",
                "action": "Check daylight image before ordering.",
                "fact_ids": (return_fact_ids + review_fact_ids)[:6],
            }
        )
    return conflicts


def category_prior_return_rate(conn: sqlite3.Connection, category: str) -> float:
    row = conn.execute(
        """
        SELECT
          SUM(CASE WHEN o.status = 'returned' THEN 1 ELSE 0 END) AS returns,
          SUM(CASE WHEN o.status IN ('delivered_kept', 'returned', 'exchanged') THEN 1 ELSE 0 END) AS delivered
        FROM order_outcomes o
        JOIN variants v ON v.variant_id = o.variant_id
        JOIN products p ON p.product_id = v.product_id
        WHERE p.category = ?
        """,
        (category,),
    ).fetchone()
    if not row or not row["delivered"]:
        return 0.15
    return float(row["returns"]) / float(row["delivered"])
