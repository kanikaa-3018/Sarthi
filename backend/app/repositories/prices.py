from __future__ import annotations

import sqlite3


def get_price_events(conn: sqlite3.Connection, variant_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM price_events WHERE variant_id = ? ORDER BY created_at ASC",
        (variant_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_campaign(conn: sqlite3.Connection, variant_id: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM campaigns WHERE variant_id = ? ORDER BY end_at DESC LIMIT 1",
        (variant_id,),
    ).fetchone()
    return dict(row) if row else None


def get_latest_inventory(conn: sqlite3.Connection, variant_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT * FROM inventory_snapshots
        WHERE variant_id = ?
        ORDER BY captured_at DESC
        LIMIT 1
        """,
        (variant_id,),
    ).fetchone()
    return dict(row) if row else None

