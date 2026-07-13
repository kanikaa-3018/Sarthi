from app.database import get_connection
from app.graph.graph_projection import build_projection_summary
from app.graph.graph_queries import sqlite_graph_path
from app.seed import reset_seed_database


def test_projection_summary_has_nodes_and_edges(tmp_path):
    db_path = tmp_path / "sarthi.db"
    reset_seed_database(db_path)
    conn = get_connection(db_path)
    summary = build_projection_summary(conn)
    conn.close()

    assert summary["buyers"] == 3
    assert summary["products"] == 32
    assert summary["variants"] == 112
    assert summary["expected_min_nodes"] > 0
    assert summary["expected_min_edges"] > 0


def test_sqlite_fit_path_fallback_has_fact_ids(tmp_path):
    db_path = tmp_path / "sarthi.db"
    reset_seed_database(db_path)
    conn = get_connection(db_path)
    path = sqlite_graph_path(
        conn,
        "buyer_fit_path",
        buyer_id="buyer_asha",
        variant_id="kurti_1_1_xl",
    )
    conn.close()

    assert path["path_type"] == "buyer_fit_path"
    assert "HAS_FIT_MEMORY" in path["relationships"]
    assert path["fact_ids"]
