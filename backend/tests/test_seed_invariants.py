from app.database import get_connection
from app.seed import reset_seed_database


def test_seed_creates_required_shape(tmp_path):
    db_path = tmp_path / "sarthi.db"
    counts = reset_seed_database(db_path)

    assert counts["buyers"] == 3
    assert counts["products"] == 32
    assert counts["variants"] == 112
    assert counts["outcomes"] >= 900
    assert counts["facts"] >= counts["outcomes"]


def test_marketplace_feed_products_have_visual_and_eligibility_metadata(tmp_path):
    db_path = tmp_path / "sarthi.db"
    reset_seed_database(db_path)
    conn = get_connection(db_path)
    rows = conn.execute(
        """
        SELECT image_url, rating, rating_count, commerce_badge, delivery_text, is_sarthi_eligible
        FROM products
        """
    ).fetchall()
    conn.close()

    assert rows
    assert all(row["image_url"].startswith("https://") for row in rows)
    assert all(row["rating"] >= 4.0 for row in rows)
    assert all(row["rating_count"] > 0 for row in rows)
    assert all(row["commerce_badge"] for row in rows)
    assert all(row["delivery_text"] for row in rows)
    assert any(row["is_sarthi_eligible"] == 1 for row in rows)
    assert any(row["is_sarthi_eligible"] == 0 for row in rows)


def test_return_counts_never_exceed_delivered(tmp_path):
    db_path = tmp_path / "sarthi.db"
    reset_seed_database(db_path)
    conn = get_connection(db_path)
    rows = conn.execute(
        """
        SELECT
          variant_id,
          SUM(CASE WHEN status = 'returned' THEN 1 ELSE 0 END) AS returns,
          SUM(CASE WHEN status IN ('delivered_kept', 'returned', 'exchanged') THEN 1 ELSE 0 END) AS delivered
        FROM order_outcomes
        GROUP BY variant_id
        """
    ).fetchall()
    conn.close()

    assert rows
    for row in rows:
        assert row["returns"] <= row["delivered"]


def test_every_outcome_fact_exists(tmp_path):
    db_path = tmp_path / "sarthi.db"
    reset_seed_database(db_path)
    conn = get_connection(db_path)
    missing = conn.execute(
        """
        SELECT o.fact_id
        FROM order_outcomes o
        LEFT JOIN fact_records f ON f.fact_id = o.fact_id
        WHERE f.fact_id IS NULL
        """
    ).fetchall()
    conn.close()
    assert missing == []
