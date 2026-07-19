import type { LanguageCode } from "../../i18n";

const ENGLISH = {
  workspace: "Seller workspace",
  today: "Today",
  products: "Products",
  newListing: "New listing",
  proofs: "Proofs",
  market: "Market Compare",
  nextAction: "Next action",
  priorityQueue: "Up next",
  sellerFacts: "Seller facts",
  createListing: "Create a listing",
  proofRequests: "Proof requests",
  needsAction: "Needs your action",
  withReviewer: "With reviewer",
  buyerVisible: "Buyer-visible",
  uploadProof: "Upload proof",
  replaceProof: "Replace proof",
  caughtUp: "You are caught up",
  caughtUpDetail: "No seller action is blocking buyer trust right now.",
  retry: "Try again",
  loading: "Loading seller workspace",
  privacy: "Only aggregate product and marketplace evidence is shown. Buyer personal data stays private.",
  searchProducts: "Search products",
  allProducts: "All products",
  needsAttention: "Needs action",
  inReview: "In review",
  healthy: "Healthy",
  product: "Product",
  status: "Status",
  buyerConcern: "Buyer concern",
  evidence: "Evidence",
  position: "Market position",
  action: "Action",
  noConcern: "No active buyer concern",
  noProducts: "No products match these filters.",
  verification: "Verification",
  buyerRating: "Buyer rating",
  liveProducts: "Live products",
  openProofs: "Open proof requests",
  reviewItems: "Items with reviewer"
} as const;

type SellerCopy = { [Key in keyof typeof ENGLISH]: string };

const HINDI: SellerCopy = {
  workspace: "सेलर वर्कस्पेस",
  today: "आज",
  products: "प्रोडक्ट",
  newListing: "नई लिस्टिंग",
  proofs: "प्रूफ",
  market: "मार्केट तुलना",
  nextAction: "अगला काम",
  priorityQueue: "इसके बाद",
  sellerFacts: "सेलर जानकारी",
  createListing: "लिस्टिंग बनाएं",
  proofRequests: "प्रूफ अनुरोध",
  needsAction: "आपका काम बाकी है",
  withReviewer: "रिव्यूअर के पास",
  buyerVisible: "बायर को दिखाई दे रहा है",
  uploadProof: "प्रूफ अपलोड करें",
  replaceProof: "प्रूफ बदलें",
  caughtUp: "सभी जरूरी काम पूरे हैं",
  caughtUpDetail: "अभी कोई सेलर काम बायर ट्रस्ट को रोक नहीं रहा है।",
  retry: "फिर कोशिश करें",
  loading: "सेलर वर्कस्पेस लोड हो रहा है",
  privacy: "सिर्फ कुल प्रोडक्ट और मार्केट जानकारी दिखाई जाती है। बायर की निजी जानकारी सुरक्षित रहती है।",
  searchProducts: "प्रोडक्ट खोजें",
  allProducts: "सभी प्रोडक्ट",
  needsAttention: "काम जरूरी है",
  inReview: "रिव्यू में",
  healthy: "ठीक है",
  product: "प्रोडक्ट",
  status: "स्थिति",
  buyerConcern: "बायर की चिंता",
  evidence: "प्रूफ स्थिति",
  position: "मार्केट स्थिति",
  action: "काम",
  noConcern: "कोई सक्रिय बायर चिंता नहीं",
  noProducts: "इन फिल्टर में कोई प्रोडक्ट नहीं मिला।",
  verification: "वेरिफिकेशन",
  buyerRating: "बायर रेटिंग",
  liveProducts: "लाइव प्रोडक्ट",
  openProofs: "खुले प्रूफ अनुरोध",
  reviewItems: "रिव्यूअर के पास"
};

const HINGLISH: SellerCopy = {
  ...ENGLISH,
  workspace: "Seller kaam",
  today: "Aaj",
  nextAction: "Abhi yeh karein",
  priorityQueue: "Iske baad",
  sellerFacts: "Seller details",
  createListing: "Listing banayein",
  proofRequests: "Proof requests",
  needsAction: "Aapka action chahiye",
  withReviewer: "Reviewer ke paas",
  buyerVisible: "Buyer ko dikh raha hai",
  uploadProof: "Proof upload karein",
  replaceProof: "Proof dobara dein",
  caughtUp: "Saare zaroori kaam poore hain",
  caughtUpDetail: "Abhi koi seller action buyer trust ko block nahi kar raha.",
  privacy: "Sirf aggregate product aur marketplace evidence dikhaya jaata hai. Buyer personal data private rehta hai.",
  searchProducts: "Products search karein",
  needsAttention: "Action chahiye",
  noConcern: "Koi active buyer concern nahi",
  noProducts: "In filters mein koi product nahi mila."
};

const COPY_BY_LANGUAGE: Record<LanguageCode, SellerCopy> = {
  english: ENGLISH,
  hindi: HINDI,
  hinglish: HINGLISH
};

export function sellerCopy(language: LanguageCode): SellerCopy {
  return COPY_BY_LANGUAGE[language] ?? ENGLISH;
}

export type { SellerCopy };
