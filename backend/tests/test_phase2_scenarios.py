from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "phase2.db")
    return TestClient(app)


def _activate(client: TestClient, scenario_id: str) -> dict:
    response = client.post(f"/scenarios/{scenario_id}/activate")
    assert response.status_code == 200
    return response.json()


def test_scenarios_are_discoverable_with_start_context(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    response = client.get("/scenarios")
    assert response.status_code == 200
    scenarios = response.json()["scenarios"]
    scenario_ids = {scenario["scenario_id"] for scenario in scenarios}

    assert {
        "main_confidence",
        "cold_start",
        "conflicting_evidence",
        "verified_deal",
        "no_rush",
        "memory_off",
        "service_fallback",
    }.issubset(scenario_ids)
    assert all(scenario["start"]["product_id"] for scenario in scenarios)
    assert all("synthetic" in scenario["data_disclosure"].lower() for scenario in scenarios)


def test_cold_start_abstains_from_return_rate_confidence(tmp_path):
    client = _client(tmp_path)
    _activate(client, "cold_start")
    headers = buyer_headers(client, "buyer_cold")

    response = client.get("/products/kurti_1_4?buyer_id=buyer_cold", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["evidence"]["delivered_orders_90d"] == 0
    assert payload["evidence"]["returns_90d"] == 0
    assert payload["evidence"]["evidence_strength"] == "unknown"
    assert payload["avoidable_issue"] is None
    assert payload["fit"]["confidence"] == "low"
    assert payload["privacy"]["fit_memory_enabled"] is False


def test_conflicting_evidence_surfaces_color_return_conflict(tmp_path):
    client = _client(tmp_path)
    _activate(client, "conflicting_evidence")
    headers = buyer_headers(client, "buyer_asha")

    response = client.get("/products/kurti_1_3?buyer_id=buyer_asha", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["evidence"]["color_mismatch_returns"] >= 14
    assert payload["conflicts"]
    conflict = payload["conflicts"][0]
    assert conflict["type"] == "color_review_return_conflict"
    assert conflict["severity"] == "medium"
    assert "daylight" in conflict["action"].lower()
    assert conflict["fact_ids"]


def test_verified_deal_uses_price_and_campaign_facts(tmp_path):
    client = _client(tmp_path)
    _activate(client, "verified_deal")
    headers = buyer_headers(client, "buyer_asha")

    response = client.post(
        "/checkout/verify-offer",
        json={"buyer_id": "buyer_asha", "variant_id": "kurti_2_2_xl"},
        headers=headers,
    )
    assert response.status_code == 200
    offer = response.json()["offer"]

    assert offer["status"] == "verified_price_drop"
    assert "Verified deal" in offer["message"]
    assert offer["truth_basis"] == "price_drop"
    assert offer["price_evidence"]["latest_price"] is not None
    assert offer["price_evidence"]["reference_price"] is not None
    assert offer["price_evidence"]["price_delta"] > 0
    assert offer["campaign_evidence"]["timer_reset_count"] == 0
    assert {check["key"] for check in offer["checks"]} == {
        "price_history",
        "campaign_timer",
        "inventory_pressure",
    }
    assert any(fact_id.startswith("fact_scenario_deal_price") for fact_id in offer["fact_ids"])
    assert "fact_campaign_kurti_2_2_xl" in offer["fact_ids"]


def test_no_rush_offer_keeps_dark_pattern_copy_factual(tmp_path):
    client = _client(tmp_path)
    _activate(client, "no_rush")
    headers = buyer_headers(client, "buyer_asha")

    response = client.post(
        "/checkout/verify-offer",
        json={"buyer_id": "buyer_asha", "variant_id": "kurti_1_1_xl"},
        headers=headers,
    )
    assert response.status_code == 200
    offer = response.json()["offer"]

    assert offer["status"] == "no_need_to_rush"
    assert "No need to rush" in offer["message"]
    assert offer["truth_basis"] == "timer_reset"
    assert offer["campaign_evidence"]["timer_reset_count"] >= 2
    assert offer["price_evidence"]["price_event_count"] >= 3
    assert "timer" in offer["checks"][1]["detail"].lower()
    assert "fake" not in offer["message"].lower()
    assert "manipulative" not in offer["message"].lower()


def test_memory_off_does_not_use_personal_fit_facts(tmp_path):
    client = _client(tmp_path)
    _activate(client, "memory_off")
    headers = buyer_headers(client, "buyer_cold")

    memory = client.get("/buyers/buyer_cold/memory", headers=headers)
    assert memory.status_code == 200
    assert memory.json()["memory"] == []

    response = client.get("/products/kurti_1_2?buyer_id=buyer_cold", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["privacy"]["fit_memory_enabled"] is False
    assert payload["fit"]["confidence"] == "low"
    assert any("No personal fit memory" in reason for reason in payload["fit"]["reasons"])
    assert not any("fit_memory" in fact_id for fact_id in payload["fit"]["fact_ids"])
    assert payload["graph_paths"][0]["relationships"] == []


def test_service_fallback_keeps_agent_and_audit_fact_backed(tmp_path):
    client = _client(tmp_path)
    scenario = _activate(client, "service_fallback")["scenario"]
    headers = buyer_headers(client, scenario["buyer_id"])

    response = client.post(
        "/agent/query",
        json={
            "buyer_id": scenario["buyer_id"],
            "cluster_id": scenario["cluster_id"],
            "query": scenario["question"],
        },
        headers=headers,
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["trace_id"]
    assert payload["fact_ids"]

    audit = client.get(f"/audit/{payload['trace_id']}", headers=headers)
    assert audit.status_code == 200
    graph_paths = audit.json()["graph_paths"]
    assert graph_paths
    assert all(path["available_from"] == "sqlite_fallback" for path in graph_paths)
    assert "traverse_commerce_graph" in audit.json()["tools_used"]
