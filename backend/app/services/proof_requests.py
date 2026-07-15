from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sqlite3
from uuid import uuid4

from app.repositories.catalog import get_product, get_variant


IST = timezone(timedelta(hours=5, minutes=30))

ATTRIBUTE_KEYWORDS = {
    "transparency": ["transparent", "see through", "see-through", "andar dikhe", "patla", "thin"],
    "fabric": ["fabric", "kapda", "cotton", "material", "summer", "soft", "rough"],
    "color": ["color", "colour", "rang", "darker", "light", "photo"],
    "size": ["size", "fit", "tight", "loose", "chhoti", "badi", "measurement", "chest"],
    "packaging": ["damage", "damaged", "packaging", "torn", "broken"],
    "offer": ["offer", "deal", "discount", "timer", "rush", "stock", "left"],
}

PROOF_TYPE_BY_ATTRIBUTE = {
    "transparency": "fabric_closeup",
    "fabric": "fabric_closeup",
    "color": "daylight_photo",
    "size": "measurement_chart",
    "packaging": "packaging_photo",
    "offer": "seller_note",
}

BROKEN_ATTRIBUTE_BY_DIMENSION = {
    "fit": "size",
    "fabric": "fabric",
    "color": "color",
    "packaging": "packaging",
    "delivery": "packaging",
    "offer": "offer",
}


def infer_evidence_attribute(question: str) -> str | None:
    normalized = question.lower()
    for attribute, keywords in ATTRIBUTE_KEYWORDS.items():
        if any(keyword in normalized for keyword in keywords):
            return attribute
    return None


def build_proof_coverage(conn: sqlite3.Connection, product_id: str, variant_id: str | None = None) -> dict:
    product = get_product(conn, product_id)
    if not product:
        raise ValueError(f"Unknown product_id: {product_id}")

    coverage = {
        "fabric": _review_asset_coverage(conn, product_id, "fabric", ["fabric", "transparency"]),
        "transparency": _review_asset_coverage(conn, product_id, "transparency", ["transparency", "fabric"]),
        "color": _review_asset_coverage(conn, product_id, "color", ["color"]),
        "size": _size_coverage(conn, product_id, variant_id),
        "packaging": _packaging_coverage(conn, product_id, variant_id),
        "offer": _offer_coverage(conn, product_id, variant_id),
    }
    for attribute, item in coverage.items():
        item["attribute"] = attribute
        item["recommended_proof_type"] = PROOF_TYPE_BY_ATTRIBUTE[attribute]
    return coverage


def evidence_gap_for_question(
    conn: sqlite3.Connection,
    product_id: str,
    variant_id: str | None,
    question: str,
) -> dict | None:
    attribute = infer_evidence_attribute(question)
    if not attribute:
        return None
    coverage = build_proof_coverage(conn, product_id, variant_id)
    item = coverage.get(attribute)
    if item and item["sufficient"]:
        return None
    return {
        "attribute": attribute,
        "title": _gap_title(attribute),
        "summary": _gap_summary(attribute),
        "recommended_proof_type": PROOF_TYPE_BY_ATTRIBUTE[attribute],
        "coverage": item,
    }


def create_or_increment_proof_request(
    conn: sqlite3.Connection,
    buyer_id: str,
    product_id: str,
    variant_id: str | None,
    attribute: str,
    buyer_question: str,
) -> dict:
    product = get_product(conn, product_id)
    if not product:
        raise ValueError(f"Unknown product_id: {product_id}")
    if variant_id:
        variant = get_variant(conn, variant_id)
        if not variant or variant["product_id"] != product_id:
            raise ValueError("variant_id does not belong to product_id")
    buyer = conn.execute("SELECT buyer_id FROM buyers WHERE buyer_id = ?", (buyer_id,)).fetchone()
    if not buyer:
        raise ValueError(f"Unknown buyer_id: {buyer_id}")

    now = datetime.now(IST).isoformat()
    existing = conn.execute(
        """
        SELECT *
        FROM proof_requests
        WHERE product_id = ? AND seller_id = ? AND attribute = ? AND status = 'open'
        LIMIT 1
        """,
        (product_id, product["seller_id"], attribute),
    ).fetchone()
    if existing:
        conn.execute(
            """
            UPDATE proof_requests
            SET request_count = request_count + 1,
                updated_at = ?,
                buyer_question = ?
            WHERE request_id = ?
            """,
            (now, buyer_question, existing["request_id"]),
        )
        row = conn.execute("SELECT * FROM proof_requests WHERE request_id = ?", (existing["request_id"],)).fetchone()
        return _proof_request_public(dict(row), include_buyer=False)

    request_id = f"proof_req_{uuid4().hex[:10]}"
    fact_id = f"fact_{request_id}"
    conn.execute(
        """
        INSERT INTO proof_requests
        (request_id, buyer_id, seller_id, product_id, variant_id, attribute, buyer_question, status,
         request_count, created_at, updated_at, resolved_at, resolution_proof_id, fact_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?, NULL, NULL, ?)
        """,
        (
            request_id,
            buyer_id,
            product["seller_id"],
            product_id,
            variant_id,
            attribute,
            buyer_question,
            now,
            now,
            fact_id,
        ),
    )
    _insert_fact(
        conn,
        fact_id,
        "proof_requests",
        request_id,
        "buyer_evidence_gap",
        f"Buyer evidence request for {attribute} proof on {product_id}",
        now,
    )
    row = conn.execute("SELECT * FROM proof_requests WHERE request_id = ?", (request_id,)).fetchone()
    return _proof_request_public(dict(row), include_buyer=False)


def submit_seller_evidence_asset(
    conn: sqlite3.Connection,
    seller_id: str,
    product_id: str,
    attribute: str,
    proof_type: str,
    title: str,
    description: str,
    asset_url: str,
) -> dict:
    product = get_product(conn, product_id)
    if not product:
        raise ValueError(f"Unknown product_id: {product_id}")
    if product["seller_id"] != seller_id:
        raise ValueError("Cannot submit evidence for another seller's product")
    if proof_type not in {"daylight_photo", "fabric_closeup", "measurement_chart", "packaging_photo", "seller_note"}:
        raise ValueError(f"Unsupported proof_type: {proof_type}")
    if attribute not in ATTRIBUTE_KEYWORDS:
        raise ValueError(f"Unsupported attribute: {attribute}")
    if not asset_url.strip():
        raise ValueError("Evidence asset URL or storage reference is required")
    if not title.strip() or not description.strip():
        raise ValueError("Evidence title and description are required")

    now = datetime.now(IST).isoformat()
    proof_id = f"proof_{uuid4().hex[:10]}"
    fact_id = f"fact_{proof_id}"
    conn.execute(
        """
        INSERT INTO seller_evidence_assets
        (proof_id, seller_id, product_id, attribute, proof_type, title, description, asset_url,
         status, created_at, reviewed_at, fact_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified', ?, ?, ?)
        """,
        (proof_id, seller_id, product_id, attribute, proof_type, title, description, asset_url, now, now, fact_id),
    )
    _insert_fact(
        conn,
        fact_id,
        "seller_evidence_assets",
        proof_id,
        "seller_submitted_proof",
        f"Seller submitted verified {proof_type} for {attribute} on {product_id}",
        now,
    )
    resolved = conn.execute(
        """
        UPDATE proof_requests
        SET status = 'resolved',
            updated_at = ?,
            resolved_at = ?,
            resolution_proof_id = ?
        WHERE seller_id = ?
          AND product_id = ?
          AND attribute = ?
          AND status = 'open'
        """,
        (now, now, proof_id, seller_id, product_id, attribute),
    ).rowcount
    return {
        "proof_id": proof_id,
        "seller_id": seller_id,
        "product_id": product_id,
        "attribute": attribute,
        "proof_type": proof_type,
        "status": "verified",
        "fact_id": fact_id,
        "resolved_open_requests": resolved,
    }


def build_seller_evidence_coach(conn: sqlite3.Connection, seller_id: str) -> dict:
    seller = conn.execute("SELECT * FROM sellers WHERE seller_id = ?", (seller_id,)).fetchone()
    if not seller:
        raise ValueError(f"Unknown seller_id: {seller_id}")

    rows = conn.execute(
        """
        SELECT
          pr.product_id,
          p.title,
          pr.attribute,
          COUNT(*) AS open_threads,
          SUM(pr.request_count) AS buyer_demand,
          MIN(pr.created_at) AS first_seen_at,
          MAX(pr.updated_at) AS last_seen_at,
          GROUP_CONCAT(pr.fact_id) AS fact_ids
        FROM proof_requests pr
        JOIN products p ON p.product_id = pr.product_id
        WHERE pr.seller_id = ? AND pr.status = 'open'
        GROUP BY pr.product_id, p.title, pr.attribute
        ORDER BY buyer_demand DESC, last_seen_at DESC
        """,
        (seller_id,),
    ).fetchall()
    tasks = []
    for row in rows:
        fact_ids = row["fact_ids"].split(",") if row["fact_ids"] else []
        tasks.append(
            {
                "type": "missing_buyer_proof",
                "priority": _priority_for_demand(row["buyer_demand"]),
                "product_id": row["product_id"],
                "product_title": row["title"],
                "attribute": row["attribute"],
                "title": f"Add {row['attribute']} proof",
                "rationale": f"{row['buyer_demand']} buyer question(s) are waiting for clearer {row['attribute']} evidence.",
                "recommended_proof_type": PROOF_TYPE_BY_ATTRIBUTE.get(row["attribute"], "seller_note"),
                "buyer_demand": row["buyer_demand"],
                "first_seen_at": row["first_seen_at"],
                "last_seen_at": row["last_seen_at"],
                "fact_ids": fact_ids[:5],
            }
        )

    broken_rows = conn.execute(
        """
        SELECT
          ec.product_id,
          p.title,
          ec.broken_dimension,
          COUNT(*) AS buyer_demand,
          MIN(ec.completed_at) AS first_seen_at,
          MAX(ec.completed_at) AS last_seen_at,
          GROUP_CONCAT(ec.fact_id) AS fact_ids
        FROM expectation_contracts ec
        JOIN products p ON p.product_id = ec.product_id
        WHERE p.seller_id = ?
          AND ec.status = 'broken'
          AND ec.completed_at IS NOT NULL
        GROUP BY ec.product_id, p.title, ec.broken_dimension
        ORDER BY buyer_demand DESC, last_seen_at DESC
        """,
        (seller_id,),
    ).fetchall()
    for row in broken_rows:
        attribute = BROKEN_ATTRIBUTE_BY_DIMENSION.get(row["broken_dimension"] or "", "fabric")
        demand = int(row["buyer_demand"] or 0)
        fact_ids = row["fact_ids"].split(",") if row["fact_ids"] else []
        resolved_by_recent_proof = conn.execute(
            """
            SELECT proof_id
            FROM seller_evidence_assets
            WHERE seller_id = ?
              AND product_id = ?
              AND attribute = ?
              AND status = 'verified'
              AND created_at >= ?
            LIMIT 1
            """,
            (seller_id, row["product_id"], attribute, row["last_seen_at"]),
        ).fetchone()
        if resolved_by_recent_proof:
            continue
        tasks.append(
            {
                "type": "broken_expectation",
                "priority": _priority_for_demand(demand),
                "product_id": row["product_id"],
                "product_title": row["title"],
                "attribute": attribute,
                "title": f"Repair {attribute} expectation gap",
                "rationale": (
                    f"{demand} locked expectation(s) broke on {row['broken_dimension']}. "
                    "Correct the listing or add stronger proof before the same doubt repeats."
                ),
                "recommended_proof_type": PROOF_TYPE_BY_ATTRIBUTE.get(attribute, "seller_note"),
                "buyer_demand": demand,
                "first_seen_at": row["first_seen_at"],
                "last_seen_at": row["last_seen_at"],
                "fact_ids": fact_ids[:5],
            }
        )

    tasks.sort(
        key=lambda task: (
            _priority_score(task["priority"]),
            int(task["buyer_demand"] or 0),
            task["last_seen_at"] or "",
        ),
        reverse=True,
    )

    resolved_count = conn.execute(
        "SELECT COUNT(*) AS count FROM proof_requests WHERE seller_id = ? AND status = 'resolved'",
        (seller_id,),
    ).fetchone()["count"]
    return {
        "seller_id": seller_id,
        "open_task_count": len(tasks),
        "resolved_request_count": resolved_count,
        "tasks": tasks,
        "privacy_guard": {
            "safe_for_seller": True,
            "summary": "Buyer identity and personal fit memory are not shown. Seller sees aggregate evidence gaps only.",
        },
    }


def list_open_proof_requests_for_product(conn: sqlite3.Connection, product_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT request_id, seller_id, product_id, variant_id, attribute, status, request_count,
               created_at, updated_at, fact_id
        FROM proof_requests
        WHERE product_id = ? AND status = 'open'
        ORDER BY request_count DESC, updated_at DESC
        """,
        (product_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _review_asset_coverage(
    conn: sqlite3.Connection,
    product_id: str,
    review_attribute: str,
    asset_attributes: list[str],
) -> dict:
    review_count = conn.execute(
        """
        SELECT COUNT(*) AS count, GROUP_CONCAT(fact_id) AS fact_ids
        FROM reviews
        WHERE product_id = ? AND attribute = ?
        """,
        (product_id, review_attribute),
    ).fetchone()
    placeholders = ",".join("?" for _ in asset_attributes)
    assets = conn.execute(
        f"""
        SELECT COUNT(*) AS count, GROUP_CONCAT(fact_id) AS fact_ids
        FROM seller_evidence_assets
        WHERE product_id = ?
          AND attribute IN ({placeholders})
          AND status = 'verified'
        """,
        [product_id, *asset_attributes],
    ).fetchone()
    count = int(review_count["count"] or 0) + int(assets["count"] or 0)
    fact_ids = _split_fact_ids(review_count["fact_ids"]) + _split_fact_ids(assets["fact_ids"])
    return {
        "sufficient": count >= 2,
        "evidence_count": count,
        "source_summary": f"{review_count['count'] or 0} review(s), {assets['count'] or 0} seller proof asset(s)",
        "fact_ids": fact_ids[:6],
    }


def _size_coverage(conn: sqlite3.Connection, product_id: str, variant_id: str | None) -> dict:
    params: list[object] = [product_id]
    where_variant = ""
    if variant_id:
        where_variant = "AND v.variant_id = ?"
        params.append(variant_id)
    row = conn.execute(
        f"""
        SELECT COUNT(*) AS count, GROUP_CONCAT(o.fact_id) AS fact_ids
        FROM order_outcomes o
        JOIN variants v ON v.variant_id = o.variant_id
        WHERE v.product_id = ?
          {where_variant}
          AND (o.status = 'delivered_kept' OR o.return_reason IN ('too_small', 'too_large'))
        """,
        params,
    ).fetchone()
    assets = conn.execute(
        """
        SELECT COUNT(*) AS count, GROUP_CONCAT(fact_id) AS fact_ids
        FROM seller_evidence_assets
        WHERE product_id = ? AND attribute = 'size' AND status = 'verified'
        """,
        (product_id,),
    ).fetchone()
    count = int(row["count"] or 0) + int(assets["count"] or 0)
    return {
        "sufficient": count >= 10 or int(assets["count"] or 0) > 0,
        "evidence_count": count,
        "source_summary": f"{row['count'] or 0} size outcome(s), {assets['count'] or 0} measurement proof asset(s)",
        "fact_ids": (_split_fact_ids(row["fact_ids"]) + _split_fact_ids(assets["fact_ids"]))[:6],
    }


def _packaging_coverage(conn: sqlite3.Connection, product_id: str, variant_id: str | None) -> dict:
    params: list[object] = [product_id]
    where_variant = ""
    if variant_id:
        where_variant = "AND v.variant_id = ?"
        params.append(variant_id)
    row = conn.execute(
        f"""
        SELECT COUNT(*) AS count, GROUP_CONCAT(o.fact_id) AS fact_ids
        FROM order_outcomes o
        JOIN variants v ON v.variant_id = o.variant_id
        WHERE v.product_id = ?
          {where_variant}
          AND o.return_reason = 'damaged'
        """,
        params,
    ).fetchone()
    assets = conn.execute(
        """
        SELECT COUNT(*) AS count, GROUP_CONCAT(fact_id) AS fact_ids
        FROM seller_evidence_assets
        WHERE product_id = ? AND attribute = 'packaging' AND status = 'verified'
        """,
        (product_id,),
    ).fetchone()
    count = int(row["count"] or 0) + int(assets["count"] or 0)
    return {
        "sufficient": int(row["count"] or 0) == 0 or int(assets["count"] or 0) > 0,
        "evidence_count": count,
        "source_summary": f"{row['count'] or 0} damage return(s), {assets['count'] or 0} packaging proof asset(s)",
        "fact_ids": (_split_fact_ids(row["fact_ids"]) + _split_fact_ids(assets["fact_ids"]))[:6],
    }


def _offer_coverage(conn: sqlite3.Connection, product_id: str, variant_id: str | None) -> dict:
    params: list[object] = [product_id]
    where_variant = ""
    if variant_id:
        where_variant = "AND v.variant_id = ?"
        params.append(variant_id)
    row = conn.execute(
        f"""
        SELECT
          COUNT(DISTINCT pe.price_event_id) AS price_events,
          COUNT(DISTINCT c.campaign_id) AS campaigns,
          COUNT(DISTINCT i.snapshot_id) AS inventory_snapshots,
          GROUP_CONCAT(DISTINCT pe.fact_id) AS price_fact_ids,
          GROUP_CONCAT(DISTINCT c.fact_id) AS campaign_fact_ids,
          GROUP_CONCAT(DISTINCT i.fact_id) AS inventory_fact_ids
        FROM variants v
        LEFT JOIN price_events pe ON pe.variant_id = v.variant_id
        LEFT JOIN campaigns c ON c.variant_id = v.variant_id
        LEFT JOIN inventory_snapshots i ON i.variant_id = v.variant_id
        WHERE v.product_id = ?
        {where_variant}
        """,
        params,
    ).fetchone()
    count = int(row["price_events"] or 0) + int(row["campaigns"] or 0) + int(row["inventory_snapshots"] or 0)
    return {
        "sufficient": int(row["price_events"] or 0) >= 3,
        "evidence_count": count,
        "source_summary": f"{row['price_events'] or 0} price event(s), {row['campaigns'] or 0} campaign(s), {row['inventory_snapshots'] or 0} inventory snapshot(s)",
        "fact_ids": (
            _split_fact_ids(row["price_fact_ids"])
            + _split_fact_ids(row["campaign_fact_ids"])
            + _split_fact_ids(row["inventory_fact_ids"])
        )[:6],
    }


def _insert_fact(
    conn: sqlite3.Connection,
    fact_id: str,
    source_table: str,
    source_id: str,
    source_type: str,
    summary: str,
    created_at: str,
) -> None:
    conn.execute(
        """
        INSERT INTO fact_records
        (fact_id, source_table, source_id, source_type, summary, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, NULL)
        """,
        (fact_id, source_table, source_id, source_type, summary, created_at),
    )


def _proof_request_public(row: dict, include_buyer: bool) -> dict:
    data = {
        "request_id": row["request_id"],
        "seller_id": row["seller_id"],
        "product_id": row["product_id"],
        "variant_id": row["variant_id"],
        "attribute": row["attribute"],
        "status": row["status"],
        "request_count": row["request_count"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "fact_id": row["fact_id"],
    }
    if include_buyer:
        data["buyer_id"] = row["buyer_id"]
        data["buyer_question"] = row["buyer_question"]
    return data


def _priority_for_demand(count: int) -> str:
    if count >= 5:
        return "high"
    if count >= 2:
        return "medium"
    return "low"


def _priority_score(priority: str) -> int:
    return {"high": 3, "medium": 2, "low": 1}.get(priority, 0)


def _gap_title(attribute: str) -> str:
    return {
        "transparency": "Fabric transparency proof is missing",
        "fabric": "Fabric proof is not strong enough",
        "color": "Real-light color proof is not strong enough",
        "size": "Size proof is not strong enough",
        "packaging": "Packaging proof is not strong enough",
        "offer": "Offer proof is not strong enough",
    }.get(attribute, "Product proof is missing")


def _gap_summary(attribute: str) -> str:
    return {
        "transparency": "The product does not have enough review or seller proof to answer transparency confidently.",
        "fabric": "The product does not have enough material proof to answer fabric questions confidently.",
        "color": "The product does not have enough daylight color evidence to answer color questions confidently.",
        "size": "The product does not have enough fit outcomes or measurement proof for a confident size claim.",
        "packaging": "The product does not have enough packaging proof to address damage concerns.",
        "offer": "The product does not have enough price, campaign, or inventory history for a strong urgency claim.",
    }.get(attribute, "The product does not have enough evidence for a confident answer.")


def _split_fact_ids(value: str | None) -> list[str]:
    if not value:
        return []
    return [item for item in value.split(",") if item]
