from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sqlite3
from uuid import uuid4

from app.repositories.catalog import get_variant


IST = timezone(timedelta(hours=5, minutes=30))
ALLOWED_OUTCOME_STATUSES = {"delivered_kept", "returned", "exchanged", "rto"}
ALLOWED_RETURN_REASONS = {"too_small", "too_large", "color_different", "fabric_different", "damaged"}
STATUSES_REQUIRING_RETURN_REASON = {"returned", "exchanged"}


def record_order_outcome(
    conn: sqlite3.Connection,
    buyer_id: str,
    variant_id: str,
    status: str,
    return_reason: str | None = None,
) -> dict:
    validate_order_outcome(conn, buyer_id, variant_id, status, return_reason)
    order_id = f"order_user_{uuid4().hex[:10]}"
    fact_id = f"fact_{order_id}"
    created_at = datetime.now(IST).isoformat()
    conn.execute(
        "INSERT INTO order_outcomes VALUES (?, ?, ?, ?, ?, ?, ?)",
        (order_id, buyer_id, variant_id, status, return_reason, created_at, fact_id),
    )
    summary = f"{buyer_id} marked {variant_id} as {status}"
    if return_reason:
        summary += f" because {return_reason}"
    conn.execute(
        """
        INSERT INTO fact_records
        (fact_id, source_table, source_id, source_type, summary, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (fact_id, "order_outcomes", order_id, "order_outcome", summary, created_at, None),
    )
    memory_update = _maybe_update_fit_memory(conn, buyer_id, variant_id, status, fact_id, created_at)
    conn.commit()
    return {
        "order_id": order_id,
        "fact_id": fact_id,
        "created_at": created_at,
        "status": status,
        "memory_update": memory_update,
    }


def validate_order_outcome(
    conn: sqlite3.Connection,
    buyer_id: str,
    variant_id: str,
    status: str,
    return_reason: str | None,
) -> None:
    if status not in ALLOWED_OUTCOME_STATUSES:
        raise ValueError(f"Unsupported outcome status: {status}")
    if return_reason and return_reason not in ALLOWED_RETURN_REASONS:
        raise ValueError(f"Unsupported return reason: {return_reason}")
    if status in STATUSES_REQUIRING_RETURN_REASON and not return_reason:
        raise ValueError(f"{status} outcomes require a structured return_reason")
    if status not in STATUSES_REQUIRING_RETURN_REASON and return_reason:
        raise ValueError(f"{status} outcomes cannot include a return_reason")

    buyer = conn.execute("SELECT buyer_id FROM buyers WHERE buyer_id = ?", (buyer_id,)).fetchone()
    if not buyer:
        raise ValueError(f"Unknown buyer_id: {buyer_id}")
    if not get_variant(conn, variant_id):
        raise ValueError(f"Unknown variant_id: {variant_id}")


def _maybe_update_fit_memory(
    conn: sqlite3.Connection,
    buyer_id: str,
    variant_id: str,
    status: str,
    fact_id: str,
    created_at: str,
) -> dict:
    buyer = conn.execute("SELECT fit_memory_enabled FROM buyers WHERE buyer_id = ?", (buyer_id,)).fetchone()
    if not buyer or not buyer["fit_memory_enabled"]:
        return {
            "updated": False,
            "reason": "fit_memory_disabled",
        }
    if status != "delivered_kept":
        return {
            "updated": False,
            "reason": "only_kept_outcomes_update_personal_fit_memory",
        }

    variant = conn.execute(
        """
        SELECT v.size, p.category
        FROM variants v
        JOIN products p ON p.product_id = v.product_id
        WHERE v.variant_id = ?
        """,
        (variant_id,),
    ).fetchone()
    if not variant:
        return {
            "updated": False,
            "reason": "variant_not_found",
        }

    memory_id = f"fit_memory_{buyer_id}_{variant['category']}_{uuid4().hex[:8]}"
    conn.execute(
        """
        INSERT INTO fit_memory
        (memory_id, buyer_id, category, anchor_variant_id, retained_size, preferred_fit, confidence, updated_at, fact_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            memory_id,
            buyer_id,
            variant["category"],
            variant_id,
            variant["size"],
            "comfort",
            "medium",
            created_at,
            fact_id,
        ),
    )
    return {
        "updated": True,
        "memory_id": memory_id,
        "category": variant["category"],
        "retained_size": variant["size"],
    }
