from __future__ import annotations

import sqlite3


def get_buyer(conn: sqlite3.Connection, buyer_id: str) -> dict | None:
    row = conn.execute("SELECT * FROM buyers WHERE buyer_id = ?", (buyer_id,)).fetchone()
    return dict(row) if row else None


def get_fit_memory(conn: sqlite3.Connection, buyer_id: str, category: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT * FROM fit_memory
        WHERE buyer_id = ? AND category = ?
        ORDER BY updated_at DESC
        """,
        (buyer_id, category),
    ).fetchall()
    return [dict(row) for row in rows]


def list_fit_memory(conn: sqlite3.Connection, buyer_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT * FROM fit_memory
        WHERE buyer_id = ?
        ORDER BY updated_at DESC
        """,
        (buyer_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def update_memory_settings(
    conn: sqlite3.Connection,
    buyer_id: str,
    fit_memory_enabled: bool | None = None,
    preferred_fit: str | None = None,
) -> dict:
    if fit_memory_enabled is not None:
        conn.execute(
            "UPDATE buyers SET fit_memory_enabled = ? WHERE buyer_id = ?",
            (1 if fit_memory_enabled else 0, buyer_id),
        )
    if preferred_fit:
        conn.execute(
            "UPDATE fit_memory SET preferred_fit = ?, updated_at = datetime('now') WHERE buyer_id = ?",
            (preferred_fit, buyer_id),
        )
    conn.commit()
    buyer = get_buyer(conn, buyer_id)
    return {
        "buyer_id": buyer_id,
        "fit_memory_enabled": bool(buyer["fit_memory_enabled"]) if buyer else False,
        "memory": list_fit_memory(conn, buyer_id),
    }


def delete_fit_memory(conn: sqlite3.Connection, buyer_id: str) -> int:
    cursor = conn.execute("DELETE FROM fit_memory WHERE buyer_id = ?", (buyer_id,))
    conn.execute("UPDATE buyers SET fit_memory_enabled = 0 WHERE buyer_id = ?", (buyer_id,))
    conn.commit()
    return cursor.rowcount
