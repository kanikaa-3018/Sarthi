from __future__ import annotations


BLOCKED_ABSOLUTES = ["guaranteed", "always", "never fail", "100%"]


def validate_grounded_response(text: str, fact_ids: list[str]) -> dict:
    blocked: list[str] = []
    lower_text = text.lower()
    for word in BLOCKED_ABSOLUTES:
        if word in lower_text:
            blocked.append(f"absolute_claim:{word}")
    if not fact_ids:
        blocked.append("missing_fact_ids")
    return {
        "ok": not blocked,
        "blocked": blocked,
    }

