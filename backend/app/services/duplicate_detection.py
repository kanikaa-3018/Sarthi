from __future__ import annotations

import sqlite3

from app.repositories.catalog import get_product


def find_near_duplicate_listings(conn: sqlite3.Connection, product_id: str) -> dict:
    product = get_product(conn, product_id)
    if not product:
        raise ValueError(f"Unknown product_id: {product_id}")
    rows = conn.execute(
        """
        SELECT p.*
        FROM products p
        WHERE p.cluster_id = ?
          AND p.category = ?
          AND p.garment_type = ?
        ORDER BY p.product_id
        """,
        (product["cluster_id"], product["category"], product["garment_type"]),
    ).fetchall()
    return {
        "cluster_id": product["cluster_id"],
        "base_product_id": product_id,
        "comparable_products": [dict(row) for row in rows],
    }


def candidate_variants_for_cluster(conn: sqlite3.Connection, cluster_id: str, size: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT v.variant_id
        FROM variants v
        JOIN products p ON p.product_id = v.product_id
        WHERE p.cluster_id = ? AND v.size = ?
        ORDER BY v.variant_id
        """,
        (cluster_id, size),
    ).fetchall()
    return [row["variant_id"] for row in rows]

