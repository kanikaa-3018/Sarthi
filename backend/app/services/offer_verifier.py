from __future__ import annotations

import sqlite3
from statistics import median

from app.repositories.catalog import get_variant
from app.repositories.prices import get_campaign, get_latest_inventory, get_price_events


def verify_offer(conn: sqlite3.Connection, variant_id: str) -> dict:
    if not get_variant(conn, variant_id):
        raise ValueError(f"Unknown variant_id: {variant_id}")

    events = get_price_events(conn, variant_id)
    campaign = get_campaign(conn, variant_id)
    inventory = get_latest_inventory(conn, variant_id)

    fact_ids = [event["fact_id"] for event in events[-3:]]
    if campaign:
        fact_ids.append(campaign["fact_id"])
    if inventory:
        fact_ids.append(inventory["fact_id"])

    if len(events) < 3:
        return {
            "variant_id": variant_id,
            "status": "not_enough_history",
            "message": "Not enough price history to verify this offer.",
            "fact_ids": fact_ids,
        }

    prices = [event["price"] for event in events]
    current_price = prices[-1]
    recent_median = median(prices[:-1])
    if current_price <= recent_median - 50 and campaign and campaign["timer_reset_count"] <= 1:
        return {
            "variant_id": variant_id,
            "status": "verified_price_drop",
            "message": f"Verified deal. Rs {int(recent_median - current_price)} below recent comparable price.",
            "fact_ids": fact_ids,
        }

    if campaign and campaign["timer_reset_count"] >= 2:
        return {
            "variant_id": variant_id,
            "status": "no_need_to_rush",
            "message": "No need to rush. This price has been active for 5 days.",
            "fact_ids": fact_ids,
        }

    if inventory and inventory["available_to_promise"] <= 2 and inventory["sales_velocity_24h"] >= 10:
        return {
            "variant_id": variant_id,
            "status": "verified_price_drop",
            "message": "Low stock is supported by inventory and recent sales velocity.",
            "fact_ids": fact_ids,
        }

    return {
        "variant_id": variant_id,
        "status": "no_need_to_rush",
        "message": "No need to rush. There is no verified scarcity signal.",
        "fact_ids": fact_ids,
    }
