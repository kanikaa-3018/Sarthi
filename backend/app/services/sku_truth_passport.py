from __future__ import annotations

import sqlite3

from app.repositories.catalog import get_product, get_variant
from app.services.data_contracts import build_product_trust_state
from app.services.evidence_aggregator import build_variant_evidence, evidence_conflicts, top_return_reason
from app.services.fit_predictor import predict_fit
from app.services.offer_verifier import verify_offer
from app.services.product_detail import ISSUE_COPY
from app.services.proof_requests import build_proof_coverage, list_open_proof_requests_for_product
from app.services.review_retriever import retrieve_review_passages


def build_sku_truth_passport(
    conn: sqlite3.Connection,
    buyer_id: str,
    variant_id: str,
    preferred_fit: str = "comfort",
) -> dict:
    variant = get_variant(conn, variant_id)
    if not variant:
        raise ValueError(f"Unknown variant_id: {variant_id}")
    product = get_product(conn, variant["product_id"])
    if not product:
        raise ValueError(f"Unknown product for variant_id: {variant_id}")

    evidence = build_variant_evidence(conn, variant_id)
    fit = predict_fit(conn, buyer_id, variant_id, preferred_fit)
    offer = verify_offer(conn, variant_id)
    issue = _avoidable_issue(conn, variant_id)
    conflicts = evidence_conflicts(conn, variant_id)
    trust_state = build_product_trust_state(conn, product, evidence, conflicts, issue)
    proof_coverage = build_proof_coverage(conn, product["product_id"], variant_id)
    evidence_gaps = [
        _gap_from_coverage(attribute, coverage)
        for attribute, coverage in proof_coverage.items()
        if not coverage["sufficient"]
    ]
    review_evidence = {
        "fabric": retrieve_review_passages(conn, product["product_id"], "fabric"),
        "color": retrieve_review_passages(conn, product["product_id"], "color"),
    }
    open_requests = list_open_proof_requests_for_product(conn, product["product_id"])
    fact_ids = _unique(
        evidence["fact_ids"]
        + fit["fact_ids"]
        + offer["fact_ids"]
        + (issue["fact_ids"] if issue else [])
        + [fact_id for coverage in proof_coverage.values() for fact_id in coverage["fact_ids"]]
        + [request["fact_id"] for request in open_requests]
    )

    return {
        "buyer_id": buyer_id,
        "product": product,
        "variant": variant,
        "truth_summary": {
            "headline": trust_state["headline"],
            "status": trust_state["status"],
            "confidence": trust_state["confidence"],
            "can_recommend": trust_state["can_recommend"],
            "buyer_guidance": trust_state["buyer_guidance"],
        },
        "outcome_evidence": evidence,
        "fit": fit,
        "avoidable_issue": issue,
        "offer_truth": offer,
        "review_evidence": review_evidence,
        "proof_coverage": proof_coverage,
        "evidence_gaps": evidence_gaps,
        "open_proof_requests": open_requests,
        "conflicts": conflicts,
        "trust_state": trust_state,
        "fact_ids": fact_ids[:24],
    }


def _avoidable_issue(conn: sqlite3.Connection, variant_id: str) -> dict | None:
    issue = top_return_reason(conn, variant_id)
    if not issue:
        return None
    copy = ISSUE_COPY.get(issue["return_reason"], {"title": issue["return_reason"], "action": "Review product evidence."})
    return {
        "reason": issue["return_reason"],
        "title": copy["title"],
        "action": copy["action"],
        "count": issue["count"],
        "fact_ids": issue["fact_ids"][:4],
    }


def _gap_from_coverage(attribute: str, coverage: dict) -> dict:
    return {
        "attribute": attribute,
        "severity": "high" if coverage["evidence_count"] == 0 else "medium",
        "title": f"{attribute.replace('_', ' ').title()} evidence is incomplete",
        "summary": coverage["source_summary"],
        "recommended_proof_type": coverage["recommended_proof_type"],
        "fact_ids": coverage["fact_ids"],
    }


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))
