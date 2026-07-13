from __future__ import annotations

from datetime import datetime, timezone
import json
import sqlite3


PRODUCT_DETAIL_SOURCE_IDS = [
    "catalog",
    "orders",
    "returns",
    "reviews",
    "pricing",
    "campaigns",
    "inventory",
    "seller_verification",
]

SELLER_PANEL_SOURCE_IDS = [
    "catalog",
    "orders",
    "returns",
    "reviews",
    "seller_verification",
]


def list_data_sources(conn: sqlite3.Connection, source_ids: list[str] | None = None) -> list[dict]:
    if source_ids:
        placeholders = ",".join("?" for _ in source_ids)
        rows = conn.execute(
            f"""
            SELECT *
            FROM data_sources
            WHERE source_id IN ({placeholders})
            ORDER BY source_id
            """,
            source_ids,
        ).fetchall()
    else:
        rows = conn.execute("SELECT * FROM data_sources ORDER BY source_id").fetchall()
    return [_source_with_freshness(dict(row)) for row in rows]


def source_health_summary(sources: list[dict]) -> dict:
    if not sources:
        return {
            "overall_status": "unavailable",
            "blocking": True,
            "sources": [],
        }
    statuses = {source["effective_status"] for source in sources}
    if "unavailable" in statuses:
        overall = "unavailable"
    elif "stale" in statuses:
        overall = "stale"
    elif "degraded" in statuses:
        overall = "degraded"
    else:
        overall = "operational"
    return {
        "overall_status": overall,
        "blocking": overall in {"unavailable", "stale"},
        "sources": sources,
    }


def seller_verification(conn: sqlite3.Connection, seller_id: str) -> dict:
    row = conn.execute(
        """
        SELECT sp.*, s.name AS seller_name
        FROM seller_profiles sp
        JOIN sellers s ON s.seller_id = sp.seller_id
        WHERE sp.seller_id = ?
        """,
        (seller_id,),
    ).fetchone()
    if not row:
        return {
            "seller_id": seller_id,
            "seller_name": None,
            "verification_status": "restricted",
            "gst_status": "unknown",
            "kyc_status": "unknown",
            "pickup_pincode": None,
            "categories": [],
            "support_contact": None,
            "data_access_level": "restricted",
            "restricted_reason": "Seller verification profile is missing.",
            "last_verified_at": None,
        }
    data = dict(row)
    data["categories"] = json.loads(data.pop("categories_json"))
    return data


def build_product_trust_state(
    conn: sqlite3.Connection,
    product: dict,
    evidence: dict,
    conflicts: list[dict],
    avoidable_issue: dict | None,
) -> dict:
    data_health = source_health_summary(list_data_sources(conn, PRODUCT_DETAIL_SOURCE_IDS))
    verification = seller_verification(conn, product["seller_id"])
    missing_data: list[str] = []
    reasons: list[str] = []

    if evidence["delivered_orders_90d"] == 0:
        missing_data.append("No delivered outcome denominator for this exact variant yet.")
    if not evidence["fact_ids"]:
        missing_data.append("No order outcome facts are available for this variant.")
    if data_health["overall_status"] != "operational":
        reasons.append(f"One or more source systems are {data_health['overall_status']}.")
    if verification["verification_status"] != "verified":
        reasons.append(f"Seller verification is {verification['verification_status']}.")
    if avoidable_issue:
        reasons.append(avoidable_issue["title"])
    if conflicts:
        reasons.append(conflicts[0]["summary"])

    status = "ready_to_buy"
    confidence = "high" if evidence["evidence_strength"] == "strong" else "medium"
    can_recommend = True
    headline = "Good evidence available"
    summary = "Sarthi has enough fresh marketplace evidence to explain this recommendation."
    buyer_guidance = "You can compare seller options and proceed after checking size and offer truth."

    if verification["verification_status"] == "restricted":
        status = "seller_restricted"
        confidence = "blocked"
        can_recommend = False
        headline = "Seller verification issue"
        summary = "This seller is restricted or missing verification, so Sarthi will not present this as a safe recommendation."
        buyer_guidance = "Choose another seller listing until the seller account is cleared."
    elif data_health["blocking"]:
        status = "data_degraded"
        confidence = "low"
        can_recommend = False
        headline = "Fresh evidence unavailable"
        summary = "Some source systems are stale or unavailable, so Sarthi is lowering confidence instead of making a strong claim."
        buyer_guidance = "Use catalog details only and avoid relying on return-rate or offer claims right now."
    elif evidence["evidence_strength"] == "unknown":
        status = "limited_evidence"
        confidence = "low"
        can_recommend = False
        headline = "Not enough buyer outcome data yet"
        summary = "This listing does not have enough delivered-order evidence for strong kept-order guidance."
        buyer_guidance = "Check reviews, seller status, and measurements before ordering."
    elif conflicts:
        status = "conflicting_evidence"
        confidence = "medium"
        can_recommend = True
        headline = "Evidence has a conflict"
        summary = "Some reviews and return outcomes disagree, so Sarthi shows the conflict instead of hiding it."
        buyer_guidance = conflicts[0]["action"]
    elif verification["verification_status"] == "pending":
        status = "seller_verification_pending"
        confidence = "medium"
        can_recommend = True
        headline = "Seller verification pending"
        summary = "The listing has product evidence, but the seller verification profile is still under review."
        buyer_guidance = "Compare with verified sellers before placing a COD order."
    elif avoidable_issue:
        status = "specific_caution"
        confidence = "medium"
        can_recommend = True
        headline = "One issue to check"
        summary = "Sarthi found one avoidable issue for this exact variant."
        buyer_guidance = avoidable_issue["action"]

    return {
        "status": status,
        "confidence": confidence,
        "can_recommend": can_recommend,
        "headline": headline,
        "summary": summary,
        "buyer_guidance": buyer_guidance,
        "reasons": reasons[:4],
        "missing_data": missing_data,
        "data_freshness": data_health,
        "seller_verification": verification,
    }


def _source_with_freshness(source: dict) -> dict:
    hours_since_sync = _hours_since(source["last_synced_at"])
    source["hours_since_sync"] = round(hours_since_sync, 2)
    source["effective_status"] = source["status"]
    source["fresh"] = source["status"] == "operational"
    return source


def _hours_since(value: str) -> float:
    try:
        synced = datetime.fromisoformat(value)
        if synced.tzinfo is None:
            synced = synced.replace(tzinfo=timezone.utc)
        return max(0.0, (datetime.now(synced.tzinfo) - synced).total_seconds() / 3600)
    except ValueError:
        return 999999.0
