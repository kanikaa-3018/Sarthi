from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "trust_privacy.db")
    return TestClient(app)


def test_audit_trace_includes_fact_details(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    compare = client.post(
        "/compare",
        json={
            "buyer_id": "buyer_asha",
            "cluster_id": "cluster_floral_blue",
            "preferred_fit": "comfort",
        },
        headers=headers,
    )
    assert compare.status_code == 200

    audit = client.get(f"/audit/{compare.json()['trace_id']}", headers=headers)
    assert audit.status_code == 200
    payload = audit.json()

    assert payload["fact_ids"]
    assert payload["fact_details"]
    assert payload["fact_details"][0]["fact_id"] in payload["fact_ids"]
    assert payload["fact_details"][0]["summary"]
    assert payload["fact_details"][0]["source_type"]


def test_privacy_summary_tracks_setting_even_without_memory_records(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    delete_response = client.delete("/buyers/buyer_asha/memory", headers=headers)
    assert delete_response.status_code == 200

    enable_response = client.patch(
        "/buyers/buyer_asha/memory",
        json={"fit_memory_enabled": True},
        headers=headers,
    )
    assert enable_response.status_code == 200
    assert enable_response.json()["fit_memory_enabled"] is True
    assert enable_response.json()["memory"] == []

    privacy = client.get("/buyers/buyer_asha/privacy", headers=headers)
    assert privacy.status_code == 200
    payload = privacy.json()

    assert payload["fit_memory_enabled"] is True
    assert payload["memory_record_count"] == 0
    assert "future kept outcomes" in payload["used"][0]
    assert "seller access to personal buyer memory" in payload["not_used"]


def test_memory_preference_update_is_visible_in_memory_center(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    response = client.patch(
        "/buyers/buyer_asha/memory",
        json={"preferred_fit": "regular"},
        headers=headers,
    )
    assert response.status_code == 200
    memory = response.json()["memory"]

    assert memory
    assert all(row["preferred_fit"] == "regular" for row in memory)


def test_memory_preference_rejects_unsupported_fit_modes(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    response = client.patch(
        "/buyers/buyer_asha/memory",
        json={"preferred_fit": "snug"},
        headers=headers,
    )

    assert response.status_code == 422
