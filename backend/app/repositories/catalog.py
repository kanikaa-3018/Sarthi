from __future__ import annotations

import sqlite3


def list_feed(
    conn: sqlite3.Connection,
    limit: int = 48,
    offset: int = 0,
    category: str | None = None,
    query: str | None = None,
) -> dict:
    where: list[str] = []
    params: list[object] = []
    if category:
        where.append("p.category = ?")
        params.append(category)
    if query:
        like = f"%{query.lower()}%"
        where.append(
            """
            (
              lower(p.title) LIKE ?
              OR lower(p.fabric) LIKE ?
              OR lower(p.category) LIKE ?
              OR lower(s.name) LIKE ?
            )
            """
        )
        params.extend([like, like, like, like])
    where_sql = f"WHERE {' AND '.join(where)}" if where else ""
    total = conn.execute(
        f"""
        SELECT COUNT(*) AS count
        FROM products p
        JOIN sellers s ON s.seller_id = p.seller_id
        {where_sql}
        """,
        params,
    ).fetchone()["count"]
    rows = conn.execute(
        """
        SELECT p.*, s.name AS seller_name
        FROM products p
        JOIN sellers s ON s.seller_id = p.seller_id
        {where_sql}
        ORDER BY p.cluster_id, p.product_id
        LIMIT ? OFFSET ?
        """.format(where_sql=where_sql),
        [*params, limit, offset],
    ).fetchall()
    return {
        "products": [dict(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset,
        "has_more": offset + len(rows) < total,
    }


def get_product(conn: sqlite3.Connection, product_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT p.*, s.name AS seller_name, s.median_dispatch_hours
        FROM products p
        JOIN sellers s ON s.seller_id = p.seller_id
        WHERE p.product_id = ?
        """,
        (product_id,),
    ).fetchone()
    return dict(row) if row else None


def get_variants_for_product(conn: sqlite3.Connection, product_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM variants WHERE product_id = ? ORDER BY size",
        (product_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_cluster_products(conn: sqlite3.Connection, cluster_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT p.*, s.name AS seller_name, s.median_dispatch_hours
        FROM products p
        JOIN sellers s ON s.seller_id = p.seller_id
        WHERE p.cluster_id = ?
        ORDER BY p.product_id
        """,
        (cluster_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def get_variant(conn: sqlite3.Connection, variant_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT v.*, p.category, p.garment_type, p.fabric, p.color_family, p.seller_id
        FROM variants v
        JOIN products p ON p.product_id = v.product_id
        WHERE v.variant_id = ?
        """,
        (variant_id,),
    ).fetchone()
    return dict(row) if row else None
