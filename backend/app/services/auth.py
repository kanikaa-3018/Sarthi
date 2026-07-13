from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import sqlite3
from uuid import uuid4


IST = timezone(timedelta(hours=5, minutes=30))
PASSWORD_ITERATIONS = 210_000
SESSION_HOURS = 12


SEEDED_ACCOUNTS = [
    {
        "account_id": "acct_buyer_asha",
        "username": "asha.buyer",
        "display_name": "Asha",
        "role": "buyer",
        "buyer_id": "buyer_asha",
        "seller_id": None,
        "password": "buyer-asha-pass",
    },
    {
        "account_id": "acct_buyer_neha",
        "username": "neha.buyer",
        "display_name": "Neha",
        "role": "buyer",
        "buyer_id": "buyer_neha",
        "seller_id": None,
        "password": "buyer-neha-pass",
    },
    {
        "account_id": "acct_buyer_cold",
        "username": "new.buyer",
        "display_name": "New buyer",
        "role": "buyer",
        "buyer_id": "buyer_cold",
        "seller_id": None,
        "password": "buyer-new-pass",
    },
    {
        "account_id": "acct_seller_a",
        "username": "seller.a",
        "display_name": "NayiDisha Fashions",
        "role": "seller",
        "buyer_id": None,
        "seller_id": "seller_a",
        "password": "seller-a-pass",
    },
    {
        "account_id": "acct_seller_b",
        "username": "seller.b",
        "display_name": "RangSetu Styles",
        "role": "seller",
        "buyer_id": None,
        "seller_id": "seller_b",
        "password": "seller-b-pass",
    },
    {
        "account_id": "acct_seller_c",
        "username": "seller.c",
        "display_name": "Sakhi Wholesale",
        "role": "seller",
        "buyer_id": None,
        "seller_id": "seller_c",
        "password": "seller-c-pass",
    },
    {
        "account_id": "acct_admin_reviewer",
        "username": "reviewer.admin",
        "display_name": "Catalog Reviewer",
        "role": "admin",
        "buyer_id": None,
        "seller_id": None,
        "password": "admin-reviewer-pass",
    },
]


def seed_auth_accounts(conn: sqlite3.Connection) -> None:
    now = _now()
    for account in SEEDED_ACCOUNTS:
        salt, password_hash = hash_password(account["password"], salt=account["account_id"])
        conn.execute(
            """
            INSERT INTO accounts
            (account_id, username, display_name, role, buyer_id, seller_id, password_salt, password_hash, disabled, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            """,
            (
                account["account_id"],
                account["username"],
                account["display_name"],
                account["role"],
                account["buyer_id"],
                account["seller_id"],
                salt,
                password_hash,
                now,
            ),
        )


def authenticate_account(conn: sqlite3.Connection, username: str, password: str) -> dict | None:
    row = conn.execute(
        """
        SELECT *
        FROM accounts
        WHERE username = ? AND disabled = 0
        """,
        (username.strip().lower(),),
    ).fetchone()
    if not row:
        return None
    account = dict(row)
    if not verify_password(password, account["password_salt"], account["password_hash"]):
        return None
    return public_account(account)


def register_buyer_account(
    conn: sqlite3.Connection,
    username: str,
    password: str,
    display_name: str,
    language: str = "hinglish",
) -> dict:
    _validate_credentials(username, password)
    buyer_id = f"buyer_user_{uuid4().hex[:10]}"
    account_id = f"acct_{buyer_id}"
    now = _now()
    salt, password_hash = hash_password(password)
    try:
        conn.execute(
            """
            INSERT INTO buyers (buyer_id, display_name, language, cod_preferred, fit_memory_enabled)
            VALUES (?, ?, ?, 1, 1)
            """,
            (buyer_id, display_name.strip(), language),
        )
        conn.execute(
            """
            INSERT INTO accounts
            (account_id, username, display_name, role, buyer_id, seller_id, password_salt, password_hash, disabled, created_at)
            VALUES (?, ?, ?, 'buyer', ?, NULL, ?, ?, 0, ?)
            """,
            (account_id, username.strip().lower(), display_name.strip(), buyer_id, salt, password_hash, now),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("Username is already registered") from exc
    return public_account(
        {
            "account_id": account_id,
            "username": username.strip().lower(),
            "display_name": display_name.strip(),
            "role": "buyer",
            "buyer_id": buyer_id,
            "seller_id": None,
        }
    )


def register_seller_application(
    conn: sqlite3.Connection,
    username: str,
    password: str,
    business_name: str,
    gst_number: str,
    pickup_pincode: str,
    support_contact: str,
) -> dict:
    _validate_credentials(username, password)
    if len(pickup_pincode.strip()) != 6 or not pickup_pincode.strip().isdigit():
        raise ValueError("Pickup pincode must be a 6 digit Indian pincode")
    if len(gst_number.strip()) < 10:
        raise ValueError("GST or business registration number is too short")

    seller_id = f"seller_user_{uuid4().hex[:10]}"
    account_id = f"acct_{seller_id}"
    application_id = f"seller_app_{uuid4().hex[:10]}"
    now = _now()
    salt, password_hash = hash_password(password)
    try:
        conn.execute(
            "INSERT INTO sellers (seller_id, name, median_dispatch_hours) VALUES (?, ?, 48)",
            (seller_id, business_name.strip()),
        )
        conn.execute(
            """
            INSERT INTO seller_profiles
            (seller_id, verification_status, gst_status, kyc_status, pickup_pincode, categories_json,
             support_contact, data_access_level, restricted_reason, last_verified_at)
            VALUES (?, 'pending', 'pending_review', 'not_started', ?, '[]', ?, 'limited', NULL, ?)
            """,
            (seller_id, pickup_pincode.strip(), support_contact.strip(), now),
        )
        conn.execute(
            """
            INSERT INTO seller_applications
            (application_id, seller_id, business_name, gst_number, pickup_pincode, support_contact, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending_review', ?)
            """,
            (
                application_id,
                seller_id,
                business_name.strip(),
                gst_number.strip().upper(),
                pickup_pincode.strip(),
                support_contact.strip(),
                now,
            ),
        )
        conn.execute(
            """
            INSERT INTO accounts
            (account_id, username, display_name, role, buyer_id, seller_id, password_salt, password_hash, disabled, created_at)
            VALUES (?, ?, ?, 'seller', NULL, ?, ?, ?, 0, ?)
            """,
            (account_id, username.strip().lower(), business_name.strip(), seller_id, salt, password_hash, now),
        )
    except sqlite3.IntegrityError as exc:
        raise ValueError("Username is already registered") from exc
    account = public_account(
        {
            "account_id": account_id,
            "username": username.strip().lower(),
            "display_name": business_name.strip(),
            "role": "seller",
            "buyer_id": None,
            "seller_id": seller_id,
        }
    )
    account["application_id"] = application_id
    account["verification_status"] = "pending"
    return account


def create_session(conn: sqlite3.Connection, account_id: str) -> dict:
    token = secrets.token_urlsafe(32)
    created_at = _now()
    expires_at = (datetime.now(IST) + timedelta(hours=SESSION_HOURS)).isoformat()
    conn.execute(
        """
        INSERT INTO auth_sessions (token_hash, account_id, created_at, expires_at, revoked_at)
        VALUES (?, ?, ?, ?, NULL)
        """,
        (_token_hash(token), account_id, created_at, expires_at),
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires_at,
    }


def account_for_token(conn: sqlite3.Connection, token: str) -> dict | None:
    row = conn.execute(
        """
        SELECT a.*
        FROM auth_sessions s
        JOIN accounts a ON a.account_id = s.account_id
        WHERE s.token_hash = ?
          AND s.revoked_at IS NULL
          AND s.expires_at > ?
          AND a.disabled = 0
        """,
        (_token_hash(token), _now()),
    ).fetchone()
    return public_account(dict(row)) if row else None


def revoke_session(conn: sqlite3.Connection, token: str) -> None:
    conn.execute(
        "UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ?",
        (_now(), _token_hash(token)),
    )
    conn.commit()


def public_account(account: dict) -> dict:
    return {
        "account_id": account["account_id"],
        "username": account["username"],
        "display_name": account["display_name"],
        "role": account["role"],
        "buyer_id": account.get("buyer_id"),
        "seller_id": account.get("seller_id"),
    }


def _validate_credentials(username: str, password: str) -> None:
    normalized = username.strip()
    if len(normalized) < 4:
        raise ValueError("Username must be at least 4 characters")
    if len(password) < 10:
        raise ValueError("Password must be at least 10 characters")
    if not any(char.isalpha() for char in password) or not any(char.isdigit() for char in password):
        raise ValueError("Password must include at least one letter and one number")


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    password_salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        password_salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
    ).hex()
    return password_salt, digest


def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    _, actual_hash = hash_password(password, salt=salt)
    return secrets.compare_digest(actual_hash, expected_hash)


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(IST).isoformat()
