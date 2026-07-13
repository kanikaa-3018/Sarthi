from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))
NOW = datetime(2026, 7, 13, 14, 32, tzinfo=IST)


def _iso(days_ago: int = 0, hours: int = 0) -> str:
    return (NOW - timedelta(days=days_ago, hours=hours)).isoformat()


def _insert_fact(
    conn: sqlite3.Connection,
    fact_id: str,
    source_table: str,
    source_id: str,
    source_type: str,
    summary: str,
    days_ago: int = 0,
    expires_in_hours: int | None = None,
) -> None:
    expires_at = None
    if expires_in_hours is not None:
        expires_at = (NOW + timedelta(hours=expires_in_hours)).isoformat()
    conn.execute(
        """
        INSERT OR REPLACE INTO fact_records
        (fact_id, source_table, source_id, source_type, summary, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (fact_id, source_table, source_id, source_type, summary, _iso(days_ago), expires_at),
    )


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    title: str
    description: str
    buyer_id: str
    cluster_id: str
    product_id: str
    variant_id: str
    question: str
    expected: tuple[str, ...]


SCENARIOS = [
    Scenario(
        scenario_id="main_confidence",
        title="Main confidence path",
        description="Warm buyer, comparable listings, strong evidence, stable offer pressure.",
        buyer_id="buyer_asha",
        cluster_id="cluster_floral_blue",
        product_id="kurti_1_1",
        variant_id="kurti_1_1_xl",
        question="In teen mein best kaunsa hai? Mera usual L hai, kapda thin nahi chahiye.",
        expected=("recommend one listing", "recommend XL", "show one warning", "no need to rush"),
    ),
    Scenario(
        scenario_id="cold_start",
        title="Cold start product",
        description="No order history and no personal memory, so Sarthi must abstain from strong claims.",
        buyer_id="buyer_cold",
        cluster_id="cluster_floral_blue",
        product_id="kurti_1_4",
        variant_id="kurti_1_4_xl",
        question="Is product ka size reliable hai?",
        expected=("unknown evidence", "low confidence", "no return-rate warning"),
    ),
    Scenario(
        scenario_id="conflicting_evidence",
        title="Conflicting review and return evidence",
        description="Reviews praise color, but recent returns show color mismatch.",
        buyer_id="buyer_asha",
        cluster_id="cluster_floral_blue",
        product_id="kurti_1_3",
        variant_id="kurti_1_3_xl",
        question="Iska color photos jaisa hi aayega?",
        expected=("lower confidence", "mention daylight photo", "prioritize verified returns"),
    ),
    Scenario(
        scenario_id="verified_deal",
        title="Verified real deal",
        description="Current price is significantly below recent median and campaign expiry is verified.",
        buyer_id="buyer_asha",
        cluster_id="cluster_pink_print",
        product_id="kurti_2_2",
        variant_id="kurti_2_2_xl",
        question="Kya ye discount genuine hai?",
        expected=("verified_price_drop", "cite price delta", "cite campaign facts"),
    ),
    Scenario(
        scenario_id="no_rush",
        title="No need to rush",
        description="Timer reset and stable price mean the buyer should not feel pressured.",
        buyer_id="buyer_asha",
        cluster_id="cluster_floral_blue",
        product_id="kurti_1_1",
        variant_id="kurti_1_1_xl",
        question="Offer khatam hone wala hai kya?",
        expected=("no_need_to_rush", "factual copy", "no fake/manipulative wording"),
    ),
    Scenario(
        scenario_id="memory_off",
        title="Memory off privacy mode",
        description="Buyer memory disabled, so personal fit facts must not be used.",
        buyer_id="buyer_cold",
        cluster_id="cluster_floral_blue",
        product_id="kurti_1_2",
        variant_id="kurti_1_2_xl",
        question="Mere liye kaunsa size safe hai?",
        expected=("no personal memory", "fallback to catalog/category evidence", "low confidence"),
    ),
    Scenario(
        scenario_id="service_fallback",
        title="Service fallback mode",
        description="LLM and Neo4j may be unavailable, but deterministic SQLite-backed advice still works.",
        buyer_id="buyer_asha",
        cluster_id="cluster_floral_blue",
        product_id="kurti_1_1",
        variant_id="kurti_1_1_xl",
        question="Agar graph service unavailable ho to bhi best listing bata sakte ho?",
        expected=("deterministic answer", "sqlite_fallback graph path", "fact-backed audit"),
    ),
    Scenario(
        scenario_id="seller_restricted",
        title="Restricted seller account",
        description="Seller is restricted, so the buyer experience must avoid recommending the listing as safe.",
        buyer_id="buyer_asha",
        cluster_id="cluster_floral_blue",
        product_id="kurti_1_1",
        variant_id="kurti_1_1_xl",
        question="Ye seller reliable hai kya?",
        expected=("seller_restricted", "do not recommend", "suggest alternate seller"),
    ),
    Scenario(
        scenario_id="stale_data_source",
        title="Stale source data",
        description="Order and return source freshness is stale, so Sarthi must lower confidence.",
        buyer_id="buyer_asha",
        cluster_id="cluster_floral_blue",
        product_id="kurti_1_2",
        variant_id="kurti_1_2_xl",
        question="Aaj ke data ke basis par safe hai kya?",
        expected=("data_degraded", "freshness warning", "no strong return-rate claim"),
    ),
]


def list_scenarios() -> list[dict]:
    return [scenario_to_dict(scenario) for scenario in SCENARIOS]


def get_scenario(scenario_id: str) -> Scenario:
    for scenario in SCENARIOS:
        if scenario.scenario_id == scenario_id:
            return scenario
    raise ValueError(f"Unknown scenario_id: {scenario_id}")


def scenario_to_dict(scenario: Scenario) -> dict:
    return {
        "scenario_id": scenario.scenario_id,
        "title": scenario.title,
        "description": scenario.description,
        "buyer_id": scenario.buyer_id,
        "cluster_id": scenario.cluster_id,
        "product_id": scenario.product_id,
        "variant_id": scenario.variant_id,
        "question": scenario.question,
        "expected": list(scenario.expected),
        "start": {
            "screen": "product_detail",
            "buyer_id": scenario.buyer_id,
            "cluster_id": scenario.cluster_id,
            "product_id": scenario.product_id,
            "variant_id": scenario.variant_id,
        },
        "data_disclosure": "Prototype uses deterministic synthetic commerce facts because official marketplace APIs are not available.",
    }


def seed_scenario_metadata(conn: sqlite3.Connection) -> None:
    for scenario in SCENARIOS:
        conn.execute(
            """
            INSERT INTO scenario_metadata
            (scenario_id, title, description, buyer_id, cluster_id, product_id, variant_id, question, expected_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scenario.scenario_id,
                scenario.title,
                scenario.description,
                scenario.buyer_id,
                scenario.cluster_id,
                scenario.product_id,
                scenario.variant_id,
                scenario.question,
                json.dumps(list(scenario.expected)),
            ),
        )


def apply_scenario_patch(conn: sqlite3.Connection, scenario_id: str) -> dict:
    scenario = get_scenario(scenario_id)
    if scenario_id == "conflicting_evidence":
        _apply_conflicting_evidence(conn, scenario.variant_id, scenario.product_id)
    elif scenario_id == "verified_deal":
        _apply_verified_deal(conn, scenario.variant_id)
    elif scenario_id == "no_rush":
        _apply_no_rush(conn, scenario.variant_id)
    elif scenario_id == "memory_off":
        conn.execute("UPDATE buyers SET fit_memory_enabled = 0 WHERE buyer_id = ?", (scenario.buyer_id,))
        conn.execute("DELETE FROM fit_memory WHERE buyer_id = ?", (scenario.buyer_id,))
    elif scenario_id == "seller_restricted":
        _apply_seller_restricted(conn, "seller_c")
    elif scenario_id == "stale_data_source":
        _apply_stale_data_source(conn)
    conn.commit()
    return scenario_to_dict(scenario)


def _apply_conflicting_evidence(conn: sqlite3.Connection, variant_id: str, product_id: str) -> None:
    for idx in range(1, 15):
        order_id = f"scenario_conflict_return_{idx:02d}"
        fact_id = f"fact_{order_id}"
        conn.execute(
            "INSERT OR REPLACE INTO order_outcomes VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                order_id,
                f"buyer_conflict_{idx:02d}",
                variant_id,
                "returned",
                "color_different",
                _iso(days_ago=idx),
                fact_id,
            ),
        )
        _insert_fact(
            conn,
            fact_id,
            "order_outcomes",
            order_id,
            "order_outcome",
            f"Recent return for {variant_id} due to color_different",
            days_ago=idx,
        )
    for idx in range(1, 4):
        review_id = f"scenario_color_praise_{idx}"
        fact_id = f"fact_{review_id}"
        conn.execute(
            "INSERT OR REPLACE INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                review_id,
                product_id,
                variant_id,
                "color",
                "positive",
                "Color looked bright and close to the product photos.",
                4.7,
                fact_id,
            ),
        )
        _insert_fact(
            conn,
            fact_id,
            "reviews",
            review_id,
            "review",
            "Review praises color accuracy, conflicting with recent returns",
            days_ago=idx + 1,
        )


def _apply_verified_deal(conn: sqlite3.Connection, variant_id: str) -> None:
    conn.execute("DELETE FROM price_events WHERE variant_id = ?", (variant_id,))
    price_points = [(29, 579, "baseline"), (12, 549, "price_change"), (1, 449, "current")]
    for idx, (days_ago, price, event_type) in enumerate(price_points, start=1):
        event_id = f"scenario_deal_price_{idx}"
        fact_id = f"fact_{event_id}"
        conn.execute(
            "INSERT INTO price_events VALUES (?, ?, ?, ?, ?, ?)",
            (event_id, variant_id, price, event_type, _iso(days_ago=days_ago), fact_id),
        )
        _insert_fact(
            conn,
            fact_id,
            "price_events",
            event_id,
            "price",
            f"{variant_id} scenario price Rs {price}",
            days_ago=days_ago,
            expires_in_hours=24,
        )
    conn.execute(
        "UPDATE campaigns SET timer_reset_count = 0, end_at = ? WHERE variant_id = ?",
        (_iso(days_ago=-1), variant_id),
    )


def _apply_no_rush(conn: sqlite3.Connection, variant_id: str) -> None:
    conn.execute("DELETE FROM price_events WHERE variant_id = ?", (variant_id,))
    for idx, days_ago in enumerate((29, 12, 5), start=1):
        event_id = f"scenario_rush_price_{idx}"
        fact_id = f"fact_{event_id}"
        conn.execute(
            "INSERT INTO price_events VALUES (?, ?, ?, ?, ?, ?)",
            (event_id, variant_id, 449, "stable", _iso(days_ago=days_ago), fact_id),
        )
        _insert_fact(
            conn,
            fact_id,
            "price_events",
            event_id,
            "price",
            f"{variant_id} stable price Rs 449",
            days_ago=days_ago,
            expires_in_hours=24,
        )
    conn.execute("UPDATE campaigns SET timer_reset_count = 4 WHERE variant_id = ?", (variant_id,))
    conn.execute(
        "UPDATE inventory_snapshots SET available_to_promise = 24, sales_velocity_24h = 3 WHERE variant_id = ?",
        (variant_id,),
    )


def _apply_seller_restricted(conn: sqlite3.Connection, seller_id: str) -> None:
    conn.execute(
        """
        UPDATE seller_profiles
        SET verification_status = 'restricted',
            gst_status = 'blocked',
            kyc_status = 'manual_review',
            data_access_level = 'restricted',
            restricted_reason = 'Seller account is under marketplace review for unresolved fulfilment complaints.',
            last_verified_at = ?
        WHERE seller_id = ?
        """,
        (_iso(days_ago=1), seller_id),
    )


def _apply_stale_data_source(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        UPDATE data_sources
        SET status = 'stale',
            last_synced_at = ?,
            notes = 'Source freshness breach injected for safe degradation testing.'
        WHERE source_id IN ('orders', 'returns', 'reviews')
        """,
        (_iso(days_ago=9),),
    )
