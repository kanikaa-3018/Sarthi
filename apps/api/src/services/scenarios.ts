import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";

type Scenario = {
  scenario_id: string;
  title: string;
  description: string;
  buyer_id: string;
  cluster_id: string;
  product_id: string;
  variant_id: string;
  question: string;
  expected: string[];
  start: {
    screen: string;
    buyer_id: string;
    cluster_id: string;
    product_id: string;
    variant_id: string;
  };
  data_disclosure: string;
};

export async function defaultScenarios(db: Db): Promise<Scenario[]> {
  const c = collections(db);
  const buyer = await c.buyers.findOne({}, { sort: { fit_memory_enabled: -1, joined_at: 1, buyer_id: 1 } } as any);
  const products = await c.products
    .find({ is_sarthi_eligible: 1 })
    .sort({ feed_rank: 1, product_id: 1 })
    .limit(8)
    .toArray();

  if (!buyer || !products.length) return [];

  const profile = await c.buyerFitProfiles.findOne(
    { buyer_id: buyer.buyer_id, active: 1 },
    { sort: { updated_at: -1, profile_id: 1 } } as any
  );
  const chosen = await chooseScenarioProduct(c, products, profile);
  if (!chosen) return [];

  const { product, variant } = chosen;
  const cluster = product.cluster_id ? await c.clusters.findOne({ cluster_id: product.cluster_id }) : null;
  const question = scenarioQuestion(product, variant, profile);
  return [{
    scenario_id: "checkout_confidence_flow",
    title: "Checkout trust and payment confidence",
    description: "A buyer checks one saved product, Sarthi compares evidence, and checkout recommends the safest payment path.",
    buyer_id: String(buyer.buyer_id),
    cluster_id: String(product.cluster_id ?? ""),
    product_id: String(product.product_id),
    variant_id: String(variant.variant_id),
    question,
    expected: ["trust score", "proof gap", "fit risk", "checkout confidence"],
    start: {
      screen: "buyer_feed",
      buyer_id: String(buyer.buyer_id),
      cluster_id: String(product.cluster_id ?? cluster?.cluster_id ?? ""),
      product_id: String(product.product_id),
      variant_id: String(variant.variant_id)
    },
    data_disclosure: "MongoDB evidence records are used until official production connectors are attached."
  }];
}

async function chooseScenarioProduct(c: ReturnType<typeof collections>, products: any[], profile: any) {
  for (const product of products) {
    const variants = await c.variants
      .find({ product_id: product.product_id })
      .sort({ current_price: 1, variant_id: 1 })
      .toArray();
    const variant = selectVariantForScenario(product, variants, profile);
    if (variant) return { product, variant };
  }
  return null;
}

function selectVariantForScenario(product: any, variants: any[], profile: any) {
  if (!variants.length) return null;
  const inStock = variants.filter((variant) => Number(variant.stock ?? 0) > 0);
  const candidates = inStock.length ? inStock : variants;
  const preferredSize = normalizeSize(profile?.size_map?.[product.category] ?? profile?.size_map?.[product.garment_type]);
  if (preferredSize) {
    const profileMatch = candidates.find((variant) => normalizeSize(variant.size) === preferredSize);
    if (profileMatch) return profileMatch;
  }
  return candidates[0];
}

function scenarioQuestion(product: any, variant: any, profile: any) {
  const size = normalizeSize(variant.size) ?? String(variant.size ?? "this size");
  const fabric = product.fabric ? ` and is ${product.fabric} comfortable` : "";
  const profileHint = profile?.label ? ` for ${profile.label}` : "";
  return `Is size ${size}${profileHint} safe${fabric}?`;
}

function normalizeSize(value: unknown) {
  const size = String(value ?? "").trim().toUpperCase();
  return size || null;
}
