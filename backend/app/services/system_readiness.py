from __future__ import annotations

import sqlite3

from app.config import settings
from app.services.data_contracts import list_data_sources, source_health_summary


PRODUCTION_CONNECTORS = [
    {
        "name": "Catalog, variants, and seller listing metadata",
        "prototype_source": "SQLite seed catalog",
        "production_source": "authorized marketplace catalog service",
        "status": "adapter_required",
    },
    {
        "name": "Orders, returns, and exchange outcomes",
        "prototype_source": "synthetic order outcome facts",
        "production_source": "authorized order and returns systems",
        "status": "adapter_required",
    },
    {
        "name": "Reviews and attribute extraction",
        "prototype_source": "seeded review passages with fact IDs",
        "production_source": "review service and moderation/indexing pipeline",
        "status": "adapter_required",
    },
    {
        "name": "Campaign, price, and inventory truth",
        "prototype_source": "seeded price/campaign/inventory ledgers",
        "production_source": "pricing, campaign, and available-to-promise systems",
        "status": "adapter_required",
    },
    {
        "name": "Seller KYC/GST verification",
        "prototype_source": "reviewer workflow with uploaded file hashes",
        "production_source": "seller platform plus KYC/GST provider integrations",
        "status": "provider_required",
    },
    {
        "name": "Identity and session security",
        "prototype_source": "local username/password sessions",
        "production_source": "OTP/IAM, recovery, risk checks, and device/session controls",
        "status": "provider_required",
    },
]


def build_system_readiness(conn: sqlite3.Connection) -> dict:
    source_health = source_health_summary(list_data_sources(conn))
    production_blockers = [
        "Official marketplace data connectors are not configured in this local prototype.",
        "OTP/IAM, account recovery, and device/session risk controls are not connected.",
        "Seller document upload is local evidence storage, not third-party KYC/GST verification.",
        "Media uploads and listing publishing write to local prototype storage, not a production catalog service.",
        "Observability, rate limiting, alerting, and compliance-grade audit retention are not deployed.",
    ]
    return {
        "app_env": settings.app_env,
        "data_mode": "deterministic_synthetic_prototype",
        "user_disclosure": (
            "This local prototype uses deterministic synthetic commerce facts. It proves the evidence, "
            "privacy, and review workflows; a production deployment must connect the same contracts to "
            "authorized first-party marketplace systems."
        ),
        "source_health": source_health,
        "implemented_controls": [
            "buyer, seller, and admin role separation",
            "server-side ownership checks",
            "fact IDs and audit traces for buyer claims",
            "seller verification gates before publishing",
            "uploaded seller document hashes and storage metadata",
            "reviewer audit events for approval/revision decisions",
            "data freshness states that lower confidence when evidence is stale",
            "buyer memory controls and deletion",
        ],
        "production_connectors": PRODUCTION_CONNECTORS,
        "production_blockers": production_blockers,
        "can_compete_without_blockers": False,
    }
