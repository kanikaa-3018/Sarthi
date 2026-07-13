from __future__ import annotations

import base64
import binascii
from datetime import datetime, timedelta, timezone
import hashlib
import sqlite3
from pathlib import Path
from uuid import uuid4

from app.config import settings
from app.services.data_contracts import seller_verification


IST = timezone(timedelta(hours=5, minutes=30))
DOCUMENT_TYPES = {"gst_certificate", "pan_card", "address_proof", "bank_proof"}
ALLOWED_DOCUMENT_MIME_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_DOCUMENT_BYTES = 2 * 1024 * 1024


def build_seller_onboarding(conn: sqlite3.Connection, seller_id: str) -> dict:
    seller = _seller(conn, seller_id)
    if not seller:
        raise ValueError(f"Unknown seller_id: {seller_id}")
    verification = seller_verification(conn, seller_id)
    application = _latest_application(conn, seller_id)
    documents = _documents(conn, seller_id)
    drafts = _drafts(conn, seller_id)
    return {
        "seller": seller,
        "seller_verification": verification,
        "application": application,
        "documents": documents,
        "listing_drafts": drafts,
        "policy": {
            "buyer_feed_blocked_until": [
                "seller verification is approved",
                "listing draft is reviewed",
                "catalog duplicate mapping is confirmed",
            ],
            "personal_buyer_data_used": False,
            "new_listing_default": "evidence_building",
        },
        "next_actions": _next_actions(verification, application, documents, drafts),
    }


def submit_verification_document(
    conn: sqlite3.Connection,
    seller_id: str,
    document_type: str,
    reference: str,
    file_name: str,
    mime_type: str,
    content_base64: str,
) -> dict:
    if document_type not in DOCUMENT_TYPES:
        raise ValueError(f"Unsupported document_type: {document_type}")
    if len(reference.strip()) < 6:
        raise ValueError("Document reference is too short")
    if not _seller(conn, seller_id):
        raise ValueError(f"Unknown seller_id: {seller_id}")

    document_id = f"doc_{uuid4().hex[:10]}"
    now = _now()
    asset = _store_document_asset(
        seller_id=seller_id,
        document_id=document_id,
        file_name=file_name,
        mime_type=mime_type,
        content_base64=content_base64,
        uploaded_at=now,
    )
    conn.execute(
        """
        INSERT INTO seller_verification_documents
        (document_id, seller_id, document_type, reference, file_name, mime_type, file_size_bytes, sha256,
         storage_uri, uploaded_at, status, submitted_at, reviewed_at, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, NULL, 'Awaiting verification review.')
        """,
        (
            document_id,
            seller_id,
            document_type,
            reference.strip(),
            asset["file_name"],
            asset["mime_type"],
            asset["file_size_bytes"],
            asset["sha256"],
            asset["storage_uri"],
            asset["uploaded_at"],
            now,
        ),
    )
    conn.commit()
    return build_seller_onboarding(conn, seller_id)


def create_listing_draft(
    conn: sqlite3.Connection,
    seller_id: str,
    title: str,
    category: str,
    garment_type: str,
    fabric: str,
    color_family: str,
    base_price: int,
    image_url: str,
) -> dict:
    if not _seller(conn, seller_id):
        raise ValueError(f"Unknown seller_id: {seller_id}")
    _validate_listing_input(title, category, garment_type, fabric, color_family, base_price, image_url)
    verification = seller_verification(conn, seller_id)
    target_cluster_id = _suggest_cluster(conn, category, garment_type, color_family)
    readiness = _readiness_status(verification, target_cluster_id)
    draft_id = f"draft_{uuid4().hex[:10]}"
    now = _now()
    conn.execute(
        """
        INSERT INTO listing_drafts
        (draft_id, seller_id, title, category, garment_type, fabric, color_family, base_price, image_url,
         target_cluster_id, status, readiness_status, created_at, updated_at, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, NULL)
        """,
        (
            draft_id,
            seller_id,
            title.strip(),
            category.strip(),
            garment_type.strip(),
            fabric.strip(),
            color_family.strip(),
            base_price,
            image_url.strip(),
            target_cluster_id,
            readiness,
            now,
            now,
        ),
    )
    conn.commit()
    return build_seller_onboarding(conn, seller_id)


def submit_listing_draft(conn: sqlite3.Connection, seller_id: str, draft_id: str) -> dict:
    draft = conn.execute(
        "SELECT * FROM listing_drafts WHERE draft_id = ? AND seller_id = ?",
        (draft_id, seller_id),
    ).fetchone()
    if not draft:
        raise ValueError(f"Unknown listing draft: {draft_id}")
    if draft["status"] not in {"draft", "needs_revision"}:
        raise ValueError(f"Listing draft cannot be submitted from status {draft['status']}")
    verification = seller_verification(conn, seller_id)
    readiness = _readiness_status(verification, draft["target_cluster_id"])
    now = _now()
    conn.execute(
        """
        UPDATE listing_drafts
        SET status = 'submitted',
            readiness_status = ?,
            updated_at = ?,
            submitted_at = ?
        WHERE draft_id = ? AND seller_id = ?
        """,
        (readiness, now, now, draft_id, seller_id),
    )
    conn.commit()
    return build_seller_onboarding(conn, seller_id)


def _seller(conn: sqlite3.Connection, seller_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT
          s.seller_id,
          s.name,
          s.median_dispatch_hours,
          COUNT(p.product_id) AS product_count
        FROM sellers s
        LEFT JOIN products p ON p.seller_id = s.seller_id
        WHERE s.seller_id = ?
        GROUP BY s.seller_id, s.name, s.median_dispatch_hours
        """,
        (seller_id,),
    ).fetchone()
    return dict(row) if row else None


def _latest_application(conn: sqlite3.Connection, seller_id: str) -> dict | None:
    row = conn.execute(
        """
        SELECT *
        FROM seller_applications
        WHERE seller_id = ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (seller_id,),
    ).fetchone()
    return dict(row) if row else None


def _documents(conn: sqlite3.Connection, seller_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT *
        FROM seller_verification_documents
        WHERE seller_id = ?
        ORDER BY submitted_at DESC
        """,
        (seller_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _drafts(conn: sqlite3.Connection, seller_id: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT *
        FROM listing_drafts
        WHERE seller_id = ?
        ORDER BY updated_at DESC
        """,
        (seller_id,),
    ).fetchall()
    return [dict(row) for row in rows]


def _suggest_cluster(conn: sqlite3.Connection, category: str, garment_type: str, color_family: str) -> str | None:
    row = conn.execute(
        """
        SELECT cluster_id, COUNT(*) AS count
        FROM products
        WHERE category = ?
          AND garment_type = ?
          AND color_family = ?
          AND is_sarthi_eligible = 1
        GROUP BY cluster_id
        ORDER BY count DESC, cluster_id
        LIMIT 1
        """,
        (category.strip(), garment_type.strip(), color_family.strip()),
    ).fetchone()
    return row["cluster_id"] if row else None


def _readiness_status(verification: dict, target_cluster_id: str | None) -> str:
    if verification["verification_status"] != "verified":
        return "blocked_seller_verification"
    if not target_cluster_id:
        return "catalog_only"
    return "evidence_building"


def _next_actions(
    verification: dict,
    application: dict | None,
    documents: list[dict],
    drafts: list[dict],
) -> list[dict]:
    actions: list[dict] = []
    approved_docs = {doc["document_type"] for doc in documents if doc["status"] == "approved" and _has_asset(doc)}
    submitted_docs = {
        doc["document_type"]
        for doc in documents
        if doc["status"] in {"submitted", "under_review", "approved"} and _has_asset(doc)
    }
    if verification["verification_status"] != "verified":
        missing = [doc for doc in ("gst_certificate", "address_proof", "bank_proof") if doc not in submitted_docs]
        actions.append(
            {
                "priority": "high",
                "title": "Complete seller verification",
                "detail": "Buyer-facing trust remains limited until verification is approved.",
                "blocked": True,
            }
        )
        for document_type in missing[:2]:
            actions.append(
                {
                    "priority": "high",
                    "title": f"Submit {document_type.replace('_', ' ')}",
                    "detail": "Upload a document file so review can continue.",
                    "blocked": False,
                }
            )
    if not application:
        actions.append(
            {
                "priority": "high",
                "title": "Create seller application",
                "detail": "Seller profile exists without an onboarding application record.",
                "blocked": True,
            }
        )
    if not drafts:
        actions.append(
            {
                "priority": "medium" if approved_docs else "high",
                "title": "Create first listing draft",
                "detail": "Draft listings are reviewed before they enter buyer catalog or Sarthi recommendations.",
                "blocked": False,
            }
        )
    elif any(draft["status"] == "draft" for draft in drafts):
        actions.append(
            {
                "priority": "medium",
                "title": "Submit draft listing for review",
                "detail": "Drafts stay out of the buyer feed until submitted and reviewed.",
                "blocked": False,
            }
        )
    if not actions:
        actions.append(
            {
                "priority": "low",
                "title": "Monitor submitted listings",
                "detail": "Submitted listings are waiting for review and evidence-building.",
                "blocked": False,
            }
        )
    return actions[:4]


def _validate_listing_input(
    title: str,
    category: str,
    garment_type: str,
    fabric: str,
    color_family: str,
    base_price: int,
    image_url: str,
) -> None:
    if len(title.strip()) < 8:
        raise ValueError("Listing title is too short")
    if not all(value.strip() for value in (category, garment_type, fabric, color_family)):
        raise ValueError("Listing category, garment type, fabric, and color are required")
    if base_price < 99 or base_price > 9999:
        raise ValueError("Base price must be between Rs 99 and Rs 9999")
    if not image_url.strip().startswith("https://"):
        raise ValueError("Image URL must be an HTTPS URL")


def _store_document_asset(
    seller_id: str,
    document_id: str,
    file_name: str,
    mime_type: str,
    content_base64: str,
    uploaded_at: str,
) -> dict:
    normalized_mime = mime_type.strip().lower()
    if normalized_mime not in ALLOWED_DOCUMENT_MIME_TYPES:
        raise ValueError("Document file must be a PDF, JPEG, PNG, or WEBP")
    cleaned_name = _safe_file_name(file_name)
    if not cleaned_name:
        raise ValueError("Document file name is required")
    try:
        raw = base64.b64decode(content_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Document file content is not valid base64") from exc
    if not raw:
        raise ValueError("Document file is empty")
    if len(raw) > MAX_DOCUMENT_BYTES:
        raise ValueError("Document file must be 2 MB or smaller")

    digest = hashlib.sha256(raw).hexdigest()
    extension = ALLOWED_DOCUMENT_MIME_TYPES[normalized_mime]
    storage_dir = settings.database_path.parent / "uploads" / "seller_documents" / seller_id
    storage_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{document_id}_{digest[:12]}{extension}"
    storage_path = storage_dir / stored_name
    storage_path.write_bytes(raw)
    return {
        "file_name": cleaned_name,
        "mime_type": normalized_mime,
        "file_size_bytes": len(raw),
        "sha256": digest,
        "storage_uri": _relative_storage_uri(storage_path),
        "uploaded_at": uploaded_at,
    }


def _safe_file_name(file_name: str) -> str:
    candidate = Path(file_name.strip()).name
    return "".join(char for char in candidate if char.isalnum() or char in {" ", ".", "_", "-"}).strip()[:120]


def _relative_storage_uri(path: Path) -> str:
    try:
        return str(path.relative_to(settings.database_path.parent)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def _has_asset(document: dict) -> bool:
    return bool(document.get("sha256") and document.get("storage_uri") and document.get("file_size_bytes"))


def _now() -> str:
    return datetime.now(IST).isoformat()
