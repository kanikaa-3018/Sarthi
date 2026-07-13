from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import seller_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "seller_panel.db")
    return TestClient(app)


def test_sellers_are_listed_from_seed_data(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_c")

    response = client.get("/sellers", headers=headers)
    assert response.status_code == 200
    sellers = response.json()["sellers"]

    assert len(sellers) == 1
    assert sellers[0]["seller_id"] == "seller_c"
    assert all(seller["seller_id"] for seller in sellers)
    assert all(seller["product_count"] > 0 for seller in sellers)
    assert all(seller["cluster_ids"] for seller in sellers)


def test_seller_panel_explains_duplicate_cluster_without_buyer_memory(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_c")

    response = client.get("/sellers/seller_c/panel?cluster_id=cluster_floral_blue", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["seller"]["seller_id"] == "seller_c"
    assert payload["cluster"]["cluster_id"] == "cluster_floral_blue"
    assert payload["seller_listings"]
    assert payload["competing_listings"]
    assert payload["privacy_guard"]["safe_for_seller"] is True
    assert "buyer personal fit memory" in payload["decision_policy"]["inputs_not_used"]
    assert payload["fact_ids"]

    listing = payload["seller_listings"][0]
    assert listing["variant"]["size"] == "XL"
    assert listing["metrics"]["delivered_orders_90d"] >= 0
    assert listing["decision_status"] in {
        "eligible_for_recommendation",
        "needs_seller_action",
        "insufficient_evidence",
    }
    assert listing["action_items"]
    assert "buyer_id" not in str(payload)


def test_seller_panel_marks_cold_start_listing_as_insufficient_evidence(tmp_path):
    client = _client(tmp_path)
    client.post("/scenarios/cold_start/activate")
    headers = seller_headers(client, "seller_c")

    response = client.get("/sellers/seller_c/panel?cluster_id=cluster_floral_blue", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    cold_listing = next(
        listing for listing in payload["seller_listings"] if listing["product"]["product_id"] == "kurti_1_4"
    )

    assert cold_listing["quality_score"] is None
    assert cold_listing["decision_status"] == "insufficient_evidence"
    assert cold_listing["cluster_position"] is None
    assert cold_listing["action_items"][0]["title"] == "Build evidence before strong placement"


def test_seller_panel_recommends_color_photo_fix_from_conflicting_evidence(tmp_path):
    client = _client(tmp_path)
    client.post("/scenarios/conflicting_evidence/activate")
    headers = seller_headers(client, "seller_b")

    response = client.get("/sellers/seller_b/panel?cluster_id=cluster_floral_blue", headers=headers)
    assert response.status_code == 200
    payload = response.json()
    listing = payload["seller_listings"][0]
    actions = listing["action_items"]

    assert listing["product"]["product_id"] == "kurti_1_3"
    assert listing["metrics"]["color_mismatch_returns"] >= 14
    assert any("daylight" in action["title"].lower() for action in actions)
    assert any(action["fact_ids"] for action in actions)


def test_unknown_seller_panel_returns_404(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_c")

    response = client.get("/sellers/missing_seller/panel?cluster_id=cluster_floral_blue", headers=headers)
    assert response.status_code == 403
