from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sqlite3
from uuid import uuid4


IST = timezone(timedelta(hours=5, minutes=30))
APPAREL_SIZES = ["S", "M", "L", "XL", "XXL"]
ONE_SIZE_CATEGORIES = {"women_accessories", "home_furnishing", "women_sarees"}
REQUIRED_VERIFICATION_DOCUMENTS = {"gst_certificate", "address_proof", "bank_proof"}


def build_review_queue(conn: sqlite3.Connection) -> dict:
    return {
        "seller_applications": _seller_applications(conn),
        "documents": _documents(conn),
        "listing_drafts": _listing_drafts(conn),
        "audit_events": _audit_events(conn),
    }


def approve_seller_application(
    conn: sqlite3.Connection,
    application_id: str,
    actor_account_id: str,
    notes: str = "",
) -> dict:
    application = conn.execute(
        "SELECT * FROM seller_applications WHERE application_id = ?",
        (application_id,),
    ).fetchone()
    if not application:
        raise ValueError(f"Unknown seller application: {application_id}")
    missing = _missing_required_documents(conn, application["seller_id"])
    if missing:
        raise ValueError(f"Seller verification is missing uploaded evidence for: {', '.join(sorted(missing))}")
    now = _now()
    conn.execute(
        "UPDATE seller_applications SET status = 'approved' WHERE application_id = ?",
        (application_id,),
    )
    conn.execute(
        """
        UPDATE seller_profiles
        SET verification_status = 'verified',
            gst_status = 'verified',
            kyc_status = 'verified',
            data_access_level = 'aggregate_only',
            restricted_reason = NULL,
            last_verified_at = ?
        WHERE seller_id = ?
        """,
        (now, application["seller_id"]),
    )
    conn.execute(
        """
        UPDATE seller_verification_documents
        SET status = 'approved',
            reviewed_at = ?,
            notes = CASE WHEN notes = '' THEN ? ELSE notes END
        WHERE seller_id = ?
          AND status IN ('submitted', 'under_review')
        """,
        (now, notes or "Approved during seller verification review.", application["seller_id"]),
    )
    _record_review_event(
        conn,
        actor_account_id=actor_account_id,
        action="seller_application_approved",
        target_type="seller_application",
        target_id=application_id,
        seller_id=application["seller_id"],
        decision="approved",
        notes=notes or "Seller verification approved after document evidence review.",
        created_at=now,
    )
    conn.commit()
    return build_review_queue(conn)


def reject_seller_application(
    conn: sqlite3.Connection,
    application_id: str,
    actor_account_id: str,
    notes: str,
) -> dict:
    application = conn.execute(
        "SELECT * FROM seller_applications WHERE application_id = ?",
        (application_id,),
    ).fetchone()
    if not application:
        raise ValueError(f"Unknown seller application: {application_id}")
    if len(notes.strip()) < 8:
        raise ValueError("Rejection notes are required")
    now = _now()
    conn.execute(
        "UPDATE seller_applications SET status = 'rejected' WHERE application_id = ?",
        (application_id,),
    )
    conn.execute(
        """
        UPDATE seller_profiles
        SET verification_status = 'restricted',
            restricted_reason = ?,
            data_access_level = 'restricted',
            last_verified_at = ?
        WHERE seller_id = ?
        """,
        (notes.strip(), now, application["seller_id"]),
    )
    _record_review_event(
        conn,
        actor_account_id=actor_account_id,
        action="seller_application_rejected",
        target_type="seller_application",
        target_id=application_id,
        seller_id=application["seller_id"],
        decision="rejected",
        notes=notes.strip(),
        created_at=now,
    )
    conn.commit()
    return build_review_queue(conn)


def approve_listing_draft(
    conn: sqlite3.Connection,
    draft_id: str,
    actor_account_id: str,
    notes: str = "",
) -> dict:
    draft = conn.execute(
        "SELECT * FROM listing_drafts WHERE draft_id = ?",
        (draft_id,),
    ).fetchone()
    if not draft:
        raise ValueError(f"Unknown listing draft: {draft_id}")
    if draft["status"] != "submitted":
        raise ValueError(f"Listing draft must be submitted before approval, current status is {draft['status']}")

    profile = conn.execute(
        "SELECT verification_status FROM seller_profiles WHERE seller_id = ?",
        (draft["seller_id"],),
    ).fetchone()
    if not profile or profile["verification_status"] != "verified":
        raise ValueError("Seller must be verified before listing can be published")

    product_id = f"published_{draft_id}"
    if conn.execute("SELECT 1 FROM products WHERE product_id = ?", (product_id,)).fetchone():
        raise ValueError("Listing draft has already been published")

    cluster_id = draft["target_cluster_id"] or f"cluster_{draft_id}"
    if not draft["target_cluster_id"]:
        conn.execute(
            """
            INSERT INTO duplicate_clusters (cluster_id, label, category)
            VALUES (?, ?, ?)
            """,
            (cluster_id, draft["title"], draft["category"]),
        )

    is_sarthi_eligible = 1 if draft["target_cluster_id"] else 0
    conn.execute(
        """
        INSERT INTO products
        (product_id, cluster_id, seller_id, title, category, garment_type, fabric, color_family, base_price,
         image_url, rating, rating_count, commerce_badge, delivery_text, is_sarthi_eligible)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 4.0, 0, 'New seller', 'Delivery after seller confirmation', ?)
        """,
        (
            product_id,
            cluster_id,
            draft["seller_id"],
            draft["title"],
            draft["category"],
            draft["garment_type"],
            draft["fabric"],
            draft["color_family"],
            draft["base_price"],
            draft["image_url"],
            is_sarthi_eligible,
        ),
    )
    for index, size in enumerate(_sizes_for_category(draft["category"])):
        conn.execute(
            "INSERT INTO variants VALUES (?, ?, ?, ?, ?)",
            (
                f"{product_id}_{size.lower()}",
                product_id,
                size,
                int(draft["base_price"]) + index * 10,
                12 + index * 2,
            ),
        )

    readiness = "evidence_building" if draft["target_cluster_id"] else "catalog_only"
    now = _now()
    conn.execute(
        """
        UPDATE listing_drafts
        SET status = 'approved',
            readiness_status = ?,
            updated_at = ?
        WHERE draft_id = ?
        """,
        (readiness, now, draft_id),
    )
    conn.execute(
        """
        INSERT INTO fact_records
        (fact_id, source_table, source_id, source_type, summary, created_at, expires_at)
        VALUES (?, 'listing_drafts', ?, 'catalog_review', ?, ?, NULL)
        """,
        (
            f"fact_publish_{draft_id}",
            draft_id,
            f"Reviewer approved listing draft {draft_id}. {notes}".strip(),
            now,
        ),
    )
    _record_review_event(
        conn,
        actor_account_id=actor_account_id,
        action="listing_draft_published",
        target_type="listing_draft",
        target_id=draft_id,
        seller_id=draft["seller_id"],
        decision="approved",
        notes=notes or "Listing draft approved for buyer feed publishing.",
        created_at=now,
    )
    conn.commit()
    return build_review_queue(conn)


def request_listing_revision(
    conn: sqlite3.Connection,
    draft_id: str,
    actor_account_id: str,
    notes: str,
) -> dict:
    if len(notes.strip()) < 8:
        raise ValueError("Revision notes are required")
    draft = conn.execute("SELECT * FROM listing_drafts WHERE draft_id = ?", (draft_id,)).fetchone()
    if not draft:
        raise ValueError(f"Unknown listing draft: {draft_id}")
    conn.execute(
        """
        UPDATE listing_drafts
        SET status = 'needs_revision',
            updated_at = ?
        WHERE draft_id = ?
        """,
        (_now(), draft_id),
    )
    _record_review_event(
        conn,
        actor_account_id=actor_account_id,
        action="listing_revision_requested",
        target_type="listing_draft",
        target_id=draft_id,
        seller_id=draft["seller_id"],
        decision="needs_revision",
        notes=notes.strip(),
        created_at=_now(),
    )
    conn.commit()
    return build_review_queue(conn)


def _seller_applications(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT a.*, s.name AS seller_name, sp.verification_status
        FROM seller_applications a
        JOIN sellers s ON s.seller_id = a.seller_id
        LEFT JOIN seller_profiles sp ON sp.seller_id = a.seller_id
        ORDER BY
          CASE a.status WHEN 'pending_review' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
          a.created_at DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def _documents(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT d.*, s.name AS seller_name
        FROM seller_verification_documents d
        JOIN sellers s ON s.seller_id = d.seller_id
        ORDER BY
          CASE d.status WHEN 'submitted' THEN 0 WHEN 'under_review' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
          d.submitted_at DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def _listing_drafts(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT d.*, s.name AS seller_name, sp.verification_status
        FROM listing_drafts d
        JOIN sellers s ON s.seller_id = d.seller_id
        LEFT JOIN seller_profiles sp ON sp.seller_id = d.seller_id
        ORDER BY
          CASE d.status WHEN 'submitted' THEN 0 WHEN 'needs_revision' THEN 1 WHEN 'draft' THEN 2 ELSE 3 END,
          d.updated_at DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def _audit_events(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT e.*, a.display_name AS actor_name
        FROM reviewer_audit_events e
        JOIN accounts a ON a.account_id = e.actor_account_id
        ORDER BY e.created_at DESC
        LIMIT 25
        """
    ).fetchall()
    return [dict(row) for row in rows]


def _missing_required_documents(conn: sqlite3.Connection, seller_id: str) -> set[str]:
    rows = conn.execute(
        """
        SELECT document_type
        FROM seller_verification_documents
        WHERE seller_id = ?
          AND status IN ('submitted', 'under_review', 'approved')
          AND sha256 != ''
          AND storage_uri != ''
          AND file_size_bytes > 0
        """,
        (seller_id,),
    ).fetchall()
    available = {row["document_type"] for row in rows}
    return REQUIRED_VERIFICATION_DOCUMENTS - available


def _record_review_event(
    conn: sqlite3.Connection,
    actor_account_id: str,
    action: str,
    target_type: str,
    target_id: str,
    seller_id: str,
    decision: str,
    notes: str,
    created_at: str,
) -> None:
    conn.execute(
        """
        INSERT INTO reviewer_audit_events
        (event_id, actor_account_id, action, target_type, target_id, seller_id, decision, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"review_event_{uuid4().hex[:12]}",
            actor_account_id,
            action,
            target_type,
            target_id,
            seller_id,
            decision,
            notes.strip(),
            created_at,
        ),
    )


def _sizes_for_category(category: str) -> list[str]:
    if category in ONE_SIZE_CATEGORIES:
        return ["ONE_SIZE"]
    return APPAREL_SIZES


def _now() -> str:
    return datetime.now(IST).isoformat()
