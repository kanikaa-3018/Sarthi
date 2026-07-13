from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import random
import sqlite3
from pathlib import Path

from app.database import clear_db, get_connection, init_db
from app.scenarios import apply_scenario_patch, seed_scenario_metadata
from app.services.auth import seed_auth_accounts


IST = timezone(timedelta(hours=5, minutes=30))
NOW = datetime(2026, 7, 13, 14, 32, tzinfo=IST)
SIZES = ["S", "M", "L", "XL", "XXL"]
ONE_SIZE = ["ONE_SIZE"]


SELLERS = [
    ("seller_a", "NayiDisha Fashions", 19),
    ("seller_b", "RangSetu Styles", 31),
    ("seller_c", "Sakhi Wholesale", 24),
]

CLUSTERS = [
    ("cluster_floral_blue", "Blue floral daily kurtis", "women_kurtis"),
    ("cluster_pink_print", "Pink printed straight kurtis", "women_kurtis"),
    ("cluster_festive_maroon", "Maroon festive kurta sets", "women_kurta_sets"),
    ("cluster_cotton_tops", "Cotton everyday tops", "women_tops"),
    ("cluster_office_palazzo", "Office wear palazzos", "women_bottomwear"),
    ("cluster_summer_saree", "Summer printed sarees", "women_sarees"),
    ("cluster_work_bags", "Work and college handbags", "women_accessories"),
    ("cluster_home_bedsheets", "Printed cotton bedsheets", "home_furnishing"),
]

BUYERS = [
    ("buyer_asha", "Asha", "hinglish", 1, 1),
    ("buyer_neha", "Neha", "english", 1, 1),
    ("buyer_cold", "New buyer", "hinglish", 1, 0),
]


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
        INSERT INTO fact_records
        (fact_id, source_table, source_id, source_type, summary, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (fact_id, source_table, source_id, source_type, summary, _iso(days_ago), expires_at),
    )


def _product_seed() -> list[dict[str, object]]:
    products: list[dict[str, object]] = []
    cluster_specs = [
        ("cluster_floral_blue", "Blue Floral Cotton Kurti", "women_kurtis", "kurti", "cotton blend", "blue", 449, True, [
            "https://images.unsplash.com/photo-1583391733956-6c78276477e2?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80",
        ]),
        ("cluster_pink_print", "Pink Printed Straight Kurti", "women_kurtis", "kurti", "rayon blend", "pink", 399, True, [
            "https://images.unsplash.com/photo-1509631179647-0177331693ae?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1525507119028-ed4c629a60a3?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80",
        ]),
        ("cluster_festive_maroon", "Maroon Festive Kurta Set", "women_kurta_sets", "kurta set", "viscose silk blend", "maroon", 699, True, [
            "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1594633313593-bab3825d0caf?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?auto=format&fit=crop&w=900&q=80",
        ]),
        ("cluster_cotton_tops", "Solid Cotton Daily Top", "women_tops", "top", "cotton jersey", "sage", 329, True, [
            "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1554568218-0f1715e72254?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1562157873-818bc0726f68?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1523381294911-8d3cead13475?auto=format&fit=crop&w=900&q=80",
        ]),
        ("cluster_office_palazzo", "High Waist Office Palazzo", "women_bottomwear", "palazzo", "viscose blend", "black", 379, True, [
            "https://images.unsplash.com/photo-1541099649105-f69ad21f3246?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1506629905607-d9c297d241c5?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=900&q=80",
        ]),
        ("cluster_summer_saree", "Printed Summer Saree", "women_sarees", "saree", "cotton silk", "mint", 549, False, [
            "https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1603217040830-34473db521a2?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1610189016272-57c81758a7a8?auto=format&fit=crop&w=900&q=80",
        ]),
        ("cluster_work_bags", "Zip Closure Work Handbag", "women_accessories", "handbag", "vegan leather", "tan", 499, False, [
            "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&w=900&q=80",
        ]),
        ("cluster_home_bedsheets", "Printed Cotton Bedsheet Set", "home_furnishing", "bedsheet", "cotton", "multi", 459, False, [
            "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1618220179428-22790b461013?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1567016526105-22da7c13161a?auto=format&fit=crop&w=900&q=80",
            "https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=900&q=80",
        ]),
    ]
    for cluster_index, spec in enumerate(cluster_specs, start=1):
        (
            cluster_id,
            base_title,
            category,
            garment_type,
            fabric,
            color_family,
            base_price,
            is_sarthi_eligible,
            image_urls,
        ) = spec
        for item_index in range(1, 5):
            seller_id = SELLERS[(item_index + cluster_index) % len(SELLERS)][0]
            products.append(
                {
                    "product_id": f"kurti_{cluster_index}_{item_index}",
                    "cluster_id": cluster_id,
                    "seller_id": seller_id,
                    "title": f"{base_title} - Seller Option {item_index}",
                    "category": category,
                    "garment_type": garment_type,
                    "fabric": fabric,
                    "color_family": color_family,
                    "base_price": base_price + (item_index - 2) * 20,
                    "image_url": image_urls[item_index - 1],
                    "rating": round(4.0 + ((cluster_index + item_index) % 7) * 0.1, 1),
                    "rating_count": 180 + cluster_index * 57 + item_index * 43,
                    "commerce_badge": _commerce_badge(cluster_index, item_index, is_sarthi_eligible),
                    "delivery_text": "Free delivery in 3-5 days" if item_index % 2 else "Delivery by tomorrow",
                    "is_sarthi_eligible": 1 if is_sarthi_eligible else 0,
                }
            )
    return products


def _commerce_badge(cluster_index: int, item_index: int, is_sarthi_eligible: bool) -> str:
    if is_sarthi_eligible and item_index == 1:
        return "Sarthi choice"
    badges = ["Deal", "Trending", "Low return", "COD"]
    return badges[(cluster_index + item_index) % len(badges)]


def reset_seed_database(db_path: Path | None = None, scenario_id: str | None = None) -> dict[str, int]:
    conn = get_connection(db_path)
    init_db(conn)
    clear_db(conn)

    for buyer in BUYERS:
        conn.execute("INSERT INTO buyers VALUES (?, ?, ?, ?, ?)", buyer)

    for seller in SELLERS:
        conn.execute("INSERT INTO sellers VALUES (?, ?, ?)", seller)

    _seed_seller_profiles(conn)
    _seed_seller_onboarding(conn)
    _seed_data_sources(conn)
    seed_auth_accounts(conn)

    for cluster in CLUSTERS:
        conn.execute("INSERT INTO duplicate_clusters VALUES (?, ?, ?)", cluster)

    products = _product_seed()
    for product in products:
        conn.execute(
            """
            INSERT INTO products
            (product_id, cluster_id, seller_id, title, category, garment_type, fabric, color_family, base_price,
             image_url, rating, rating_count, commerce_badge, delivery_text, is_sarthi_eligible)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                product["product_id"],
                product["cluster_id"],
                product["seller_id"],
                product["title"],
                product["category"],
                product["garment_type"],
                product["fabric"],
                product["color_family"],
                product["base_price"],
                product["image_url"],
                product["rating"],
                product["rating_count"],
                product["commerce_badge"],
                product["delivery_text"],
                product["is_sarthi_eligible"],
            ),
        )
        for size_index, size in enumerate(_sizes_for_product(product)):
            variant_id = f"{product['product_id']}_{size.lower()}"
            stock = 18 + size_index * 3
            current_price = int(product["base_price"]) + size_index * 10
            conn.execute(
                "INSERT INTO variants VALUES (?, ?, ?, ?, ?)",
                (variant_id, product["product_id"], size, current_price, stock),
            )

    _seed_reviews(conn, products)
    _seed_outcomes(conn, products)
    _seed_prices_campaigns_inventory(conn)
    _seed_fit_memory(conn)
    seed_scenario_metadata(conn)
    if scenario_id:
        apply_scenario_patch(conn, scenario_id)

    conn.commit()
    counts = {
        "buyers": conn.execute("SELECT COUNT(*) FROM buyers").fetchone()[0],
        "products": conn.execute("SELECT COUNT(*) FROM products").fetchone()[0],
        "variants": conn.execute("SELECT COUNT(*) FROM variants").fetchone()[0],
        "outcomes": conn.execute("SELECT COUNT(*) FROM order_outcomes").fetchone()[0],
        "facts": conn.execute("SELECT COUNT(*) FROM fact_records").fetchone()[0],
    }
    conn.close()
    return counts


def _sizes_for_product(product: dict[str, object]) -> list[str]:
    if product["category"] in {"women_accessories", "home_furnishing", "women_sarees"}:
        return ONE_SIZE
    return SIZES


def _seed_seller_profiles(conn: sqlite3.Connection) -> None:
    rows = [
        (
            "seller_a",
            "verified",
            "verified",
            "verified",
            "560102",
            ["women_kurtis", "women_kurta_sets"],
            "ops+nayidisha@example.local",
            "aggregate_only",
            None,
            _iso(days_ago=3),
        ),
        (
            "seller_b",
            "pending",
            "pending_review",
            "under_review",
            "302012",
            ["women_kurtis"],
            "ops+rangsetu@example.local",
            "limited",
            None,
            _iso(days_ago=18),
        ),
        (
            "seller_c",
            "verified",
            "verified",
            "verified",
            "201301",
            ["women_kurtis", "women_kurta_sets"],
            "ops+sakhi@example.local",
            "aggregate_only",
            None,
            _iso(days_ago=2),
        ),
    ]
    for row in rows:
        (
            seller_id,
            verification_status,
            gst_status,
            kyc_status,
            pickup_pincode,
            categories,
            support_contact,
            data_access_level,
            restricted_reason,
            last_verified_at,
        ) = row
        conn.execute(
            """
            INSERT INTO seller_profiles
            (seller_id, verification_status, gst_status, kyc_status, pickup_pincode, categories_json,
             support_contact, data_access_level, restricted_reason, last_verified_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                seller_id,
                verification_status,
                gst_status,
                kyc_status,
                pickup_pincode,
                json.dumps(categories),
                support_contact,
                data_access_level,
                restricted_reason,
                last_verified_at,
            ),
        )


def _seed_seller_onboarding(conn: sqlite3.Connection) -> None:
    applications = [
        ("seller_app_seed_a", "seller_a", "NayiDisha Fashions", "29NAYIDISHA1Z5", "560102", "ops+nayidisha@example.local", "approved", _iso(days_ago=35)),
        ("seller_app_seed_b", "seller_b", "RangSetu Styles", "08RANGSETU1Z7", "302012", "ops+rangsetu@example.local", "pending_review", _iso(days_ago=18)),
        ("seller_app_seed_c", "seller_c", "Sakhi Wholesale", "09SAKHIWHOLESALE1Z2", "201301", "ops+sakhi@example.local", "approved", _iso(days_ago=28)),
    ]
    for row in applications:
        conn.execute(
            """
            INSERT INTO seller_applications
            (application_id, seller_id, business_name, gst_number, pickup_pincode, support_contact, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            row,
        )

    documents = [
        ("doc_seed_a_gst", "seller_a", "gst_certificate", "GST certificate ending 1Z5", "gst_seed_a.pdf", "approved", _iso(days_ago=34), _iso(days_ago=33), "Matched seller legal name."),
        ("doc_seed_a_bank", "seller_a", "bank_proof", "Cancelled cheque ending 4431", "bank_seed_a.pdf", "approved", _iso(days_ago=34), _iso(days_ago=33), "Payout account verified."),
        ("doc_seed_b_gst", "seller_b", "gst_certificate", "GST certificate ending 1Z7", "gst_seed_b.pdf", "under_review", _iso(days_ago=18), None, "Manual review pending."),
        ("doc_seed_c_gst", "seller_c", "gst_certificate", "GST certificate ending 1Z2", "gst_seed_c.pdf", "approved", _iso(days_ago=27), _iso(days_ago=26), "Matched seller legal name."),
        ("doc_seed_c_address", "seller_c", "address_proof", "Warehouse utility bill", "address_seed_c.pdf", "approved", _iso(days_ago=27), _iso(days_ago=26), "Pickup address verified."),
        ("doc_seed_c_bank", "seller_c", "bank_proof", "Cancelled cheque ending 8842", "bank_seed_c.pdf", "approved", _iso(days_ago=27), _iso(days_ago=26), "Payout account verified."),
    ]
    for row in documents:
        document_id, seller_id, document_type, reference, file_name, status, submitted_at, reviewed_at, notes = row
        sha256 = hashlib.sha256(f"{document_id}:{reference}".encode("utf-8")).hexdigest()
        conn.execute(
            """
            INSERT INTO seller_verification_documents
            (document_id, seller_id, document_type, reference, file_name, mime_type, file_size_bytes, sha256,
             storage_uri, uploaded_at, status, submitted_at, reviewed_at, notes)
            VALUES (?, ?, ?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                document_id,
                seller_id,
                document_type,
                reference,
                file_name,
                1024 + len(reference),
                sha256,
                f"seeded/seller_documents/{seller_id}/{file_name}",
                submitted_at,
                status,
                submitted_at,
                reviewed_at,
                notes,
            ),
        )


def _seed_data_sources(conn: sqlite3.Connection) -> None:
    rows = [
        ("catalog", "catalog", "Catalog listing service", "catalog-platform", "first_party_contract", 6, _iso(hours=1), "operational", "Product, variant, category, and seller listing metadata."),
        ("orders", "orders", "Delivered order outcomes", "order-platform", "first_party_contract", 24, _iso(hours=2), "operational", "Delivered, returned, exchanged, and RTO outcomes."),
        ("returns", "returns", "Return reason service", "returns-platform", "first_party_contract", 24, _iso(hours=2), "operational", "Structured return reasons used for avoidable issue detection."),
        ("reviews", "reviews", "Review evidence index", "ugc-platform", "first_party_contract", 48, _iso(days_ago=1), "operational", "Attribute-level review snippets with fact IDs."),
        ("pricing", "pricing", "Price event ledger", "pricing-platform", "first_party_contract", 12, _iso(hours=3), "operational", "Historical price events for offer verification."),
        ("campaigns", "campaigns", "Campaign timer ledger", "growth-platform", "first_party_contract", 6, _iso(hours=1), "operational", "Campaign starts, ends, and timer reset counts."),
        ("inventory", "inventory", "Inventory snapshot stream", "inventory-platform", "first_party_contract", 4, _iso(hours=2), "operational", "Available-to-promise and sales velocity snapshots."),
        ("seller_verification", "seller", "Seller verification registry", "seller-platform", "first_party_contract", 168, _iso(days_ago=2), "operational", "Seller KYC/GST state and marketplace access level."),
        ("buyer_memory", "privacy", "Buyer fit memory store", "personalization-platform", "first_party_private", 12, _iso(hours=1), "operational", "Buyer-owned fit memory, never exposed to sellers."),
        ("graph_projection", "reasoning", "Commerce graph projection", "sarthi-graph", "derived", 12, _iso(hours=4), "operational", "Projected reasoning graph from source-of-truth facts."),
    ]
    for row in rows:
        conn.execute(
            """
            INSERT INTO data_sources
            (source_id, domain, display_name, owner_system, reliability, freshness_sla_hours,
             last_synced_at, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            row,
        )


def _seed_reviews(conn: sqlite3.Connection, products: list[dict[str, object]]) -> None:
    review_templates = [
        ("fabric", "positive", "Light cotton blend, good for summer use.", 4.3),
        ("fit", "mixed", "L feels tight at chest; XL worked better.", 3.8),
        ("color", "mixed", "Looks darker indoors, daylight photo is closer.", 3.7),
        ("wash", "positive", "Machine wash was fine on gentle cycle.", 4.1),
        ("quality", "positive", "Stitching was neat for the price.", 4.2),
    ]
    review_counter = 1
    for product in products:
        for attribute, sentiment, text, rating in review_templates:
            review_id = f"review_{review_counter:03d}"
            fact_id = f"fact_review_{review_counter:03d}"
            conn.execute(
                "INSERT INTO reviews VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (review_id, product["product_id"], None, attribute, sentiment, text, rating, fact_id),
            )
            _insert_fact(conn, fact_id, "reviews", review_id, "review", text, days_ago=review_counter % 20)
            review_counter += 1


def _seed_outcomes(conn: sqlite3.Connection, products: list[dict[str, object]]) -> None:
    rng = random.Random(42)
    all_variants = [
        row["variant_id"]
        for row in conn.execute("SELECT variant_id FROM variants ORDER BY variant_id").fetchall()
        if not row["variant_id"].startswith("kurti_1_4_")
    ]
    buyers = ["buyer_asha", "buyer_neha", "buyer_synth_01", "buyer_synth_02", "buyer_synth_03"]
    return_reasons = [None, "too_small", "too_large", "color_different", "fabric_different", "damaged"]

    for idx in range(960):
        variant_id = all_variants[idx % len(all_variants)]
        size = variant_id.rsplit("_", 1)[1].upper()
        buyer_id = buyers[idx % len(buyers)]
        if size == "L" and rng.random() < 0.32:
            status = "returned"
            reason = "too_small"
        elif rng.random() < 0.12:
            status = "returned"
            reason = rng.choice(return_reasons[2:])
        elif rng.random() < 0.06:
            status = "rto"
            reason = None
        elif rng.random() < 0.04:
            status = "exchanged"
            reason = "too_small"
        else:
            status = "delivered_kept"
            reason = None

        order_id = f"order_{idx + 1:04d}"
        fact_id = f"fact_order_{idx + 1:04d}"
        created_at = _iso(days_ago=idx % 90)
        conn.execute(
            "INSERT INTO order_outcomes VALUES (?, ?, ?, ?, ?, ?, ?)",
            (order_id, buyer_id, variant_id, status, reason, created_at, fact_id),
        )
        summary = f"{status} outcome for {variant_id}"
        if reason:
            summary += f" due to {reason}"
        _insert_fact(conn, fact_id, "order_outcomes", order_id, "order_outcome", summary, days_ago=idx % 90)


def _seed_prices_campaigns_inventory(conn: sqlite3.Connection) -> None:
    variants = conn.execute(
        "SELECT variant_id, current_price, stock FROM variants ORDER BY variant_id"
    ).fetchall()
    event_counter = 1
    for row in variants:
        for days_ago, delta, event_type in [(29, 40, "baseline"), (12, 20, "price_change"), (5, 0, "current")]:
            event_id = f"price_{event_counter:04d}"
            fact_id = f"fact_price_{event_counter:04d}"
            price = int(row["current_price"]) + delta
            conn.execute(
                "INSERT INTO price_events VALUES (?, ?, ?, ?, ?, ?)",
                (event_id, row["variant_id"], price, event_type, _iso(days_ago=days_ago), fact_id),
            )
            _insert_fact(
                conn,
                fact_id,
                "price_events",
                event_id,
                "price",
                f"{row['variant_id']} price was Rs {price}",
                days_ago=days_ago,
                expires_in_hours=24,
            )
            event_counter += 1

        campaign_id = f"campaign_{row['variant_id']}"
        campaign_fact_id = f"fact_{campaign_id}"
        conn.execute(
            "INSERT INTO campaigns VALUES (?, ?, ?, ?, ?, ?)",
            (campaign_id, row["variant_id"], _iso(days_ago=5), _iso(days_ago=-1), 3, campaign_fact_id),
        )
        _insert_fact(
            conn,
            campaign_fact_id,
            "campaigns",
            campaign_id,
            "campaign",
            f"Campaign for {row['variant_id']} has server verified dates",
            days_ago=5,
            expires_in_hours=12,
        )

        snapshot_id = f"inventory_{row['variant_id']}"
        inventory_fact_id = f"fact_{snapshot_id}"
        conn.execute(
            "INSERT INTO inventory_snapshots VALUES (?, ?, ?, ?, ?, ?)",
            (snapshot_id, row["variant_id"], row["stock"], 4 + (row["stock"] % 5), _iso(hours=2), inventory_fact_id),
        )
        _insert_fact(
            conn,
            inventory_fact_id,
            "inventory_snapshots",
            snapshot_id,
            "inventory",
            f"{row['variant_id']} has {row['stock']} available-to-promise units",
            expires_in_hours=2,
        )


def _seed_fit_memory(conn: sqlite3.Connection) -> None:
    rows = [
        ("fit_memory_asha_01", "buyer_asha", "women_kurtis", "kurti_1_1_xl", "XL", "comfort", "medium"),
        ("fit_memory_asha_02", "buyer_asha", "women_kurtis", "kurti_2_1_xl", "XL", "comfort", "medium"),
        ("fit_memory_neha_01", "buyer_neha", "women_kurtis", "kurti_1_2_m", "M", "regular", "medium"),
    ]
    for idx, row in enumerate(rows, start=1):
        memory_id, buyer_id, category, anchor_variant_id, retained_size, preferred_fit, confidence = row
        fact_id = f"fact_{memory_id}"
        conn.execute(
            "INSERT INTO fit_memory VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                memory_id,
                buyer_id,
                category,
                anchor_variant_id,
                retained_size,
                preferred_fit,
                confidence,
                _iso(days_ago=idx),
                fact_id,
            ),
        )
        _insert_fact(
            conn,
            fact_id,
            "fit_memory",
            memory_id,
            "fit_memory",
            f"{buyer_id} retained {retained_size} in {category}",
            days_ago=idx,
        )


if __name__ == "__main__":
    print(reset_seed_database())
