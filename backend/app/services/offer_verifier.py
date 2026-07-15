from __future__ import annotations

import sqlite3
from datetime import datetime
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

    price_evidence = _price_evidence(events)
    campaign_evidence = _campaign_evidence(campaign)
    inventory_evidence = _inventory_evidence(inventory)

    if len(events) < 3:
        return {
            "variant_id": variant_id,
            "status": "not_enough_history",
            "message": "Not enough price history to verify this offer.",
            "buyer_guidance": "Do not rely on urgency claims for this listing yet.",
            "truth_basis": "insufficient_history",
            "price_evidence": price_evidence,
            "campaign_evidence": campaign_evidence,
            "inventory_evidence": inventory_evidence,
            "checks": _checks(
                price_evidence=price_evidence,
                campaign_evidence=campaign_evidence,
                inventory_evidence=inventory_evidence,
                price_status="caution",
                campaign_status="neutral",
                inventory_status="neutral",
            ),
            "fact_ids": fact_ids,
        }

    prices = [event["price"] for event in events]
    current_price = prices[-1]
    recent_median = median(prices[:-1])
    delta = int(recent_median - current_price)
    if current_price <= recent_median - 50 and campaign and campaign["timer_reset_count"] <= 1:
        return {
            "variant_id": variant_id,
            "status": "verified_price_drop",
            "message": f"Verified deal. Rs {delta} below recent comparable price.",
            "buyer_guidance": "The price drop is backed by recent price history and campaign facts.",
            "truth_basis": "price_drop",
            "price_evidence": price_evidence,
            "campaign_evidence": campaign_evidence,
            "inventory_evidence": inventory_evidence,
            "checks": _checks(
                price_evidence=price_evidence,
                campaign_evidence=campaign_evidence,
                inventory_evidence=inventory_evidence,
                price_status="positive",
                campaign_status="positive",
                inventory_status="neutral",
            ),
            "fact_ids": fact_ids,
        }

    if campaign and campaign["timer_reset_count"] >= 2:
        active_days = price_evidence["current_price_age_days"]
        active_copy = (
            f"This price has been active for {active_days} day{'s' if active_days != 1 else ''}"
            if active_days is not None
            else "This price has been seen before"
        )
        return {
            "variant_id": variant_id,
            "status": "no_need_to_rush",
            "message": f"No need to rush. {active_copy}; campaign timer has reset {campaign['timer_reset_count']} times.",
            "buyer_guidance": "You can decide based on product fit and seller trust, not countdown pressure.",
            "truth_basis": "timer_reset",
            "price_evidence": price_evidence,
            "campaign_evidence": campaign_evidence,
            "inventory_evidence": inventory_evidence,
            "checks": _checks(
                price_evidence=price_evidence,
                campaign_evidence=campaign_evidence,
                inventory_evidence=inventory_evidence,
                price_status="neutral",
                campaign_status="caution",
                inventory_status="neutral",
            ),
            "fact_ids": fact_ids,
        }

    if inventory and inventory["available_to_promise"] <= 2 and inventory["sales_velocity_24h"] >= 10:
        return {
            "variant_id": variant_id,
            "status": "verified_price_drop",
            "message": "Low stock is supported by inventory and recent sales velocity.",
            "buyer_guidance": "Scarcity is supported by inventory data, but price still matters.",
            "truth_basis": "scarcity",
            "price_evidence": price_evidence,
            "campaign_evidence": campaign_evidence,
            "inventory_evidence": inventory_evidence,
            "checks": _checks(
                price_evidence=price_evidence,
                campaign_evidence=campaign_evidence,
                inventory_evidence=inventory_evidence,
                price_status="neutral",
                campaign_status="neutral",
                inventory_status="positive",
            ),
            "fact_ids": fact_ids,
        }

    return {
        "variant_id": variant_id,
        "status": "no_need_to_rush",
        "message": "No need to rush. There is no verified scarcity signal.",
        "buyer_guidance": "You can continue without urgency pressure.",
        "truth_basis": "no_verified_urgency",
        "price_evidence": price_evidence,
        "campaign_evidence": campaign_evidence,
        "inventory_evidence": inventory_evidence,
        "checks": _checks(
            price_evidence=price_evidence,
            campaign_evidence=campaign_evidence,
            inventory_evidence=inventory_evidence,
            price_status="neutral",
            campaign_status="neutral",
            inventory_status="neutral",
        ),
        "fact_ids": fact_ids,
    }


def _price_evidence(events: list[dict]) -> dict:
    points = [
        {
            "price": event["price"],
            "event_type": event["event_type"],
            "created_at": event["created_at"],
            "fact_id": event["fact_id"],
        }
        for event in events
    ]
    if not events:
        return {
            "latest_price": None,
            "reference_price": None,
            "price_delta": None,
            "price_event_count": 0,
            "current_price_age_days": None,
            "points": points,
        }

    previous_prices = [event["price"] for event in events[:-1]]
    reference_price = int(median(previous_prices)) if previous_prices else None
    latest_price = events[-1]["price"]
    return {
        "latest_price": latest_price,
        "reference_price": reference_price,
        "price_delta": None if reference_price is None else reference_price - latest_price,
        "price_event_count": len(events),
        "current_price_age_days": _age_days(events[-1]["created_at"]),
        "points": points[-5:],
    }


def _campaign_evidence(campaign: dict | None) -> dict | None:
    if not campaign:
        return None
    return {
        "campaign_id": campaign["campaign_id"],
        "start_at": campaign["start_at"],
        "end_at": campaign["end_at"],
        "timer_reset_count": campaign["timer_reset_count"],
        "fact_id": campaign["fact_id"],
    }


def _inventory_evidence(inventory: dict | None) -> dict | None:
    if not inventory:
        return None
    return {
        "available_to_promise": inventory["available_to_promise"],
        "sales_velocity_24h": inventory["sales_velocity_24h"],
        "captured_at": inventory["captured_at"],
        "fact_id": inventory["fact_id"],
    }


def _checks(
    *,
    price_evidence: dict,
    campaign_evidence: dict | None,
    inventory_evidence: dict | None,
    price_status: str,
    campaign_status: str,
    inventory_status: str,
) -> list[dict]:
    price_count = price_evidence["price_event_count"]
    price_delta = price_evidence["price_delta"]
    return [
        {
            "key": "price_history",
            "label": "Price history",
            "status": price_status,
            "detail": (
                f"{price_count} price events checked; current is Rs {abs(price_delta)} "
                f"{'below' if price_delta and price_delta > 0 else 'above' if price_delta and price_delta < 0 else 'from'} reference."
                if price_delta is not None
                else f"{price_count} price events checked."
            ),
            "fact_ids": [point["fact_id"] for point in price_evidence["points"]],
        },
        {
            "key": "campaign_timer",
            "label": "Campaign timer",
            "status": campaign_status,
            "detail": (
                f"Timer reset {campaign_evidence['timer_reset_count']} time(s); campaign end is server-recorded."
                if campaign_evidence
                else "No campaign timer found for this variant."
            ),
            "fact_ids": [campaign_evidence["fact_id"]] if campaign_evidence else [],
        },
        {
            "key": "inventory_pressure",
            "label": "Inventory pressure",
            "status": inventory_status,
            "detail": (
                f"{inventory_evidence['available_to_promise']} units available; "
                f"{inventory_evidence['sales_velocity_24h']} sold in the last 24h signal."
                if inventory_evidence
                else "No inventory snapshot available."
            ),
            "fact_ids": [inventory_evidence["fact_id"]] if inventory_evidence else [],
        },
    ]


def _age_days(value: str) -> int | None:
    try:
        created_at = datetime.fromisoformat(value)
    except ValueError:
        return None
    now = datetime.now(created_at.tzinfo) if created_at.tzinfo else datetime.now()
    return max(0, (now - created_at).days)
