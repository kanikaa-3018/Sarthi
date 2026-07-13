from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "production_guards.db")
    return TestClient(app)


def test_demo_control_endpoints_are_blocked_in_production_mode(tmp_path):
    client = _client(tmp_path)
    original_env = settings.app_env
    object.__setattr__(settings, "app_env", "production")
    try:
        seed = client.post("/seed/reset")
        scenarios = client.get("/scenarios")
    finally:
        object.__setattr__(settings, "app_env", original_env)

    assert seed.status_code == 403
    assert scenarios.status_code == 403


def test_system_readiness_discloses_prototype_data_and_blockers(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    response = client.get("/system/readiness")

    assert response.status_code == 200
    payload = response.json()
    assert payload["data_mode"] == "deterministic_synthetic_prototype"
    assert payload["can_compete_without_blockers"] is False
    assert payload["implemented_controls"]
    assert any("marketplace data connectors" in blocker for blocker in payload["production_blockers"])
    assert payload["source_health"]["overall_status"] == "operational"


def test_outcome_writeback_rejects_invalid_status_and_reason_contracts(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    invalid_status = client.post(
        "/orders/simulate",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
            "status": "lost_in_transit",
        },
        headers=headers,
    )
    returned_without_reason = client.post(
        "/orders/simulate",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
            "status": "returned",
        },
        headers=headers,
    )
    kept_with_reason = client.post(
        "/orders/simulate",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
            "status": "delivered_kept",
            "return_reason": "too_small",
        },
        headers=headers,
    )

    assert invalid_status.status_code == 422
    assert returned_without_reason.status_code == 422
    assert kept_with_reason.status_code == 422


def test_outcome_writeback_rejects_unknown_variant_without_learning_update(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    response = client.post(
        "/orders/simulate",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "missing_variant",
            "status": "returned",
            "return_reason": "too_small",
        },
        headers=headers,
    )

    assert response.status_code == 400
    assert "Unknown variant_id" in response.json()["detail"]


def test_compare_rejects_unknown_fit_preference(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    response = client.post(
        "/compare",
        json={
            "buyer_id": "buyer_asha",
            "cluster_id": "cluster_floral_blue",
            "preferred_fit": "oversized",
        },
        headers=headers,
    )

    assert response.status_code == 422


def test_offer_and_agent_reject_unknown_variants_cleanly(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    offer = client.post(
        "/checkout/verify-offer",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "missing_variant",
        },
        headers=headers,
    )
    agent = client.post(
        "/agent/query",
        json={
            "buyer_id": "buyer_asha",
            "query": "is this offer real?",
            "selected_variant_id": "missing_variant",
        },
        headers=headers,
    )

    assert offer.status_code == 404
    assert "Unknown variant_id" in offer.json()["detail"]
    assert agent.status_code == 400
    assert "Unknown variant_id" in agent.json()["detail"]
