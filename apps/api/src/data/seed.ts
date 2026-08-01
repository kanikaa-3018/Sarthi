import type { Db } from "mongodb";
import { collections } from "../db/mongo.js";
import { clientPasswordSecret, hashPassword, sha256 } from "../services/crypto.js";
import { futureIso, iso } from "../services/time.js";

const sellers = [
  { seller_id: "seller_a", name: "NayiDisha Fashions", median_dispatch_hours: 19 },
  { seller_id: "seller_b", name: "RangSetu Styles", median_dispatch_hours: 31 },
  { seller_id: "seller_c", name: "Sakhi Wholesale", median_dispatch_hours: 24 }
];

const clusters = [
  { cluster_id: "cluster_floral_blue", label: "Blue floral daily kurtis", category: "women_kurtis" },
  { cluster_id: "cluster_pink_print", label: "Pink printed straight kurtis", category: "women_kurtis" },
  { cluster_id: "cluster_festive_maroon", label: "Maroon festive kurta sets", category: "women_kurta_sets" },
  { cluster_id: "cluster_cotton_tops", label: "Cotton everyday tops", category: "women_tops" },
  { cluster_id: "cluster_office_palazzo", label: "Office wear palazzos", category: "women_bottomwear" },
  { cluster_id: "cluster_summer_saree", label: "Summer printed sarees", category: "women_sarees" },
  { cluster_id: "cluster_work_bags", label: "Work and college handbags", category: "women_accessories" },
  { cluster_id: "cluster_home_bedsheets", label: "Printed cotton bedsheets", category: "home_furnishing" },
  { cluster_id: "cluster_denim_wideleg", label: "Wide-leg denim bottoms", category: "women_bottomwear" },
  { cluster_id: "cluster_graphic_tees", label: "Graphic daily tees", category: "women_tops" },
  { cluster_id: "cluster_everyday_tote", label: "Everyday structured handbags", category: "women_accessories" },
  { cluster_id: "cluster_room_comfort", label: "Bedroom comfort sets", category: "home_furnishing" },
  { cluster_id: "cluster_ajrakh_kurti", label: "Ajrakh printed kurtis", category: "women_kurtis" },
  { cluster_id: "cluster_relaxed_cargos", label: "Relaxed casual cargos", category: "women_bottomwear" },
  { cluster_id: "cluster_lightweight_dupatta", label: "Lightweight festive dupattas", category: "women_sarees" },
  { cluster_id: "cluster_everyday_coord", label: "Everyday co-ord sets", category: "women_kurta_sets" }
];

const buyers = [
  { buyer_id: "buyer_asha", display_name: "Asha", language: "english", cod_preferred: 1, fit_memory_enabled: 1, preferred_fit: "comfort", joined_at: iso(320) },
  { buyer_id: "buyer_neha", display_name: "Neha", language: "english", cod_preferred: 1, fit_memory_enabled: 1, preferred_fit: "regular", joined_at: iso(210) },
  { buyer_id: "buyer_cold", display_name: "New buyer", language: "english", cod_preferred: 1, fit_memory_enabled: 0, preferred_fit: "comfort", joined_at: iso(4) }
];

const buyerReviewProfiles = [
  reviewerProfile("buyer_asha", 320, 92, 7, 3, 18, 0.94, "trusted", ["long_history", "low_return_rate"]),
  reviewerProfile("buyer_neha", 210, 61, 8, 2, 13, 0.86, "trusted", ["verified_purchase_history"]),
  reviewerProfile("buyer_cold", 4, 0, 0, 0, 0, 0.45, "new_user", ["new_account", "no_order_history"]),
  reviewerProfile("buyer_synth_01", 180, 48, 5, 1, 9, 0.84, "trusted", ["stable_history"]),
  reviewerProfile("buyer_synth_02", 95, 26, 6, 4, 7, 0.71, "watch", ["moderate_returns"]),
  reviewerProfile("buyer_synth_03", 140, 37, 4, 2, 8, 0.8, "trusted", ["stable_history"]),
  reviewerProfile("buyer_verified_01", 260, 104, 9, 2, 22, 0.93, "trusted", ["long_history", "verified_purchase_history"]),
  reviewerProfile("buyer_new_01", 6, 1, 0, 0, 2, 0.48, "new_user", ["new_account", "thin_order_history"]),
  reviewerProfile("buyer_high_return_01", 70, 18, 16, 7, 11, 0.34, "high_return", ["high_return_rate", "high_rto_rate"]),
  reviewerProfile("buyer_repeat_text_01", 34, 8, 5, 3, 16, 0.39, "watch", ["repeated_text_pattern", "moderate_returns"])
];

const buyerFitProfiles = [
  fitProfile("fit_profile_asha_self", "buyer_asha", "Asha", "self", 1, "comfort", {
    women_kurtis: "XL",
    women_kurta_sets: "XL",
    women_tops: "L",
    women_bottomwear: "XL"
  }, ["prefers breathable fabric", "avoids chest-tight L sizes"]),
  fitProfile("fit_profile_asha_mom", "buyer_asha", "Mummy", "family", 0, "comfort", {
    women_kurtis: "XXL",
    women_kurta_sets: "XXL",
    women_tops: "XL",
    women_bottomwear: "XXL"
  }, ["buys looser daily wear fits"]),
  fitProfile("fit_profile_neha_self", "buyer_neha", "Neha", "self", 1, "regular", {
    women_kurtis: "M",
    women_kurta_sets: "M",
    women_tops: "M",
    women_bottomwear: "L"
  }, ["prefers standard fit"]),
  fitProfile("fit_profile_cold_self", "buyer_cold", "New buyer", "self", 1, "comfort", {
    women_kurtis: "XL",
    women_kurta_sets: "XL",
    women_tops: "L",
    women_bottomwear: "XL"
  }, ["profile can be corrected after first kept order"])
];

const clusterSpecs = [
  ["cluster_floral_blue", "Blue Floral Cotton Kurti", "women_kurtis", "kurti", "cotton blend", "blue", 449, true, [
    "/catalog/blue-floral-product-1.jpg",
    "/catalog/blue-floral-product-2.jpg",
    "/catalog/blue-floral-product-3.jpg",
    "/catalog/blue-floral-product-4.jpg"
  ]],
  ["cluster_pink_print", "Pink Printed Straight Kurti", "women_kurtis", "kurti", "rayon blend", "pink", 399, true, [
    "/catalog/pink-print-1.jpg",
    "/catalog/pink-print-2.jpg",
    "/catalog/pink-print-3.jpg",
    "/catalog/pink-print-4.jpg"
  ]],
  ["cluster_festive_maroon", "Maroon Festive Kurta Set", "women_kurta_sets", "kurta set", "viscose silk blend", "maroon", 699, true, [
    "/catalog/maroon-set-product-1.jpg",
    "/catalog/maroon-set-product-2.jpg",
    "/catalog/maroon-set-product-3.jpg",
    "/catalog/maroon-set-product-4.jpg"
  ]],
  ["cluster_cotton_tops", "Solid Cotton Daily Top", "women_tops", "top", "cotton jersey", "sage", 329, true, [
    "/catalog/cotton-top-1.jpg",
    "/catalog/cotton-top-2.jpg",
    "/catalog/cotton-top-3.jpg",
    "/catalog/cotton-top-4.jpg"
  ]],
  ["cluster_office_palazzo", "High Waist Office Palazzo", "women_bottomwear", "palazzo", "viscose blend", "black", 379, true, [
    "/catalog/office-palazzo-1.jpg",
    "/catalog/office-palazzo-2.jpg",
    "/catalog/office-palazzo-3.jpg",
    "/catalog/office-palazzo-4.jpg"
  ]],
  ["cluster_summer_saree", "Printed Summer Saree", "women_sarees", "saree", "cotton silk", "mint", 549, false, [
    "/catalog/summer-saree-1.jpg",
    "/catalog/summer-saree-2.jpg",
    "/catalog/summer-saree-3.jpg",
    "/catalog/summer-saree-4.jpg"
  ]],
  ["cluster_work_bags", "Zip Closure Work Handbag", "women_accessories", "handbag", "vegan leather", "tan", 499, false, [
    "/catalog/work-bag-1.jpg",
    "/catalog/work-bag-2.jpg",
    "/catalog/work-bag-3.jpg",
    "/catalog/work-bag-4.jpg"
  ]],
  ["cluster_home_bedsheets", "Printed Cotton Bedsheet Set", "home_furnishing", "bedsheet", "cotton", "multi", 459, false, [
    "/catalog/bedsheet-1.jpg",
    "/catalog/bedsheet-2.jpg",
    "/catalog/bedsheet-3.jpg",
    "/catalog/bedsheet-4.jpg"
  ]],
  ["cluster_denim_wideleg", "Wide Leg Denim Bottom", "women_bottomwear", "jeans", "denim blend", "blue", 529, true, [
    "/catalog/denim-1.png",
    "/catalog/denim-1-2.png",
    "/catalog/denim-1-3.png",
    "/catalog/denim-1-4.png"
  ]],
  ["cluster_graphic_tees", "Graphic Cotton Daily Tee", "women_tops", "t-shirt", "cotton jersey", "white", 279, true, [
    "/catalog/graphic-tee-1.png",
    "/catalog/graphic-tee-1-2.png",
    "/catalog/graphic-tee-1-3.png",
    "/catalog/graphic-tee-1-4.png"
  ]],
  ["cluster_everyday_tote", "Structured Everyday Handbag", "women_accessories", "handbag", "vegan leather", "brown", 599, false, [
    "/catalog/work-bag-1.jpg",
    "/catalog/work-bag-2.jpg",
    "/catalog/work-bag-3.jpg",
    "/catalog/work-bag-4.jpg"
  ]],
  ["cluster_room_comfort", "Soft Bedroom Comfort Set", "home_furnishing", "bedsheet", "cotton", "multi", 629, false, [
    "/catalog/bedsheet-1.jpg",
    "/catalog/bedsheet-2.jpg",
    "/catalog/bedsheet-3.jpg",
    "/catalog/bedsheet-4.jpg"
  ]],
  ["cluster_ajrakh_kurti", "Ajrakh Print Daily Kurti", "women_kurtis", "kurti", "cotton cambric", "blue", 469, true, [
    "/catalog/ajrakh-1.png",
    "/catalog/ajrakh-1-2.png",
    "/catalog/ajrakh-1-3.png",
    "/catalog/ajrakh-1-4.png"
  ]],
  ["cluster_relaxed_cargos", "Relaxed Everyday Cargo", "women_bottomwear", "cargo", "cotton twill", "olive", 489, true, [
    "/catalog/cargo-1.png",
    "/catalog/cargo-1-2.png",
    "/catalog/cargo-1-3.png",
    "/catalog/cargo-1-4.png"
  ]],
  ["cluster_lightweight_dupatta", "Lightweight Festive Dupatta", "women_sarees", "dupatta", "chiffon blend", "mint", 349, false, [
    "/catalog/dupatta-1.png",
    "/catalog/dupatta-1-2.png",
    "/catalog/dupatta-1-3.png",
    "/catalog/dupatta-1-4.png"
  ]],
  ["cluster_everyday_coord", "Everyday Printed Co-ord Set", "women_kurta_sets", "co-ord set", "rayon cotton", "maroon", 649, true, [
    "/catalog/coord-1.png",
    "/catalog/coord-1-2.png",
    "/catalog/coord-1-3.png",
    "/catalog/coord-1-4.png"
  ]]
] as const;

const sizes = ["S", "M", "L", "XL", "XXL"];
const productNameSuffixes = ["Everyday Wear", "Office Ready", "Festival Edit", "Comfort Fit"] as const;
const singleSizeCategories = new Set(["women_accessories", "home_furnishing", "women_sarees"]);

function productGallery(images: readonly string[], itemIndex: number) {
  const baseImg = images[0] ?? "";
  if (!baseImg) return [];
  const primary = images[0];
  const rotatedProvidedViews = rotateGalleryViews(images.slice(1), itemIndex);
  const explicitViews = [1, 2, 3, 4].map((index) => baseImg.replace(/-1\.(jpg|png)$/i, `-${index}.$1`));
  if (explicitViews.every((image) => images.includes(image))) {
    const ordered = [primary, ...rotatedProvidedViews, ...images].filter(Boolean);
    return Array.from(new Set(ordered));
  }
  const match = baseImg.match(/^(.*-1)\.(jpg|png)$/);
  if (!match) {
    const ordered = [primary, ...rotatedProvidedViews, ...images].filter(Boolean);
    return Array.from(new Set(ordered));
  }
  const basePath = match[1];
  const ext = match[2];
  const proofAngles = [
    `${basePath}.${ext}`,
    `${basePath}-2.${ext}`,
    `${basePath}-3.${ext}`,
    `${basePath}-4.${ext}`
  ];
  const ordered = [primary, ...rotatedProvidedViews, ...rotateGalleryViews(proofAngles.slice(1), itemIndex), ...proofAngles].filter(Boolean);
  return Array.from(new Set(ordered));
}

function rotateGalleryViews(images: readonly string[], itemIndex: number) {
  if (images.length <= 1) return [...images];
  const offset = (itemIndex - 1) % images.length;
  return [...images.slice(offset), ...images.slice(0, offset)];
}

function mediaEvidence(imageUrls: string[], itemIndex: number, category: string) {
  const labelSequence = [
    "Model view",
    "Side view",
    "Fabric close-up",
    "Lifestyle",
    "Seller angle",
    "Buyer photo",
    "Measurement chart"
  ];
  const labels = imageUrls.map((_, index) => labelSequence[index] ?? `View ${index + 1}`);
  const apparelCategories = new Set(["women_kurtis", "women_kurta_sets", "women_tops", "women_bottomwear", "women_sarees"]);
  const apparel = apparelCategories.has(category);
  const hasFabricCloseup = labels.some((label) => label.toLowerCase().includes("fabric"));
  const hasHumanModel = apparel ? labels.some((label) => /model|lifestyle/i.test(label)) : true;
  const hasMeasurementChart = apparel && itemIndex !== 2;
  const reviewerPhotoCount = itemIndex % 2 === 0 ? 2 : 1;
  const requiredAssets = [
    {
      key: "main_product",
      label: "Main product photo",
      status: imageUrls.length >= 1 ? "present" : "missing",
      required: true,
      detail: "Buyer can inspect the primary listing image."
    },
    {
      key: "human_model",
      label: "Human-model image",
      status: apparel ? (hasHumanModel ? "present" : "missing") : "not_required",
      required: apparel,
      detail: apparel ? "Apparel should show fall, length, and fit on a human model." : "Not required for this category."
    },
    {
      key: "fabric_closeup",
      label: "Fabric close-up",
      status: hasFabricCloseup ? "present" : "missing",
      required: apparel,
      detail: "Close-up reduces fabric and transparency doubt."
    },
    {
      key: "measurement_chart",
      label: "Measurement chart",
      status: hasMeasurementChart ? "linked" : apparel ? "missing" : "not_required",
      required: apparel,
      detail: "Used by fit confidence before checkout."
    },
    {
      key: "reviewer_photos",
      label: "Reviewer/customer photos",
      status: reviewerPhotoCount > 0 ? "present" : "missing",
      required: true,
      detail: `${reviewerPhotoCount} buyer photo signal${reviewerPhotoCount === 1 ? "" : "s"} attached to this catalog group.`
    }
  ];
  const missingAngles = requiredAssets
    .filter((asset) => asset.required && asset.status === "missing")
    .map((asset) => asset.label);
  const qualityScore = Math.max(42, Math.min(98,
    48 +
    imageUrls.length * 8 +
    (hasHumanModel ? 12 : 0) +
    (hasFabricCloseup ? 10 : 0) +
    (hasMeasurementChart ? 8 : 0) +
    Math.min(8, reviewerPhotoCount * 4)
  ));
  return {
    image_count: imageUrls.length,
    angle_labels: labels,
    verification_status: imageUrls.length >= 2 ? "verified_gallery" : "limited_gallery",
    source: "seller_catalog_media",
    issues: [],
    warnings: missingAngles.map((angle) => `${angle} missing important angle`),
    quality_score: qualityScore,
    clarity_score: Math.min(100, 68 + imageUrls.length * 6 + (hasFabricCloseup ? 8 : 0)),
    gallery_readiness: missingAngles.length ? "needs_more_media" : "complete",
    human_model_required: apparel,
    required_assets: requiredAssets,
    missing_angles: missingAngles,
    reviewer_photo_count: reviewerPhotoCount,
    buyer_copy: missingAngles.length
      ? `Image check is usable, but ${missingAngles[0].toLowerCase()} should be added before high confidence.`
      : "Image proof covers the important buying angles for this category.",
    checked_at: iso(itemIndex % 3)
  };
}

function productQualitySignals(category: string, eligible: boolean, itemIndex: number) {
  const needsSizeChart = !singleSizeCategories.has(category);
  return {
    size_chart_available: needsSizeChart,
    measurement_tolerance_cm: needsSizeChart ? 2 : null,
    fabric_proof_status: eligible ? (itemIndex === 2 ? "requested" : "available") : "catalog_only",
    color_proof_status: itemIndex % 3 === 0 ? "daylight_check_needed" : "available",
    return_window_days: 7,
    cod_available: itemIndex !== 4,
    proof_priority: needsSizeChart ? ["size", "fabric", "color"] : ["media", "source"]
  };
}

export function buildSeedDocuments() {
  const products: any[] = [];
  const variants: any[] = [];
  const reviews: any[] = [];
  const outcomes: any[] = [];
  const facts: any[] = [];
  const priceEvents: any[] = [];
  const campaigns: any[] = [];
  const inventorySnapshots: any[] = [];

  const addFact = (fact_id: string, source_table: string, source_id: string, source_type: string, summary: string, daysAgo = 0) => {
    facts.push({ fact_id, source_table, source_id, source_type, summary, created_at: iso(daysAgo), expires_at: null });
  };

  clusterSpecs.forEach((spec, clusterIndexZero) => {
    const clusterIndex = clusterIndexZero + 1;
    const [cluster_id, baseTitle, category, garment_type, fabric, color_family, basePrice, eligible, images] = spec;
    for (let itemIndex = 1; itemIndex <= 4; itemIndex += 1) {
      const seller = sellers[(itemIndex + clusterIndex) % sellers.length];
      const imageUrls = productGallery(images, itemIndex);
      const product = {
        product_id: `kurti_${clusterIndex}_${itemIndex}`,
        cluster_id,
        seller_id: seller.seller_id,
        seller_name: seller.name,
        title: `${baseTitle} ${productNameSuffixes[itemIndex - 1]}`,
        category,
        garment_type,
        fabric,
        color_family,
        base_price: basePrice + (itemIndex - 2) * 20,
        image_url: imageUrls[0],
        image_urls: imageUrls,
        feed_rank: (itemIndex - 1) * clusterSpecs.length + clusterIndex,
        rating: Number((4.0 + ((clusterIndex + itemIndex) % 7) * 0.1).toFixed(1)),
        rating_count: 180 + clusterIndex * 57 + itemIndex * 43,
        commerce_badge: eligible && itemIndex === 1 ? "Sarthi choice" : ["Deal", "Trending", "Low return", "COD"][(clusterIndex + itemIndex) % 4],
        delivery_text: itemIndex % 2 ? "Free delivery in 3-5 days" : "Delivery by tomorrow",
        is_sarthi_eligible: eligible ? 1 : 0,
        source_refs: {
          source_product_id: 600000000 + clusterIndex * 100 + itemIndex,
          catalog_id: 230000000 + clusterIndex,
          supplier_id: 2600000 + ((itemIndex + clusterIndex) % sellers.length)
        },
        taxonomy_attributes: [
          { field_name: "category", display_name: "Category", value: category },
          { field_name: "generic_name", display_name: "Generic Name", value: garment_type },
          { field_name: "fabric", display_name: "Fabric", value: fabric },
          { field_name: "color", display_name: "Color", value: color_family }
        ],
        seller_snapshot: {
          supplier_type: itemIndex % 3 === 0 ? "MANUFACTURER" : "TRADER",
          quality_rating: Number((3.8 + ((clusterIndex + itemIndex) % 5) * 0.12).toFixed(1)),
          availability_rating: Number((3.9 + ((clusterIndex + itemIndex + 1) % 5) * 0.1).toFixed(1)),
          shipping_rating: Number((3.8 + ((clusterIndex + itemIndex + 2) % 5) * 0.11).toFixed(1))
        },
        fulfillment: {
          returns_enabled: true,
          cod_available: itemIndex !== 4,
          cod_charges: itemIndex === 2 ? 29 : 0,
          return_conditions_visible: itemIndex !== 2,
          shipping_delay_days: itemIndex === 2 ? 1 : 0,
          reverse_carrier_weight_g: 120
        },
        media_evidence: mediaEvidence(imageUrls, itemIndex, category),
        quality_signals: productQualitySignals(category, eligible, itemIndex)
      };
      products.push(product);

      const productSizes = singleSizeCategories.has(category) ? ["ONE_SIZE"] : sizes;
      productSizes.forEach((size, sizeIndex) => {
        const variant = {
          variant_id: `${product.product_id}_${size.toLowerCase()}`,
          product_id: product.product_id,
          size,
          current_price: product.base_price + sizeIndex * 10,
          stock: 18 + sizeIndex * 3
        };
        variants.push(variant);
      });
    }
  });

  const reviewTemplates = [
    ["fabric", "positive", "Light cotton blend, good for summer use.", 4.3],
    ["fit", "mixed", "L feels tight at chest; XL worked better.", 3.8],
    ["color", "mixed", "Looks darker indoors, daylight photo is closer.", 3.7],
    ["wash", "positive", "Machine wash was fine on gentle cycle.", 4.1],
    ["quality", "positive", "Stitching was neat for the price.", 4.2]
  ] as const;
  let reviewCounter = 1;
  const reviewerIds = [
    "buyer_asha",
    "buyer_neha",
    "buyer_verified_01",
    "buyer_new_01",
    "buyer_high_return_01",
    "buyer_repeat_text_01",
    "buyer_synth_01",
    "buyer_synth_02"
  ];
  const reviewerById = new Map(buyerReviewProfiles.map((profile) => [profile.buyer_id, profile]));
  for (const product of products) {
    for (const [attribute, sentiment, text, rating] of reviewTemplates) {
      const review_id = `review_${String(reviewCounter).padStart(3, "0")}`;
      const fact_id = `fact_review_${String(reviewCounter).padStart(3, "0")}`;
      const reviewer_buyer_id = reviewerIds[(reviewCounter + product.rating_count) % reviewerIds.length];
      const reviewer = reviewerById.get(reviewer_buyer_id)!;
      const flags = [
        ...reviewer.risk_signals,
        ...(attribute === "quality" && reviewer_buyer_id === "buyer_repeat_text_01" ? ["generic_quality_text"] : []),
        ...(attribute === "fabric" && product.fulfillment.shipping_delay_days > 0 ? ["needs_attribute_proof"] : [])
      ];
      const credibility_weight = reviewCredibilityWeight(reviewer, flags);
      reviews.push({
        review_id,
        product_id: product.product_id,
        variant_id: null,
        reviewer_buyer_id,
        attribute,
        sentiment,
        text: flags.includes("generic_quality_text") ? "Good product, nice, same as shown." : text,
        rating,
        verified_purchase: reviewer.delivered_orders > 0 ? 1 : 0,
        reviewer_age_days: reviewer.marketplace_age_days,
        reviewer_return_rate: reviewer.return_rate,
        credibility_weight,
        credibility_flags: flags,
        fact_id
      });
      addFact(fact_id, "reviews", review_id, "review", text, reviewCounter % 20);
      reviewCounter += 1;
    }
  }

  const outcomeVariants = variants.filter((variant) => !variant.variant_id.startsWith("kurti_1_4_"));
  const buyerIds = ["buyer_asha", "buyer_neha", "buyer_synth_01", "buyer_synth_02", "buyer_synth_03"];
  const returnReasons = ["too_large", "color_different", "fabric_different", "damaged"];
  for (let idx = 0; idx < 1920; idx += 1) {
    const variant = outcomeVariants[idx % outcomeVariants.length];
    const size = String(variant.size).toUpperCase();
    const roll = (idx * 9301 + 49297) % 233280 / 233280;
    let status = "delivered_kept";
    let return_reason: string | null = null;
    if (size === "L" && roll < 0.32) {
      status = "returned";
      return_reason = "too_small";
    } else if (roll < 0.12) {
      status = "returned";
      return_reason = returnReasons[idx % returnReasons.length];
    } else if (roll < 0.18) {
      status = "rto";
    } else if (roll < 0.22) {
      status = "exchanged";
      return_reason = "too_small";
    }
    const order_id = `order_${String(idx + 1).padStart(4, "0")}`;
    const fact_id = `fact_order_${String(idx + 1).padStart(4, "0")}`;
    outcomes.push({
      order_id,
      buyer_id: buyerIds[idx % buyerIds.length],
      variant_id: variant.variant_id,
      status,
      return_reason,
      created_at: iso(idx % 90),
      fact_id
    });
    addFact(fact_id, "order_outcomes", order_id, "order_outcome", `${status} outcome for ${variant.variant_id}${return_reason ? ` due to ${return_reason}` : ""}`, idx % 90);
  }

  const expectationContracts = [{
    contract_id: "contract_seed_pending_asha_1",
    buyer_id: "buyer_asha",
    product_id: "kurti_1_1",
    variant_id: "kurti_1_1_xl",
    status: "active",
    contract: {
      title: "Sarthi expectation contract",
      summary: "Fact-backed snapshot before checkout.",
      items: [
        { dimension: "fit", claim: "Recommended size XL", confidence: "medium", buyer_action: "Confirm after delivery.", fact_ids: ["fact_order_0004"] },
        { dimension: "fabric", claim: "cotton blend", confidence: "weak", buyer_action: "Return reason can teach future fabric checks.", fact_ids: ["fact_review_001"] },
        { dimension: "color", claim: "blue", confidence: "medium", buyer_action: "Report mismatch if daylight color differs.", fact_ids: ["fact_review_002"] },
        { dimension: "dispatch", claim: "Free delivery in 3-5 days", confidence: "medium", buyer_action: "Confirm delivery outcome.", fact_ids: [] },
        { dimension: "offer", claim: "Timer pressure not used", confidence: "medium", buyer_action: "Use current price proof instead of urgency.", fact_ids: ["fact_price_0012"] }
      ],
      fact_ids: ["fact_order_0004", "fact_review_001", "fact_review_002", "fact_price_0012"],
      privacy: { buyer_visible: true, seller_visible_as_aggregate_only: true, raw_private_memory_exposed: false }
    },
    created_at: iso(1),
    completed_at: null,
    outcome_order_id: null,
    broken_dimension: null,
    fact_id: "fact_contract_seed_pending_asha_1"
  }];
  addFact("fact_contract_seed_pending_asha_1", "expectation_contracts", "contract_seed_pending_asha_1", "expectation_contract", "Pending delivered order feedback for buyer_asha on kurti_1_1_xl", 1);

  const proofRequests = [
    proofRequest("proof_req_seed_a_fabric", "buyer_asha", "seller_a", "kurti_1_2", "kurti_1_2_xl", "fabric", "Kapda thin toh nahi hai?", 6, 3),
    {
      ...proofRequest("proof_req_seed_asha_color_pending", "buyer_asha", "seller_a", "kurti_2_1", "kurti_2_1_xl", "color", "Daylight mein colour same dikhega?", 4, 2),
      status: "submitted",
      resolution_proof_id: "proof_seed_a_color_pending"
    },
    {
      ...proofRequest("proof_req_seed_asha_size_approved", "buyer_asha", "seller_a", "kurti_3_3", "kurti_3_3_xl", "size", "XL chest tight toh nahi hoga?", 5, 1),
      status: "resolved",
      resolved_at: iso(0, 5),
      resolution_proof_id: "proof_seed_a_size_verified"
    },
    proofRequest("proof_req_seed_a_color", "buyer_neha", "seller_a", "kurti_2_1", "kurti_2_1_xl", "color", "Daylight mein colour same dikhega?", 4, 2),
    proofRequest("proof_req_seed_a_size", "buyer_synth_01", "seller_a", "kurti_3_3", "kurti_3_3_xl", "size", "XL chest tight toh nahi hoga?", 5, 1),
    proofRequest("proof_req_seed_a_transparency", "buyer_synth_02", "seller_a", "kurti_4_2", "kurti_4_2_l", "transparency", "White light mein transparent toh nahi?", 3, 4)
  ];
  for (const request of proofRequests) {
    addFact(request.fact_id, "proof_requests", request.request_id, "proof_request", `${request.attribute} proof requested by buyers for ${request.product_id}.`, 2);
  }
  const sellerEvidenceAssets = [
    {
      proof_id: "proof_seed_a_color_pending",
      seller_id: "seller_a",
      product_id: "kurti_2_1",
      attribute: "color",
      proof_type: "daylight_photo",
      title: "Daylight colour photo",
      description: "Seller submitted a daylight photo for colour match review.",
      asset_url: "/catalog/pink-print-3.jpg",
      status: "submitted",
      created_at: iso(1),
      submitted_at: iso(1),
      reviewed_at: null,
      review_notes: null,
      fact_id: "fact_proof_seed_a_color_pending"
    },
    {
      proof_id: "proof_seed_a_size_verified",
      seller_id: "seller_a",
      product_id: "kurti_3_3",
      attribute: "size",
      proof_type: "measurement_chart",
      title: "XL measurement chart",
      description: "Admin approved chest and length measurements for size XL.",
      asset_url: "seeded://proofs/seller_a/kurti_3_3_size_chart",
      status: "verified",
      created_at: iso(2),
      submitted_at: iso(2),
      reviewed_at: iso(0, 5),
      review_notes: "Measurement proof matches the listing claim.",
      fact_id: "fact_proof_seed_a_size_verified"
    }
  ];
  for (const asset of sellerEvidenceAssets) {
    addFact(asset.fact_id, "seller_evidence_assets", asset.proof_id, "seller_proof", `${asset.attribute} proof ${asset.status} for ${asset.product_id}.`, 1);
  }

  let priceCounter = 1;
  for (const variant of variants) {
    const productItemIndex = Number(String(variant.product_id).split("_").at(-1) ?? 0);
    const priceTimeline = productItemIndex === 2
      ? [[29, 30, "baseline"], [2, 80, "price_spike"], [0, 0, "current"]] as const
      : [[29, 40, "baseline"], [12, 20, "price_change"], [5, 0, "current"]] as const;
    for (const [daysAgo, delta, event_type] of priceTimeline) {
      const price_event_id = `price_${String(priceCounter).padStart(4, "0")}`;
      const fact_id = `fact_price_${String(priceCounter).padStart(4, "0")}`;
      priceEvents.push({ price_event_id, variant_id: variant.variant_id, price: variant.current_price + delta, event_type, created_at: iso(daysAgo), fact_id });
      addFact(fact_id, "price_events", price_event_id, "price", `${variant.variant_id} price was Rs ${variant.current_price + delta}`, daysAgo);
      priceCounter += 1;
    }
    const campaign_id = `campaign_${variant.variant_id}`;
    const campaignFact = `fact_${campaign_id}`;
    const timerResetCount = productItemIndex === 2 ? 3 : productItemIndex === 4 ? 1 : 0;
    campaigns.push({ campaign_id, variant_id: variant.variant_id, start_at: iso(5), end_at: futureIso(24), timer_reset_count: timerResetCount, fact_id: campaignFact });
    addFact(campaignFact, "campaign_events", campaign_id, "campaign", `Campaign for ${variant.variant_id} has server verified dates`, 5);
    const snapshot_id = `inventory_${variant.variant_id}`;
    const invFact = `fact_${snapshot_id}`;
    inventorySnapshots.push({ snapshot_id, variant_id: variant.variant_id, available_to_promise: variant.stock, sales_velocity_24h: 4 + (variant.stock % 5), captured_at: iso(0, 2), fact_id: invFact });
    addFact(invFact, "inventory_snapshots", snapshot_id, "inventory", `${variant.variant_id} has ${variant.stock} available-to-promise units`);
  }

  const sellerProfiles = [
    profile("seller_a", "verified", "verified", "verified", "560102", ["women_kurtis", "women_kurta_sets"], "ops+nayidisha@example.local", "aggregate_only", null, iso(3)),
    profile("seller_b", "pending", "pending_review", "under_review", "302012", ["women_kurtis"], "ops+rangsetu@example.local", "limited", null, iso(18)),
    profile("seller_c", "verified", "verified", "verified", "201301", ["women_kurtis", "women_kurta_sets"], "ops+sakhi@example.local", "aggregate_only", null, iso(2))
  ];

  const sellerApplications = [
    app("seller_app_seed_a", "seller_a", "NayiDisha Fashions", "29NAYIDISHA1Z5", "560102", "ops+nayidisha@example.local", "approved", iso(35)),
    app("seller_app_seed_b", "seller_b", "RangSetu Styles", "08RANGSETU1Z7", "302012", "ops+rangsetu@example.local", "pending_review", iso(18)),
    app("seller_app_seed_c", "seller_c", "Sakhi Wholesale", "09SAKHIWHOLESALE1Z2", "201301", "ops+sakhi@example.local", "approved", iso(28))
  ];

  const documents = [
    doc("doc_seed_a_gst", "seller_a", "gst_certificate", "GST certificate ending 1Z5", "gst_seed_a.pdf", "approved", "Matched seller legal name."),
    doc("doc_seed_a_bank", "seller_a", "bank_proof", "Cancelled cheque ending 4431", "bank_seed_a.pdf", "approved", "Payout account verified."),
    doc("doc_seed_b_gst", "seller_b", "gst_certificate", "GST certificate ending 1Z7", "gst_seed_b.pdf", "under_review", "Manual review pending."),
    doc("doc_seed_c_gst", "seller_c", "gst_certificate", "GST certificate ending 1Z2", "gst_seed_c.pdf", "approved", "Matched seller legal name."),
    doc("doc_seed_c_address", "seller_c", "address_proof", "Warehouse utility bill", "address_seed_c.pdf", "approved", "Pickup address verified."),
    doc("doc_seed_c_bank", "seller_c", "bank_proof", "Cancelled cheque ending 8842", "bank_seed_c.pdf", "approved", "Payout account verified.")
  ];

  const fitMemory = [
    memory("fit_memory_asha_01", "buyer_asha", "women_kurtis", "kurti_1_1_xl", "XL", "comfort", "medium", 1),
    memory("fit_memory_asha_02", "buyer_asha", "women_kurtis", "kurti_2_1_xl", "XL", "comfort", "medium", 2),
    memory("fit_memory_neha_01", "buyer_neha", "women_kurtis", "kurti_1_2_m", "M", "regular", "medium", 3)
  ];
  for (const item of fitMemory) {
    addFact(item.fact_id, "fit_memory", item.memory_id, "fit_memory", `${item.buyer_id} retained ${item.retained_size} in ${item.category}`, 1);
  }

  return {
    buyers,
    buyerReviewProfiles,
    buyerFitProfiles,
    sellers,
    sellerProfiles,
    accounts: seedAccounts(),
    dataSources: dataSources(),
    clusters,
    products,
    variants,
    reviews,
    outcomes,
    priceEvents,
    campaigns,
    inventorySnapshots,
    fitMemory,
    facts,
    sellerApplications,
    sellerVerificationDocuments: documents,
    listingDrafts: [{
      draft_id: "draft_seed_a_ready",
      seller_id: "seller_a",
      title: "Green Cotton Daily Kurti - Ready Draft",
      category: "women_kurtis",
      garment_type: "kurti",
      fabric: "cotton blend",
      color_family: "green",
      base_price: 429,
      image_url: "/catalog/blue-floral-4.jpg",
      target_cluster_id: "cluster_floral_blue",
      status: "draft",
      readiness_status: "catalog_only",
      created_at: iso(3),
      updated_at: iso(1),
      submitted_at: null
    }, {
      draft_id: "draft_seed_pending_b",
      seller_id: "seller_b",
      title: "Pink Printed Straight Kurti - New Seller Draft",
      category: "women_kurtis",
      garment_type: "kurti",
      fabric: "rayon blend",
      color_family: "pink",
      base_price: 389,
      image_url: "/catalog/pink-print-3.jpg",
      target_cluster_id: "cluster_pink_print",
      status: "submitted",
      readiness_status: "blocked_seller_verification",
      created_at: iso(8),
      updated_at: iso(4),
      submitted_at: iso(4)
    }],
    proofRequests,
    sellerEvidenceAssets,
    auditTraces: [],
    expectationContracts,
    adminAuditEvents: [],
    llmCache: [],
    trustScoreSnapshots: [],
    wishlistIntents: [],
    trustRadarEvents: [],
    cartConfidenceSnapshots: [],
    featureWeights: [{
      category: "default",
      active: 1,
      description: "Marketplace-level trust weights. Stored in Mongo so scoring can be tuned without changing application code.",
      weights: {
        sku_outcome: 22,
        seller_reliability: 15,
        seller_verification: 12,
        fit_consistency: 18,
        review_credibility: 14,
        product_rating: 10,
        proof_coverage: 3,
        offer_truth: 1,
        dispatch: 8,
        price_value: 6
      },
      version: "sarthi_trust_policy_v1"
    }, {
      category: "women_kurtis",
      active: 1,
      description: "Fit-heavy apparel variant: gives more weight to kept-order fit evidence while still protecting newer verified sellers.",
      weights: {
        sku_outcome: 24,
        seller_reliability: 14,
        seller_verification: 12,
        fit_consistency: 20,
        review_credibility: 13,
        product_rating: 8,
        proof_coverage: 4,
        offer_truth: 1,
        dispatch: 6,
        price_value: 4
      },
      version: "sarthi_apparel_fit_policy_v1"
    }]
  };
}

export async function resetMongoSeed(db: Db) {
  const c = collections(db);
  const docs = buildSeedDocuments();
  await Promise.all(Object.values(c).map((collection) => collection.deleteMany({})));
  await insert(c.buyers, docs.buyers);
  await insert(c.buyerReviewProfiles, docs.buyerReviewProfiles);
  await insert(c.buyerFitProfiles, docs.buyerFitProfiles);
  await insert(c.sellers, docs.sellers);
  await insert(c.sellerProfiles, docs.sellerProfiles);
  await insert(c.accounts, docs.accounts);
  await insert(c.dataSources, docs.dataSources);
  await insert(c.clusters, docs.clusters);
  await insert(c.products, docs.products);
  await insert(c.variants, docs.variants);
  await insert(c.reviews, docs.reviews);
  await insert(c.outcomes, docs.outcomes);
  await insert(c.priceEvents, docs.priceEvents);
  await insert(c.campaigns, docs.campaigns);
  await insert(c.inventorySnapshots, docs.inventorySnapshots);
  await insert(c.fitMemory, docs.fitMemory);
  await insert(c.facts, docs.facts);
  await insert(c.sellerApplications, docs.sellerApplications);
  await insert(c.sellerVerificationDocuments, docs.sellerVerificationDocuments);
  await insert(c.listingDrafts, docs.listingDrafts);
  await insert(c.proofRequests, docs.proofRequests);
  await insert(c.sellerEvidenceAssets, docs.sellerEvidenceAssets);
  await insert(c.auditTraces, docs.auditTraces);
  await insert(c.expectationContracts, docs.expectationContracts);
  await insert(c.adminAuditEvents, docs.adminAuditEvents);
  await insert(c.llmCache, docs.llmCache);
  await insert(c.trustScoreSnapshots, docs.trustScoreSnapshots);
  await insert(c.wishlistIntents, docs.wishlistIntents);
  await insert(c.trustRadarEvents, docs.trustRadarEvents);
  await insert(c.cartConfidenceSnapshots, docs.cartConfidenceSnapshots);
  await insert(c.featureWeights, docs.featureWeights);
  return {
    buyers: docs.buyers.length,
    buyerReviewProfiles: docs.buyerReviewProfiles.length,
    buyerFitProfiles: docs.buyerFitProfiles.length,
    sellers: docs.sellers.length,
    products: docs.products.length,
    variants: docs.variants.length,
    outcomes: docs.outcomes.length,
    facts: docs.facts.length,
    proofRequests: docs.proofRequests.length,
    sellerEvidenceAssets: docs.sellerEvidenceAssets.length
  };
}

async function insert(collection: any, documents: any[]) {
  if (documents.length) await collection.insertMany(documents);
}

function reviewerProfile(
  buyer_id: string,
  marketplace_age_days: number,
  delivered_orders: number,
  returned_orders: number,
  rto_orders: number,
  review_count: number,
  credibility_weight: number,
  risk_band: string,
  risk_signals: string[]
) {
  const completed = delivered_orders + returned_orders;
  return {
    buyer_id,
    marketplace_age_days,
    delivered_orders,
    returned_orders,
    rto_orders,
    return_rate: completed ? Number((returned_orders / completed).toFixed(3)) : 0,
    rto_rate: completed + rto_orders ? Number((rto_orders / (completed + rto_orders)).toFixed(3)) : 0,
    review_count,
    verified_purchase_rate: delivered_orders > 0 ? 1 : 0,
    credibility_weight,
    risk_band,
    risk_signals,
    updated_at: iso(0, 3)
  };
}

function fitProfile(profile_id: string, buyer_id: string, label: string, relationship: string, active: number, preferred_fit: string, size_map: Record<string, string>, notes: string[]) {
  return {
    profile_id,
    buyer_id,
    label,
    relationship,
    active,
    preferred_fit,
    size_map,
    notes,
    source: "buyer_owned_profile",
    privacy_scope: "buyer_only",
    created_at: iso(15),
    updated_at: iso(1)
  };
}

function reviewCredibilityWeight(reviewer: any, flags: string[]) {
  let weight = reviewer.credibility_weight ?? 0.6;
  if (flags.includes("generic_quality_text")) weight -= 0.1;
  if (flags.includes("needs_attribute_proof")) weight -= 0.04;
  return Number(Math.max(0.2, Math.min(1, weight)).toFixed(2));
}

function seedAccounts() {
  return [
    account("acct_buyer_asha", "asha.buyer", "Asha", "buyer", "buyer_asha", null, "buyer-asha-pass"),
    account("acct_buyer_neha", "neha.buyer", "Neha", "buyer", "buyer_neha", null, "buyer-neha-pass"),
    account("acct_buyer_cold", "cold.buyer", "New buyer", "buyer", "buyer_cold", null, "buyer-cold-pass"),
    account("acct_seller_a", "seller.a", "NayiDisha Fashions", "seller", null, "seller_a", "seller-a-pass"),
    account("acct_seller_b", "seller.b", "RangSetu Styles", "seller", null, "seller_b", "seller-b-pass"),
    account("acct_seller_c", "seller.c", "Sakhi Wholesale", "seller", null, "seller_c", "seller-c-pass"),
    account("acct_admin_reviewer", "reviewer.admin", "Reviewer Admin", "admin", null, null, "admin-reviewer-pass")
  ];
}

function account(account_id: string, username: string, display_name: string, role: string, buyer_id: string | null, seller_id: string | null, password: string) {
  const { salt, hash } = hashPassword(clientPasswordSecret(sha256(password)));
  return {
    account_id,
    username,
    display_name,
    role,
    buyer_id,
    seller_id,
    password_salt: salt,
    password_hash: hash,
    password_client_hash_version: "sha256_v1",
    disabled: 0,
    created_at: iso(20)
  };
}

function profile(seller_id: string, verification_status: string, gst_status: string, kyc_status: string, pickup_pincode: string, categories: string[], support_contact: string, data_access_level: string, restricted_reason: string | null, last_verified_at: string) {
  return { seller_id, verification_status, gst_status, kyc_status, pickup_pincode, categories, support_contact, data_access_level, restricted_reason, last_verified_at };
}

function app(application_id: string, seller_id: string, business_name: string, gst_number: string, pickup_pincode: string, support_contact: string, status: string, created_at: string) {
  return { application_id, seller_id, business_name, gst_number, pickup_pincode, support_contact, status, created_at };
}

function doc(document_id: string, seller_id: string, document_type: string, reference: string, file_name: string, status: string, notes: string) {
  const submitted_at = iso(18);
  return {
    document_id,
    seller_id,
    document_type,
    reference,
    file_name,
    mime_type: "application/pdf",
    file_size_bytes: 1024 + reference.length,
    sha256: sha256(`${document_id}:${reference}`),
    storage_uri: `seeded/seller_documents/${seller_id}/${file_name}`,
    uploaded_at: submitted_at,
    status,
    submitted_at,
    reviewed_at: status === "approved" ? iso(17) : null,
    notes
  };
}

function proofRequest(request_id: string, buyer_id: string, seller_id: string, product_id: string, variant_id: string, attribute: string, buyer_question: string, request_count: number, daysAgo: number) {
  return {
    request_id,
    buyer_id,
    seller_id,
    product_id,
    variant_id,
    attribute,
    buyer_question,
    status: "open",
    request_count,
    created_at: iso(daysAgo),
    updated_at: iso(0, daysAgo),
    resolved_at: null,
    resolution_proof_id: null,
    fact_id: `fact_${request_id}`
  };
}

function memory(memory_id: string, buyer_id: string, category: string, anchor_variant_id: string, retained_size: string, preferred_fit: string, confidence: string, daysAgo: number) {
  return {
    memory_id,
    buyer_id,
    category,
    anchor_variant_id,
    retained_size,
    preferred_fit,
    confidence,
    updated_at: iso(daysAgo),
    fact_id: `fact_${memory_id}`
  };
}

function dataSources() {
  return [
    source("catalog", "catalog", "Catalog listing service", "catalog-platform", 6, iso(0, 1), "operational", "Product, variant, category, and seller listing metadata."),
    source("orders", "orders", "Delivered order outcomes", "order-platform", 24, iso(0, 2), "operational", "Delivered, returned, exchanged, and RTO outcomes."),
    source("returns", "returns", "Return reason service", "returns-platform", 24, iso(0, 2), "operational", "Structured return reasons used for avoidable issue detection."),
    source("reviews", "reviews", "Review evidence index", "ugc-platform", 48, iso(1), "operational", "Attribute-level review snippets with fact IDs."),
    source("pricing", "pricing", "Price event ledger", "pricing-platform", 12, iso(0, 3), "operational", "Historical price events for offer verification."),
    source("campaigns", "campaigns", "Campaign timer ledger", "growth-platform", 6, iso(0, 1), "operational", "Campaign starts, ends, and timer reset counts."),
    source("inventory", "inventory", "Inventory snapshot stream", "inventory-platform", 4, iso(0, 2), "operational", "Available-to-promise and sales velocity snapshots."),
    source("buyer_review_profiles", "reviews", "Reviewer credibility profile", "ugc-risk-platform", 24, iso(0, 2), "operational", "Reviewer account age, return behavior, and review reliability signals."),
    source("buyer_fit_profiles", "privacy", "Buyer fit profile store", "personalization-platform", 12, iso(0, 1), "operational", "Buyer-owned size profiles for self, family, and gift decisions."),
    source("seller_verification", "seller", "Seller verification registry", "seller-platform", 168, iso(2), "operational", "Seller KYC/GST state and marketplace access level."),
    source("buyer_memory", "privacy", "Buyer fit memory store", "personalization-platform", 12, iso(0, 1), "operational", "Buyer-owned fit memory, never exposed to sellers."),
    source("graph_projection", "reasoning", "Commerce graph projection", "sarthi-graph", 12, iso(0, 4), "operational", "Projected reasoning graph from MongoDB evidence documents.")
  ];
}

function source(source_id: string, domain: string, display_name: string, owner_system: string, freshness_sla_hours: number, last_synced_at: string, status: string, notes: string) {
  return { source_id, domain, display_name, owner_system, reliability: "first_party_contract", freshness_sla_hours, last_synced_at, status, notes };
}
