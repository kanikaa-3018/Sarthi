from __future__ import annotations

import sqlite3

from app.repositories.buyers import delete_fit_memory, get_buyer, get_fit_memory


def privacy_summary(conn: sqlite3.Connection, buyer_id: str, category: str = "women_kurtis") -> dict:
    buyer = get_buyer(conn, buyer_id)
    memory = get_fit_memory(conn, buyer_id, category)
    fit_memory_enabled = bool(buyer["fit_memory_enabled"]) if buyer else False
    if fit_memory_enabled and memory:
        personalization_source = "past category fit outcomes"
    elif fit_memory_enabled:
        personalization_source = "future kept outcomes only; no past memory exists yet"
    else:
        personalization_source = "catalog and product evidence only"
    return {
        "buyer_id": buyer_id,
        "fit_memory_enabled": fit_memory_enabled,
        "memory_record_count": len(memory),
        "used": [
            personalization_source,
            "selected fit preference",
            "aggregate product outcomes",
            "review and offer facts",
        ],
        "not_used": [
            "phone contacts",
            "messages",
            "address",
            "payment details",
            "raw voice",
            "seller access to personal buyer memory",
        ],
    }


def delete_personal_memory(conn: sqlite3.Connection, buyer_id: str) -> dict:
    deleted = delete_fit_memory(conn, buyer_id)
    return {
        "buyer_id": buyer_id,
        "deleted_fit_memory_records": deleted,
        "fit_memory_enabled": False,
    }
