from __future__ import annotations

import sqlite3


def get_recent_outcomes(conn: sqlite3.Connection, variant_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT * FROM order_outcomes
        WHERE variant_id = ?
        ORDER BY created_at DESC
        """,
        (variant_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_review_passages(conn: sqlite3.Connection, product_id: str, attribute: str | None = None) -> list[dict]:
    if attribute:
        rows = conn.execute(
            """
            SELECT * FROM reviews
            WHERE product_id = ? AND attribute = ?
            ORDER BY rating DESC
            """,
            (product_id, attribute),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM reviews WHERE product_id = ? ORDER BY rating DESC",
            (product_id,),
        ).fetchall()
    return [dict(row) for row in rows]


def get_fact_records(conn: sqlite3.Connection, fact_ids: list[str]) -> list[dict]:
    if not fact_ids:
        return []
    placeholders = ",".join("?" for _ in fact_ids)
    rows = conn.execute(
        f"SELECT * FROM fact_records WHERE fact_id IN ({placeholders})",
        fact_ids,
    ).fetchall()
    return [dict(row) for row in rows]

