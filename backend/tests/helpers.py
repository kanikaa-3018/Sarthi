from fastapi.testclient import TestClient


def auth_headers(client: TestClient, username: str = "asha.buyer", password: str = "buyer-asha-pass") -> dict:
    response = client.post(
        "/auth/login",
        json={
            "username": username,
            "password": password,
        },
    )
    assert response.status_code == 200
    return {
        "Authorization": f"Bearer {response.json()['access_token']}",
    }


def buyer_headers(client: TestClient, buyer_id: str = "buyer_asha") -> dict:
    credentials = {
        "buyer_asha": ("asha.buyer", "buyer-asha-pass"),
        "buyer_neha": ("neha.buyer", "buyer-neha-pass"),
        "buyer_cold": ("new.buyer", "buyer-new-pass"),
    }
    username, password = credentials[buyer_id]
    return auth_headers(client, username, password)


def seller_headers(client: TestClient, seller_id: str = "seller_a") -> dict:
    credentials = {
        "seller_a": ("seller.a", "seller-a-pass"),
        "seller_b": ("seller.b", "seller-b-pass"),
        "seller_c": ("seller.c", "seller-c-pass"),
    }
    username, password = credentials[seller_id]
    return auth_headers(client, username, password)


def admin_headers(client: TestClient) -> dict:
    return auth_headers(client, "reviewer.admin", "admin-reviewer-pass")
