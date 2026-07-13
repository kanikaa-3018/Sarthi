from app.database import get_connection
from app.seed import reset_seed_database
from app.services.duplicate_detection import candidate_variants_for_cluster
from app.services.evidence_aggregator import build_variant_evidence
from app.services.fit_predictor import predict_fit
from app.services.kept_order_ranker import rank_for_kept_order
from app.services.offer_verifier import verify_offer


def test_core_services_return_fact_backed_outputs(tmp_path):
    db_path = tmp_path / "sarthi.db"
    reset_seed_database(db_path)
    conn = get_connection(db_path)

    candidates = candidate_variants_for_cluster(conn, "cluster_floral_blue", "XL")
    assert candidates

    evidence = build_variant_evidence(conn, candidates[0])
    assert evidence["variant_id"] == candidates[0]
    assert evidence["delivered_orders_90d"] >= evidence["returns_90d"]
    assert evidence["fact_ids"]

    fit = predict_fit(conn, "buyer_asha", candidates[0])
    assert fit["recommended_size"] in {"XL", "XXL"}
    assert fit["fact_ids"]

    ranking = rank_for_kept_order(conn, "buyer_asha", candidates)
    assert ranking["winner"] in candidates
    assert ranking["fact_ids"]

    offer = verify_offer(conn, ranking["winner"])
    assert offer["status"] in {"verified_price_drop", "no_need_to_rush", "not_enough_history"}
    assert offer["fact_ids"]

    conn.close()

