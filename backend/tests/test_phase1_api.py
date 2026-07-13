from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "phase1.db")
    return TestClient(app)


def test_phase1_main_journey_api_contract(tmp_path):
    client = _client(tmp_path)

    seed = client.post("/seed/reset")
    assert seed.status_code == 200
    assert seed.json()["sqlite"]["products"] == 32
    headers = buyer_headers(client, "buyer_asha")

    feed = client.get("/feed?buyer_id=buyer_asha", headers=headers)
    assert feed.status_code == 200
    assert feed.json()["total"] == 32
    assert feed.json()["limit"] == 48
    assert feed.json()["has_more"] is False
    product = feed.json()["products"][0]

    detail = client.get(f"/products/{product['product_id']}?buyer_id=buyer_asha", headers=headers)
    assert detail.status_code == 200
    detail_payload = detail.json()
    assert detail_payload["selected_variant"]["variant_id"]
    assert detail_payload["evidence"]["fact_ids"]
    assert detail_payload["graph_paths"]

    compare = client.post(
        "/compare",
        json={
            "buyer_id": "buyer_asha",
            "cluster_id": product["cluster_id"],
            "preferred_fit": "comfort",
        },
        headers=headers,
    )
    assert compare.status_code == 200
    compare_payload = compare.json()
    assert compare_payload["trace_id"]
    assert compare_payload["ranking"]["winner"]
    assert compare_payload["selected_product_id"]

    audit = client.get(f"/audit/{compare_payload['trace_id']}", headers=headers)
    assert audit.status_code == 200
    assert "rank_for_kept_order" in audit.json()["tools_used"]

    agent = client.post(
        "/agent/query",
        json={
            "buyer_id": "buyer_asha",
            "cluster_id": product["cluster_id"],
            "query": "In teen mein best kaunsa hai? Mera usual L hai, kapda thin nahi chahiye.",
        },
        headers=headers,
    )
    assert agent.status_code == 200
    agent_payload = agent.json()
    assert agent_payload["trace_id"]
    assert agent_payload["fact_ids"]

    checkout = client.post(
        "/checkout/verify-offer",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": compare_payload["ranking"]["winner"],
        },
        headers=headers,
    )
    assert checkout.status_code == 200
    assert checkout.json()["offer"]["status"] in {
        "verified_price_drop",
        "no_need_to_rush",
        "not_enough_history",
    }

    before_memory = client.get("/buyers/buyer_asha/memory", headers=headers).json()["memory"]
    outcome = client.post(
        "/orders/simulate",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": compare_payload["ranking"]["winner"],
            "status": "delivered_kept",
        },
        headers=headers,
    )
    assert outcome.status_code == 200
    assert outcome.json()["outcome"]["memory_update"]["updated"] is True
    after_memory = client.get("/buyers/buyer_asha/memory", headers=headers).json()["memory"]
    assert len(after_memory) == len(before_memory) + 1


def test_feed_supports_pagination_search_and_category_filters(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    page = client.get("/feed?buyer_id=buyer_asha&limit=5&offset=0", headers=headers)
    next_page = client.get("/feed?buyer_id=buyer_asha&limit=5&offset=5", headers=headers)
    search = client.get("/feed?buyer_id=buyer_asha&q=handbag", headers=headers)
    category = client.get("/feed?buyer_id=buyer_asha&category=women_kurtis", headers=headers)

    assert page.status_code == 200
    assert len(page.json()["products"]) == 5
    assert page.json()["total"] == 32
    assert page.json()["has_more"] is True
    assert next_page.status_code == 200
    assert page.json()["products"][0]["product_id"] != next_page.json()["products"][0]["product_id"]
    assert search.status_code == 200
    assert search.json()["products"]
    assert all("handbag" in product["title"].lower() for product in search.json()["products"])
    assert category.status_code == 200
    assert category.json()["products"]
    assert all(product["category"] == "women_kurtis" for product in category.json()["products"])


def test_memory_delete_degrades_personalization(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    delete_response = client.delete("/buyers/buyer_asha/memory", headers=headers)
    assert delete_response.status_code == 200
    assert delete_response.json()["fit_memory_enabled"] is False

    memory = client.get("/buyers/buyer_asha/memory", headers=headers)
    assert memory.status_code == 200
    assert memory.json()["memory"] == []

    detail = client.get("/products/kurti_1_1?buyer_id=buyer_asha", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["privacy"]["fit_memory_enabled"] is False


def test_low_data_product_abstains_from_strong_confidence(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_cold")

    detail = client.get("/products/kurti_1_4?buyer_id=buyer_cold", headers=headers)
    assert detail.status_code == 200
    payload = detail.json()
    assert payload["evidence"]["delivered_orders_90d"] == 0
    assert payload["evidence"]["evidence_strength"] == "unknown"
    assert payload["privacy"]["fit_memory_enabled"] is False
