from __future__ import annotations

import sqlite3

from app.graph.cypher import CONSTRAINTS
from app.graph.neo4j_client import Neo4jClient


def build_projection_summary(conn: sqlite3.Connection) -> dict:
    counts = {
        "buyers": conn.execute("SELECT COUNT(*) FROM buyers").fetchone()[0],
        "products": conn.execute("SELECT COUNT(*) FROM products").fetchone()[0],
        "variants": conn.execute("SELECT COUNT(*) FROM variants").fetchone()[0],
        "sellers": conn.execute("SELECT COUNT(*) FROM sellers").fetchone()[0],
        "fit_memory": conn.execute("SELECT COUNT(*) FROM fit_memory").fetchone()[0],
        "returned_edges": conn.execute(
            "SELECT COUNT(*) FROM order_outcomes WHERE status = 'returned'"
        ).fetchone()[0],
        "kept_edges": conn.execute(
            "SELECT COUNT(*) FROM order_outcomes WHERE status = 'delivered_kept'"
        ).fetchone()[0],
        "fact_records": conn.execute("SELECT COUNT(*) FROM fact_records").fetchone()[0],
    }
    counts["expected_min_nodes"] = (
        counts["buyers"] + counts["products"] + counts["variants"] + counts["sellers"] + counts["fit_memory"]
    )
    counts["expected_min_edges"] = (
        counts["returned_edges"] + counts["kept_edges"] + counts["variants"] + counts["fit_memory"]
    )
    return counts


def sync_neo4j_from_sqlite(conn: sqlite3.Connection, client: Neo4jClient) -> dict:
    if not client.status.available:
        return {
            "available": False,
            "reason": client.status.reason,
            "projection_summary": build_projection_summary(conn),
        }

    for constraint in CONSTRAINTS:
        client.run_write(constraint)

    client.run_write("MATCH (n) DETACH DELETE n")
    _sync_buyers(conn, client)
    _sync_catalog(conn, client)
    _sync_fit_memory(conn, client)
    _sync_outcomes(conn, client)
    _sync_offer_facts(conn, client)
    return {
        "available": True,
        "projection_summary": build_projection_summary(conn),
    }


def _sync_buyers(conn: sqlite3.Connection, client: Neo4jClient) -> None:
    for row in conn.execute("SELECT * FROM buyers"):
        client.run_write(
            "MERGE (:Buyer {buyer_id: $buyer_id, display_name: $display_name, language: $language})",
            dict(row),
        )


def _sync_catalog(conn: sqlite3.Connection, client: Neo4jClient) -> None:
    for row in conn.execute("SELECT * FROM sellers"):
        client.run_write("MERGE (:Seller {seller_id: $seller_id, name: $name})", dict(row))
    for row in conn.execute("SELECT * FROM products"):
        data = dict(row)
        client.run_write(
            """
            MERGE (p:Product {product_id: $product_id, title: $title, category: $category})
            MERGE (s:Seller {seller_id: $seller_id})
            MERGE (p)-[:SOLD_BY]->(s)
            """,
            data,
        )
    for row in conn.execute("SELECT * FROM variants"):
        data = dict(row)
        client.run_write(
            """
            MATCH (p:Product {product_id: $product_id})
            MERGE (v:Variant {variant_id: $variant_id, size: $size, current_price: $current_price})
            MERGE (p)-[:HAS_VARIANT]->(v)
            """,
            data,
        )


def _sync_fit_memory(conn: sqlite3.Connection, client: Neo4jClient) -> None:
    for row in conn.execute("SELECT * FROM fit_memory"):
        data = dict(row)
        client.run_write(
            """
            MATCH (b:Buyer {buyer_id: $buyer_id})
            MERGE (m:FitMemory {memory_id: $memory_id, category: $category, retained_size: $retained_size, fact_id: $fact_id})
            MERGE (b)-[:HAS_FIT_MEMORY {category: $category, preferred_fit: $preferred_fit, fact_id: $fact_id}]->(m)
            WITH m
            MATCH (v:Variant {variant_id: $anchor_variant_id})
            MERGE (m)-[:MATCHES_CANDIDATE_SIZE {recommended_size: $retained_size, confidence: $confidence, fact_id: $fact_id}]->(v)
            """,
            data,
        )


def _sync_outcomes(conn: sqlite3.Connection, client: Neo4jClient) -> None:
    rows = conn.execute(
        """
        SELECT buyer_id, variant_id, status, return_reason, order_id, fact_id, created_at
        FROM order_outcomes
        WHERE status IN ('delivered_kept', 'returned')
        """
    ).fetchall()
    for row in rows:
        data = dict(row)
        relationship = "KEPT" if row["status"] == "delivered_kept" else "RETURNED"
        client.run_write(
            f"""
            MERGE (b:Buyer {{buyer_id: $buyer_id}})
            MERGE (v:Variant {{variant_id: $variant_id}})
            MERGE (b)-[:{relationship} {{order_id: $order_id, fact_id: $fact_id, reason: $return_reason, timestamp: $created_at}}]->(v)
            """,
            data,
        )


def _sync_offer_facts(conn: sqlite3.Connection, client: Neo4jClient) -> None:
    for row in conn.execute("SELECT * FROM price_events"):
        data = dict(row)
        client.run_write(
            """
            MATCH (v:Variant {variant_id: $variant_id})
            MERGE (p:PriceEvent {price_event_id: $price_event_id, price: $price, fact_id: $fact_id})
            MERGE (v)-[:HAS_PRICE_EVENT {fact_id: $fact_id}]->(p)
            """,
            data,
        )
    for row in conn.execute("SELECT * FROM campaigns"):
        data = dict(row)
        client.run_write(
            """
            MATCH (v:Variant {variant_id: $variant_id})
            MERGE (c:Campaign {campaign_id: $campaign_id, timer_reset_count: $timer_reset_count, fact_id: $fact_id})
            MERGE (v)-[:IN_CAMPAIGN {fact_id: $fact_id}]->(c)
            """,
            data,
        )
    for row in conn.execute("SELECT * FROM inventory_snapshots"):
        data = dict(row)
        client.run_write(
            """
            MATCH (v:Variant {variant_id: $variant_id})
            MERGE (i:InventorySnapshot {snapshot_id: $snapshot_id, available_to_promise: $available_to_promise, fact_id: $fact_id})
            MERGE (v)-[:HAS_INVENTORY {fact_id: $fact_id}]->(i)
            """,
            data,
        )

