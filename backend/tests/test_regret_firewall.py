from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers, seller_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "regret_firewall.db")
    return TestClient(app)


def test_regret_firewall_creates_missing_proof_loop_for_buyer_doubt(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    buyer = buyer_headers(client, "buyer_asha")

    response = client.post(
        "/decision/regret-firewall",
        json={
            "buyer_id": "buyer_asha",
            "product_id": "kurti_1_1",
            "query": "Kapda transparent toh nahi hai? daylight proof hai kya?",
        },
        headers=buyer,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["decision"]["code"] == "ask_seller_proof"
    assert payload["missing_proof"]["attribute"] == "transparency"
    assert payload["proof_request"]["request_count"] == 1
    assert payload["trace_id"]
    assert "create_or_increment_proof_request" in client.get(
        f"/audit/{payload['trace_id']}",
        headers=buyer,
    ).json()["tools_used"]


def test_seller_evidence_coach_uses_aggregate_doubts_and_hides_buyer_identity(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    buyer = buyer_headers(client, "buyer_asha")

    response = client.post(
        "/decision/regret-firewall",
        json={
            "buyer_id": "buyer_asha",
            "product_id": "kurti_1_1",
            "query": "Kapda transparent toh nahi hai?",
        },
        headers=buyer,
    )
    assert response.status_code == 200
    proof_request = response.json()["proof_request"]
    seller = seller_headers(client, proof_request["seller_id"])

    coach = client.get("/seller/me/evidence-coach", headers=seller)
    assert coach.status_code == 200
    payload = coach.json()
    assert payload["open_task_count"] == 1
    task = payload["tasks"][0]
    assert task["attribute"] == "transparency"
    assert task["product_id"] == proof_request["product_id"]
    assert "buyer_id" not in task
    assert payload["privacy_guard"]["safe_for_seller"] is True


def test_seller_evidence_submission_resolves_open_proof_requests(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    buyer = buyer_headers(client, "buyer_asha")

    decision = client.post(
        "/decision/regret-firewall",
        json={
            "buyer_id": "buyer_asha",
            "product_id": "kurti_1_1",
            "query": "Kapda transparent toh nahi hai?",
        },
        headers=buyer,
    )
    proof_request = decision.json()["proof_request"]
    seller = seller_headers(client, proof_request["seller_id"])

    proof = client.post(
        "/seller/me/evidence-assets",
        json={
            "product_id": proof_request["product_id"],
            "attribute": "transparency",
            "proof_type": "fabric_closeup",
            "title": "Daylight fabric close-up",
            "description": "Shows the fabric against daylight for transparency confidence.",
            "asset_url": "https://example.local/proof/fabric-closeup.jpg",
        },
        headers=seller,
    )
    assert proof.status_code == 200
    assert proof.json()["resolved_open_requests"] == 1

    coach = client.get("/seller/me/evidence-coach", headers=seller)
    assert coach.status_code == 200
    assert coach.json()["open_task_count"] == 0
    assert coach.json()["resolved_request_count"] == 1

    passport = client.get(
        f"/products/{proof_request['product_id']}/sku-passport?buyer_id=buyer_asha&variant_id={proof_request['variant_id']}",
        headers=buyer,
    )
    assert passport.status_code == 200
    coverage = passport.json()["proof_coverage"]["transparency"]
    assert coverage["evidence_count"] >= 1
    assert proof.json()["fact_id"] in coverage["fact_ids"]


def test_seller_cannot_submit_proof_for_another_sellers_listing(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    seller_a = seller_headers(client, "seller_a")

    response = client.post(
        "/seller/me/evidence-assets",
        json={
            "product_id": "kurti_1_1",
            "attribute": "transparency",
            "proof_type": "fabric_closeup",
            "title": "Invalid proof",
            "description": "Seller does not own this listing.",
            "asset_url": "https://example.local/proof/not-owned.jpg",
        },
        headers=seller_a,
    )
    assert response.status_code == 400
    assert "another seller" in response.json()["detail"]


def test_seller_evidence_submission_requires_real_asset_reference(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    seller = seller_headers(client, "seller_c")

    response = client.post(
        "/seller/me/evidence-assets",
        json={
            "product_id": "kurti_1_1",
            "attribute": "transparency",
            "proof_type": "fabric_closeup",
            "title": "Fabric close-up",
            "description": "Seller needs to attach a real proof reference.",
            "asset_url": "",
        },
        headers=seller,
    )

    assert response.status_code == 400
    assert "asset URL" in response.json()["detail"]


def test_low_evidence_decision_abstains_instead_of_inventing_confidence(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    buyer = buyer_headers(client, "buyer_cold")

    response = client.post(
        "/decision/regret-firewall",
        json={
            "buyer_id": "buyer_cold",
            "product_id": "kurti_1_4",
            "query": "Is this safe to buy?",
            "create_missing_proof_request": False,
        },
        headers=buyer,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["sku_truth_passport"]["outcome_evidence"]["evidence_strength"] in {"unknown", "weak"}
    assert payload["decision"]["code"] in {"low_evidence", "buy_without_rush", "buy_with_one_check"}
    if payload["sku_truth_passport"]["outcome_evidence"]["evidence_strength"] == "unknown":
        assert payload["decision"]["code"] == "low_evidence"
