export type CommerceQuestionIntent =
  | "fit_question"
  | "seller_trust"
  | "proof_missing"
  | "review_credibility"
  | "price_offer"
  | "return_risk"
  | "compare_sellers"
  | "checkout_payment"
  | "buying_decision"
  | "unsupported";

export type ProofAttribute =
  | "fabric"
  | "transparency"
  | "color"
  | "measurement"
  | "packaging"
  | "offer"
  | "seller";

export type ClassifiedCommerceQuestion = {
  intent: CommerceQuestionIntent;
  normalized: string;
  requested_size: string | null;
  proof_attribute: ProofAttribute | null;
  unsupported_reason: string | null;
  matched_terms: string[];
};

const SIZE_ALIASES: Array<[string, string[]]> = [
  ["XS", ["xs", "extra small"]],
  ["S", ["s", "small", "chhota", "choti", "chota"]],
  ["M", ["m", "medium"]],
  ["L", ["l", "large", "bada", "badi"]],
  ["XL", ["xl", "extra large"]],
  ["XXL", ["xxl", "2xl", "double xl"]]
];

const UNSUPPORTED_TERMS = [
  "bank account",
  "phone number",
  "mobile number",
  "personal address",
  "home address",
  "religion",
  "caste",
  "income",
  "medical",
  "disease",
  "political",
  "private",
  "owner details"
];

const INTENT_TERMS: Record<Exclude<CommerceQuestionIntent, "unsupported">, string[]> = {
  fit_question: [
    "size", "fit", "tight", "loose", "chest", "bust", "waist", "shoulder",
    "length", "measurement", "l fit", "xl fit", "s fit", "m fit", "xxl fit",
    "size hoga", "tight hoga", "fit hoga", "mujhe fit", "chhota hoga", "bada hoga"
  ],
  seller_trust: [
    "seller", "shop", "trusted", "trust", "reliable", "verified", "verification",
    "safe seller", "real seller", "rating", "dispatch"
  ],
  proof_missing: [
    "proof", "evidence", "photo", "image", "fabric", "cloth", "kapda", "kapde",
    "material", "quality", "transparent", "thin", "patla", "see through", "color",
    "colour", "asli", "genuine", "real", "authentic", "close up", "close-up",
    "daylight", "packaging", "measurement chart"
  ],
  review_credibility: [
    "review", "rating", "fake review", "false review", "trusted rating", "credibility",
    "buyer review", "new account", "return reviewer"
  ],
  price_offer: [
    "price", "offer", "discount", "deal", "timer", "campaign", "cheap", "cost",
    "lowest price", "price drop", "only today"
  ],
  return_risk: [
    "return", "refund", "exchange", "rto", "kept", "problem", "defect", "damage",
    "return risk", "reject"
  ],
  compare_sellers: [
    "compare", "similar", "alternative", "better seller", "which seller",
    "same product", "other seller", "best seller"
  ],
  checkout_payment: [
    "checkout", "payment", "prepaid", "pay online", "cod", "cash on delivery",
    "refund time", "bank offer", "cashback"
  ],
  buying_decision: [
    "buy", "should i buy", "worth", "good", "safe", "recommend", "choose",
    "final decision", "purchase", "order"
  ]
};

export function classifyCommerceQuestion(query: string): ClassifiedCommerceQuestion {
  const normalized = normalizeQuestion(query);
  const unsupported = UNSUPPORTED_TERMS.find((term) => normalized.includes(term));
  if (!normalized) {
    return {
      intent: "unsupported",
      normalized,
      requested_size: null,
      proof_attribute: null,
      unsupported_reason: "Ask about seller trust, fit, returns, reviews, proof, price, offer, or checkout risk.",
      matched_terms: []
    };
  }
  if (unsupported) {
    return {
      intent: "unsupported",
      normalized,
      requested_size: detectRequestedSize(normalized),
      proof_attribute: detectProofAttribute(normalized),
      unsupported_reason: "That asks for private or off-platform information that is not in the product evidence graph.",
      matched_terms: [unsupported]
    };
  }

  const requestedSize = detectRequestedSize(normalized);
  const proofAttribute = detectProofAttribute(normalized);
  if (proofAttribute && asksForProofEvidence(normalized)) {
    return {
      intent: "proof_missing",
      normalized,
      requested_size: requestedSize,
      proof_attribute: proofAttribute,
      unsupported_reason: null,
      matched_terms: ["proof", proofAttribute]
    };
  }

  const scores = Object.entries(INTENT_TERMS).map(([intent, terms]) => {
    const matched = terms.filter((term) => termMatches(normalized, term));
    return {
      intent: intent as Exclude<CommerceQuestionIntent, "unsupported">,
      matched,
      score: matched.length + intentBoost(intent as CommerceQuestionIntent, normalized)
    };
  }).sort((left, right) => right.score - left.score);
  const winner = scores[0];
  const intent = winner && winner.score > 0 ? winner.intent : "buying_decision";
  return {
    intent,
    normalized,
    requested_size: requestedSize,
    proof_attribute: proofAttribute,
    unsupported_reason: null,
    matched_terms: winner?.matched ?? []
  };
}

export function nodeKeysForIntent(intent: CommerceQuestionIntent) {
  if (intent === "fit_question") return ["buyer_fit", "sku", "returns", "proof", "score"];
  if (intent === "seller_trust") return ["seller", "returns", "reviews", "proof", "score"];
  if (intent === "proof_missing") return ["product", "proof", "reviews", "returns", "score"];
  if (intent === "review_credibility") return ["reviews", "returns", "proof", "score"];
  if (intent === "price_offer") return ["offer", "price", "proof", "score"];
  if (intent === "return_risk") return ["sku", "returns", "reviews", "score"];
  if (intent === "compare_sellers") return ["product", "seller", "sku", "returns", "proof", "score"];
  if (intent === "checkout_payment") return ["sku", "returns", "offer", "proof", "score"];
  return ["product", "seller", "sku", "returns", "reviews", "proof", "score"];
}

export function normalizeQuestion(value: string) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[?!.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectRequestedSize(normalized: string) {
  for (const [size, aliases] of SIZE_ALIASES) {
    if (aliases.some((alias) => termMatches(normalized, alias))) return size;
  }
  return null;
}

function detectProofAttribute(normalized: string): ProofAttribute | null {
  if (
    termMatches(normalized, "transparent") ||
    termMatches(normalized, "thin") ||
    termMatches(normalized, "patla") ||
    termMatches(normalized, "see through")
  ) {
    return "transparency";
  }
  if (["fabric", "cloth", "kapda", "kapde", "material", "quality"].some((term) => termMatches(normalized, term))) return "fabric";
  if (["color", "colour", "daylight", "print"].some((term) => termMatches(normalized, term))) return "color";
  if (["measurement", "size chart", "chest", "waist", "length"].some((term) => termMatches(normalized, term))) return "measurement";
  if (["packaging", "package", "dispatch"].some((term) => termMatches(normalized, term))) return "packaging";
  if (["offer", "price", "discount", "timer"].some((term) => termMatches(normalized, term))) return "offer";
  if (["seller", "shop", "verified"].some((term) => termMatches(normalized, term))) return "seller";
  return null;
}

function intentBoost(intent: CommerceQuestionIntent, normalized: string) {
  if (intent === "compare_sellers" && /\b(which|best|better)\b/.test(normalized) && normalized.includes("seller")) return 2;
  if (intent === "fit_question" && /\b(xs|s|m|l|xl|xxl)\b/.test(normalized)) return 1.5;
  if (intent === "checkout_payment" && normalized.includes("cod")) return 2;
  return 0;
}

function asksForProofEvidence(normalized: string) {
  return /\b(proof|evidence|photo|image|picture|chart|close up|closeup|verified|available|uploaded)\b/.test(normalized);
}

function termMatches(normalized: string, term: string) {
  const clean = term.toLowerCase().trim();
  if (!clean) return false;
  if (/^[a-z0-9]+$/.test(clean)) {
    return new RegExp(`(^|[^a-z0-9])${escapeRegExp(clean)}([^a-z0-9]|$)`).test(normalized);
  }
  return normalized.includes(clean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
