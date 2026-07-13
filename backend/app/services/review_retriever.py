from __future__ import annotations

import sqlite3

from app.repositories.evidence import get_review_passages


def retrieve_review_passages(conn: sqlite3.Connection, product_id: str, attribute: str) -> dict:
    passages = get_review_passages(conn, product_id, attribute)[:3]
    return {
        "product_id": product_id,
        "attribute": attribute,
        "passages": passages,
        "fact_ids": [row["fact_id"] for row in passages],
    }

