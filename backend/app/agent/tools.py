from __future__ import annotations

import sqlite3

from app.graph.graph_queries import sqlite_graph_path
from app.services.duplicate_detection import candidate_variants_for_cluster
from app.services.evidence_aggregator import build_variant_evidence
from app.services.fit_predictor import predict_fit
from app.services.kept_order_ranker import rank_for_kept_order
from app.services.offer_verifier import verify_offer
from app.services.review_retriever import retrieve_review_passages


def traverse_commerce_graph(
    conn: sqlite3.Connection,
    path_type: str,
    buyer_id: str | None = None,
    variant_id: str | None = None,
) -> dict:
    return sqlite_graph_path(conn, path_type, buyer_id=buyer_id, variant_id=variant_id)


TOOL_REGISTRY = {
    "candidate_variants_for_cluster": candidate_variants_for_cluster,
    "get_sku_evidence": build_variant_evidence,
    "predict_fit": predict_fit,
    "rank_for_kept_order": rank_for_kept_order,
    "verify_offer": verify_offer,
    "retrieve_review_passages": retrieve_review_passages,
    "traverse_commerce_graph": traverse_commerce_graph,
}

