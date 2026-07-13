from __future__ import annotations

import sqlite3

from app.graph.graph_queries import sqlite_graph_path
from app.repositories.catalog import get_product, get_variant, get_variants_for_product
from app.services.data_contracts import build_product_trust_state
from app.services.evidence_aggregator import build_variant_evidence, evidence_conflicts, top_return_reason
from app.services.fit_predictor import predict_fit
from app.services.privacy import privacy_summary
from app.services.review_retriever import retrieve_review_passages


ISSUE_COPY = {
    "too_small": {
        "title": "Runs small for some buyers",
        "action": "Choose the safer size and check chest measurement.",
    },
    "too_large": {
        "title": "Runs large for some buyers",
        "action": "Check shoulder and length before ordering.",
    },
    "color_different": {
        "title": "Color may look different indoors",
        "action": "Check daylight photo before ordering.",
    },
    "fabric_different": {
        "title": "Fabric expectation mismatch",
        "action": "Read fabric reviews before ordering.",
    },
    "damaged": {
        "title": "Damage complaints seen",
        "action": "Consider the alternate listing if confidence is low.",
    },
}


def _variant_for_size(variants: list[dict], size: str) -> dict:
    for variant in variants:
        if variant["size"] == size:
            return variant
    return variants[0]


def build_product_detail(
    conn: sqlite3.Connection,
    buyer_id: str,
    product_id: str,
    preferred_fit: str = "comfort",
) -> dict:
    product = get_product(conn, product_id)
    if not product:
        raise ValueError(f"Unknown product_id: {product_id}")

    variants = get_variants_for_product(conn, product_id)
    if not variants:
        raise ValueError(f"No variants for product_id: {product_id}")

    initial_variant = _variant_for_size(variants, "XL")
    initial_fit = predict_fit(conn, buyer_id, initial_variant["variant_id"], preferred_fit)
    selected_variant = _variant_for_size(variants, initial_fit["recommended_size"])
    selected_variant_id = selected_variant["variant_id"]
    fit = predict_fit(conn, buyer_id, selected_variant_id, preferred_fit)
    evidence = build_variant_evidence(conn, selected_variant_id)
    issue = top_return_reason(conn, selected_variant_id)
    avoidable_issue = None
    if issue:
        copy = ISSUE_COPY.get(issue["return_reason"], {"title": issue["return_reason"], "action": "Review product evidence."})
        avoidable_issue = {
            "reason": issue["return_reason"],
            "title": copy["title"],
            "action": copy["action"],
            "count": issue["count"],
            "fact_ids": issue["fact_ids"][:3],
        }

    fabric_reviews = retrieve_review_passages(conn, product_id, "fabric")
    color_reviews = retrieve_review_passages(conn, product_id, "color")
    graph_paths = [
        sqlite_graph_path(conn, "buyer_fit_path", buyer_id=buyer_id, variant_id=selected_variant_id),
        sqlite_graph_path(conn, "variant_risk_path", variant_id=selected_variant_id),
    ]
    conflicts = evidence_conflicts(conn, selected_variant_id)
    trust_state = build_product_trust_state(conn, product, evidence, conflicts, avoidable_issue)
    return {
        "buyer_id": buyer_id,
        "product": product,
        "variants": variants,
        "selected_variant": selected_variant,
        "fit": fit,
        "evidence": evidence,
        "avoidable_issue": avoidable_issue,
        "review_evidence": {
            "fabric": fabric_reviews,
            "color": color_reviews,
        },
        "conflicts": conflicts,
        "trust_state": trust_state,
        "graph_paths": graph_paths,
        "privacy": privacy_summary(conn, buyer_id, product["category"]),
    }
