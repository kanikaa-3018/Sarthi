import sqlite3

from fastapi.testclient import TestClient

from app.config import settings
from app.main import app
from helpers import buyer_headers, seller_headers


def _client(tmp_path):
    object.__setattr__(settings, "database_path", tmp_path / "auth_rbac.db")
    return TestClient(app)


def test_login_me_and_logout_session_lifecycle(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    headers = buyer_headers(client, "buyer_asha")
    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["account"]["role"] == "buyer"
    assert me.json()["account"]["buyer_id"] == "buyer_asha"

    logout = client.post("/auth/logout", headers=headers)
    assert logout.status_code == 200

    after_logout = client.get("/auth/me", headers=headers)
    assert after_logout.status_code == 401


def test_login_normalizes_username_whitespace_and_case(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    response = client.post(
        "/auth/login",
        json={"username": "  ASHA.BUYER  ", "password": "buyer-asha-pass"},
    )

    assert response.status_code == 200
    assert response.json()["account"]["buyer_id"] == "buyer_asha"


def test_anonymous_requests_are_denied_for_private_buyer_api(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    response = client.get("/feed?buyer_id=buyer_asha")
    assert response.status_code == 401


def test_buyer_cannot_access_seller_panel(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    response = client.get("/sellers/seller_a/panel?cluster_id=cluster_floral_blue", headers=headers)
    assert response.status_code == 403


def test_seller_cannot_access_buyer_memory(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_a")

    response = client.get("/buyers/buyer_asha/memory", headers=headers)
    assert response.status_code == 403


def test_seller_cannot_access_another_seller_panel(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = seller_headers(client, "seller_a")

    response = client.get("/sellers/seller_b/panel?cluster_id=cluster_floral_blue", headers=headers)
    assert response.status_code == 403


def test_buyer_cannot_access_another_buyer_account(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")
    headers = buyer_headers(client, "buyer_asha")

    response = client.get("/buyers/buyer_neha/memory", headers=headers)
    assert response.status_code == 403


def test_buyer_signup_creates_database_backed_account_and_session(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    signup = client.post(
        "/auth/signup/buyer",
        json={
            "username": "riya.buyer",
            "password": "riya-pass-123",
            "display_name": "Riya",
            "language": "hinglish",
        },
    )
    assert signup.status_code == 200
    payload = signup.json()
    assert payload["account"]["role"] == "buyer"
    assert payload["account"]["buyer_id"].startswith("buyer_user_")

    headers = {"Authorization": f"Bearer {payload['access_token']}"}
    memory = client.get(f"/buyers/{payload['account']['buyer_id']}/memory", headers=headers)
    assert memory.status_code == 200
    assert memory.json()["privacy"]["fit_memory_enabled"] is True

    duplicate = client.post(
        "/auth/signup/buyer",
        json={
            "username": "riya.buyer",
            "password": "another-pass-123",
            "display_name": "Riya Two",
        },
    )
    assert duplicate.status_code == 400


def test_buyer_signup_accepts_bharat_language_preference(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    signup = client.post(
        "/auth/signup/buyer",
        json={
            "username": "kavya.buyer",
            "password": "kavya-pass-123",
            "display_name": "Kavya",
            "language": "tamil",
        },
    )

    assert signup.status_code == 200
    buyer_id = signup.json()["account"]["buyer_id"]
    conn = sqlite3.connect(settings.database_path)
    try:
        language = conn.execute("SELECT language FROM buyers WHERE buyer_id = ?", (buyer_id,)).fetchone()[0]
    finally:
        conn.close()
    assert language == "tamil"


def test_signup_rejects_weak_passwords(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    too_short = client.post(
        "/auth/signup/buyer",
        json={
            "username": "weak.buyer",
            "password": "short1",
            "display_name": "Weak",
        },
    )
    no_number = client.post(
        "/auth/signup/buyer",
        json={
            "username": "weak.buyer2",
            "password": "longpassword",
            "display_name": "Weak",
        },
    )

    assert too_short.status_code == 400
    assert "at least 10 characters" in too_short.json()["detail"]
    assert no_number.status_code == 400
    assert "one letter and one number" in no_number.json()["detail"]


def test_seller_signup_creates_pending_application_not_verified_access(tmp_path):
    client = _client(tmp_path)
    client.post("/seed/reset")

    signup = client.post(
        "/auth/signup/seller",
        json={
            "username": "new.seller",
            "password": "seller-pass-123",
            "business_name": "Nayi Seller Store",
            "gst_number": "29ABCDE1234F1Z5",
            "pickup_pincode": "560001",
            "support_contact": "seller@example.local",
        },
    )
    assert signup.status_code == 200
    payload = signup.json()
    assert payload["account"]["role"] == "seller"
    assert payload["application"]["status"] == "pending_review"

    headers = {"Authorization": f"Bearer {payload['access_token']}"}
    sellers = client.get("/sellers", headers=headers)
    assert sellers.status_code == 200
    assert sellers.json()["sellers"][0]["product_count"] == 0

    panel = client.get("/seller/me/panel", headers=headers)
    assert panel.status_code == 404
