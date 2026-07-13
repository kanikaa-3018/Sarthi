from __future__ import annotations

import sqlite3

from app.repositories.buyers import get_fit_memory
from app.repositories.catalog import get_variant
from app.services.evidence_aggregator import top_return_reason
from app.services.offer_verifier import verify_offer


def sqlite_graph_path(
    conn: sqlite3.Connection,
    path_type: str,
    buyer_id: str | None = None,
    variant_id: str | None = None,
) -> dict:
    if path_type == "buyer_fit_path":
        if not buyer_id or not variant_id:
            raise ValueError("buyer_id and variant_id are required")
        variant = get_variant(conn, variant_id)
        memories = get_fit_memory(conn, buyer_id, variant["category"]) if variant else []
        fact_ids = [memory["fact_id"] for memory in memories[:2]]
        return {
            "path_type": path_type,
            "available_from": "sqlite_fallback",
            "nodes": [buyer_id, *(memory["memory_id"] for memory in memories[:1]), variant_id],
            "relationships": ["HAS_FIT_MEMORY", "MATCHES_CANDIDATE_SIZE"] if memories else [],
            "fact_ids": fact_ids,
            "summary": "Buyer fit memory projected path" if memories else "No buyer fit path available",
        }

    if path_type == "variant_risk_path":
        if not variant_id:
            raise ValueError("variant_id is required")
        risk = top_return_reason(conn, variant_id)
        return {
            "path_type": path_type,
            "available_from": "sqlite_fallback",
            "nodes": [variant_id, risk["return_reason"]] if risk else [variant_id],
            "relationships": ["RETURNED_FOR"] if risk else [],
            "fact_ids": risk["fact_ids"][:3] if risk else [],
            "summary": f"Top return reason is {risk['return_reason']}" if risk else "No return issue found",
        }

    if path_type == "offer_truth_path":
        if not variant_id:
            raise ValueError("variant_id is required")
        offer = verify_offer(conn, variant_id)
        return {
            "path_type": path_type,
            "available_from": "sqlite_fallback",
            "nodes": [variant_id, offer["status"]],
            "relationships": ["HAS_PRICE_EVENT", "IN_CAMPAIGN", "HAS_INVENTORY"],
            "fact_ids": offer["fact_ids"],
            "summary": offer["message"],
        }

    raise ValueError(f"Unsupported path_type: {path_type}")

