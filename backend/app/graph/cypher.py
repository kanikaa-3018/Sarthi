CONSTRAINTS = [
    "CREATE CONSTRAINT buyer_id IF NOT EXISTS FOR (n:Buyer) REQUIRE n.buyer_id IS UNIQUE",
    "CREATE CONSTRAINT product_id IF NOT EXISTS FOR (n:Product) REQUIRE n.product_id IS UNIQUE",
    "CREATE CONSTRAINT variant_id IF NOT EXISTS FOR (n:Variant) REQUIRE n.variant_id IS UNIQUE",
    "CREATE CONSTRAINT seller_id IF NOT EXISTS FOR (n:Seller) REQUIRE n.seller_id IS UNIQUE",
    "CREATE CONSTRAINT fact_id IF NOT EXISTS FOR (n:Fact) REQUIRE n.fact_id IS UNIQUE",
]


BUYER_FIT_PATH = """
MATCH path = (b:Buyer {buyer_id: $buyer_id})-[:HAS_FIT_MEMORY]->(:FitMemory)-[:MATCHES_CANDIDATE_SIZE]->(v:Variant {variant_id: $variant_id})
RETURN path
LIMIT 1
"""


VARIANT_RISK_PATH = """
MATCH path = (v:Variant {variant_id: $variant_id})-[:RETURNED_FOR]->(r:ReturnReason)
RETURN path
ORDER BY r.count DESC
LIMIT 1
"""


OFFER_TRUTH_PATH = """
MATCH path = (v:Variant {variant_id: $variant_id})-[:HAS_PRICE_EVENT|IN_CAMPAIGN|HAS_INVENTORY]->(n)
RETURN path
LIMIT 10
"""

