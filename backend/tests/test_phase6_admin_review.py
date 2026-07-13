import base64

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import admin_headers, buyer_headers, seller_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "phase6.db")
    return TestClient(app)


def _document_payload(document_type: str) -> dict:
    return {
        "document_type": document_type,
        "reference": f"{document_type} verified 9988",
        "file_name": f"{document_type}.pdf",
        "mime_type": "application/pdf",
        "content_base64": base64.b64encode(f"{document_type}:phase6 evidence".encode("utf-8")).decode("ascii"),
    }


def _submit_required_documents(client: TestClient, seller_headers_: dict) -> None:
    for document_type in ("address_proof", "bank_proof"):
        response = client.post(
            "/seller/me/verification/documents",
            json=_document_payload(document_type),
            headers=seller_headers_,
        )
        assert response.status_code == 200


def test_admin_review_queue_is_role_protected(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    buyer = buyer_headers(client, "buyer_asha")
    seller = seller_headers(client, "seller_c")
    admin = admin_headers(client)

    assert client.get("/admin/review-queue", headers=buyer).status_code == 403
    assert client.get("/admin/review-queue", headers=seller).status_code == 403
    response = client.get("/admin/review-queue", headers=admin)

    assert response.status_code == 200
    payload = response.json()
    assert payload["seller_applications"]
    assert payload["documents"]
    assert "listing_drafts" in payload


def test_admin_can_approve_pending_seller_application(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    admin = admin_headers(client)
    seller = seller_headers(client, "seller_b")

    before = client.get("/seller/me/onboarding", headers=seller).json()
    application_id = before["application"]["application_id"]
    assert before["seller_verification"]["verification_status"] == "pending"

    blocked = client.post(
        f"/admin/seller-applications/{application_id}/approve",
        json={"notes": "Should fail until required uploaded evidence exists."},
        headers=admin,
    )
    _submit_required_documents(client, seller)
    approve = client.post(
        f"/admin/seller-applications/{application_id}/approve",
        json={"notes": "Verified GST and pickup address."},
        headers=admin,
    )
    after = client.get("/seller/me/onboarding", headers=seller).json()
    queue = approve.json()

    assert blocked.status_code == 400
    assert "missing uploaded evidence" in blocked.json()["detail"]
    assert approve.status_code == 200
    assert after["seller_verification"]["verification_status"] == "verified"
    assert after["seller_verification"]["data_access_level"] == "aggregate_only"
    assert queue["audit_events"][0]["action"] == "seller_application_approved"


def test_admin_approval_publishes_submitted_listing_to_buyer_feed(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    seller = seller_headers(client, "seller_c")
    admin = admin_headers(client)
    buyer = buyer_headers(client, "buyer_asha")

    create = client.post(
        "/seller/me/listing-drafts",
        json={
            "title": "Blue Floral Cotton Kurti Published Seller Listing",
            "category": "women_kurtis",
            "garment_type": "kurti",
            "fabric": "cotton blend",
            "color_family": "blue",
            "base_price": 459,
            "image_url": "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab",
        },
        headers=seller,
    )
    draft_id = create.json()["listing_drafts"][0]["draft_id"]
    client.post(f"/seller/me/listing-drafts/{draft_id}/submit", headers=seller)

    before_feed = client.get("/feed?buyer_id=buyer_asha&limit=100", headers=buyer).json()
    approve = client.post(
        f"/admin/listing-drafts/{draft_id}/approve",
        json={"notes": "Catalog details reviewed."},
        headers=admin,
    )
    after_feed = client.get("/feed?buyer_id=buyer_asha&limit=100", headers=buyer).json()
    published_id = f"published_{draft_id}"
    product_detail = client.get(f"/products/{published_id}?buyer_id=buyer_asha", headers=buyer)

    assert approve.status_code == 200
    assert after_feed["total"] == before_feed["total"] + 1
    published = next(product for product in after_feed["products"] if product["product_id"] == published_id)
    assert published["seller_id"] == "seller_c"
    assert published["cluster_id"] == "cluster_floral_blue"
    assert product_detail.status_code == 200
    assert product_detail.json()["trust_state"]["status"] == "limited_evidence"
    assert approve.json()["audit_events"][0]["action"] == "listing_draft_published"


def test_admin_cannot_publish_unsubmitted_or_unverified_seller_draft(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    seller = seller_headers(client, "seller_b")
    admin = admin_headers(client)

    create = client.post(
        "/seller/me/listing-drafts",
        json={
            "title": "Pink Printed Straight Kurti Review Blocked",
            "category": "women_kurtis",
            "garment_type": "kurti",
            "fabric": "rayon blend",
            "color_family": "pink",
            "base_price": 419,
            "image_url": "https://images.unsplash.com/photo-1509631179647-0177331693ae",
        },
        headers=seller,
    )
    draft_id = create.json()["listing_drafts"][0]["draft_id"]
    unsubmitted = client.post(
        f"/admin/listing-drafts/{draft_id}/approve",
        json={"notes": "Should fail before seller submits."},
        headers=admin,
    )
    client.post(f"/seller/me/listing-drafts/{draft_id}/submit", headers=seller)
    unverified = client.post(
        f"/admin/listing-drafts/{draft_id}/approve",
        json={"notes": "Should fail until seller verification clears."},
        headers=admin,
    )

    assert unsubmitted.status_code == 400
    assert "submitted" in unsubmitted.json()["detail"]
    assert unverified.status_code == 400
    assert "Seller must be verified" in unverified.json()["detail"]
