import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";

export type SimilarListingCandidate = {
  product_id: string;
  seller_id: string;
  cluster_id: string;
  title: string;
  image_url: string;
  score: number;
  reasons: string[];
};

export type SimilarListingSet = {
  seed_product_id: string;
  comparable_product_ids: string[];
  candidates: SimilarListingCandidate[];
  method: "visual_taxonomy_signature_v1";
  minimum_score: number;
  distinct_seller_count: number;
  summary: string;
};

const MINIMUM_SCORE = 0.46;

export async function resolveSimilarListingSet(db: Db, productId: string, limit = 8): Promise<SimilarListingSet> {
  const c = collections(db);
  const seed = await c.products.findOne({ product_id: productId });
  if (!seed) throw new Error("Product not found");

  const broadFilter = {
    is_sarthi_eligible: 1,
    category: seed.category
  };
  const products = await c.products.find(broadFilter).limit(80).toArray();
  const scored = products
    .map((product: any) => scoreSimilarProduct(seed, product))
    .filter((candidate) => candidate.product_id === productId || candidate.score >= MINIMUM_SCORE || candidate.cluster_id === seed.cluster_id)
    .sort((left, right) => {
      if (left.product_id === productId) return -1;
      if (right.product_id === productId) return 1;
      if (left.seller_id !== seed.seller_id && right.seller_id === seed.seller_id) return -1;
      if (right.seller_id !== seed.seller_id && left.seller_id === seed.seller_id) return 1;
      return right.score - left.score;
    });

  const selected: SimilarListingCandidate[] = [];
  const seenSellers = new Set<string>();
  for (const candidate of scored) {
    if (selected.some((item) => item.product_id === candidate.product_id)) continue;
    const isSeed = candidate.product_id === productId;
    const addsSeller = !seenSellers.has(candidate.seller_id);
    if (isSeed || addsSeller || selected.length < 4) {
      selected.push(candidate);
      seenSellers.add(candidate.seller_id);
    }
    if (selected.length >= limit) break;
  }

  if (!selected.some((candidate) => candidate.product_id === productId)) {
    selected.unshift(scoreSimilarProduct(seed, seed));
  }

  return {
    seed_product_id: productId,
    comparable_product_ids: selected.map((candidate) => candidate.product_id),
    candidates: selected,
    method: "visual_taxonomy_signature_v1",
    minimum_score: MINIMUM_SCORE,
    distinct_seller_count: new Set(selected.map((candidate) => candidate.seller_id)).size,
    summary: selected.length > 1
      ? `${selected.length} visually similar listing options across ${new Set(selected.map((candidate) => candidate.seller_id)).size} sellers.`
      : "Only one close listing found; Sarthi keeps confidence cautious until more seller options appear."
  };
}

export async function suggestClusterFromSimilarListings(db: Db, draft: {
  title?: string;
  category?: string;
  garment_type?: string;
  fabric?: string;
  color_family?: string;
  image_url?: string;
}) {
  const c = collections(db);
  const seed = {
    product_id: "draft",
    seller_id: "draft",
    cluster_id: "",
    title: draft.title ?? "",
    category: draft.category ?? "",
    garment_type: draft.garment_type ?? "",
    fabric: draft.fabric ?? "",
    color_family: draft.color_family ?? "",
    image_url: draft.image_url ?? "",
    taxonomy_attributes: []
  };
  const products = await c.products.find({
    is_sarthi_eligible: 1,
    category: seed.category || { $exists: true }
  }).limit(80).toArray();
  const best = products
    .map((product: any) => scoreSimilarProduct(seed, product))
    .filter((candidate) => candidate.score >= 0.52)
    .sort((left, right) => right.score - left.score)[0];
  return best?.cluster_id ?? null;
}

function scoreSimilarProduct(seed: any, product: any): SimilarListingCandidate {
  const titleScore = jaccard(tokens(seed.title), tokens(product.title));
  const fabricScore = jaccard(tokens(seed.fabric), tokens(product.fabric));
  const imageScore = jaccard(imageTokens(seed.image_url), imageTokens(product.image_url));
  const taxonomyScore = jaccard(taxonomyTokens(seed), taxonomyTokens(product));
  const categoryScore = same(seed.category, product.category) ? 1 : 0;
  const garmentScore = same(seed.garment_type, product.garment_type) ? 1 : titleScore > 0.34 ? 0.45 : 0;
  const colorScore = same(seed.color_family, product.color_family) ? 1 : colorFamily(seed.color_family) === colorFamily(product.color_family) ? 0.55 : 0;
  const clusterScore = same(seed.cluster_id, product.cluster_id) && seed.cluster_id ? 1 : 0;
  const rawScore =
    clusterScore * 0.24 +
    categoryScore * 0.14 +
    garmentScore * 0.22 +
    colorScore * 0.14 +
    titleScore * 0.12 +
    fabricScore * 0.06 +
    imageScore * 0.04 +
    taxonomyScore * 0.04;
  const score = Number(Math.max(product.product_id === seed.product_id ? 1 : 0, Math.min(1, rawScore)).toFixed(3));
  return {
    product_id: product.product_id,
    seller_id: product.seller_id,
    cluster_id: product.cluster_id,
    title: product.title,
    image_url: product.image_url,
    score,
    reasons: similarityReasons({
      clusterScore,
      categoryScore,
      garmentScore,
      colorScore,
      titleScore,
      fabricScore,
      imageScore,
      taxonomyScore
    })
  };
}

function similarityReasons(scores: Record<string, number>) {
  const labels: Record<string, string> = {
    clusterScore: "same mapped group",
    categoryScore: "same category",
    garmentScore: "same product type",
    colorScore: "same color family",
    titleScore: "similar title",
    fabricScore: "similar fabric",
    imageScore: "image URL signal",
    taxonomyScore: "same catalog attributes"
  };
  return Object.entries(scores)
    .filter(([, value]) => value >= 0.45)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 4)
    .map(([key]) => labels[key]);
}

function tokens(value: unknown) {
  return new Set(String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token.length > 2 && !["with", "and", "for", "the", "set"].includes(token)));
}

function imageTokens(value: unknown) {
  try {
    const url = new URL(String(value ?? ""));
    return tokens(`${url.hostname} ${url.pathname.replace(/\.[a-z0-9]+$/i, "")}`);
  } catch {
    return tokens(value);
  }
}

function taxonomyTokens(product: any) {
  const attributes = Array.isArray(product.taxonomy_attributes) ? product.taxonomy_attributes : [];
  const values: string[] = attributes.flatMap((attribute: any) => [
    ...tokens(attribute.field_name),
    ...tokens(attribute.display_name),
    ...tokens(attribute.value)
  ]);
  return new Set(values);
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((item) => right.has(item)).length;
  const union = new Set([...left, ...right]).size;
  return union ? intersection / union : 0;
}

function same(left: unknown, right: unknown) {
  return String(left ?? "").trim().toLowerCase() === String(right ?? "").trim().toLowerCase();
}

function colorFamily(value: unknown) {
  const color = String(value ?? "").toLowerCase();
  if (["maroon", "red", "pink", "rose"].includes(color)) return "warm";
  if (["blue", "navy", "mint", "sage", "green"].includes(color)) return "cool";
  if (["black", "white", "cream", "tan"].includes(color)) return "neutral";
  return color;
}
