from __future__ import annotations


def grounded_compare_answer(ranking: dict, fit: dict, offer: dict | None = None) -> dict:
    if offer:
        if offer["status"] == "verified_price_drop":
            title = "This offer has evidence"
            action_label = "Continue with deal"
        elif offer["status"] == "not_enough_history":
            title = "Offer history is limited"
            action_label = "Review product first"
        else:
            title = "No need to rush"
            action_label = "Continue without urgency"
        return {
            "title": title,
            "summary": offer["message"],
            "reasons": ranking["top_factors"][:2] + [f"Size {fit['recommended_size']} is the safer pick"],
            "caution": "Offer advice is based only on available price, campaign, and inventory facts.",
            "primary_action": {
                "type": "verify_offer",
                "variant_id": offer["variant_id"],
                "label": action_label,
            },
        }

    caution = "Check the listed daylight photo if color accuracy matters."
    return {
        "title": f"{ranking['winner']} is safer",
        "summary": f"Size {fit['recommended_size']} better rahega. Evidence is grounded in recent outcomes.",
        "reasons": ranking["top_factors"][:3],
        "caution": caution,
        "primary_action": {
            "type": "select_variant",
            "variant_id": ranking["winner"],
            "label": f"Choose {fit['recommended_size']}",
        },
    }
