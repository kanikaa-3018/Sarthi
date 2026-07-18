export type LanguageCode = "english";

export type ExperienceMode = "standard" | "simple";

export type CopyKey =
  | "shop"
  | "trust"
  | "sellerConsole"
  | "reviewQueue"
  | "language"
  | "simpleMode"
  | "standardMode"
  | "awaitingScanTitle"
  | "awaitingScanBody"
  | "trustReceipt"
  | "agentChecks"
  | "whatThisMeans"
  | "nextStep"
  | "proofAvailable"
  | "recommendationAllowed"
  | "recommendationPaused"
  | "offerTruth"
  | "sellerChecked"
  | "returnsChecked"
  | "sizeChecked"
  | "priceChecked"
  | "privacyChecked"
  | "notEnoughProof"
  | "safeToCompare"
  | "checkOnce"
  | "resolveListings";

export const LANGUAGE_OPTIONS: Array<{ code: LanguageCode; label: string; shortLabel: string }> = [
  { code: "english", label: "English", shortLabel: "En" }
];

const ENGLISH_COPY: Record<CopyKey, string> = {
  shop: "Shop",
  trust: "Trust",
  sellerConsole: "Seller",
  reviewQueue: "Review",
  language: "Language",
  simpleMode: "Simple",
  standardMode: "Details",
  awaitingScanTitle: "Waiting for Sarthi check",
  awaitingScanBody: "Save a product. Sarthi checks seller, size, returns, price, and proof.",
  trustReceipt: "Trust check",
  agentChecks: "Checked by Sarthi",
  whatThisMeans: "Simple meaning",
  nextStep: "Next step",
  proofAvailable: "Proof ready",
  recommendationAllowed: "Good to consider",
  recommendationPaused: "Check once",
  offerTruth: "Offer check",
  sellerChecked: "Seller checked",
  returnsChecked: "Returns checked",
  sizeChecked: "Size checked",
  priceChecked: "Price checked",
  privacyChecked: "Privacy protected",
  notEnoughProof: "Need more proof",
  safeToCompare: "Safe to compare",
  checkOnce: "Check once before buying",
  resolveListings: "Compare listings"
};

export function t(_language: LanguageCode, key: CopyKey): string {
  return ENGLISH_COPY[key];
}

export function languageLabel(language: LanguageCode): string {
  return LANGUAGE_OPTIONS.find((item) => item.code === language)?.label ?? "English";
}

export function simpleTrustMeaning(status: string, canRecommend: boolean, language: LanguageCode): string {
  if (!canRecommend) {
    if (status === "limited_evidence") return t(language, "notEnoughProof");
    if (status === "data_degraded") return "Fresh proof is not ready.";
    if (status === "seller_restricted") return "Seller check failed.";
    return t(language, "recommendationPaused");
  }
  if (status === "specific_caution") return t(language, "checkOnce");
  if (status === "conflicting_evidence") return "Proof does not fully match. Compare carefully.";
  return t(language, "safeToCompare");
}
