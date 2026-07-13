from __future__ import annotations

import json
import sqlite3
from uuid import uuid4


def create_trace(
    conn: sqlite3.Connection,
    buyer_id: str,
    intent: list[str],
    tools_used: list[str],
    fact_ids: list[str],
    graph_paths: list[dict],
    product_id: str | None = None,
    variant_id: str | None = None,
) -> str:
    trace_id = f"trace_{uuid4().hex[:10]}"
    conn.execute(
        """
        INSERT INTO recommendation_traces
        (trace_id, buyer_id, product_id, variant_id, intent, tools_used, fact_ids, graph_paths, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        """,
        (
            trace_id,
            buyer_id,
            product_id,
            variant_id,
            json.dumps(intent),
            json.dumps(tools_used),
            json.dumps(list(dict.fromkeys(fact_ids))),
            json.dumps(graph_paths),
        ),
    )
    return trace_id


def get_trace(conn: sqlite3.Connection, trace_id: str) -> dict | None:
    row = conn.execute(
        "SELECT * FROM recommendation_traces WHERE trace_id = ?",
        (trace_id,),
    ).fetchone()
    if not row:
        return None
    data = dict(row)
    data["intent"] = json.loads(data["intent"])
    data["tools_used"] = json.loads(data["tools_used"])
    data["fact_ids"] = json.loads(data["fact_ids"])
    data["graph_paths"] = json.loads(data["graph_paths"])
    data["fact_details"] = _fact_details(conn, data["fact_ids"])
    return data


def _fact_details(conn: sqlite3.Connection, fact_ids: list[str]) -> list[dict]:
    if not fact_ids:
        return []
    placeholders = ",".join("?" for _ in fact_ids)
    rows = conn.execute(
        f"""
        SELECT fact_id, source_table, source_id, source_type, summary, created_at, expires_at
        FROM fact_records
        WHERE fact_id IN ({placeholders})
        """,
        fact_ids,
    ).fetchall()
    by_id = {row["fact_id"]: dict(row) for row in rows}
    return [by_id[fact_id] for fact_id in fact_ids if fact_id in by_id]
