from __future__ import annotations

import sqlite3
from typing import Any

from app.repositories.catalog import get_cluster_products, get_variant, get_variants_for_product
from app.repositories.evidence import get_review_passages
from app.repositories.prices import get_campaign, get_latest_inventory, get_price_events
from app.services.data_contracts import PRODUCT_DETAIL_SOURCE_IDS, list_data_sources, seller_verification, source_health_summary
from app.services.duplicate_detection import candidate_variants_for_cluster
from app.services.evidence_aggregator import build_variant_evidence, top_return_reason
from app.services.fit_predictor import predict_fit
from app.services.kept_order_ranker import rank_for_kept_order


def build_cluster_knowledge_graph(
    conn: sqlite3.Connection,
    buyer_id: str,
    cluster_id: str,
    preferred_fit: str = "comfort",
) -> dict:
    products = get_cluster_products(conn, cluster_id)
    if not products:
        raise ValueError(f"Unknown cluster_id: {cluster_id}")

    cluster = _cluster(conn, cluster_id)
    candidate_ids = candidate_variants_for_cluster(conn, cluster_id, "XL")
    ranking = rank_for_kept_order(conn, buyer_id, candidate_ids, preferred_fit) if candidate_ids else None
    candidate_by_variant = {
        candidate["variant_id"]: candidate
        for candidate in ranking["candidates"]
    } if ranking else {}

    nodes: dict[str, dict] = {}
    edges: dict[str, dict] = {}
    seller_context: list[dict] = []
    fact_ids: list[str] = []

    def add_node(node: dict) -> None:
        existing = nodes.get(node["id"])
        if existing:
            existing["fact_ids"] = _unique(existing.get("fact_ids", []) + node.get("fact_ids", []))
            existing["data"] = {**existing.get("data", {}), **node.get("data", {})}
            return
        nodes[node["id"]] = node

    def add_edge(edge: dict) -> None:
        existing = edges.get(edge["id"])
        if existing:
            existing["fact_ids"] = _unique(existing.get("fact_ids", []) + edge.get("fact_ids", []))
            return
        edges[edge["id"]] = edge

    cluster_node_id = f"cluster:{cluster_id}"
    buyer_node_id = f"buyer:{buyer_id}"
    add_node(
        {
            "id": cluster_node_id,
            "type": "cluster",
            "label": cluster["label"],
            "subtitle": f"{len(products)} similar seller listings",
            "status": "mapped",
            "score": None,
            "fact_ids": [],
            "data": {
                "cluster_id": cluster_id,
                "category": cluster["category"],
            },
        }
    )
    add_node(
        {
            "id": buyer_node_id,
            "type": "buyer_context",
            "label": "Your private fit context",
            "subtitle": "Used only inside your buyer account",
            "status": "private",
            "score": None,
            "fact_ids": [],
            "data": {
                "buyer_id": buyer_id,
                "privacy": "not shared with sellers",
            },
        }
    )

    for product in products:
        variants = get_variants_for_product(conn, product["product_id"])
        variant = _variant_for_size(variants, "XL") if variants else None
        if not variant:
            continue

        evidence = build_variant_evidence(conn, variant["variant_id"])
        issue = top_return_reason(conn, variant["variant_id"])
        reviews = get_review_passages(conn, product["product_id"])[:4]
        verification = seller_verification(conn, product["seller_id"])
        fit = predict_fit(conn, buyer_id, variant["variant_id"], preferred_fit)
        prices = get_price_events(conn, variant["variant_id"])
        campaign = get_campaign(conn, variant["variant_id"])
        inventory = get_latest_inventory(conn, variant["variant_id"])
        candidate = candidate_by_variant.get(variant["variant_id"])
        product_fact_ids = _unique(
            evidence["fact_ids"]
            + fit["fact_ids"]
            + [review["fact_id"] for review in reviews]
            + ([campaign["fact_id"]] if campaign else [])
            + ([inventory["fact_id"]] if inventory else [])
            + [price["fact_id"] for price in prices[-2:]]
        )
        fact_ids.extend(product_fact_ids)

        seller_node_id = f"seller:{product['seller_id']}"
        product_node_id = f"product:{product['product_id']}"
        variant_node_id = f"variant:{variant['variant_id']}"
        evidence_node_id = f"evidence:{variant['variant_id']}"
        review_node_id = f"reviews:{product['product_id']}"
        fabric_node_id = f"fabric:{product['fabric']}"
        rating_node_id = f"rating:{product['product_id']}"
        price_node_id = f"price:{variant['variant_id']}"

        add_node(
            {
                "id": seller_node_id,
                "type": "seller",
                "label": product["seller_name"],
                "subtitle": f"{verification['verification_status']} seller",
                "status": verification["verification_status"],
                "score": _seller_score(verification),
                "fact_ids": [],
                "data": {
                    "seller_id": product["seller_id"],
                    "dispatch_hours": product.get("median_dispatch_hours"),
                    "verification": verification,
                },
            }
        )
        add_node(
            {
                "id": product_node_id,
                "type": "product",
                "label": product["title"].split(" - ")[0],
                "subtitle": f"Rs {product['base_price']} | {product['rating']} stars",
                "status": "winner" if ranking and ranking["winner"] == variant["variant_id"] else "candidate",
                "score": candidate["score"] if candidate else None,
                "fact_ids": product_fact_ids,
                "data": {
                    "product": product,
                    "image_url": product.get("image_url", ""),
                    "commerce_badge": product.get("commerce_badge", ""),
                },
            }
        )
        add_node(
            {
                "id": variant_node_id,
                "type": "sku",
                "label": f"SKU {variant['size']}",
                "subtitle": f"Rs {variant['current_price']} | stock {variant['stock']}",
                "status": evidence["evidence_strength"],
                "score": candidate["score"] if candidate else None,
                "fact_ids": evidence["fact_ids"],
                "data": {
                    "variant": variant,
                    "fit": fit,
                    "ranking_candidate": candidate,
                },
            }
        )
        add_node(
            {
                "id": evidence_node_id,
                "type": "evidence",
                "label": "Return and kept evidence",
                "subtitle": f"{evidence['delivered_orders_90d']} delivered | {round(evidence['return_rate'] * 100)}% returns",
                "status": evidence["evidence_strength"],
                "score": round(1 - evidence["return_rate"], 3),
                "fact_ids": evidence["fact_ids"],
                "data": {
                    "evidence": evidence,
                },
            }
        )
        add_node(
            {
                "id": review_node_id,
                "type": "reviews",
                "label": "Review context",
                "subtitle": _review_summary(reviews),
                "status": "available" if reviews else "missing",
                "score": _average_review_rating(reviews),
                "fact_ids": [review["fact_id"] for review in reviews],
                "data": {
                    "reviews": reviews,
                },
            }
        )
        add_node(
            {
                "id": fabric_node_id,
                "type": "fabric",
                "label": product["fabric"],
                "subtitle": product["color_family"],
                "status": "catalog_fact",
                "score": None,
                "fact_ids": [],
                "data": {
                    "fabric": product["fabric"],
                    "color_family": product["color_family"],
                },
            }
        )
        add_node(
            {
                "id": rating_node_id,
                "type": "rating",
                "label": f"{product['rating']} star rating",
                "subtitle": f"{product['rating_count']} buyer ratings",
                "status": "catalog_rating",
                "score": round(float(product["rating"]) / 5, 3),
                "fact_ids": [],
                "data": {
                    "rating": product["rating"],
                    "rating_count": product["rating_count"],
                },
            }
        )
        add_node(
            {
                "id": price_node_id,
                "type": "price",
                "label": "Price and offer facts",
                "subtitle": _price_summary(prices, campaign, inventory),
                "status": "offer_context",
                "score": None,
                "fact_ids": _unique(
                    [price["fact_id"] for price in prices[-2:]]
                    + ([campaign["fact_id"]] if campaign else [])
                    + ([inventory["fact_id"]] if inventory else [])
                ),
                "data": {
                    "latest_price": prices[-1]["price"] if prices else variant["current_price"],
                    "campaign": campaign,
                    "inventory": inventory,
                },
            }
        )

        add_edge(_edge(cluster_node_id, product_node_id, "HAS_SIMILAR_LISTING", product_fact_ids[:2], candidate["score"] if candidate else 0.5))
        add_edge(_edge(seller_node_id, product_node_id, "SELLS", [], _seller_score(verification)))
        add_edge(_edge(product_node_id, variant_node_id, "HAS_SKU", evidence["fact_ids"][:2], candidate["score"] if candidate else 0.5))
        add_edge(_edge(variant_node_id, evidence_node_id, "HAS_OUTCOME_EVIDENCE", evidence["fact_ids"], 1 - evidence["return_rate"]))
        add_edge(_edge(product_node_id, review_node_id, "HAS_REVIEW_CONTEXT", [review["fact_id"] for review in reviews], _average_review_rating(reviews) or 0.5))
        add_edge(_edge(product_node_id, fabric_node_id, "HAS_FABRIC", [], 0.7))
        add_edge(_edge(product_node_id, rating_node_id, "HAS_RATING", [], float(product["rating"]) / 5))
        add_edge(_edge(variant_node_id, price_node_id, "HAS_PRICE_CONTEXT", nodes[price_node_id]["fact_ids"], 0.7))
        add_edge(_edge(buyer_node_id, variant_node_id, "FIT_CHECKED_FOR_BUYER", fit["fact_ids"], _fit_score(fit)))

        if issue:
            reason_node_id = f"return_reason:{variant['variant_id']}:{issue['return_reason']}"
            add_node(
                {
                    "id": reason_node_id,
                    "type": "return_reason",
                    "label": issue["return_reason"].replace("_", " "),
                    "subtitle": f"{issue['count']} recent signals",
                    "status": "risk",
                    "score": None,
                    "fact_ids": issue["fact_ids"][:5],
                    "data": {
                        "issue": issue,
                    },
                }
            )
            add_edge(_edge(evidence_node_id, reason_node_id, "RETURNED_FOR", issue["fact_ids"][:5], min(1.0, issue["count"] / 10)))

        seller_context.append(
            {
                "product": product,
                "seller": {
                    "seller_id": product["seller_id"],
                    "name": product["seller_name"],
                    "verification": verification,
                },
                "variant": variant,
                "evidence": evidence,
                "fit": fit,
                "reviews": reviews,
                "top_return_reason": issue,
                "price_context": {
                    "latest_price": prices[-1]["price"] if prices else variant["current_price"],
                    "campaign": campaign,
                    "inventory": inventory,
                },
                "candidate": candidate,
                "node_ids": {
                    "seller": seller_node_id,
                    "product": product_node_id,
                    "variant": variant_node_id,
                    "evidence": evidence_node_id,
                    "reviews": review_node_id,
                    "price": price_node_id,
                },
            }
        )

    fact_ids = _unique(fact_ids)
    source_health = source_health_summary(list_data_sources(conn, PRODUCT_DETAIL_SOURCE_IDS))
    selected_product_id = None
    if ranking:
        winner_variant = get_variant(conn, ranking["winner"])
        selected_product_id = winner_variant["product_id"] if winner_variant else None

    return {
        "buyer_id": buyer_id,
        "cluster": {
            "cluster_id": cluster_id,
            "label": cluster["label"],
            "category": cluster["category"],
            "listing_count": len(products),
        },
        "summary": {
            "title": f"{cluster['label']} knowledge graph",
            "body": f"Sarthi connected {len(products)} seller listings, {len(nodes)} fact nodes, and {len(edges)} graph edges for this product cluster.",
            "dynamic": True,
            "source_health": source_health,
            "fact_count": len(fact_ids),
        },
        "ranking": ranking,
        "selected_product_id": selected_product_id,
        "nodes": list(nodes.values()),
        "edges": list(edges.values()),
        "seller_context": seller_context,
        "fact_ids": fact_ids[:40],
        "chat_suggestions": [
            "Which seller has the lowest return risk?",
            "Why is the top option safer?",
            "What do reviews say about fabric and color?",
            "Is the cheapest option still safe?",
            "Which size should I choose?",
        ],
    }


def answer_knowledge_graph_question(graph: dict, query: str) -> dict:
    normalized = query.strip().lower()
    contexts = graph["seller_context"]
    if not contexts:
        return _answer(
            query,
            "Not enough graph context",
            "Sarthi could not find seller listings inside this product graph.",
            ["No seller context nodes were available."],
            [],
            [],
            [],
        )

    winner = _winner_context(graph) or _highest_score_context(contexts)
    cheapest = min(contexts, key=lambda item: item["variant"]["current_price"])
    lowest_return = min(contexts, key=lambda item: item["evidence"]["return_rate"])
    highest_rating = max(contexts, key=lambda item: (item["product"]["rating"], item["product"]["rating_count"]))

    if any(word in normalized for word in ["return", "risk", "refund", "rto", "loss"]):
        return _context_answer(
            query,
            lowest_return,
            "Lowest return-risk seller",
            f"{lowest_return['seller']['name']} has the lowest observed return rate in this mapped cluster.",
            [
                f"Return rate is {round(lowest_return['evidence']['return_rate'] * 100)}% over {lowest_return['evidence']['delivered_orders_90d']} delivered orders.",
                _issue_sentence(lowest_return),
                f"Evidence strength is {lowest_return['evidence']['evidence_strength']}.",
            ],
        )

    if any(word in normalized for word in ["fabric", "kapda", "cloth", "material", "color", "colour", "review"]):
        reviews = winner["reviews"][:3]
        review_text = "; ".join(review["text"] for review in reviews) if reviews else "No review passages were available."
        return _context_answer(
            query,
            winner,
            "Review and fabric context",
            f"For the current best option, Sarthi found: {review_text}",
            [
                f"Fabric is listed as {winner['product']['fabric']}.",
                f"Color family is {winner['product']['color_family']}.",
                f"Rating is {winner['product']['rating']} from {winner['product']['rating_count']} buyers.",
            ],
            extra_fact_ids=[review["fact_id"] for review in reviews],
        )

    if any(word in normalized for word in ["price", "cheap", "cheapest", "offer", "deal", "timer"]):
        caution = ""
        if cheapest["product"]["product_id"] != winner["product"]["product_id"]:
            caution = f" The cheapest listing is not the current safest pick; {winner['seller']['name']} has stronger kept-order evidence."
        return _context_answer(
            query,
            cheapest,
            "Price and value answer",
            f"{cheapest['seller']['name']} is the cheapest mapped option at Rs {cheapest['variant']['current_price']}.{caution}",
            [
                f"Campaign timer resets: {_campaign_resets(cheapest)}.",
                f"Available-to-promise stock: {_inventory_units(cheapest)}.",
                f"Kept-order score: {_score_label(cheapest)}.",
            ],
        )

    if any(word in normalized for word in ["size", "fit", "chest", "l ", "xl", "tight"]):
        return _context_answer(
            query,
            winner,
            "Size guidance",
            f"For the best mapped option, Sarthi recommends size {winner['fit']['recommended_size']}.",
            winner["fit"]["reasons"] or ["This answer used aggregate size outcomes because no personal memory matched."],
            extra_fact_ids=winner["fit"]["fact_ids"],
        )

    if any(word in normalized for word in ["rating", "star", "rated"]):
        return _context_answer(
            query,
            highest_rating,
            "Highest rating context",
            f"{highest_rating['seller']['name']} has the strongest rating signal: {highest_rating['product']['rating']} stars from {highest_rating['product']['rating_count']} buyers.",
            [
                f"Sarthi still checks returns because ratings alone do not prove fit or color accuracy.",
                f"Return rate is {round(highest_rating['evidence']['return_rate'] * 100)}%.",
                f"Seller verification is {highest_rating['seller']['verification']['verification_status']}.",
            ],
        )

    if any(word in normalized for word in ["privacy", "memory", "seller see", "personal"]):
        return _answer(
            query,
            "Privacy boundary",
            "Sarthi can use your private fit context for your recommendation, but sellers only see aggregate listing evidence.",
            [
                "The buyer fit node is private to this account.",
                "Seller nodes are connected to aggregate product, outcome, and listing facts only.",
                "No seller-facing edge exposes personal buyer memory.",
            ],
            ["buyer:" + graph["buyer_id"]],
            [],
            [],
        )

    return _context_answer(
        query,
        winner,
        "Best mapped option",
        f"Sarthi currently prefers {winner['seller']['name']} for this product cluster.",
        [
            f"Kept-order score: {_score_label(winner)}.",
            f"Return rate: {round(winner['evidence']['return_rate'] * 100)}%.",
            f"Seller verification: {winner['seller']['verification']['verification_status']}.",
        ],
    )


def _context_answer(
    query: str,
    context: dict,
    title: str,
    summary: str,
    reasons: list[str],
    extra_fact_ids: list[str] | None = None,
) -> dict:
    node_ids = [
        context["node_ids"]["seller"],
        context["node_ids"]["product"],
        context["node_ids"]["variant"],
        context["node_ids"]["evidence"],
        context["node_ids"]["reviews"],
    ]
    fact_ids = _unique(
        context["evidence"]["fact_ids"]
        + context["fit"]["fact_ids"]
        + [review["fact_id"] for review in context["reviews"][:3]]
        + (extra_fact_ids or [])
    )
    return _answer(
        query,
        title,
        summary,
        reasons[:3],
        node_ids,
        [],
        fact_ids,
    )


def _answer(
    query: str,
    title: str,
    summary: str,
    reasons: list[str],
    matched_node_ids: list[str],
    highlighted_edge_ids: list[str],
    fact_ids: list[str],
) -> dict:
    return {
        "query": query,
        "title": title,
        "summary": summary,
        "reasons": reasons[:3],
        "matched_node_ids": matched_node_ids,
        "highlighted_edge_ids": highlighted_edge_ids,
        "fact_ids": _unique(fact_ids)[:12],
        "follow_up_questions": [
            "Why not the cheapest option?",
            "What is the return risk?",
            "What do reviews say?",
        ],
    }


def _cluster(conn: sqlite3.Connection, cluster_id: str) -> dict:
    row = conn.execute(
        "SELECT * FROM duplicate_clusters WHERE cluster_id = ?",
        (cluster_id,),
    ).fetchone()
    if row:
        return dict(row)
    return {
        "cluster_id": cluster_id,
        "label": cluster_id.replace("_", " "),
        "category": "unknown",
    }


def _variant_for_size(variants: list[dict], size: str) -> dict:
    for variant in variants:
        if variant["size"] == size:
            return variant
    return variants[0]


def _edge(source: str, target: str, label: str, fact_ids: list[str], weight: float) -> dict:
    edge_id = f"{source}->{label}->{target}"
    return {
        "id": edge_id,
        "source": source,
        "target": target,
        "label": label,
        "weight": round(max(0.0, min(1.0, weight)), 3),
        "fact_ids": _unique(fact_ids),
    }


def _unique(values: list[Any]) -> list[Any]:
    return list(dict.fromkeys(value for value in values if value))


def _seller_score(verification: dict) -> float:
    return {
        "verified": 1.0,
        "pending": 0.68,
        "restricted": 0.0,
    }.get(verification["verification_status"], 0.0)


def _fit_score(fit: dict) -> float:
    return {
        "high": 1.0,
        "medium": 0.72,
        "low": 0.45,
    }.get(fit["confidence"], 0.45)


def _average_review_rating(reviews: list[dict]) -> float | None:
    if not reviews:
        return None
    return round(sum(float(review["rating"]) for review in reviews) / len(reviews) / 5, 3)


def _review_summary(reviews: list[dict]) -> str:
    if not reviews:
        return "No review passages yet"
    attributes = ", ".join(_unique([review["attribute"] for review in reviews])[:3])
    return f"{len(reviews)} passages: {attributes}"


def _price_summary(prices: list[dict], campaign: dict | None, inventory: dict | None) -> str:
    latest_price = prices[-1]["price"] if prices else "unknown"
    resets = campaign["timer_reset_count"] if campaign else "unknown"
    stock = inventory["available_to_promise"] if inventory else "unknown"
    return f"Rs {latest_price} | {resets} timer resets | {stock} stock"


def _winner_context(graph: dict) -> dict | None:
    ranking = graph.get("ranking")
    if not ranking:
        return None
    winner_variant = ranking["winner"]
    for context in graph["seller_context"]:
        if context["variant"]["variant_id"] == winner_variant:
            return context
    return None


def _highest_score_context(contexts: list[dict]) -> dict:
    return max(contexts, key=lambda item: item["candidate"]["score"] if item["candidate"] else 0.0)


def _issue_sentence(context: dict) -> str:
    issue = context["top_return_reason"]
    if not issue:
        return "No dominant return reason is visible for this SKU."
    return f"Top return reason is {issue['return_reason'].replace('_', ' ')} from {issue['count']} signals."


def _campaign_resets(context: dict) -> str:
    campaign = context["price_context"]["campaign"]
    return str(campaign["timer_reset_count"]) if campaign else "unknown"


def _inventory_units(context: dict) -> str:
    inventory = context["price_context"]["inventory"]
    return str(inventory["available_to_promise"]) if inventory else "unknown"


def _score_label(context: dict) -> str:
    candidate = context["candidate"]
    if not candidate:
        return "not enough comparable evidence"
    return f"{round(candidate['score'] * 100)}/100"
