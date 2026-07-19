import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  LineChart,
  ListChecks,
  RefreshCcw,
  Info,
  X,
  Plus,
  ShieldCheck,
  UploadCloud,
  Star
} from "lucide-react";
import { getSellerPanel, correctMeasurement, getSellerEvidenceCoach, submitSellerEvidenceAsset, getSellerOnboarding, submitSellerDocument, createListingDraft, submitListingDraft } from "../api/client";
import type { LanguageCode } from "../i18n";
import type { SellerActionBoard, SellerPanelResponse, SellerPanelListing, SellerEvidenceCoachResponse, SellerEvidenceCoachTask, SellerOnboardingResponse } from "../types/api";

type SellerWorkbenchTab = "overview" | "products" | "proofs_submitted" | "add_product" | "performance";
type SellerTopFeature = "console" | "proofs" | "trust_coach";
type SellerProofAsset = SellerEvidenceCoachResponse["proof_assets"][number];
type SellerProofNav = SellerEvidenceCoachResponse["proof_nav"];
type SellerUploadWarning = {
  key: string;
  title: string;
  detail: string;
  tone: "good" | "watch" | "risk";
};
const SELLER_WORKBENCH_NAV_LABEL = "Seller workbench";

const ENGLISH_SELLER_COPY = {
  loadingSellerCenter: "Loading seller center...",
  sellerConsole: "Seller Console",
  sellerCenter: "Seller center",
  noRatingsYet: "No ratings yet",
  ratings: "ratings",
  toolbarBody: "Fix proof gaps. Add products. Buyer personal data is never shown.",
  addProduct: "Add product",
  productCluster: "Product cluster",
  refreshSellerConsole: "Refresh seller console",
  proofSubmitted: "Proof submitted to admin. You can track approval status in Proof center.",
  workbenchToday: "Today",
  workbenchTodayDetail: "Priority queue",
  workbenchProducts: "Product fixes",
  workbenchProductsDetail: "Listing issues",
  workbenchEvidence: "Evidence queue",
  workbenchEvidenceDetail: "open asks",
  workbenchNewListing: "New listing",
  workbenchNewListingDetail: "Draft & submit",
  workbenchMarket: "Market compare",
  workbenchMarketDetail: "Rank inputs",
  currentRating: "Current rating",
  buyerRatings: "buyer ratings",
  buildFirstRatings: "Build first ratings with proof",
  liveProducts: "Live products",
  productsTracked: "products tracked",
  addAndSubmitProducts: "Add and submit products",
  buyerProofAsks: "Buyer proof asks",
  fixBeforeTrust: "Fix these before trust improves",
  noOpenBuyerDoubts: "No open buyer doubts",
  verification: "Verification",
  buyerFeedReady: "Can appear in buyer feed",
  uploadDocsReview: "Upload docs for admin review",
  doFirst: "Do first",
  keepProductProofReady: "Keep product proof ready",
  noUrgentBuyerRequest: "No urgent buyer request is open. Add clear fabric, daylight, and measurement proof before doubts rise.",
  addProof: "Add proof",
  viewProofGuide: "View proof guide",
  productHealth: "Product health",
  whatEachListingNeeds: "What each listing needs",
  productHealthBody: "Simple action table from buyer returns, proof gaps, and rating signals.",
  noLiveProductData: "No live product data yet",
  finishVerificationOrDraft: "Finish verification or add a product draft. Product health appears after the listing has evidence.",
  addProductEyebrow: "Add product",
  createTrustedListing: "Create a listing buyers can trust",
  readinessBody: "Live readiness updates before you send the product to admin review.",
  readyToSubmit: "Ready to submit",
  listingUploadChecks: "Listing upload checks",
  productTitle: "Product title",
  category: "Category",
  garmentType: "Garment type",
  fabric: "Fabric",
  colourFamily: "Colour family",
  basePrice: "Base price (Rs)",
  imageUrl: "Image URL",
  productImageSelected: "Product image selected",
  uploadProductImage: "Upload product image",
  improveTitle: "Improve title",
  saving: "Saving...",
  saveDraft: "Save draft",
  listingDraftCreated: "Listing draft created successfully.",
  listingDraftSubmitted: "Listing draft submitted to admin review queue.",
  verificationDocs: "Verification docs",
  uploaded: "uploaded",
  docsApproved: "Documents approved. New products can enter review.",
  uploadSellerProof: "Upload seller proof so admin can verify you.",
  quickDocumentUpload: "Quick document upload",
  referenceNumber: "Reference number",
  attachDocumentFile: "Attach document file",
  submitting: "Submitting...",
  submitDoc: "Submit doc",
  attachDocumentBeforeSubmit: "Attach a document file before submitting.",
  documentSubmitted: "Document submitted successfully.",
  drafts: "Drafts",
  noDrafts: "No drafts yet. Save a product draft to begin admin review.",
  sellerSetupNotLoaded: "Seller setup is not loaded",
  refreshSetupDetail: "Refresh the page to load verification and draft tools.",
  refresh: "Refresh",
  proofCenter: "Proof center",
  proofCenterTitle: "Show buyers proof they can trust",
  proofCenterBody: "Track the full path: buyer asks for proof, you upload it, admin checks it, and approved proof becomes visible to buyers.",
  uploadNextProof: "Upload next proof",
  approved: "Approved",
  adminChecking: "Admin checking",
  needsRedo: "Needs redo",
  trustPoints: "Trust points",
  buyerCanSeeProof: "proof signals buyers can see",
  doNotUploadDuplicate: "Do not upload the same proof twice while it is being checked",
  uploadClearerProof: "Upload a clearer proof for rejected items",
  approvedProofReducesDoubt: "Approved proof can reduce buyer doubt",
  proofLifecycleEyebrow: "How proof builds trust",
  proofLifecycleTitle: "From buyer doubt to buyer-visible proof",
  buyerAsked: "Buyer asked",
  buyerAskedDetail: "Buyers want proof before trusting these products.",
  noBuyerAsk: "No new buyer proof ask.",
  youUploaded: "You uploaded",
  proofSaved: "Proof is saved against products.",
  uploadRealProof: "Upload real product proof here.",
  adminChecks: "Admin checks",
  adminCheckingDetail: "Admin is checking if proof matches the product.",
  nothingWithAdmin: "Nothing waiting with admin.",
  buyerSees: "Buyer sees",
  proofBuildsConfidence: "This proof can build buyer confidence.",
  approvedProofAppears: "Approved proof will appear here.",
  buyerVisible: "Approved proof is now buyer-facing.",
  nothingBuyerVisible: "Nothing buyer-visible yet.",
  needRedo: "need redo",
  trustCoach: "Trust coach",
  trustCoachTitle: "Know what to fix first to win buyer trust",
  trustCoachBody: "Sarthi looks at buyer doubts, returns, proof status, and product issues, then tells you the one action that matters most.",
  thingsToFix: "Things to fix",
  groupedWork: "Proof asks, product issues, and listing checks grouped for you.",
  ratingChance: "Rating chance",
  accountReady: "Account ready?",
  review: "Review",
  clear: "Clear",
  finishVerificationBeforeProof: "Finish seller verification before proof helps buyers.",
  buyerDoubts: "Buyer doubts",
  noBuyerProofAsk: "No buyer proof ask pending",
  proofCenterClear: "Proof center is clear. New buyer doubts will appear when they need action.",
  uploadProof: "Upload proof",
  newProductCheck: "New product check",
  readyToSend: "ready to send",
  checkListing: "Check listing",
  productLosingTrust: "Product losing trust",
  noUrgentProductFix: "No urgent product fix",
  productFixesAppear: "Product fixes will appear here when buyer trust or returns need action.",
  fixSize: "Fix size",
  viewReason: "View reason",
  fixFirst: "Fix first",
  productsLikelyAffectTrust: "Products most likely to affect buyer trust",
  proof: "Proof",
  plan: "Plan",
  prepareProof: "Prepare proof",
  noProofTask: "No proof task",
  viewProductIssues: "View product issues",
  proofAdminReview: "Proof for admin review",
  reviewAndSubmit: "Review and submit",
  suggestedDraft: "Suggested draft",
  draftApplied: "Draft applied",
  applyDraft: "Apply draft",
  requiredAsset: "Required asset",
  adminNote: "Admin note",
  suggestedDraftApplied: "Suggested draft is now filled into the form.",
  wrongProofGuard: "Wrong proof guard",
  proofTitle: "Proof title",
  proofFileSelected: "Proof file selected",
  uploadProofFile: "Upload proof file",
  proofFileOrLink: "Proof file or real image link",
  proofFilePlaceholder: "Upload a file above or paste https://.../photo.jpg",
  whatProofShows: "What this proof shows",
  submitProofReference: "Submit proof reference",
  submittingProof: "Submitting proof",
  proofQualityCheck: "Proof quality check",
  proofCurrentListingOnly: "This proof applies to the current listing only.",
  afterApprovalCanSupport: "After approval, this can support",
  similarListingWithSameProof: "similar listing with the same proof need.",
  similarListingsWithSameProof: "similar listings with the same proof need.",
  ok: "OK",
  thisWeek: "This week",
  readinessBlockedByVerification: "Seller verification must finish before this can become buyer-visible.",
  readinessGood: "Good enough to save and submit. Add proof after admin review.",
  readinessIncomplete: "Add clear title, fabric, color, price, and image before submitting.",
  verificationBlocksTitle: "Verification blocks buyer visibility",
  verificationBlocksDetail: "Admin must approve seller verification before this product can become trusted buyer-facing stock.",
  productImageMissingTitle: "Product image missing",
  productImageMissingDetail: "Add a real product photo before review; generic or missing images usually need revision.",
  imageReferenceWrongTitle: "Image reference looks wrong",
  imageReferenceWrongDetail: "Use an uploaded image or a real https image URL that admin can open.",
  titleThinTitle: "Title is too thin",
  titleThinDetail: "Use product type, color, and fabric so admin can match the listing claim.",
  titleTypeMismatchTitle: "Title and garment type may not match",
  titleTypeMismatchDetail: "The title should clearly mention the garment type.",
  priceInvalidTitle: "Price looks invalid",
  priceInvalidDetail: "Use a realistic base price before submitting to admin.",
  factsIncompleteTitle: "Product facts are incomplete",
  factsIncompleteDetail: "Fabric, color, and category are used in duplicate matching and buyer trust checks.",
  uploadReadyTitle: "Upload looks ready",
  uploadReadyDetail: "Admin can review this listing without obvious missing facts.",
  proofFileMissingTitle: "Proof file missing",
  proofReferenceWrongTitle: "Proof reference looks wrong",
  proofReferenceWrongDetail: "Use the file upload button or paste a real https URL that admin can inspect.",
  actionPlan: "Action plan",
  actionPlanTitle: "Fix the products buyers are unsure about",
  autoPrioritized: "Auto-prioritized",
  aiCoachLive: "AI coach live",
  evidenceRulesActive: "Evidence rules active",
  aiFallbackActive: "Rules backup active",
  buyerWorry: "Buyer worry",
  doNow: "Do now",
  trustScoreShort: "trust",
  improveTrustSignals: "Improve trust signals",
  current: "Current",
  reviewLoop: "Review loop",
  reviewLoopTitle: "Admin approval status",
  reviewLoopBody: "See what is waiting with admin, what needs your fix, and what buyers can already see.",
  adminQueue: "With admin",
  needsSellerFix: "Needs seller fix",
  buyerVisibleProof: "Buyer-visible proof",
  waitingForAdminDetail: "Documents, listings, and proof currently waiting for review.",
  nothingWaitingAdminDetail: "No review item is waiting with admin right now.",
  fixRejectedOrOpenDetail: "Rejected proof, revision drafts, or buyer asks need your action.",
  noSellerFixDetail: "No rejected item or open proof ask is blocking you.",
  approvedBuyerVisibleDetail: "Approved proof signals are already available for buyer trust checks.",
  prepareReviewItem: "Prepare review item",
  proofTypeMismatchTitle: "Proof type mismatch",
  explainProofTitle: "Explain what the proof shows",
  explainProofDetail: "Mention the product and the exact buyer doubt so admin can approve faster.",
  proofTitleTooShortTitle: "Proof title is too short",
  proofTitleTooShortDetail: "Use a specific title like fabric close-up, daylight color, or size chart.",
  proofReadyTitle: "Proof looks review-ready",
  proofReadyDetail: "Admin still decides whether this becomes buyer-visible trust evidence.",
  returnSpike: "Return spike",
  ratingProtection: "Rating protection",
  proofReuse: "Proof reuse",
  prepaidTrust: "Prepaid trust",
  approvedLoop: "Approved loop",
  viewProducts: "View products",
  useProof: "Use proof",
  proofFileAdded: "Proof file added",
  clearTitle: "Clear title",
  explainsBuyerAsked: "Explains what buyer asked",
  matchesProduct: "Matches product",
  addProofFile: "Add proof file",
  readyForReview: "Ready for review",
  almostReady: "Almost ready",
  improveBeforeSubmit: "Improve before submit"
};

type SellerCopy = typeof ENGLISH_SELLER_COPY;

const SELLER_COPY_BY_LANGUAGE: Record<LanguageCode, SellerCopy> = {
  english: ENGLISH_SELLER_COPY,
  hindi: {
    ...ENGLISH_SELLER_COPY,
    loadingSellerCenter: "सेलर सेंटर लोड हो रहा है...",
    sellerConsole: "सेलर कंसोल",
    sellerCenter: "सेलर सेंटर",
    noRatingsYet: "अभी रेटिंग नहीं",
    ratings: "रेटिंग",
    toolbarBody: "प्रूफ की कमी ठीक करें। प्रोडक्ट जोड़ें। खरीदार की निजी जानकारी कभी नहीं दिखती।",
    addProduct: "प्रोडक्ट जोड़ें",
    productCluster: "प्रोडक्ट क्लस्टर",
    refreshSellerConsole: "सेलर कंसोल रीफ्रेश करें",
    proofSubmitted: "प्रूफ admin को भेज दिया गया। स्टेटस Proof center में देखें।",
    workbenchToday: "आज",
    workbenchProducts: "प्रोडक्ट सुधार",
    workbenchEvidence: "प्रूफ कतार",
    workbenchNewListing: "नई लिस्टिंग",
    workbenchMarket: "मार्केट तुलना",
    currentRating: "मौजूदा रेटिंग",
    buyerRatings: "खरीदार रेटिंग",
    liveProducts: "लाइव प्रोडक्ट",
    buyerProofAsks: "खरीदार प्रूफ मांग",
    verification: "वेरिफिकेशन",
    addProof: "प्रूफ जोड़ें",
    productHealth: "प्रोडक्ट हेल्थ",
    addProductEyebrow: "प्रोडक्ट जोड़ें",
    createTrustedListing: "भरोसे वाली लिस्टिंग बनाएं",
    readyToSubmit: "सबमिट के लिए तैयार",
    listingUploadChecks: "लिस्टिंग जांच",
    productTitle: "प्रोडक्ट टाइटल",
    category: "कैटेगरी",
    garmentType: "गारमेंट टाइप",
    fabric: "कपड़ा",
    colourFamily: "रंग परिवार",
    imageUrl: "इमेज URL",
    productImageSelected: "प्रोडक्ट इमेज चुनी गई",
    uploadProductImage: "प्रोडक्ट इमेज अपलोड करें",
    improveTitle: "Title सुधारें",
    saveDraft: "ड्राफ्ट सेव करें",
    listingDraftCreated: "Listing draft successfully create हो गया।",
    listingDraftSubmitted: "Listing draft admin review queue में भेज दिया गया।",
    verificationDocs: "वेरिफिकेशन दस्तावेज",
    uploaded: "अपलोड",
    quickDocumentUpload: "जल्दी दस्तावेज अपलोड",
    referenceNumber: "रेफरेंस नंबर",
    submitDoc: "दस्तावेज भेजें",
    attachDocumentBeforeSubmit: "Submit करने से पहले document file attach करें।",
    documentSubmitted: "Document successfully submit हो गया।",
    drafts: "ड्राफ्ट",
    proofCenter: "प्रूफ सेंटर",
    proofCenterTitle: "खरीदार को भरोसे वाला प्रूफ दिखाएं",
    uploadNextProof: "अगला प्रूफ अपलोड करें",
    approved: "मंजूर",
    adminChecking: "Admin जांच",
    needsRedo: "फिर से करें",
    trustPoints: "ट्रस्ट पॉइंट",
    proofLifecycleEyebrow: "प्रूफ से भरोसा कैसे बनता है",
    buyerAsked: "खरीदार ने पूछा",
    youUploaded: "आपने अपलोड किया",
    adminChecks: "Admin जांचता है",
    buyerSees: "खरीदार देखता है",
    trustCoach: "ट्रस्ट कोच",
    trustCoachTitle: "पहले क्या ठीक करना है, साफ जानें",
    thingsToFix: "ठीक करने वाली चीजें",
    ratingChance: "रेटिंग मौका",
    accountReady: "अकाउंट तैयार?",
    review: "रिव्यू",
    clear: "क्लियर",
    buyerDoubts: "खरीदार शक",
    uploadProof: "प्रूफ अपलोड करें",
    newProductCheck: "नया प्रोडक्ट चेक",
    checkListing: "लिस्टिंग चेक करें",
    productLosingTrust: "भरोसा घटाने वाला प्रोडक्ट",
    fixSize: "साइज ठीक करें",
    viewReason: "कारण देखें",
    fixFirst: "पहले ठीक करें",
    proof: "प्रूफ",
    plan: "प्लान",
    prepareProof: "प्रूफ तैयार करें",
    viewProductIssues: "प्रोडक्ट समस्या देखें",
    proofAdminReview: "Admin review के लिए प्रूफ",
    reviewAndSubmit: "जांचें और भेजें",
    suggestedDraft: "सुझाया ड्राफ्ट",
    draftApplied: "ड्राफ्ट लग गया",
    applyDraft: "ड्राफ्ट लगाएं",
    requiredAsset: "जरूरी फाइल",
    adminNote: "Admin नोट",
    wrongProofGuard: "गलत प्रूफ गार्ड",
    proofTitle: "प्रूफ टाइटल",
    proofFileSelected: "प्रूफ फाइल चुनी गई",
    uploadProofFile: "प्रूफ फाइल अपलोड करें",
    proofFileOrLink: "प्रूफ फाइल या असली इमेज लिंक",
    whatProofShows: "यह प्रूफ क्या दिखाता है",
    submitProofReference: "प्रूफ भेजें",
    submittingProof: "प्रूफ भेज रहे हैं",
    proofQualityCheck: "प्रूफ क्वालिटी चेक",
    thisWeek: "इस हफ्ते",
    readinessBlockedByVerification: "Buyer-visible होने से पहले seller verification पूरा होना चाहिए।",
    readinessGood: "सेव और submit करने लायक है। Admin review के बाद proof जोड़ें।",
    readinessIncomplete: "Submit से पहले साफ title, fabric, color, price और image जोड़ें।",
    verificationBlocksTitle: "Verification buyer visibility रोक रहा है",
    productImageMissingTitle: "प्रोडक्ट image missing है",
    imageReferenceWrongTitle: "Image reference गलत लग रहा है",
    titleThinTitle: "Title बहुत छोटा है",
    priceInvalidTitle: "Price गलत लग रही है",
    factsIncompleteTitle: "Product facts अधूरे हैं",
    uploadReadyTitle: "Upload ready लग रहा है",
    proofFileMissingTitle: "Proof file missing है",
    proofReferenceWrongTitle: "Proof reference गलत लग रहा है",
    actionPlan: "कार्रवाई प्लान",
    actionPlanTitle: "जिन products पर buyer को शक है, उन्हें पहले ठीक करें",
    autoPrioritized: "अपने आप priority",
    aiCoachLive: "AI coach live",
    evidenceRulesActive: "Evidence rules active",
    aiFallbackActive: "Rules backup active",
    buyerWorry: "Buyer की चिंता",
    doNow: "अभी करें",
    trustScoreShort: "trust",
    improveTrustSignals: "Trust signals सुधारें",
    current: "मौजूदा",
    reviewLoop: "Review loop",
    reviewLoopTitle: "Admin approval status",
    reviewLoopBody: "क्या admin के पास है, क्या आपको ठीक करना है, और buyer क्या देख सकता है.",
    adminQueue: "Admin के पास",
    needsSellerFix: "Seller fix चाहिए",
    buyerVisibleProof: "Buyer-visible proof",
    waitingForAdminDetail: "Documents, listings और proof अभी review में हैं.",
    nothingWaitingAdminDetail: "अभी admin के पास कोई review item नहीं है.",
    fixRejectedOrOpenDetail: "Rejected proof, revision drafts या buyer asks पर action चाहिए.",
    noSellerFixDetail: "कोई rejected item या open proof ask block नहीं कर रहा.",
    approvedBuyerVisibleDetail: "Approved proof signals buyer trust checks में दिख सकते हैं.",
    prepareReviewItem: "Review item तैयार करें",
    proofTypeMismatchTitle: "Proof type mismatch",
    explainProofTitle: "Proof क्या दिखाता है बताएं",
    proofTitleTooShortTitle: "Proof title बहुत छोटा है",
    proofReadyTitle: "Proof review-ready लग रहा है",
    returnSpike: "Return spike",
    ratingProtection: "Rating protection",
    proofReuse: "Proof reuse",
    prepaidTrust: "Prepaid trust",
    approvedLoop: "Approved loop",
    viewProducts: "Products देखें",
    useProof: "Proof use करें",
    proofFileAdded: "Proof file जुड़ी",
    clearTitle: "साफ title",
    explainsBuyerAsked: "Buyer ने क्या पूछा, समझाया",
    matchesProduct: "Product match करता है",
    addProofFile: "Proof file जोड़ें",
    readyForReview: "Review के लिए ready",
    almostReady: "लगभग ready",
    improveBeforeSubmit: "Submit से पहले सुधारें"
  },
  hinglish: {
    ...ENGLISH_SELLER_COPY,
    loadingSellerCenter: "Seller center load ho raha hai...",
    sellerConsole: "Seller console",
    sellerCenter: "Seller center",
    noRatingsYet: "Abhi ratings nahi",
    ratings: "ratings",
    toolbarBody: "Proof gaps fix karo. Products add karo. Buyer personal data kabhi nahi dikhta.",
    addProduct: "Product add karo",
    productCluster: "Product cluster",
    refreshSellerConsole: "Seller console refresh karo",
    proofSubmitted: "Proof admin ko submit ho gaya. Approval status Proof center me track karo.",
    workbenchToday: "Aaj",
    workbenchProducts: "Product fixes",
    workbenchEvidence: "Evidence queue",
    workbenchNewListing: "New listing",
    workbenchMarket: "Market compare",
    currentRating: "Current rating",
    buyerRatings: "buyer ratings",
    buyerProofAsks: "Buyer proof asks",
    fixBeforeTrust: "Trust improve hone se pehle inhe fix karo",
    noOpenBuyerDoubts: "Koi open buyer doubt nahi",
    addProof: "Proof add karo",
    productHealth: "Product health",
    createTrustedListing: "Buyer-trust wali listing banao",
    readyToSubmit: "Submit ke liye ready",
    listingUploadChecks: "Listing upload checks",
    productTitle: "Product title",
    productImageSelected: "Product image selected",
    uploadProductImage: "Product image upload karo",
    improveTitle: "Title improve karo",
    saveDraft: "Draft save karo",
    listingDraftCreated: "Listing draft successfully create ho gaya.",
    listingDraftSubmitted: "Listing draft admin review queue me submit ho gaya.",
    verificationDocs: "Verification docs",
    quickDocumentUpload: "Quick document upload",
    submitDoc: "Doc submit karo",
    attachDocumentBeforeSubmit: "Submit se pehle document file attach karo.",
    documentSubmitted: "Document successfully submit ho gaya.",
    proofCenter: "Proof center",
    proofCenterTitle: "Buyers ko trust wala proof dikhao",
    proofCenterBody: "Buyer proof maangta hai, aap upload karte ho, admin check karta hai, approved proof buyer ko dikhta hai.",
    uploadNextProof: "Next proof upload karo",
    adminChecking: "Admin checking",
    trustPoints: "Trust points",
    proofLifecycleEyebrow: "Proof se trust kaise banta hai",
    buyerAsked: "Buyer ne poocha",
    youUploaded: "Aapne upload kiya",
    adminChecks: "Admin check karta hai",
    buyerSees: "Buyer dekhta hai",
    trustCoach: "Trust coach",
    trustCoachTitle: "Pehle kya fix karna hai, clearly dekho",
    trustCoachBody: "Sarthi buyer doubts, returns, proof status aur product issues dekhkar ek best action batata hai.",
    thingsToFix: "Fix karne wale kaam",
    groupedWork: "Proof asks, product issues aur listing checks ek jagah grouped hain.",
    ratingChance: "Rating chance",
    accountReady: "Account ready?",
    buyerDoubts: "Buyer doubts",
    uploadProof: "Proof upload karo",
    newProductCheck: "New product check",
    checkListing: "Listing check karo",
    productLosingTrust: "Trust lose kar raha product",
    fixSize: "Size fix karo",
    viewReason: "Reason dekho",
    fixFirst: "Pehle fix karo",
    productsLikelyAffectTrust: "Products jo buyer trust ko sabse zyada affect kar sakte hain",
    prepareProof: "Proof prepare karo",
    viewProductIssues: "Product issues dekho",
    proofAdminReview: "Admin review ke liye proof",
    reviewAndSubmit: "Review aur submit",
    suggestedDraft: "Suggested draft",
    draftApplied: "Draft applied",
    applyDraft: "Draft apply karo",
    requiredAsset: "Required asset",
    adminNote: "Admin note",
    wrongProofGuard: "Wrong proof guard",
    proofTitle: "Proof title",
    proofFileSelected: "Proof file selected",
    uploadProofFile: "Proof file upload karo",
    proofFileOrLink: "Proof file ya real image link",
    whatProofShows: "Yeh proof kya dikhata hai",
    submitProofReference: "Proof reference submit karo",
    submittingProof: "Proof submit ho raha hai",
    proofQualityCheck: "Proof quality check",
    thisWeek: "Is week",
    readinessBlockedByVerification: "Buyer-visible hone se pehle seller verification complete hona chahiye.",
    readinessGood: "Save aur submit ke liye ready hai. Admin review ke baad proof add karo.",
    readinessIncomplete: "Submit se pehle clear title, fabric, color, price aur image add karo.",
    verificationBlocksTitle: "Verification buyer visibility block kar raha hai",
    productImageMissingTitle: "Product image missing hai",
    imageReferenceWrongTitle: "Image reference wrong lag raha hai",
    titleThinTitle: "Title thin hai",
    priceInvalidTitle: "Price invalid lag rahi hai",
    factsIncompleteTitle: "Product facts incomplete hain",
    uploadReadyTitle: "Upload ready lag raha hai",
    proofFileMissingTitle: "Proof file missing hai",
    proofReferenceWrongTitle: "Proof reference wrong lag raha hai",
    actionPlan: "Action plan",
    actionPlanTitle: "Jin products par buyer unsure hai, unhe pehle fix karo",
    autoPrioritized: "Auto-prioritized",
    aiCoachLive: "AI coach live",
    evidenceRulesActive: "Evidence rules active",
    aiFallbackActive: "Rules backup active",
    buyerWorry: "Buyer worry",
    doNow: "Abhi karo",
    trustScoreShort: "trust",
    improveTrustSignals: "Trust signals improve karo",
    current: "Current",
    reviewLoop: "Review loop",
    reviewLoopTitle: "Admin approval status",
    reviewLoopBody: "Kya admin ke paas hai, kya seller fix chahiye, aur buyer kya dekh sakta hai.",
    adminQueue: "Admin ke paas",
    needsSellerFix: "Seller fix chahiye",
    buyerVisibleProof: "Buyer-visible proof",
    waitingForAdminDetail: "Documents, listings aur proof abhi review me hain.",
    nothingWaitingAdminDetail: "Abhi admin ke paas koi review item nahi hai.",
    fixRejectedOrOpenDetail: "Rejected proof, revision drafts ya buyer asks par action chahiye.",
    noSellerFixDetail: "Koi rejected item ya open proof ask block nahi kar raha.",
    approvedBuyerVisibleDetail: "Approved proof signals buyer trust checks me dikh sakte hain.",
    prepareReviewItem: "Review item prepare karo",
    proofTypeMismatchTitle: "Proof type mismatch",
    explainProofTitle: "Proof kya dikhata hai explain karo",
    proofTitleTooShortTitle: "Proof title short hai",
    proofReadyTitle: "Proof review-ready lag raha hai",
    returnSpike: "Return spike",
    ratingProtection: "Rating protection",
    proofReuse: "Proof reuse",
    prepaidTrust: "Prepaid trust",
    approvedLoop: "Approved loop",
    viewProducts: "Products dekho",
    useProof: "Proof use karo",
    proofFileAdded: "Proof file added",
    clearTitle: "Clear title",
    explainsBuyerAsked: "Buyer ne kya poocha, explain hai",
    matchesProduct: "Product match karta hai",
    addProofFile: "Proof file add karo",
    readyForReview: "Review ke liye ready",
    almostReady: "Almost ready",
    improveBeforeSubmit: "Submit se pehle improve karo"
  }
};

function sellerCopy(language: LanguageCode): SellerCopy {
  return SELLER_COPY_BY_LANGUAGE[language] ?? ENGLISH_SELLER_COPY;
}

export function SellerPanel({ language = "english" }: { language?: LanguageCode }) {
  const copy = useMemo(() => sellerCopy(language), [language]);
  const location = useLocation();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<SellerPanelResponse | null>(null);
  const [evidenceCoach, setEvidenceCoach] = useState<SellerEvidenceCoachResponse | null>(null);
  const [onboarding, setOnboarding] = useState<SellerOnboardingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string>("");

  const [workbenchTab, setWorkbenchTab] = useState<SellerWorkbenchTab>("overview");
  const topFeature = parseSellerTopFeature(location.pathname);

  // Modals/Sheets
  const [activeWhyListing, setActiveWhyListing] = useState<SellerPanelListing | null>(null);
  const [activeFixListing, setActiveFixListing] = useState<SellerPanelListing | null>(null);

  // Fix Form inputs
  const [lChest, setLChest] = useState("38");
  const [xlChest, setXlChest] = useState("40");
  const [fixSuccess, setFixSuccess] = useState(false);
  const [fixLoading, setFixLoading] = useState(false);
  const [proofSubmittingId, setProofSubmittingId] = useState<string | null>(null);
  const [activeProofTask, setActiveProofTask] = useState<SellerEvidenceCoachTask | null>(null);
  const [proofTitle, setProofTitle] = useState("");
  const [proofDescription, setProofDescription] = useState("");
  const [proofAssetUrl, setProofAssetUrl] = useState("");
  const [proofSuccess, setProofSuccess] = useState<string | null>(null);

  // Onboarding submissions
  const [docType, setDocType] = useState<"gst_certificate" | "pan_card" | "address_proof" | "bank_proof">("gst_certificate");
  const [docRef, setDocRef] = useState("");
  const [docFileName, setDocFileName] = useState("");
  const [docFileBase64, setDocFileBase64] = useState("");
  const [docMimeType, setDocMimeType] = useState("application/pdf");
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [docSuccess, setDocSuccess] = useState<string | null>(null);

  // Listing Draft inputs
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState("women_kurtis");
  const [draftGarmentType, setDraftGarmentType] = useState("");
  const [draftFabric, setDraftFabric] = useState("");
  const [draftColor, setDraftColor] = useState("");
  const [draftPrice, setDraftPrice] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftCreating, setDraftCreating] = useState(false);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);
  const [draftSubmittingId, setDraftSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    void loadPanel();
  }, []);

  useEffect(() => {
    if (topFeature !== "console") return;
    const tab = new URLSearchParams(location.search).get("tab");
    const nextTab = parseSellerWorkbenchTab(tab);
    if (nextTab && nextTab !== workbenchTab) {
      setWorkbenchTab(nextTab);
    }
  }, [location.search, topFeature, workbenchTab]);

  function selectWorkbenchTab(tab: SellerWorkbenchTab) {
    setWorkbenchTab(tab);
    navigate(`/seller?tab=${tab}`);
  }

  async function loadPanel(clusterId?: string) {
    setLoading(true);
    setError(null);
    setDocSuccess(null);
    setDraftSuccess(null);
    try {
      const onboardingPayload = await getSellerOnboarding();
      setOnboarding(onboardingPayload);

      try {
        const [payload, coach] = await Promise.all([
          getSellerPanel(clusterId),
          getSellerEvidenceCoach()
        ]);
        setPanel(payload);
        setEvidenceCoach(coach);
        setSelectedClusterId(payload.cluster.cluster_id);
      } catch (e) {
        console.warn("Seller performance details not available:", e);
        setPanel(null);
        setEvidenceCoach(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load seller panel");
    } finally {
      setLoading(false);
    }
  }

  function openProofTask(task: SellerEvidenceCoachTask) {
    setActiveProofTask(task);
    setProofTitle("");
    setProofDescription("");
    setProofAssetUrl("");
    setProofSuccess(null);
  }

  function applySuggestedProof(task: SellerEvidenceCoachTask) {
    const listing = (panel?.seller_all_listings ?? panel?.seller_listings ?? [])
      .find((item) => item.product.product_id === task.product_id);
    const draft = suggestedProofDraft(task, listing);
    setProofTitle(draft.title);
    setProofDescription(draft.description);
    if (draft.assetUrl) {
      setProofAssetUrl(draft.assetUrl);
    }
  }

  function closeProofTask() {
    setActiveProofTask(null);
    setProofTitle("");
    setProofDescription("");
    setProofAssetUrl("");
  }

  async function handleSubmitProof(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProofTask) return;
    const task = activeProofTask;
    setProofSubmittingId(proofTaskId(task));
    setError(null);
    setProofSuccess(null);
    try {
      await submitSellerEvidenceAsset({
        product_id: task.product_id,
        attribute: task.attribute,
        proof_type: task.recommended_proof_type,
        title: proofTitle.trim(),
        description: proofDescription.trim(),
        asset_url: proofAssetUrl.trim()
      });
      closeProofTask();
      await loadPanel(selectedClusterId);
      setProofSuccess(copy.proofSubmitted);
      navigate("/seller/proofs");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit proof");
    } finally {
      setProofSubmittingId(null);
    }
  }

  async function handleFixSubmit(e: React.FormEvent, productId: string) {
    e.preventDefault();
    setFixLoading(true);
    setFixSuccess(false);
    setError(null);
    try {
      await correctMeasurement(productId, {
        l_chest: Number(lChest),
        xl_chest: Number(xlChest)
      });
      setFixSuccess(true);
      // Reload seller evidence to reflect smoothing in rank and kept rates!
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving correction.");
    } finally {
      setFixLoading(false);
    }
  }

  async function submitDocumentReference() {
    setDocSubmitting(true);
    setError(null);
    setDocSuccess(null);
    try {
      const ref = docRef.trim();
      const name = docFileName.trim();
      const base64 = docFileBase64.trim();
      if (!name || !base64) {
        setError(copy.attachDocumentBeforeSubmit);
        return;
      }
      await submitSellerDocument({
        document_type: docType,
        reference: ref,
        file_name: name,
        mime_type: docMimeType || (name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
        content_base64: base64
      });
      setDocSuccess(`${labelize(docType)}: ${copy.documentSubmitted}`);
      setDocRef("");
      setDocFileName("");
      setDocFileBase64("");
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error submitting document");
    } finally {
      setDocSubmitting(false);
    }
  }

  async function handleDocFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!isAllowedUploadFile(file, ["application/pdf", "image/jpeg", "image/png", "image/webp"], 2_500_000)) {
      setError("Document must be a PDF or image under 2.5 MB.");
      event.currentTarget.value = "";
      return;
    }
    setError(null);
    setDocFileName(file.name);
    setDocMimeType(file.type || (file.name.endsWith(".pdf") ? "application/pdf" : "image/jpeg"));
    setDocFileBase64(dataUrlToBase64(await readFileAsDataUrl(file)));
  }

  async function handleCreateDraft(e: React.FormEvent) {
    e.preventDefault();
    if (draftHasBlockingIssue) {
      setError(draftWarnings.find((warning) => warning.tone === "risk" && warning.key !== "seller-verification")?.detail ?? copy.readinessIncomplete);
      return;
    }
    setDraftCreating(true);
    setError(null);
    setDraftSuccess(null);
    try {
      await createListingDraft({
        title: draftTitle.trim(),
        category: draftCategory,
        garment_type: draftGarmentType,
        fabric: draftFabric,
        color_family: draftColor,
        base_price: Number(draftPrice),
        image_url: draftImageUrl.trim()
      });
      setDraftSuccess(copy.listingDraftCreated);
      setDraftTitle("");
      setDraftGarmentType("");
      setDraftFabric("");
      setDraftColor("");
      setDraftPrice("");
      setDraftImageUrl("");
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating listing draft");
    } finally {
      setDraftCreating(false);
    }
  }

  function handleImproveDraftTitle() {
    const parts = [draftColor, draftFabric, draftGarmentType]
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) {
      setError(copy.readinessIncomplete);
      return;
    }
    setError(null);
    setDraftTitle(toTitleCase(parts.join(" ")));
  }

  async function handleDraftImageFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!isAllowedUploadFile(file, ["image/jpeg", "image/png", "image/webp"], 1_500_000)) {
      setError("Product image must be JPG, PNG, or WebP under 1.5 MB.");
      event.currentTarget.value = "";
      return;
    }
    setError(null);
    setDraftImageUrl(await readFileAsDataUrl(file));
  }

  function openAddProduct() {
    selectWorkbenchTab("add_product");
    window.setTimeout(() => {
      document.getElementById("seller-create-product")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 40);
  }

  async function handleDraftSubmit(draftId: string) {
    setDraftSubmittingId(draftId);
    setError(null);
    setDraftSuccess(null);
    try {
      await submitListingDraft(draftId);
      setDraftSuccess(copy.listingDraftSubmitted);
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error submitting listing draft");
    } finally {
      setDraftSubmittingId(null);
    }
  }

  async function handleProofFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file || !activeProofTask) return;
    if (!isAllowedUploadFile(file, ["application/pdf", "image/jpeg", "image/png", "image/webp"], 2_000_000)) {
      setError("Proof must be a PDF or image under 2 MB.");
      event.currentTarget.value = "";
      return;
    }
    if (!proofTypeAcceptsFile(activeProofTask.recommended_proof_type, file)) {
      setError(`${proofTypeLabel(activeProofTask.recommended_proof_type)} needs a clear image or PDF proof, not ${file.type || "this file type"}.`);
      event.currentTarget.value = "";
      return;
    }
    setError(null);
    setProofAssetUrl(await readFileAsDataUrl(file));
    if (!proofTitle.trim()) {
      setProofTitle(suggestedProofTitle(activeProofTask));
    }
    if (!proofDescription.trim()) {
      setProofDescription(`${shortProductTitle(activeProofTask.product_title)}: uploaded ${file.name} as ${proofTypeLabel(activeProofTask.recommended_proof_type)} for ${labelize(activeProofTask.attribute)} review.`);
    }
  }

  const sellerSummary = panel?.seller ?? onboarding?.seller ?? null;
  const currentRating = sellerSummary?.current_rating;
  const ratingText = typeof currentRating === "number" ? currentRating.toFixed(1) : "New";
  const ratingCount = sellerSummary?.rating_count ?? 0;
  const sellerListings = panel?.seller_all_listings ?? panel?.seller_listings ?? [];
  const proofTasks = useMemo(
    () => [...(evidenceCoach?.tasks ?? [])].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority)),
    [evidenceCoach]
  );
  const topProofTask = proofTasks[0] ?? null;
  const verificationStatus = onboarding?.seller_verification.verification_status
    ?? panel?.seller_verification.verification_status
    ?? "pending";
  const liveProductCount = panel?.seller.product_count ?? onboarding?.seller.product_count ?? sellerListings.length;
  const openRequestCount = evidenceCoach?.open_task_count ?? proofTasks.length;
  const actionBoard = panel?.action_board ?? null;
  const sellerInsight = useMemo(
    () => buildSellerInsight(panel, evidenceCoach, onboarding, copy),
    [copy, evidenceCoach, onboarding, panel]
  );
  const draftReadiness = useMemo(
    () => draftReadinessScore({
      title: draftTitle,
      category: draftCategory,
      garmentType: draftGarmentType,
      fabric: draftFabric,
      color: draftColor,
      price: Number(draftPrice),
      imageUrl: draftImageUrl,
      verified: onboarding?.seller_verification.verification_status === "verified"
    }, copy),
    [copy, draftCategory, draftColor, draftFabric, draftGarmentType, draftImageUrl, draftPrice, draftTitle, onboarding?.seller_verification.verification_status]
  );
  const sellerTrustOps = useMemo(
    () => buildSellerTrustOps(sellerListings, proofTasks, actionBoard, verificationStatus, ratingText, copy),
    [actionBoard, copy, proofTasks, ratingText, sellerListings, verificationStatus]
  );
  const activeProofQuality = useMemo(
    () => activeProofTask
      ? proofDraftQuality(activeProofTask, { title: proofTitle, description: proofDescription, assetUrl: proofAssetUrl }, copy)
      : null,
    [activeProofTask, copy, proofAssetUrl, proofDescription, proofTitle]
  );
  const activeProofReuse = useMemo(
    () => activeProofTask ? proofReuseCandidates(activeProofTask, sellerListings) : [],
    [activeProofTask, sellerListings]
  );
  const activeSuggestedProofDraft = useMemo(() => {
    if (!activeProofTask) return null;
    const listing = sellerListings.find((item) => item.product.product_id === activeProofTask.product_id);
    return suggestedProofDraft(activeProofTask, listing);
  }, [activeProofTask, sellerListings]);
  const proofMatchesSuggested = Boolean(
    activeSuggestedProofDraft &&
    proofTitle === activeSuggestedProofDraft.title &&
    proofDescription === activeSuggestedProofDraft.description &&
    (!activeSuggestedProofDraft.assetUrl || proofAssetUrl === activeSuggestedProofDraft.assetUrl)
  );
  const draftWarnings = useMemo(
    () => productDraftWarnings({
      title: draftTitle,
      category: draftCategory,
      garmentType: draftGarmentType,
      fabric: draftFabric,
      color: draftColor,
      price: Number(draftPrice),
      imageUrl: draftImageUrl,
      verificationStatus
    }, copy),
    [copy, draftCategory, draftColor, draftFabric, draftGarmentType, draftImageUrl, draftPrice, draftTitle, verificationStatus]
  );
  const draftHasBlockingIssue = draftWarnings.some((warning) =>
    warning.tone === "risk" && warning.key !== "seller-verification"
  );
  const activeProofWarnings = useMemo(
    () => activeProofTask
      ? proofUploadWarnings(activeProofTask, {
        title: proofTitle,
        description: proofDescription,
        assetUrl: proofAssetUrl
      }, copy)
      : [],
    [activeProofTask, copy, proofAssetUrl, proofDescription, proofTitle]
  );
  if (loading && !onboarding && !panel) {
    return <div className="seller-loading-state">{copy.loadingSellerCenter}</div>;
  }

  return (
    <main className="seller-console-shell">
      <section className="seller-console-toolbar">
        <div className="seller-title-block">
          <span className="eyebrow">{copy.sellerConsole}</span>
          <div className="seller-title-line">
            <h2>{sellerSummary?.name ?? copy.sellerCenter}</h2>
            <span className="seller-current-rating">
              <Star size={15} fill="currentColor" />
              <strong>{ratingText}</strong>
              <small>{ratingCount ? `${ratingCount.toLocaleString("en-IN")} ${copy.ratings}` : copy.noRatingsYet}</small>
            </span>
          </div>
          <p>{copy.toolbarBody}</p>
        </div>

        <div className="seller-toolbar-controls">
          <button
            type="button"
            className="seller-primary-action seller-add-product-btn"
            onClick={openAddProduct}
          >
            <Plus size={14} />
            Add product
          </button>
          {activeTab === "performance" && panel && (
            <label>
              Product cluster
              <select
                value={selectedClusterId}
                onChange={(e) => {
                  setSelectedClusterId(e.target.value);
                  void loadPanel(e.target.value);
                }}
              >
                {panel.seller.cluster_ids.map((clusterId) => (
                  <option key={clusterId} value={clusterId}>
                    {clusterLabel(clusterId)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="seller-scope-chip">
            <CheckCircle2 size={14} />
            {labelize(onboarding?.seller_verification.verification_status ?? panel?.seller_verification.verification_status ?? "pending")}
          </span>
          <button
            type="button"
            className="btn-reset-db seller-refresh-btn"
            onClick={() => loadPanel(selectedClusterId)}
            title="Refresh seller console"
          >
            <RefreshCcw size={16} className={loading ? "spin-icon" : ""} />
          </button>
        </div>
      </section>

      <div className="workspace-nav" style={{ marginBottom: "16px", alignSelf: "flex-start" }}>
        <button
          type="button"
          className={activeTab === "performance" ? "active" : ""}
          onClick={() => setActiveTab("performance")}
          disabled={!panel}
        >
          Performance
        </button>
        <button
          type="button"
          className={activeTab === "onboarding" ? "active" : ""}
          onClick={() => setActiveTab("onboarding")}
        >
          Verify & drafts {onboarding && onboarding.listing_drafts.length > 0 && `(${onboarding.listing_drafts.length})`}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {docSuccess && <div className="notice success">{docSuccess}</div>}
      {draftSuccess && <div className="notice success">{draftSuccess}</div>}

      {/* Tab 1: Active Performance & Doubt Inbox */}
      {activeTab === "performance" && panel && (
        <>
          <section className="seller-stats-band">
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><TrendingUp size={16} /></span>
              <span>Cluster</span>
              <strong>{panel.cluster.listing_count}</strong>
              <small>{panel.cluster.seller_count} seller option(s)</small>
            </div>
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><AlertTriangle size={16} /></span>
              <span>Median returns</span>
              <strong>{panel.cluster.stats.median_return_rate === null ? "N/A" : `${Math.round(panel.cluster.stats.median_return_rate * 100)}%`}</strong>
              <small>{panel.cluster.stats.delivered_orders_90d} delivered orders</small>
            </div>
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><CheckCircle2 size={16} /></span>
              <span>Verification</span>
              <strong>{labelize(panel.seller_verification.verification_status)}</strong>
              <small>{labelize(panel.seller_verification.data_access_level)}</small>
            </div>
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><RefreshCcw size={16} /></span>
              <span>Source health</span>
              <strong>{labelize(panel.data_freshness.overall_status)}</strong>
              <small>{panel.fact_ids.length} facts connected</small>
            </div>
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><Info size={16} /></span>
              <span>Buyer proof asks</span>
              <strong>{evidenceCoach?.open_task_count ?? 0}</strong>
              <small>{evidenceCoach?.resolved_request_count ?? 0} resolved</small>
            </div>
          </section>

          <section className="seller-console-grid">
            <div className="seller-main-column">
              <section className="seller-live-section seller-section">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Your live options</span>
                    <h3>{panel.cluster.label}</h3>
                  </div>
                  <span className="seller-size-pill">Size {panel.cluster.size}</span>
                </div>
                <div className="seller-listing-stack">
                  {panel.seller_listings.map((listing) => {
                    const isActionNeeded = listing.decision_status === "needs_seller_action";
                    const filledSegments = listing.cluster_position
                      ? Math.max(1, 4 - Math.min(listing.cluster_position, 3))
                      : 0;
                    return (
                      <article
                        key={listing.variant.variant_id}
                        className={`seller-listing-card ${isActionNeeded ? "needs-action" : ""}`}
                      >
                        <div className="seller-listing-image">
                          <img src={listing.product.image_url || "/product-blue.svg"} alt={listing.product.title} />
                        </div>

                        <div className="seller-listing-body">
                          <div className="seller-listing-topline">
                            <div>
                              <h4>{listing.product.title.split("-")[0].trim()}</h4>
                              <span>SKU {listing.variant.variant_id}</span>
                            </div>
                            <span className={`ui-badge ${isActionNeeded ? "caution" : "positive"}`}>
                              {isActionNeeded ? "Needs action" : "Eligible"}
                            </span>
                          </div>

                          <div className="seller-rank-line">
                            <div className="rank-dots" aria-hidden="true">
                              {[1, 2, 3].map((dot) => (
                                <span key={dot} className={dot <= filledSegments ? "filled" : ""} />
                              ))}
                            </div>
                            <strong>
                              {listing.cluster_position
                                ? `You're #${listing.cluster_position} of ${panel.cluster.listing_count} comparable listings`
                                : "Rank pending until enough evidence"}
                            </strong>
                          </div>

                          <div className="seller-score-row compact">
                            <div className="seller-data-point">
                              <span>Kept score</span>
                              <strong>{listing.metrics.kept_rate ? `${Math.round(listing.metrics.kept_rate * 100)}%` : "N/A"}</strong>
                            </div>
                            <div className="seller-data-point rating-highlight">
                              <span><Star size={11} fill="currentColor" /> Current rating</span>
                              <strong>{listing.product.rating.toFixed(1)}/5</strong>
                            </div>
                            <div className="seller-data-point">
                              <span>Fit accuracy</span>
                              <strong>{listing.metrics.fit_as_expected_rate ? `${Math.round(listing.metrics.fit_as_expected_rate * 100)}%` : "N/A"}</strong>
                            </div>
                            <div className="seller-data-point">
                              <span>Dispatch</span>
                              <strong>{listing.metrics.median_dispatch_hours}h</strong>
                            </div>
                          </div>

                          <div className="seller-card-actions">
                            <button className="seller-secondary-action" onClick={() => setActiveWhyListing(listing)}>
                              Why ranked here
                            </button>

                            <button
                              className="seller-primary-action"
                              onClick={() => {
                                setActiveFixListing(listing);
                                setFixSuccess(false);
                              }}
                            >
                              Fix it
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="seller-section">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Comparable listings</span>
                    <h3>Masked cluster context</h3>
                  </div>
                  <span className="seller-size-pill">Aggregate only</span>
                </div>
                <div className="seller-table-wrap">
                  <table className="seller-table">
                    <thead>
                      <tr>
                        <th>Seller listing</th>
                        <th>Kept rate</th>
                        <th>Top issue</th>
                        <th>Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panel.competing_listings.map((comp, idx) => (
                        <tr key={comp.variant.variant_id}>
                          <td>Competitor listing #{idx + 1}</td>
                          <td>{comp.metrics.kept_rate ? `${Math.round(comp.metrics.kept_rate * 100)}%` : "N/A"}</td>
                          <td>{comp.top_issue ? labelize(comp.top_issue.return_reason) : "None"}</td>
                          <td>#{idx + 2}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="seller-side-column">
              {evidenceCoach && (
                <section className="seller-evidence-coach">
                  <div className="seller-section-heading">
                    <div>
                      <span className="eyebrow">Buyer doubt inbox</span>
                      <h3>Evidence requests from shoppers</h3>
                    </div>
                    <strong>{evidenceCoach.open_task_count} open</strong>
                  </div>
                  {evidenceCoach.tasks.length === 0 ? (
                    <p className="seller-empty-copy">{evidenceCoach.privacy_guard.summary}</p>
                  ) : (
                    <div className="seller-proof-task-list">
                      {evidenceCoach.tasks.map((task) => {
                        const taskId = proofTaskId(task);
                        return (
                          <article key={taskId} className="seller-proof-task">
                            <div>
                              <span>{task.priority}</span>
                              <strong>{task.title}</strong>
                              <p>{task.rationale}</p>
                              <small>
                                {task.type === "broken_expectation" ? "Expectation gap" : "Buyer proof request"} |{" "}
                                {task.product_title.split("-")[0].trim()} | {task.recommended_proof_type.replace(/_/g, " ")}
                              </small>
                            </div>
                            <button
                              type="button"
                              onClick={() => openProofTask(task)}
                              disabled={proofSubmittingId === taskId}
                            >
                              {proofSubmittingId === taskId
                                ? "Submitting"
                                : task.type === "broken_expectation"
                                  ? "Add fix proof"
                                  : "Add proof"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              <section className="seller-section">
                <div className="seller-section-heading">
                  <div>
                    <span className="eyebrow">Privacy boundary</span>
                    <h3>What sellers can see</h3>
                  </div>
                  <strong>{panel.privacy_guard.safe_for_seller ? "Safe" : "Check"}</strong>
                </div>
                <p className="seller-empty-copy">{panel.privacy_guard.summary}</p>
              </section>
            </aside>
          </section>
        </>
      )}

      {/* Tab 2: Verification & Catalog Drafts (Onboarding) */}
      {activeTab === "onboarding" && onboarding && (
        <section className="seller-onboarding-workspace">
          <div className="seller-console-grid">
            <div className="seller-main-column">
              {/* Document upload card */}
              <div className="seller-section">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Identity verification</span>
                    <h3>Verification Documents</h3>
                  </div>
                </div>

                <div className="seller-doc-uploader" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", margin: "16px 0" }}>
                  <form onSubmit={handleDocSubmit} className="seller-proof-form-body" style={{ background: "var(--bg-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <strong>Upload New Document</strong>
                    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700" }}>Document Type</span>
                      <select value={docType} onChange={(e) => setDocType(e.target.value as any)}>
                        <option value="gst_certificate">GST Certificate</option>
                        <option value="pan_card">PAN Card</option>
                        <option value="address_proof">Address Proof (Aadhaar / Utility)</option>
                        <option value="bank_proof">Bank Proof (Cancelled Cheque)</option>
                      </select>
                    </label>

                    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700" }}>Reference Number</span>
                      <input value={docRef} onChange={(e) => setDocRef(e.target.value)} placeholder="e.g. GSTIN / Document ID" required />
                    </label>

                    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700" }}>File Name</span>
                      <input value={docFileName} onChange={(e) => setDocFileName(e.target.value)} placeholder="e.g. gst.pdf" />
                    </label>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      <button type="button" className="seller-secondary-action" onClick={() => handleAutoFillDoc(docType)}>
                        Auto-fill Mock Info
                      </button>
                      <button type="submit" className="seller-primary-action" disabled={docSubmitting || !docRef.trim()}>
                        {docSubmitting ? "Submitting..." : "Submit Document"}
                      </button>
                    </div>
                  </form>

                  <div className="submitted-docs-list">
                    <strong>Uploaded Proof References ({onboarding.documents.length})</strong>
                    {onboarding.documents.length === 0 ? (
                      <p style={{ fontStyle: "italic", fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>No documents uploaded yet. Identity verification requires GST & PAN card reference.</p>
                    ) : (
                      <div className="admin-card-stack" style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {onboarding.documents.map((doc) => (
                          <div key={doc.document_id} className="admin-doc-row" style={{ background: "var(--bg-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <strong>{labelize(doc.document_type)}</strong>
                              <span className={`ui-badge ${doc.status === "approved" ? "positive" : doc.status === "rejected" ? "caution" : "neutral"}`}>
                                {doc.status}
                              </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>Ref: {doc.reference}</div>
                            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>File: {doc.file_name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Listing Drafts section */}
              <div id="seller-create-product" className="seller-section" style={{ marginTop: "20px" }}>
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Catalog creation</span>
                    <h3>Add product</h3>
                  </div>
                </div>

                <div className="seller-draft-workspace" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px", margin: "16px 0" }}>
                  {/* Create Draft Form */}
                  <form onSubmit={handleCreateDraft} className="seller-proof-form-body" style={{ background: "var(--bg-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <strong>Create listing draft</strong>
                    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700" }}>Product Title</span>
                      <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="e.g. Cotton Ethnic Kurta" required />
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Category</span>
                        <input value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)} required />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Garment Type</span>
                        <input value={draftGarmentType} onChange={(e) => setDraftGarmentType(e.target.value)} required />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Fabric</span>
                        <input value={draftFabric} onChange={(e) => setDraftFabric(e.target.value)} required />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Color Family</span>
                        <input value={draftColor} onChange={(e) => setDraftColor(e.target.value)} required />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Base Price (Rs)</span>
                        <input type="number" value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} required />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Image URL (Optional)</span>
                        <input value={draftImageUrl} onChange={(e) => setDraftImageUrl(e.target.value)} placeholder="https://..." />
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      <button type="button" className="seller-secondary-action" onClick={handleAutoFillDraft}>
                        Auto-fill Sample Draft
                      </button>
                      <button type="submit" className="seller-primary-action" disabled={draftCreating || !draftTitle.trim()}>
                        {draftCreating ? "Creating..." : "Save Draft"}
                      </button>
                    </div>
                  </form>

                  {/* Drafts List */}
                  <div className="seller-drafts-list">
                    <strong>Current Drafts ({onboarding.listing_drafts.length})</strong>
                    {onboarding.listing_drafts.length === 0 ? (
                      <p style={{ fontStyle: "italic", fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>No drafts saved yet. Create a draft to start publishing catalog products.</p>
                    ) : (
                      <div className="admin-card-stack" style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {onboarding.listing_drafts.map((draft) => (
                          <div key={draft.draft_id} className="admin-doc-row" style={{ background: "var(--bg-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <strong style={{ fontSize: "13px" }}>{draft.title}</strong>
                                <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>ID: {draft.draft_id} | Rs {draft.base_price}</div>
                              </div>
                              <span className={`ui-badge ${draft.status === "approved" ? "positive" : draft.status === "submitted" ? "neutral" : "caution"}`}>
                                {draft.status}
                              </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                              Readiness: <strong>{labelize(draft.readiness_status)}</strong>
                            </div>
                            {draft.status === "draft" && (
                              <button
                                type="button"
                                style={{ marginTop: "8px", padding: "5px 10px", fontSize: "11px", borderRadius: "6px", width: "100%" }}
                                className="seller-primary-action"
                                onClick={() => void handleDraftSubmit(draft.draft_id)}
                                disabled={draftSubmittingId === draft.draft_id}
                              >
                                {draftSubmittingId === draft.draft_id ? "Submitting..." : "Submit to Admin"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <aside className="seller-side-column">
              <div className="seller-section">
                <span className="eyebrow">Onboarding Steps</span>
                <h3>Next Actions</h3>
                <div className="policy-list" style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {onboarding.next_actions.map((act, idx) => (
                    <div key={idx} style={{ padding: "10px", background: "var(--bg-canvas)", borderLeft: `3px solid var(--${act.priority === "high" ? "error" : act.priority === "medium" ? "warning" : "success"})`, borderRadius: "4px" }}>
                      <strong style={{ fontSize: "12px", display: "block" }}>{act.title}</strong>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{act.detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="seller-section" style={{ marginTop: "16px" }}>
                <span className="eyebrow">Trust Constraints</span>
                <h3>Verification Policy</h3>
                <ul className="policy-list" style={{ paddingLeft: "16px", marginTop: "8px", fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {onboarding.policy.buyer_feed_blocked_until.map((item, i) => (
                    <li key={i}>{labelize(item)}</li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* Screen 2: Why Ranked Here Bottom Sheet */}
      {activeWhyListing && (
        <div className="bottom-sheet-overlay" onClick={() => setActiveWhyListing(null)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-primary">Why You're Ranked Here</span>
                <h3 className="sheet-title">Factual Indicators</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setActiveWhyListing(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="seller-why-body">
              <p>
                This is a second view into Sarthi's evidence ranking. These factors reflect comparable listing performance.
              </p>

              <div className="seller-why-metrics">
                <div className="kv-row">
                  <span>Size accuracy</span>
                  <strong>
                    {Math.round((activeWhyListing.metrics.fit_as_expected_rate ?? 1.0) * 100)}%
                  </strong>
                </div>

                <div className="kv-row">
                  <span>Color match</span>
                  <strong>
                    {activeWhyListing.metrics.delivered_orders_90d
                      ? Math.round((1 - activeWhyListing.metrics.color_mismatch_returns / activeWhyListing.metrics.delivered_orders_90d) * 100)
                      : 100}%
                  </strong>
                </div>

                <div className="kv-row">
                  <span>Dispatch median</span>
                  <strong>
                    {activeWhyListing.metrics.median_dispatch_hours} hours
                  </strong>
                </div>
              </div>

              {/* Bullet factors list */}
              <div className="seller-why-reasons">
                <strong>Deciding factors analyzed</strong>
                {activeWhyListing.action_items.map((action, idx) => (
                  <div key={idx} className="reason-row">
                    <Info size={15} />
                    <span>{action.rationale}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => setActiveWhyListing(null)} className="seller-primary-action">
                Close details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen 3: Fix It Bottom Sheet */}
      {activeFixListing && (
        <div className="bottom-sheet-overlay" onClick={() => setActiveFixListing(null)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-danger">Fix Listing Metrics</span>
                <h3 className="sheet-title">Update Size Chest Specs</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setActiveFixListing(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="seller-fix-body">
              <div className="seller-fix-warning">
                <strong>
                  Size-related returns are elevated for {activeFixListing.product.title.split("-")[0].trim()}.
                </strong>
                <span>
                  Recommended action: correct chest measurement specifications for sizes L and XL.
                </span>
              </div>

              {fixSuccess ? (
                <div className="seller-fix-success">
                  <div>
                    <CheckCircle2 size={36} />
                  </div>
                  <strong>Measurements corrected!</strong>
                  <p>
                    Sarthi saved this as a pending correction. Buyer trust will improve only after future kept outcomes validate the change.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveFixListing(null)}
                    className="seller-primary-action"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={(e) => handleFixSubmit(e, activeFixListing.product.product_id)} className="seller-fix-form">
                  <div className="seller-fix-grid">
                    <label>
                      <span>Size L Chest (inches)</span>
                      <div className="measurement-input-wrapper">
                        <input
                          type="number"
                          step="0.5"
                          value={lChest}
                          onChange={(e) => setLChest(e.target.value)}
                          required
                        />
                        <strong>in</strong>
                      </div>
                    </label>

                    <label>
                      <span>Size XL Chest (inches)</span>
                      <div className="measurement-input-wrapper">
                        <input
                          type="number"
                          step="0.5"
                          value={xlChest}
                          onChange={(e) => setXlChest(e.target.value)}
                          required
                        />
                        <strong>in</strong>
                      </div>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={fixLoading || !(Number(lChest) > 0 && Number(xlChest) > Number(lChest))}
                    className="seller-primary-action"
                  >
                    {fixLoading ? "Updating..." : "Update measurement"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {activeProofTask && (
        <div className="bottom-sheet-overlay" onClick={closeProofTask}>
          <div className="bottom-sheet-content" onClick={(event) => event.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-primary">Seller Proof</span>
                <h3 className="sheet-title">Attach Evidence Reference</h3>
              </div>
              <button className="bottom-sheet-close" onClick={closeProofTask}>
                <X size={16} />
              </button>
            </div>

            <form className="seller-proof-form-body" onSubmit={handleSubmitProof}>
              <div className="seller-proof-context">
                <strong>{activeProofTask.title}</strong>
                <span>
                  {activeProofTask.product_title.split("-")[0].trim()} needs {activeProofTask.recommended_proof_type.replace(/_/g, " ")} for {activeProofTask.attribute}.
                </span>
              </div>

              <label>
                <span>Proof title</span>
                <input
                  value={proofTitle}
                  onChange={(event) => setProofTitle(event.target.value)}
                  required
                />
              </label>

              <label>
                <span>Proof URL or storage reference</span>
                <input
                  type="url"
                  value={proofAssetUrl}
                  onChange={(event) => setProofAssetUrl(event.target.value)}
                  placeholder="https://.../daylight-photo.jpg"
                  required
                />
              </label>

              <label>
                <span>What this proof shows</span>
                <textarea
                  value={proofDescription}
                  onChange={(event) => setProofDescription(event.target.value)}
                  required
                />
              </label>

              <button
                type="submit"
                className="seller-primary-action"
                disabled={
                  proofSubmittingId === proofTaskId(activeProofTask) ||
                  !proofTitle.trim() ||
                  !proofDescription.trim() ||
                  !proofAssetUrl.trim()
                }
              >
                <Plus size={14} />
                {proofSubmittingId ? "Submitting proof" : "Submit proof reference"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function proofTaskId(task: SellerEvidenceCoachTask) {
  return `${task.type}:${task.product_id}:${task.attribute}`;
}

function clusterLabel(clusterId: string) {
  if (clusterId === "cluster_floral_blue") return "Blue floral daily kurtis";
  if (clusterId === "cluster_pink_printed") return "Pink printed straight kurtis";
  return labelize(clusterId);
}
