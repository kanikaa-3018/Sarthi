from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "knowledge_graph.db")
    return TestClient(app)


def test_cluster_knowledge_graph_is_dynamic_and_fact_backed(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    graph = client.get(
        "/knowledge-graph/clusters/cluster_floral_blue?buyer_id=buyer_asha",
        headers=headers,
    )

    assert graph.status_code == 200
    payload = graph.json()
    assert payload["summary"]["dynamic"] is True
    assert payload["summary"]["fact_count"] > 0
    assert payload["ranking"]["winner"]
    assert payload["nodes"]
    assert payload["edges"]
    assert {node["type"] for node in payload["nodes"]} >= {
        "cluster",
        "seller",
        "product",
        "sku",
        "evidence",
        "reviews",
    }
    candidate_factors = payload["ranking"]["candidates"][0]["factors"]
    assert "seller_trust" in candidate_factors
    assert "review_signal" in candidate_factors
    assert "rating_signal" in candidate_factors


def test_knowledge_graph_chat_returns_grounded_trace(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    chat = client.post(
        "/knowledge-graph/chat",
        json={
            "buyer_id": "buyer_asha",
            "cluster_id": "cluster_floral_blue",
            "query": "Which seller has lowest return risk?",
        },
        headers=headers,
    )

    assert chat.status_code == 200
    payload = chat.json()
    assert payload["trace_id"]
    assert payload["answer"]["fact_ids"]
    assert payload["answer"]["matched_node_ids"]
    assert payload["graph_path"]["available_from"] == "sqlite_dynamic_graph"

    audit = client.get(f"/audit/{payload['trace_id']}", headers=headers)
    assert audit.status_code == 200
    assert "build_cluster_knowledge_graph" in audit.json()["tools_used"]
