from __future__ import annotations

import sqlite3
from pathlib import Path

from app.config import settings


SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS buyers (
      buyer_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      language TEXT NOT NULL,
      cod_preferred INTEGER NOT NULL,
      fit_memory_enabled INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sellers (
      seller_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      median_dispatch_hours INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS seller_profiles (
      seller_id TEXT PRIMARY KEY REFERENCES sellers(seller_id),
      verification_status TEXT NOT NULL CHECK(verification_status IN ('verified', 'pending', 'restricted')),
      gst_status TEXT NOT NULL,
      kyc_status TEXT NOT NULL,
      pickup_pincode TEXT NOT NULL,
      categories_json TEXT NOT NULL,
      support_contact TEXT NOT NULL,
      data_access_level TEXT NOT NULL CHECK(data_access_level IN ('aggregate_only', 'limited', 'restricted')),
      restricted_reason TEXT,
      last_verified_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS accounts (
      account_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('buyer', 'seller', 'admin')),
      buyer_id TEXT REFERENCES buyers(buyer_id),
      seller_id TEXT REFERENCES sellers(seller_id),
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token_hash TEXT PRIMARY KEY,
      account_id TEXT NOT NULL REFERENCES accounts(account_id),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revoked_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS data_sources (
      source_id TEXT PRIMARY KEY,
      domain TEXT NOT NULL,
      display_name TEXT NOT NULL,
      owner_system TEXT NOT NULL,
      reliability TEXT NOT NULL,
      freshness_sla_hours INTEGER NOT NULL,
      last_synced_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('operational', 'degraded', 'stale', 'unavailable')),
      notes TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS duplicate_clusters (
      cluster_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS products (
      product_id TEXT PRIMARY KEY,
      cluster_id TEXT NOT NULL REFERENCES duplicate_clusters(cluster_id),
      seller_id TEXT NOT NULL REFERENCES sellers(seller_id),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      garment_type TEXT NOT NULL,
      fabric TEXT NOT NULL,
      color_family TEXT NOT NULL,
      base_price INTEGER NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      rating REAL NOT NULL DEFAULT 4.0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      commerce_badge TEXT NOT NULL DEFAULT '',
      delivery_text TEXT NOT NULL DEFAULT '',
      is_sarthi_eligible INTEGER NOT NULL DEFAULT 1
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS variants (
      variant_id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(product_id),
      size TEXT NOT NULL,
      current_price INTEGER NOT NULL,
      stock INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS reviews (
      review_id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(product_id),
      variant_id TEXT REFERENCES variants(variant_id),
      attribute TEXT NOT NULL,
      sentiment TEXT NOT NULL,
      text TEXT NOT NULL,
      rating REAL NOT NULL,
      fact_id TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS order_outcomes (
      order_id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      variant_id TEXT NOT NULL REFERENCES variants(variant_id),
      status TEXT NOT NULL CHECK(status IN ('delivered_kept', 'returned', 'exchanged', 'rto')),
      return_reason TEXT CHECK(return_reason IS NULL OR return_reason IN ('too_small', 'too_large', 'color_different', 'fabric_different', 'damaged')),
      created_at TEXT NOT NULL,
      fact_id TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS price_events (
      price_event_id TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL REFERENCES variants(variant_id),
      price INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      fact_id TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS campaigns (
      campaign_id TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL REFERENCES variants(variant_id),
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      timer_reset_count INTEGER NOT NULL,
      fact_id TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS inventory_snapshots (
      snapshot_id TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL REFERENCES variants(variant_id),
      available_to_promise INTEGER NOT NULL,
      sales_velocity_24h INTEGER NOT NULL,
      captured_at TEXT NOT NULL,
      fact_id TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS fit_memory (
      memory_id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL REFERENCES buyers(buyer_id),
      category TEXT NOT NULL,
      anchor_variant_id TEXT REFERENCES variants(variant_id),
      retained_size TEXT NOT NULL,
      preferred_fit TEXT NOT NULL,
      confidence TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      fact_id TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS fact_records (
      fact_id TEXT PRIMARY KEY,
      source_table TEXT NOT NULL,
      source_id TEXT NOT NULL,
      source_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS recommendation_traces (
      trace_id TEXT PRIMARY KEY,
      buyer_id TEXT NOT NULL,
      product_id TEXT,
      variant_id TEXT,
      intent TEXT NOT NULL,
      tools_used TEXT NOT NULL,
      fact_ids TEXT NOT NULL,
      graph_paths TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS seller_applications (
      application_id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL REFERENCES sellers(seller_id),
      business_name TEXT NOT NULL,
      gst_number TEXT NOT NULL,
      pickup_pincode TEXT NOT NULL,
      support_contact TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending_review', 'approved', 'rejected')),
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS seller_verification_documents (
      document_id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL REFERENCES sellers(seller_id),
      document_type TEXT NOT NULL CHECK(document_type IN ('gst_certificate', 'pan_card', 'address_proof', 'bank_proof')),
      reference TEXT NOT NULL,
      file_name TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      sha256 TEXT NOT NULL DEFAULT '',
      storage_uri TEXT NOT NULL DEFAULT '',
      uploaded_at TEXT,
      status TEXT NOT NULL CHECK(status IN ('submitted', 'under_review', 'approved', 'rejected')),
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      notes TEXT NOT NULL DEFAULT ''
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS listing_drafts (
      draft_id TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL REFERENCES sellers(seller_id),
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      garment_type TEXT NOT NULL,
      fabric TEXT NOT NULL,
      color_family TEXT NOT NULL,
      base_price INTEGER NOT NULL,
      image_url TEXT NOT NULL,
      target_cluster_id TEXT REFERENCES duplicate_clusters(cluster_id),
      status TEXT NOT NULL CHECK(status IN ('draft', 'submitted', 'needs_revision', 'approved')),
      readiness_status TEXT NOT NULL CHECK(readiness_status IN ('blocked_seller_verification', 'catalog_only', 'evidence_building', 'recommendation_eligible')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS reviewer_audit_events (
      event_id TEXT PRIMARY KEY,
      actor_account_id TEXT NOT NULL REFERENCES accounts(account_id),
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      seller_id TEXT,
      decision TEXT NOT NULL,
      notes TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS scenario_metadata (
      scenario_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      buyer_id TEXT NOT NULL,
      cluster_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      variant_id TEXT NOT NULL,
      question TEXT NOT NULL,
      expected_json TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id)",
    "CREATE INDEX IF NOT EXISTS idx_outcomes_variant ON order_outcomes(variant_id)",
    "CREATE INDEX IF NOT EXISTS idx_outcomes_buyer ON order_outcomes(buyer_id)",
    "CREATE INDEX IF NOT EXISTS idx_price_variant ON price_events(variant_id)",
    "CREATE INDEX IF NOT EXISTS idx_fact_source ON fact_records(source_table, source_id)",
    "CREATE INDEX IF NOT EXISTS idx_sessions_account ON auth_sessions(account_id)",
]


def get_connection(db_path: Path | None = None) -> sqlite3.Connection:
    path = db_path or settings.database_path
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    _apply_lightweight_migrations(conn)
    conn.commit()
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    for statement in SCHEMA_STATEMENTS:
        conn.execute(statement)
    _apply_lightweight_migrations(conn)
    conn.commit()


def _apply_lightweight_migrations(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS seller_corrections (
          product_id TEXT PRIMARY KEY,
          l_chest REAL NOT NULL,
          xl_chest REAL NOT NULL,
          corrected_at TEXT NOT NULL
        )
        """
    )
    _migrate_accounts_admin_role(conn)
    _migrate_seller_document_assets(conn)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reviewer_audit_events (
          event_id TEXT PRIMARY KEY,
          actor_account_id TEXT NOT NULL REFERENCES accounts(account_id),
          action TEXT NOT NULL,
          target_type TEXT NOT NULL,
          target_id TEXT NOT NULL,
          seller_id TEXT,
          decision TEXT NOT NULL,
          notes TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
        """
    )
    if _table_exists(conn, "products"):
        product_columns = {row["name"] for row in conn.execute("PRAGMA table_info(products)").fetchall()}
        product_additions = {
            "image_url": "TEXT NOT NULL DEFAULT ''",
            "rating": "REAL NOT NULL DEFAULT 4.0",
            "rating_count": "INTEGER NOT NULL DEFAULT 0",
            "commerce_badge": "TEXT NOT NULL DEFAULT ''",
            "delivery_text": "TEXT NOT NULL DEFAULT ''",
            "is_sarthi_eligible": "INTEGER NOT NULL DEFAULT 1",
        }
        for column, definition in product_additions.items():
            if column not in product_columns:
                conn.execute(f"ALTER TABLE products ADD COLUMN {column} {definition}")


def _table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
        (table_name,),
    ).fetchone()
    return row is not None


def _migrate_accounts_admin_role(conn: sqlite3.Connection) -> None:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'accounts'"
    ).fetchone()
    if not row or "'admin'" in row["sql"]:
        return
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute(
        """
        CREATE TABLE accounts_new (
          account_id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('buyer', 'seller', 'admin')),
          buyer_id TEXT REFERENCES buyers(buyer_id),
          seller_id TEXT REFERENCES sellers(seller_id),
          password_salt TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          disabled INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        INSERT INTO accounts_new
        (account_id, username, display_name, role, buyer_id, seller_id, password_salt, password_hash, disabled, created_at)
        SELECT account_id, username, display_name, role, buyer_id, seller_id, password_salt, password_hash, disabled, created_at
        FROM accounts
        """
    )
    conn.execute("DROP TABLE accounts")
    conn.execute("ALTER TABLE accounts_new RENAME TO accounts")
    conn.execute("PRAGMA foreign_keys = ON")


def _migrate_seller_document_assets(conn: sqlite3.Connection) -> None:
    if not _table_exists(conn, "seller_verification_documents"):
        return
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(seller_verification_documents)").fetchall()}
    additions = {
        "file_name": "TEXT NOT NULL DEFAULT ''",
        "mime_type": "TEXT NOT NULL DEFAULT ''",
        "file_size_bytes": "INTEGER NOT NULL DEFAULT 0",
        "sha256": "TEXT NOT NULL DEFAULT ''",
        "storage_uri": "TEXT NOT NULL DEFAULT ''",
        "uploaded_at": "TEXT",
    }
    for column, definition in additions.items():
        if column not in columns:
            conn.execute(f"ALTER TABLE seller_verification_documents ADD COLUMN {column} {definition}")


def clear_db(conn: sqlite3.Connection) -> None:
    tables = [
        "recommendation_traces",
        "scenario_metadata",
        "listing_drafts",
        "reviewer_audit_events",
        "seller_verification_documents",
        "seller_applications",
        "fit_memory",
        "inventory_snapshots",
        "campaigns",
        "price_events",
        "order_outcomes",
        "reviews",
        "variants",
        "products",
        "duplicate_clusters",
        "auth_sessions",
        "accounts",
        "seller_profiles",
        "sellers",
        "buyers",
        "data_sources",
        "fact_records",
    ]
    for table in tables:
        conn.execute(f"DELETE FROM {table}")
    conn.commit()
