from __future__ import annotations

import sqlite3

from app.repositories.buyers import get_buyer, get_fit_memory
from app.repositories.catalog import get_variant
from app.services.evidence_aggregator import top_return_reason


SIZE_ORDER = ["S", "M", "L", "XL", "XXL"]


def _next_size(size: str) -> str:
    try:
        index = SIZE_ORDER.index(size)
    except ValueError:
        return size
    return SIZE_ORDER[min(index + 1, len(SIZE_ORDER) - 1)]


def predict_fit(
    conn: sqlite3.Connection,
    buyer_id: str,
    variant_id: str,
    preferred_fit: str = "comfort",
) -> dict:
    buyer = get_buyer(conn, buyer_id)
    variant = get_variant(conn, variant_id)
    if not buyer or not variant:
        raise ValueError("Unknown buyer or variant")

    memories = []
    if buyer["fit_memory_enabled"]:
        memories = get_fit_memory(conn, buyer_id, variant["category"])

    reasons: list[str] = []
    fact_ids: list[str] = []
    recommended_size = variant["size"]
    confidence = "low"

    if memories:
        anchor = memories[0]
        recommended_size = anchor["retained_size"]
        confidence = "medium"
        reasons.append(f"Buyer previously kept {anchor['retained_size']} in this category")
        fact_ids.append(anchor["fact_id"])
    else:
        reasons.append("No personal fit memory for this category")
        if variant["size"] in ("L", "XL"):
            recommended_size = variant["size"]

    top_issue = top_return_reason(conn, variant_id)
    if top_issue and top_issue["return_reason"] == "too_small":
        recommended_size = _next_size(recommended_size)
        reasons.append("This variant has elevated too-small returns")
        fact_ids.extend(top_issue["fact_ids"][:2])
        if memories:
            confidence = "medium"

    if preferred_fit == "comfort" and recommended_size != "XXL":
        reasons.append("Comfort fit preference favors the safer size")

    return {
        "buyer_id": buyer_id,
        "variant_id": variant_id,
        "recommended_size": recommended_size,
        "confidence": confidence,
        "reasons": reasons[:3],
        "fact_ids": fact_ids,
    }
