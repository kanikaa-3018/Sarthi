from __future__ import annotations

import sqlite3

from app.agent.orchestrator import detect_intents
from app.graph.graph_queries import sqlite_graph_path
from app.repositories.catalog import get_cluster_products, get_product, get_variant, get_variants_for_product
from app.repositories.traces import create_trace
from app.services.duplicate_detection import candidate_variants_for_cluster
from app.services.fit_predictor import predict_fit
from app.services.kept_order_ranker import rank_for_kept_order
from app.services.proof_requests import create_or_increment_proof_request, evidence_gap_for_question
from app.services.sku_truth_passport import build_sku_truth_passport


def build_regret_firewall_decision(
    conn: sqlite3.Connection,
    buyer_id: str,
    product_id: str | None = None,
    cluster_id: str | None = None,
    query: str = "",
    preferred_fit: str = "comfort",
    create_missing_proof_request: bool = True,
) -> dict:
    context = _resolve_context(conn, product_id, cluster_id)
    candidate_ids = _candidate_variant_ids(conn, buyer_id, context, preferred_fit)
    if not candidate_ids:
        raise ValueError("No comparable variants found")

    ranking = rank_for_kept_order(conn, buyer_id, candidate_ids, preferred_fit)
    winner_variant = get_variant(conn, ranking["winner"])
    if not winner_variant:
        raise ValueError("Winning variant no longer exists")
    passport = build_sku_truth_passport(conn, buyer_id, ranking["winner"], preferred_fit)
    fit = predict_fit(conn, buyer_id, ranking["winner"], preferred_fit)
    evidence_gap = evidence_gap_for_question(
        conn,
        winner_variant["product_id"],
        ranking["winner"],
        query,
    ) if query.strip() else None
    proof_request = None
    if evidence_gap and create_missing_proof_request:
        proof_request = create_or_increment_proof_request(
            conn,
            buyer_id=buyer_id,
            product_id=winner_variant["product_id"],
            variant_id=ranking["winner"],
            attribute=evidence_gap["attribute"],
            buyer_question=query,
        )

    decision = _decide_action(passport, ranking, evidence_gap)
    graph_paths = _graph_paths(conn, buyer_id, ranking["winner"])
    fact_ids = _unique(
        ranking["fact_ids"]
        + passport["fact_ids"]
        + fit["fact_ids"]
        + [fact_id for path in graph_paths for fact_id in path["fact_ids"]]
        + ([proof_request["fact_id"]] if proof_request else [])
    )
    trace_id = create_trace(
        conn,
        buyer_id=buyer_id,
        product_id=winner_variant["product_id"],
        variant_id=ranking["winner"],
        intent=detect_intents(query) if query.strip() else ["regret_firewall"],
        tools_used=[
            "resolve_product_context",
            "candidate_variants_for_cluster",
            "rank_for_kept_order",
            "build_sku_truth_passport",
            "detect_missing_proof",
            "traverse_commerce_graph",
        ] + (["create_or_increment_proof_request"] if proof_request else []),
        fact_ids=fact_ids,
        graph_paths=graph_paths,
    )
    conn.commit()

    return {
        "trace_id": trace_id,
        "buyer_id": buyer_id,
        "context": context,
        "decision": decision,
        "selected": {
            "product": passport["product"],
            "variant": passport["variant"],
            "recommended_size": fit["recommended_size"],
        },
        "ranking": ranking,
        "sku_truth_passport": passport,
        "missing_proof": evidence_gap,
        "proof_request": proof_request,
        "graph_paths": graph_paths,
        "fact_ids": fact_ids[:24],
    }


def _resolve_context(conn: sqlite3.Connection, product_id: str | None, cluster_id: str | None) -> dict:
    if product_id:
        product = get_product(conn, product_id)
        if not product:
            raise ValueError(f"Unknown product_id: {product_id}")
        return {
            "product_id": product_id,
            "cluster_id": product["cluster_id"],
            "category": product["category"],
            "garment_type": product["garment_type"],
        }
    if cluster_id:
        products = get_cluster_products(conn, cluster_id)
        if not products:
            raise ValueError(f"Unknown cluster_id: {cluster_id}")
        first = products[0]
        return {
            "product_id": first["product_id"],
            "cluster_id": cluster_id,
            "category": first["category"],
            "garment_type": first["garment_type"],
        }
    raise ValueError("product_id or cluster_id is required")


def _candidate_variant_ids(conn: sqlite3.Connection, buyer_id: str, context: dict, preferred_fit: str) -> list[str]:
    product = get_product(conn, context["product_id"])
    if not product:
        return []
    variants = get_variants_for_product(conn, product["product_id"])
    if not variants:
        return []
    anchor_variant = _variant_for_size(variants, "XL")
    fit = predict_fit(conn, buyer_id, anchor_variant["variant_id"], preferred_fit)
    candidate_ids = candidate_variants_for_cluster(conn, context["cluster_id"], fit["recommended_size"])
    if candidate_ids:
        return candidate_ids
    return [variant["variant_id"] for variant in variants]


def _variant_for_size(variants: list[dict], size: str) -> dict:
    for variant in variants:
        if variant["size"] == size:
            return variant
    return variants[0]


def _decide_action(passport: dict, ranking: dict, evidence_gap: dict | None) -> dict:
    trust = passport["trust_state"]
    evidence = passport["outcome_evidence"]
    issue = passport["avoidable_issue"]
    offer = passport["offer_truth"]
    winner_score = ranking["candidates"][0]["score"] if ranking["candidates"] else 0.0

    if trust["status"] in {"seller_restricted", "data_degraded"}:
        return {
            "code": "skip",
            "label": "Do not recommend this purchase right now",
            "summary": trust["buyer_guidance"],
            "primary_action": "choose_another_listing",
            "confidence": "low",
        }
    if evidence_gap:
        return {
            "code": "ask_seller_proof",
            "label": "Ask for proof before buying",
            "summary": evidence_gap["summary"],
            "primary_action": "request_seller_proof",
            "confidence": "low",
        }
    if passport["fit"]["recommended_size"] != passport["variant"]["size"]:
        return {
            "code": "change_size",
            "label": f"Change size to {passport['fit']['recommended_size']}",
            "summary": "Fit evidence suggests a safer size for this buyer profile.",
            "primary_action": "select_recommended_size",
            "confidence": passport["fit"]["confidence"],
        }
    if evidence["evidence_strength"] in {"unknown", "weak"}:
        return {
            "code": "low_evidence",
            "label": "Buy only if low evidence is acceptable",
            "summary": "This product is not marked bad; it simply does not have enough kept-order evidence yet.",
            "primary_action": "review_proof_or_choose_alternate",
            "confidence": "low",
        }
    if issue and issue["count"] >= 5:
        return {
            "code": "buy_with_one_check",
            "label": "Buy only after checking one risk",
            "summary": f"{issue['title']}. {issue['action']}",
            "primary_action": "review_one_risk",
            "confidence": "medium",
        }
    if offer["status"] == "no_need_to_rush":
        return {
            "code": "buy_without_rush",
            "label": "Good option; no need to rush",
            "summary": offer["message"],
            "primary_action": "continue_when_ready",
            "confidence": "medium" if winner_score < 0.72 else "high",
        }
    return {
        "code": "buy",
        "label": "Buy this option",
        "summary": "This listing has the strongest kept-order evidence among comparable options.",
        "primary_action": "continue_to_product",
        "confidence": "medium" if winner_score < 0.72 else "high",
    }


def _graph_paths(conn: sqlite3.Connection, buyer_id: str, variant_id: str) -> list[dict]:
    paths = []
    for path_type in ("buyer_fit_path", "variant_risk_path", "offer_truth_path"):
        try:
            kwargs = {"variant_id": variant_id}
            if path_type == "buyer_fit_path":
                kwargs["buyer_id"] = buyer_id
            paths.append(sqlite_graph_path(conn, path_type, **kwargs))
        except ValueError:
            continue
    return paths


def _unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value for value in values if value))
