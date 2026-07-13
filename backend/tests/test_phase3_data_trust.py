from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers, seller_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "phase3.db")
    return TestClient(app)


def test_data_sources_are_authenticated_and_operational_by_default(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    anonymous = client.get("/data-sources")
    assert anonymous.status_code == 401

    response = client.get("/data-sources", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["health"]["overall_status"] == "operational"
    source_ids = {source["source_id"] for source in payload["health"]["sources"]}
    assert {"catalog", "orders", "returns", "reviews", "seller_verification"}.issubset(source_ids)


def test_product_detail_includes_trust_state_and_seller_verification(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    response = client.get("/products/kurti_1_1?buyer_id=buyer_asha", headers=headers)
    assert response.status_code == 200
    trust_state = response.json()["trust_state"]

    assert trust_state["seller_verification"]["seller_id"] == "seller_c"
    assert trust_state["seller_verification"]["verification_status"] == "verified"
    assert trust_state["data_freshness"]["overall_status"] == "operational"
    assert trust_state["confidence"] in {"medium", "high"}


def test_cold_start_product_trust_state_pauses_strong_recommendation(tmp_path):
    client = _client(tmp_path)
    client.post("/scenarios/cold_start/activate")
    headers = buyer_headers(client, "buyer_cold")

    response = client.get("/products/kurti_1_4?buyer_id=buyer_cold", headers=headers)
    assert response.status_code == 200
    trust_state = response.json()["trust_state"]

    assert trust_state["status"] == "limited_evidence"
    assert trust_state["can_recommend"] is False
    assert trust_state["missing_data"]


def test_restricted_seller_blocks_buyer_recommendation(tmp_path):
    client = _client(tmp_path)
    client.post("/scenarios/seller_restricted/activate")
    headers = buyer_headers(client, "buyer_asha")

    response = client.get("/products/kurti_1_1?buyer_id=buyer_asha", headers=headers)
    assert response.status_code == 200
    trust_state = response.json()["trust_state"]

    assert trust_state["status"] == "seller_restricted"
    assert trust_state["can_recommend"] is False
    assert trust_state["seller_verification"]["verification_status"] == "restricted"
    assert trust_state["seller_verification"]["restricted_reason"]


def test_stale_source_data_degrades_buyer_trust_state(tmp_path):
    client = _client(tmp_path)
    client.post("/scenarios/stale_data_source/activate")
    headers = buyer_headers(client, "buyer_asha")

    response = client.get("/products/kurti_1_2?buyer_id=buyer_asha", headers=headers)
    assert response.status_code == 200
    trust_state = response.json()["trust_state"]

    assert trust_state["status"] == "data_degraded"
    assert trust_state["can_recommend"] is False
    assert trust_state["data_freshness"]["overall_status"] == "stale"


def test_pending_seller_verification_surfaces_seller_action(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_b")

    response = client.get("/seller/me/panel?cluster_id=cluster_floral_blue", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["seller_verification"]["verification_status"] == "pending"
    assert payload["data_freshness"]["overall_status"] == "operational"
    actions = payload["seller_listings"][0]["action_items"]
    assert any(action["title"] == "Complete seller verification" for action in actions)
