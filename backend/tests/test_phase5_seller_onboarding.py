import base64

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers, seller_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "phase5.db")
    return TestClient(app)


def _document_payload(document_type: str, reference: str = "document ref 9988") -> dict:
    return {
        "document_type": document_type,
        "reference": reference,
        "file_name": f"{document_type}.pdf",
        "mime_type": "application/pdf",
        "content_base64": base64.b64encode(f"{document_type}:verified evidence".encode("utf-8")).decode("ascii"),
    }


def test_pending_seller_onboarding_surfaces_verification_actions(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_b")

    response = client.get("/seller/me/onboarding", headers=headers)
    assert response.status_code == 200
    payload = response.json()

    assert payload["seller_verification"]["verification_status"] == "pending"
    assert payload["application"]["status"] == "pending_review"
    assert any(doc["status"] == "under_review" for doc in payload["documents"])
    assert any(action["title"] == "Complete seller verification" for action in payload["next_actions"])


def test_verified_seller_can_create_and_submit_listing_draft_with_cluster_mapping(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_c")

    create = client.post(
        "/seller/me/listing-drafts",
        json={
            "title": "Blue Floral Cotton Kurti Fresh Seller Listing",
            "category": "women_kurtis",
            "garment_type": "kurti",
            "fabric": "cotton blend",
            "color_family": "blue",
            "base_price": 459,
            "image_url": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab",
        },
        headers=headers,
    )
    assert create.status_code == 200
    draft = create.json()["listing_drafts"][0]

    assert draft["target_cluster_id"] == "cluster_floral_blue"
    assert draft["readiness_status"] == "evidence_building"
    assert draft["status"] == "draft"

    submit = client.post(f"/seller/me/listing-drafts/{draft['draft_id']}/submit", headers=headers)
    assert submit.status_code == 200
    submitted = submit.json()["listing_drafts"][0]

    assert submitted["status"] == "submitted"
    assert submitted["submitted_at"]
    assert submitted["readiness_status"] == "evidence_building"


def test_unverified_seller_draft_is_blocked_from_buyer_recommendation(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_b")

    response = client.post(
        "/seller/me/listing-drafts",
        json={
            "title": "Pink Printed Straight Kurti New Batch",
            "category": "women_kurtis",
            "garment_type": "kurti",
            "fabric": "rayon blend",
            "color_family": "pink",
            "base_price": 419,
            "image_url": "https://images.unsplash.com/photo-1509631179647-0177331693ae",
        },
        headers=headers,
    )
    assert response.status_code == 200
    draft = response.json()["listing_drafts"][0]

    assert draft["target_cluster_id"] == "cluster_pink_print"
    assert draft["readiness_status"] == "blocked_seller_verification"


def test_seller_document_submission_is_role_protected(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    buyer = buyer_headers(client, "buyer_asha")
    seller = seller_headers(client, "seller_b")

    blocked = client.post(
        "/seller/me/verification/documents",
        json=_document_payload("bank_proof", "bank proof ending 9988"),
        headers=buyer,
    )
    allowed = client.post(
        "/seller/me/verification/documents",
        json=_document_payload("bank_proof", "bank proof ending 9988"),
        headers=seller,
    )

    assert blocked.status_code == 403
    assert allowed.status_code == 200
    bank_doc = next(doc for doc in allowed.json()["documents"] if doc["document_type"] == "bank_proof")
    assert bank_doc["sha256"]
    assert bank_doc["storage_uri"].startswith("uploads/seller_documents/")


def test_seller_document_upload_requires_valid_file_payload(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    seller = seller_headers(client, "seller_b")

    missing_file = client.post(
        "/seller/me/verification/documents",
        json={"document_type": "bank_proof", "reference": "bank proof ending 9988"},
        headers=seller,
    )
    invalid_file = client.post(
        "/seller/me/verification/documents",
        json={
            "document_type": "bank_proof",
            "reference": "bank proof ending 9988",
            "file_name": "bank.exe",
            "mime_type": "application/x-msdownload",
            "content_base64": "not-real",
        },
        headers=seller,
    )

    assert missing_file.status_code == 422
    assert invalid_file.status_code == 400
    assert "PDF, JPEG, PNG, or WEBP" in invalid_file.json()["detail"]
