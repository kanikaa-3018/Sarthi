from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers, seller_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "expectation_contracts.db")
    return TestClient(app)


def test_buyer_can_create_fact_backed_expectation_contract(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    response = client.post(
        "/expectation-contracts",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
        },
        headers=headers,
    )

    assert response.status_code == 200
    contract = response.json()
    assert contract["status"] == "active"
    assert contract["fact_id"].startswith("fact_contract_")
    dimensions = {item["dimension"] for item in contract["contract"]["items"]}
    assert {"fit", "fabric", "color", "dispatch", "offer"}.issubset(dimensions)
    assert contract["contract"]["privacy"]["raw_private_memory_exposed"] is False


def test_returned_outcome_marks_contract_broken_dimension(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    contract = client.post(
        "/expectation-contracts",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
        },
        headers=headers,
    ).json()

    outcome = client.post(
        "/orders/simulate",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
            "status": "returned",
            "return_reason": "fabric_different",
            "contract_id": contract["contract_id"],
        },
        headers=headers,
    )

    assert outcome.status_code == 200
    update = outcome.json()["expectation_contract"]
    assert update["status"] == "broken"
    assert update["broken_dimension"] == "fabric"
    assert update["outcome_order_id"] == outcome.json()["outcome"]["order_id"]


def test_kept_outcome_marks_contract_kept(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    contract = client.post(
        "/expectation-contracts",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
        },
        headers=headers,
    ).json()

    outcome = client.post(
        "/orders/simulate",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
            "status": "delivered_kept",
            "contract_id": contract["contract_id"],
        },
        headers=headers,
    )

    assert outcome.status_code == 200
    assert outcome.json()["expectation_contract"]["status"] == "kept"
    assert outcome.json()["expectation_contract"]["broken_dimension"] is None


def test_contract_is_private_to_buyer_account(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    asha = buyer_headers(client, "buyer_asha")
    neha = buyer_headers(client, "buyer_neha")

    contract = client.post(
        "/expectation-contracts",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
        },
        headers=asha,
    ).json()

    response = client.get(f"/expectation-contracts/{contract['contract_id']}", headers=neha)
    assert response.status_code == 404


def test_broken_expectation_surfaces_as_seller_aggregate_task(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    buyer = buyer_headers(client, "buyer_asha")

    contract = client.post(
        "/expectation-contracts",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
        },
        headers=buyer,
    ).json()
    client.post(
        "/orders/simulate",
        json={
            "buyer_id": "buyer_asha",
            "variant_id": "kurti_1_1_xl",
            "status": "returned",
            "return_reason": "fabric_different",
            "contract_id": contract["contract_id"],
        },
        headers=buyer,
    )

    seller = seller_headers(client, "seller_c")
    response = client.get("/seller/me/evidence-coach", headers=seller)

    assert response.status_code == 200
    payload = response.json()
    tasks = [
        task
        for task in payload["tasks"]
        if task["type"] == "broken_expectation" and task["product_id"] == "kurti_1_1"
    ]
    assert tasks
    assert tasks[0]["attribute"] == "fabric"
    assert tasks[0]["buyer_demand"] >= 1
    assert payload["privacy_guard"]["safe_for_seller"] is True
    assert "buyer_asha" not in str(payload)

    proof = client.post(
        "/seller/me/evidence-assets",
        json={
            "product_id": "kurti_1_1",
            "attribute": "fabric",
            "proof_type": "fabric_closeup",
            "title": "Fabric proof",
            "description": "Close-up fabric proof submitted after expectation gap.",
            "asset_url": "https://example.local/proof/fabric-expectation-gap.jpg",
        },
        headers=seller,
    )
    assert proof.status_code == 200

    updated = client.get("/seller/me/evidence-coach", headers=seller).json()
    assert not [
        task
        for task in updated["tasks"]
        if task["type"] == "broken_expectation" and task["product_id"] == "kurti_1_1"
    ]
