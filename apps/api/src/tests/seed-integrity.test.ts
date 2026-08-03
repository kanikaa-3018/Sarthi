import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildSeedDocuments } from "../data/seed.js";

const docs = buildSeedDocuments();

function groupBy<T extends Record<string, any>>(rows: T[], key: keyof T) {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const value = String(row[key]);
    map.set(value, [...(map.get(value) ?? []), row]);
  }
  return map;
}

describe("seed catalog integrity", () => {
  it("builds marketplace-scale catalog coverage from one backend source", () => {
    assert.equal(docs.clusters.length, 16);
    assert.equal(docs.products.length, 64);
    assert.equal(docs.variants.length, 224);
    assert.equal(docs.reviews.length, 320);
    assert.equal(docs.outcomes.length, 1920);
    assert.ok(docs.facts.length > docs.outcomes.length);
  });

  it("keeps product feed interleaved across comparable groups", () => {
    const ranks = new Set(docs.products.map((product) => product.feed_rank));
    assert.equal(ranks.size, docs.products.length);

    const firstPageClusters = docs.products
      .slice()
      .sort((left, right) => left.feed_rank - right.feed_rank)
      .slice(0, docs.clusters.length)
      .map((product) => product.cluster_id);

    assert.equal(new Set(firstPageClusters).size, docs.clusters.length);
  });

  it("seeds every product with media, seller, taxonomy, fulfillment, and source evidence", () => {
    for (const product of docs.products) {
      assert.ok(product.product_id);
      assert.ok(product.cluster_id);
      assert.ok(product.seller_id);
      assert.ok(product.title);
      assert.ok(product.image_url.startsWith("/catalog/"));
      assert.ok(Array.isArray(product.image_urls));
      assert.ok(product.image_urls.length >= 2, `${product.product_id} should have multiple catalog photos`);
      assert.equal(product.image_urls[0], product.image_url);
      assert.equal(new Set(product.image_urls).size, product.image_urls.length);
      assert.ok(product.image_urls.every((url: string) => url.startsWith("/catalog/")));

      assert.equal(product.media_evidence.image_count, product.image_urls.length);
      assert.equal(product.media_evidence.verification_status, "verified_gallery");
      assert.deepEqual(product.media_evidence.issues, []);
      assert.equal(product.media_evidence.angle_labels.length, product.image_urls.length);

      assert.ok(product.source_refs.source_product_id);
      assert.ok(product.source_refs.catalog_id);
      assert.ok(product.source_refs.supplier_id);
      assert.ok(product.taxonomy_attributes.length >= 4);
      assert.ok(product.seller_snapshot.quality_rating >= 3.8);
      assert.equal(typeof product.fulfillment.returns_enabled, "boolean");
      assert.equal(product.quality_signals.return_window_days, 7);
      assert.equal(product.quality_signals.cod_available, product.fulfillment.cod_available);
      assert.ok(product.quality_signals.proof_priority.length >= 2);
    }
  });

  it("connects products to variants, reviews, and outcome-backed clusters", () => {
    const variantsByProduct = groupBy(docs.variants, "product_id");
    const reviewsByProduct = groupBy(docs.reviews, "product_id");
    const variantById = new Map(docs.variants.map((variant) => [variant.variant_id, variant]));
    const productById = new Map(docs.products.map((product) => [product.product_id, product]));
    const outcomesByCluster = new Map<string, number>();

    for (const outcome of docs.outcomes) {
      const variant = variantById.get(outcome.variant_id);
      assert.ok(variant, `missing variant for ${outcome.variant_id}`);
      const product = productById.get(variant.product_id);
      assert.ok(product, `missing product for ${variant.product_id}`);
      outcomesByCluster.set(product.cluster_id, (outcomesByCluster.get(product.cluster_id) ?? 0) + 1);
    }

    for (const product of docs.products) {
      assert.ok((variantsByProduct.get(product.product_id) ?? []).length >= 1);
      assert.equal((reviewsByProduct.get(product.product_id) ?? []).length, 5);
    }

    for (const cluster of docs.clusters) {
      assert.ok((outcomesByCluster.get(cluster.cluster_id) ?? 0) > 0, `${cluster.cluster_id} needs order outcomes`);
    }
  });

  it("keeps trust scoring configurable and resistant to review gaming", () => {
    const defaultPolicy = docs.featureWeights.find((policy) => policy.category === "default");
    const apparelPolicy = docs.featureWeights.find((policy) => policy.category === "women_kurtis");
    assert.ok(defaultPolicy);
    assert.ok(apparelPolicy);

    for (const policy of [defaultPolicy, apparelPolicy]) {
      assert.ok(policy.weights.sku_outcome > 0);
      assert.ok(policy.weights.seller_reliability > 0);
      assert.ok(policy.weights.seller_verification > 0);
      assert.ok(policy.weights.fit_consistency > 0);
      assert.ok(policy.weights.review_credibility > 0);
      assert.ok(policy.weights.proof_coverage > 0);
      assert.ok(policy.weights.offer_truth > 0);
    }

    const lowCredibilityReviews = docs.reviews.filter((review) => review.credibility_weight < 0.55);
    assert.ok(lowCredibilityReviews.length > 0);
    assert.ok(lowCredibilityReviews.some((review) => review.credibility_flags.includes("high_return_rate")));
    assert.ok(lowCredibilityReviews.some((review) => review.credibility_flags.includes("new_account")));
  });
});
