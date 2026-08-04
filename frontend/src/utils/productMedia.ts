import type { Product } from "../types/api";

type ProductMediaLike = Pick<Product, "image_url" | "image_urls" | "color_family" | "media_evidence"> &
  Partial<Pick<Product, "cluster_id" | "category" | "garment_type" | "title">>;

const MAX_PRODUCT_IMAGES = 6;

export function fallbackProductImage(color?: string | null) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}

export function productImageSource(product: ProductMediaLike | null | undefined) {
  return productImageSources(product)[0];
}

export function productImageSources(product: ProductMediaLike | null | undefined) {
  if (!product) return [fallbackProductImage()];

  const rawCandidates = [product.image_url, ...(product.image_urls ?? [])]
    .map(cleanImageUrl)
    .filter((value): value is string => Boolean(value));
  const uniqueRaw = Array.from(new Set(rawCandidates));
  if (uniqueRaw.length >= 2) return uniqueRaw.slice(0, MAX_PRODUCT_IMAGES);

  const expandedCatalogImages = uniqueRaw.flatMap((image) => catalogFamilyImages(image));
  const unique = Array.from(new Set([...uniqueRaw, ...expandedCatalogImages]));

  return unique.length ? unique.slice(0, MAX_PRODUCT_IMAGES) : [fallbackProductImage(product.color_family)];
}

export function productImageLabels(product: ProductMediaLike | null | undefined, images = productImageSources(product)) {
  const rawLabels = product?.media_evidence?.angle_labels?.length
    ? product.media_evidence.angle_labels
    : ["Main product", "Model fit", "Fabric detail", "Back view", "Measurement proof"];

  return images.map((image, index) => productImageLabel(rawLabels[index], index, image));
}

export function productImageLabel(label: string | undefined, index: number, imageUrl?: string) {
  const normalized = (label ?? "").toLowerCase();
  const suffixLabel = imageUrl ? productImageSuffixLabel(imageUrl) : null;
  if (suffixLabel) return suffixLabel;

  if (imageUrl && /-1(-\d)?\.(jpg|png)$/i.test(imageUrl)) {
    if (index === 0) return "Front view";
    if (imageUrl.includes("-1-2.")) return "Fit angle";
    if (imageUrl.includes("-1-3.")) return "Fabric detail";
    if (imageUrl.includes("-1-4.")) return "Close-up";
  }

  if (normalized.includes("main") || normalized.includes("front")) return "Front view";
  if (normalized.includes("model") || normalized.includes("lifestyle")) return "Model fit";
  if (normalized.includes("fabric")) return "Fabric detail";
  if (normalized.includes("measurement") || normalized.includes("size chart")) return "Measurement proof";
  if (normalized.includes("back")) return "Back view";
  if (normalized.includes("reviewer") || normalized.includes("customer")) return "Buyer photo";
  if (normalized.includes("alternate") || normalized.includes("side")) return "Side view";
  return `View ${index + 1}`;
}

function productImageSuffixLabel(imageUrl: string) {
  const fileName = imageUrl.split("/").pop() ?? imageUrl;
  if (/-model\.(jpg|png)$/i.test(fileName)) return "Model fit";
  if (/-front\.(jpg|png)$/i.test(fileName)) return "Front view";
  if (/-fabric\.(jpg|png)$/i.test(fileName)) return "Fabric detail";
  if (/-measurement\.(jpg|png)$/i.test(fileName)) return "Measurement proof";
  if (/-back\.(jpg|png)$/i.test(fileName)) return "Back view";
  if (/-product\.(jpg|png)$/i.test(fileName)) return "Product view";
  if (/-inside\.(jpg|png)$/i.test(fileName)) return "Inside view";
  if (/-material\.(jpg|png)$/i.test(fileName)) return "Material detail";
  if (/-scale\.(jpg|png)$/i.test(fileName)) return "Scale view";
  if (/-room\.(jpg|png)$/i.test(fileName)) return "Room view";
  if (/-set\.(jpg|png)$/i.test(fileName)) return "Set contents";
  if (/-fit\.(jpg|png)$/i.test(fileName)) return "Fit proof";
  if (/-length\.(jpg|png)$/i.test(fileName)) return "Length proof";
  return null;
}

function cleanImageUrl(value: string | null | undefined) {
  const source = value?.trim();
  if (!source) return null;
  if (source.includes("placehold.co") || source.includes("text=")) return null;
  return source;
}

function catalogFamilyImages(imageUrl: string) {
  const match = imageUrl.match(/^(\/catalog\/.+?)-\d(?:-\d)?\.(jpg|png)$/i);
  if (!match) return [];

  const [, prefix, ext] = match;
  const lowerExt = ext.toLowerCase();
  if (lowerExt === "png") {
    return [`${prefix}-1.${ext}`, `${prefix}-1-2.${ext}`, `${prefix}-1-3.${ext}`, `${prefix}-1-4.${ext}`];
  }

  return [1, 2, 3, 4].map((imageIndex) => `${prefix}-${imageIndex}.${ext}`);
}
