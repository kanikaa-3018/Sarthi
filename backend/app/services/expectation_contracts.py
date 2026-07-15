from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import sqlite3
from uuid import uuid4

from app.repositories.catalog import get_variant
from app.services.sku_truth_passport import build_sku_truth_passport


IST = timezone(timedelta(hours=5, minutes=30))

BROKEN_DIMENSION_BY_REASON = {
    "too_small": "fit",
    "too_large": "fit",
    "color_different": "color",
    "fabric_different": "fabric",
    "damaged": "packaging",
}


def create_expectation_contract(
    conn: sqlite3.Connection,
    buyer_id: str,
    variant_id: str,
    preferred_fit: str = "comfort",
) -> dict:
    passport = build_sku_truth_passport(conn, buyer_id, variant_id, preferred_fit)
    variant = passport["variant"]
    product = passport["product"]
    now = datetime.now(IST).isoformat()
    contract_id = f"contract_{uuid4().hex[:10]}"
    fact_id = f"fact_{contract_id}"
    contract = _build_contract_payload(passport)

    conn.execute(
        """
        INSERT INTO expectation_contracts
        (contract_id, buyer_id, product_id, variant_id, status, contract_json, created_at,
         completed_at, outcome_order_id, broken_dimension, fact_id)
        VALUES (?, ?, ?, ?, 'active', ?, ?, NULL, NULL, NULL, ?)
        """,
        (
            contract_id,
            buyer_id,
            product["product_id"],
            variant["variant_id"],
            json.dumps(contract),
            now,
            fact_id,
        ),
    )
    conn.execute(
        """
        INSERT INTO fact_records
        (fact_id, source_table, source_id, source_type, summary, created_at, expires_at)
        VALUES (?, 'expectation_contracts', ?, 'pre_purchase_expectation_contract', ?, ?, NULL)
        """,
        (
            fact_id,
            contract_id,
            f"Buyer accepted expectation contract for {variant['variant_id']}",
            now,
        ),
    )
    conn.commit()
    row = conn.execute("SELECT * FROM expectation_contracts WHERE contract_id = ?", (contract_id,)).fetchone()
    return _contract_public(dict(row))


def get_expectation_contract(conn: sqlite3.Connection, contract_id: str, buyer_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT *
        FROM expectation_contracts
        WHERE contract_id = ? AND buyer_id = ?
        """,
        (contract_id, buyer_id),
    ).fetchone()
    return _contract_public(dict(row)) if row else None


def complete_expectation_contract(
    conn: sqlite3.Connection,
    contract_id: str,
    buyer_id: str,
    outcome_order_id: str,
    status: str,
    return_reason: str | None,
) -> dict:
    row = conn.execute(
        """
        SELECT *
        FROM expectation_contracts
        WHERE contract_id = ? AND buyer_id = ?
        """,
        (contract_id, buyer_id),
    ).fetchone()
    if not row:
        raise ValueError("Expectation contract not found")
    if row["status"] != "active":
        raise ValueError("Expectation contract is already completed")

    broken_dimension = None
    contract_status = "kept"
    if status in {"returned", "exchanged"}:
        contract_status = "broken"
        broken_dimension = BROKEN_DIMENSION_BY_REASON.get(return_reason or "", "unknown")
    elif status == "rto":
        contract_status = "broken"
        broken_dimension = "delivery"

    completed_at = datetime.now(IST).isoformat()
    conn.execute(
        """
        UPDATE expectation_contracts
        SET status = ?,
            completed_at = ?,
            outcome_order_id = ?,
            broken_dimension = ?
        WHERE contract_id = ?
        """,
        (contract_status, completed_at, outcome_order_id, broken_dimension, contract_id),
    )
    updated = conn.execute("SELECT * FROM expectation_contracts WHERE contract_id = ?", (contract_id,)).fetchone()
    return _contract_public(dict(updated))


def _build_contract_payload(passport: dict) -> dict:
    evidence = passport["outcome_evidence"]
    fit = passport["fit"]
    offer = passport["offer_truth"]
    proof_coverage = passport["proof_coverage"]
    avoidable_issue = passport["avoidable_issue"]
    product = passport["product"]

    items = [
        {
            "dimension": "fit",
            "claim": f"Recommended size is {fit['recommended_size']}",
            "confidence": fit["confidence"],
            "buyer_action": "Choose this size or review measurements before ordering.",
            "fact_ids": fit["fact_ids"],
        },
        {
            "dimension": "fabric",
            "claim": f"Fabric is listed as {product['fabric']}",
            "confidence": "medium" if proof_coverage["fabric"]["sufficient"] else "low",
            "buyer_action": "Ask for fabric proof if thickness or transparency matters.",
            "fact_ids": proof_coverage["fabric"]["fact_ids"],
        },
        {
            "dimension": "color",
            "claim": _color_claim(avoidable_issue),
            "confidence": "medium" if proof_coverage["color"]["sufficient"] else "low",
            "buyer_action": "Check daylight color proof before ordering.",
            "fact_ids": proof_coverage["color"]["fact_ids"] + (avoidable_issue["fact_ids"] if avoidable_issue and avoidable_issue["reason"] == "color_different" else []),
        },
        {
            "dimension": "dispatch",
            "claim": f"Seller median dispatch is {evidence['median_dispatch_hours']} hours",
            "confidence": evidence["evidence_strength"],
            "buyer_action": "Use this as a reliability signal, not a guaranteed delivery time.",
            "fact_ids": evidence["fact_ids"],
        },
        {
            "dimension": "offer",
            "claim": offer["message"],
            "confidence": "medium" if offer["status"] != "not_enough_history" else "low",
            "buyer_action": "Do not rush unless the offer is verified.",
            "fact_ids": offer["fact_ids"],
        },
    ]
    return {
        "title": "Expectation Contract",
        "summary": "A fact-backed snapshot of what the buyer is relying on before ordering.",
        "items": items,
        "fact_ids": _unique([fact_id for item in items for fact_id in item["fact_ids"]]),
        "privacy": {
            "buyer_visible": True,
            "seller_visible_as_aggregate_only": True,
            "raw_private_memory_exposed": False,
        },
    }


def _color_claim(avoidable_issue: dict | None) -> str:
    if avoidable_issue and avoidable_issue["reason"] == "color_different":
        return avoidable_issue["title"]
    return "Color evidence was checked from available reviews and outcomes"


def _contract_public(row: dict) -> dict:
    contract = json.loads(row["contract_json"])
    return {
        "contract_id": row["contract_id"],
        "buyer_id": row["buyer_id"],
        "product_id": row["product_id"],
        "variant_id": row["variant_id"],
        "status": row["status"],
        "contract": contract,
        "created_at": row["created_at"],
        "completed_at": row["completed_at"],
        "outcome_order_id": row["outcome_order_id"],
        "broken_dimension": row["broken_dimension"],
        "fact_id": row["fact_id"],
    }


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))
