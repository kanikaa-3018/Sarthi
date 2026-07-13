from __future__ import annotations

import json
import sqlite3

from app.agent.fallback import grounded_compare_answer
from app.agent.tools import traverse_commerce_graph
from app.repositories.catalog import get_variant
from app.repositories.traces import create_trace
from app.services.duplicate_detection import candidate_variants_for_cluster
from app.services.fit_predictor import predict_fit
from app.services.kept_order_ranker import rank_for_kept_order
from app.services.offer_verifier import verify_offer
from app.services.response_validator import validate_grounded_response


def detect_intents(query: str) -> list[str]:
    q = query.lower()
    intents: list[str] = []
    if any(word in q for word in ["kaunsa", "which", "best", "compare", "teen"]):
        intents.append("compare")
    if any(word in q for word in ["size", "l hai", "xl", "fit", "chhoti", "tight"]):
        intents.append("fit")
    if any(word in q for word in ["kapda", "fabric", "cotton", "thin"]):
        intents.append("fabric")
    if any(word in q for word in ["discount", "offer", "deal", "rush", "timer"]):
        intents.append("offer_urgency")
    return intents or ["checkout_confidence"]


def answer_query(
    conn: sqlite3.Connection,
    buyer_id: str,
    query: str,
    cluster_id: str | None,
    selected_variant_id: str | None,
    language: str = "hinglish",
) -> dict:
    intents = detect_intents(query)
    tools_used: list[str] = []
    graph_paths: list[dict] = []
    fact_ids: list[str] = []
    offer = None

    if selected_variant_id and "compare" not in intents:
        candidate_ids = [selected_variant_id]
    elif cluster_id:
        candidate_ids = candidate_variants_for_cluster(conn, cluster_id, "XL")
    elif selected_variant_id:
        candidate_ids = [selected_variant_id]
    else:
        candidate_ids = candidate_variants_for_cluster(conn, "cluster_floral_blue", "XL")
    tools_used.append("candidate_variants_for_cluster")

    ranking = rank_for_kept_order(conn, buyer_id, candidate_ids)
    tools_used.append("rank_for_kept_order")
    fact_ids.extend(ranking["fact_ids"])

    fit = predict_fit(conn, buyer_id, ranking["winner"])
    tools_used.append("predict_fit")
    fact_ids.extend(fit["fact_ids"])

    offer_variant_id = selected_variant_id or ranking["winner"]
    if "offer_urgency" in intents:
        offer = verify_offer(conn, offer_variant_id)
        tools_used.append("verify_offer")
        fact_ids.extend(offer["fact_ids"])

    for path_type in ("buyer_fit_path", "variant_risk_path"):
        path = traverse_commerce_graph(conn, path_type, buyer_id=buyer_id, variant_id=ranking["winner"])
        graph_paths.append(path)
        fact_ids.extend(path["fact_ids"])
    if offer:
        path = traverse_commerce_graph(conn, "offer_truth_path", variant_id=offer_variant_id)
        graph_paths.append(path)
        fact_ids.extend(path["fact_ids"])
    tools_used.append("traverse_commerce_graph")

    answer = grounded_compare_answer(ranking, fit, offer)
    validation = validate_grounded_response(json.dumps(answer), fact_ids)
    winner_variant = get_variant(conn, ranking["winner"])
    trace_id = create_trace(
        conn,
        buyer_id=buyer_id,
        product_id=winner_variant["product_id"] if winner_variant else None,
        variant_id=ranking["winner"],
        intent=intents,
        tools_used=tools_used,
        fact_ids=fact_ids,
        graph_paths=graph_paths,
    )
    conn.commit()
    if not validation["ok"]:
        answer["caution"] = "Some unsupported wording was blocked; showing verified facts only."

    return {
        "trace_id": trace_id,
        "intent": intents,
        "answer": answer,
        "fact_ids": list(dict.fromkeys(fact_ids))[:16],
    }
