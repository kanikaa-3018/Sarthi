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
            {copy.addProduct}
          </button>
          {topFeature === "console" && workbenchTab === "performance" && panel && (
            <label>
              {copy.productCluster}
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
            title={copy.refreshSellerConsole}
          >
            <RefreshCcw size={16} className={loading ? "spin-icon" : ""} />
          </button>
        </div>
      </section>

      {error && <div className="notice error">{error}</div>}
      {proofSuccess && <div className="notice success">{proofSuccess}</div>}
      {docSuccess && <div className="notice success">{docSuccess}</div>}
      {draftSuccess && <div className="notice success">{draftSuccess}</div>}

      {topFeature !== "console" ? (
        <SellerTopFeaturePage
          feature={topFeature}
          listings={sellerListings}
          tasks={proofTasks}
          actionBoard={actionBoard}
          topProofTask={topProofTask}
          proofNav={evidenceCoach?.proof_nav ?? null}
          proofAssets={evidenceCoach?.proof_assets ?? []}
          draftReadiness={draftReadiness}
          draftWarnings={draftWarnings}
          ratingText={ratingText}
          ratingCount={ratingCount}
          liveProductCount={liveProductCount}
          openRequestCount={openRequestCount}
          resolvedProofCount={evidenceCoach?.resolved_request_count ?? 0}
          verificationStatus={verificationStatus}
          onOpenProofTask={openProofTask}
          onOpenDetails={setActiveWhyListing}
          onOpenFix={(listing) => {
            setActiveFixListing(listing);
            setFixSuccess(false);
          }}
          onAddProduct={openAddProduct}
          onOpenConsole={() => navigate("/seller")}
          copy={copy}
        />
      ) : (
        <>
          <SellerWorkbenchNav
            active={workbenchTab}
            counts={{
              products: liveProductCount,
              openProofTasks: openRequestCount,
              drafts: onboarding?.listing_drafts.length ?? 0,
              submittedProofs: evidenceCoach?.proof_assets.length ?? 0,
              facts: panel?.fact_ids.length ?? 0
            }}
            panelAvailable={Boolean(panel)}
            onSelect={selectWorkbenchTab}
            copy={copy}
          />

          {workbenchTab === "overview" && (
        <section className="seller-workbench-panel">
          <SellerAgentInsight insight={sellerInsight} copy={copy} />
          <SellerQuickActions
            topProofTask={topProofTask}
            onOpenProofTask={openProofTask}
            onShowProducts={() => selectWorkbenchTab("products")}
            onAddProduct={openAddProduct}
            copy={copy}
          />
          <SellerTrustOpsStrip
            insights={sellerTrustOps}
            onOpenProofTask={topProofTask ? () => openProofTask(topProofTask) : undefined}
            onShowProducts={() => selectWorkbenchTab("products")}
          />
          {evidenceCoach && (
            <SellerProofImpactPanel
              proofNav={evidenceCoach.proof_nav}
              proofAssets={evidenceCoach.proof_assets}
              tasks={proofTasks}
              ratingText={ratingText}
              onOpenProofTask={topProofTask ? () => openProofTask(topProofTask) : undefined}
              copy={copy}
            />
          )}

          <div className="seller-overview-grid">
            <SellerMetricCard
              label={copy.currentRating}
              value={ratingText}
              detail={ratingCount ? `${ratingCount.toLocaleString("en-IN")} ${copy.buyerRatings}` : copy.buildFirstRatings}
              tone="brand"
            />
            <SellerMetricCard
              label={copy.liveProducts}
              value={String(liveProductCount)}
              detail={panel ? `${sellerListings.length} ${copy.productsTracked}` : copy.addAndSubmitProducts}
              tone="neutral"
            />
            <SellerMetricCard
              label={copy.buyerProofAsks}
              value={String(openRequestCount)}
              detail={openRequestCount ? copy.fixBeforeTrust : copy.noOpenBuyerDoubts}
              tone={openRequestCount ? "watch" : "good"}
            />
            <SellerMetricCard
              label={copy.verification}
              value={labelize(verificationStatus)}
              detail={verificationStatus === "verified" ? copy.buyerFeedReady : copy.uploadDocsReview}
              tone={verificationStatus === "verified" ? "good" : "watch"}
            />
          </div>

          <SellerReviewLoopPanel
            onboarding={onboarding}
            proofAssets={evidenceCoach?.proof_assets ?? []}
            tasks={proofTasks}
            copy={copy}
            onOpenProofTask={openProofTask}
            onAddProduct={openAddProduct}
          />

          {actionBoard ? (
            <>
              <SellerActionBoardPanel
                board={actionBoard}
                listings={sellerListings}
                tasks={proofTasks}
                onOpenDetails={setActiveWhyListing}
                onOpenFix={(listing) => {
                  setActiveFixListing(listing);
                  setFixSuccess(false);
                }}
                onOpenProofTask={openProofTask}
                copy={copy}
              />
              <SellerRatingCoachPanel board={actionBoard} ratingText={ratingText} copy={copy} />
            </>
          ) : (
            <div className="seller-today-grid">
              <article className="seller-next-action-card primary">
                <span className="eyebrow">{copy.doFirst}</span>
                <strong>{topProofTask ? topProofTask.title : copy.keepProductProofReady}</strong>
                <p>
                  {topProofTask
                    ? `${topProofTask.buyer_demand} buyer request(s) are waiting for ${proofTypeLabel(topProofTask.recommended_proof_type)}.`
                    : copy.noUrgentBuyerRequest}
                </p>
                {topProofTask ? (
                  <button type="button" className="seller-primary-action" onClick={() => openProofTask(topProofTask)}>
                    {copy.addProof}
                    <ChevronRight size={14} />
                  </button>
                ) : (
                  <button type="button" className="seller-secondary-action" onClick={() => selectWorkbenchTab("proofs_submitted")}>
                    {copy.viewProofGuide}
                    <ChevronRight size={14} />
                  </button>
                )}
              </article>
            </div>
          )}
        </section>
      )}

      {workbenchTab === "products" && panel && (
        <section className="seller-workbench-panel">
          <div className="seller-section-heading clean">
            <div>
              <span className="eyebrow">{copy.productHealth}</span>
              <h3>{copy.whatEachListingNeeds}</h3>
              <p>{copy.productHealthBody}</p>
            </div>
            <button type="button" className="seller-primary-action" onClick={openAddProduct}>
              <Plus size={14} />
              {copy.addProduct}
            </button>
          </div>
          <SellerProductHealthTable
            listings={sellerListings}
            tasks={proofTasks}
            actionCards={actionBoard?.cards ?? []}
            onOpenDetails={setActiveWhyListing}
            onOpenFix={(listing) => {
              setActiveFixListing(listing);
              setFixSuccess(false);
            }}
            onOpenProofTask={openProofTask}
          />
        </section>
      )}

      {workbenchTab === "products" && !panel && (
        <SellerEmptyState
          title={copy.noLiveProductData}
              detail={copy.finishVerificationOrDraft}
          action={copy.addProduct}
          onAction={openAddProduct}
        />
      )}

      {workbenchTab === "add_product" && onboarding && (
        <section id="seller-create-product" className="seller-workbench-panel seller-add-product-workbench">
          <div className="seller-section-heading clean">
            <div>
              <span className="eyebrow">{copy.addProductEyebrow}</span>
              <h3>{copy.createTrustedListing}</h3>
              <p>{copy.readinessBody}</p>
            </div>
            <span className={`seller-status-pill ${verificationStatus === "verified" ? "good" : "watch"}`}>
              {labelize(verificationStatus)}
            </span>
          </div>

          <div className="seller-add-grid">
            <form onSubmit={handleCreateDraft} className="seller-clean-form">
              <div className={`seller-readiness-live ${draftReadiness.tone}`}>
                <div>
                  <span>{copy.readyToSubmit}</span>
                  <strong>{draftReadiness.score}/100</strong>
                </div>
                <p>{draftReadiness.message}</p>
              </div>
              <SellerUploadWarningList title={copy.listingUploadChecks} warnings={draftWarnings} />

              <label>
                <span>{copy.productTitle}</span>
                <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="Blue floral cotton kurti" required />
              </label>

              <div className="seller-form-row">
                <label>
                  <span>{copy.category}</span>
                  <input value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)} required />
                </label>
                <label>
                  <span>{copy.garmentType}</span>
                  <input value={draftGarmentType} onChange={(e) => setDraftGarmentType(e.target.value)} required />
                </label>
              </div>

              <div className="seller-form-row">
                <label>
                  <span>{copy.fabric}</span>
                  <input value={draftFabric} onChange={(e) => setDraftFabric(e.target.value)} required />
                </label>
                <label>
                  <span>{copy.colourFamily}</span>
                  <input value={draftColor} onChange={(e) => setDraftColor(e.target.value)} required />
                </label>
              </div>

              <div className="seller-form-row">
                <label>
                  <span>{copy.basePrice}</span>
                  <input type="number" value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} required />
                </label>
                <label>
                  <span>{copy.imageUrl}</span>
                  <input value={draftImageUrl} onChange={(e) => setDraftImageUrl(e.target.value)} placeholder="https://..." />
                </label>
              </div>
              <label className="seller-file-upload">
                <UploadCloud size={15} />
                <span>{draftImageUrl.startsWith("data:image/") ? copy.productImageSelected : copy.uploadProductImage}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleDraftImageFileSelect(event)} />
              </label>

              <div className="seller-form-actions">
                <button type="button" className="seller-secondary-action" onClick={handleImproveDraftTitle} disabled={!draftGarmentType.trim() && !draftFabric.trim() && !draftColor.trim()}>
                  {copy.improveTitle}
                </button>
                <button type="submit" className="seller-primary-action" disabled={draftCreating || !draftTitle.trim() || draftHasBlockingIssue}>
                  {draftCreating ? copy.saving : copy.saveDraft}
                </button>
              </div>
            </form>

            <aside className="seller-draft-panel">
              <div className="seller-doc-status">
                <span className="eyebrow">{copy.verificationDocs}</span>
                <strong>{onboarding.documents.length} {copy.uploaded}</strong>
                <p>{verificationStatus === "verified" ? copy.docsApproved : copy.uploadSellerProof}</p>
              </div>

              <div className="seller-mini-doc-form">
                <strong>{copy.quickDocumentUpload}</strong>
                <select value={docType} onChange={(e) => setDocType(e.target.value as typeof docType)}>
                  <option value="gst_certificate">GST Certificate</option>
                  <option value="pan_card">PAN Card</option>
                  <option value="address_proof">Address Proof</option>
                  <option value="bank_proof">Bank Proof</option>
                </select>
                <input value={docRef} onChange={(e) => setDocRef(e.target.value)} placeholder={copy.referenceNumber} />
                <label className="seller-file-upload compact">
                  <UploadCloud size={14} />
                  <span>{docFileName || copy.attachDocumentFile}</span>
                  <input type="file" accept=".pdf,image/png,image/jpeg,image/webp" onChange={(event) => void handleDocFileSelect(event)} />
                </label>
                <div className="seller-form-actions">
                  <button type="button" className="seller-primary-action" disabled={docSubmitting || !docRef.trim() || !docFileBase64} onClick={() => void submitDocumentReference()}>
                    {docSubmitting ? copy.submitting : copy.submitDoc}
                  </button>
                </div>
              </div>

              <div className="seller-draft-list">
                <strong>{copy.drafts}</strong>
                {onboarding.listing_drafts.length === 0 ? (
                  <p>{copy.noDrafts}</p>
                ) : (
                  onboarding.listing_drafts.map((draft) => (
                    <article key={draft.draft_id} className="seller-draft-row">
                      <div>
                        <strong>{draft.title}</strong>
                        <span>Rs {draft.base_price} | {labelize(draft.readiness_status)}</span>
                      </div>
                      <button
                        type="button"
                        className="seller-secondary-action"
                        onClick={() => void handleDraftSubmit(draft.draft_id)}
                        disabled={draft.status !== "draft" || draftSubmittingId === draft.draft_id}
                      >
                        {draftSubmittingId === draft.draft_id ? copy.submitting : labelize(draft.status === "draft" ? "submit" : draft.status)}
                      </button>
                    </article>
                  ))
                )}
              </div>
            </aside>
          </div>
        </section>
      )}

      {workbenchTab === "add_product" && !onboarding && (
        <SellerEmptyState
          title={copy.sellerSetupNotLoaded}
          detail={copy.refreshSetupDetail}
          action={copy.refresh}
          onAction={() => void loadPanel(selectedClusterId)}
        />
      )}

      {workbenchTab === "proofs_submitted" && (
        <SellerProofLibraryPanel
          tasks={proofTasks}
          listings={sellerListings}
          onOpenProofTask={openProofTask}
        />
      )}

      {workbenchTab === "performance" && panel && (
        <SellerPerformancePanel
          panel={panel}
          selectedClusterId={selectedClusterId}
          onClusterChange={(clusterId) => {
            setSelectedClusterId(clusterId);
            void loadPanel(clusterId);
          }}
        />
      )}
        </>
      )}

      {/* Screen 2: Why Ranked Here Bottom Sheet */}
      {activeWhyListing && (
        <div className="bottom-sheet-overlay" onClick={() => setActiveWhyListing(null)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-primary">Product plan</span>
                <h3 className="sheet-title">What to fix next</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setActiveWhyListing(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="seller-why-body">
              <p>
                Uses aggregate returns, size feedback, dispatch, and proof gaps. Buyer private fit memory is not shown.
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
                <strong>Actions that improve buyer trust</strong>
                {activeWhyListing.action_items.length ? (
                  activeWhyListing.action_items.map((action, idx) => (
                    <div key={idx} className="reason-row">
                      <Info size={15} />
                      <span>{action.rationale}</span>
                    </div>
                  ))
                ) : (
                  <div className="reason-row">
                    <CheckCircle2 size={15} />
                    <span>No urgent fix. Keep photos, size chart, and dispatch proof updated.</span>
                  </div>
                )}
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
                <span className="eyebrow sheet-eyebrow-danger">Size fix</span>
                <h3 className="sheet-title">Update chest measurements</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setActiveFixListing(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="seller-fix-body">
              <div className="seller-fix-warning">
                <strong>
                  Buyers need clearer size proof for {activeFixListing.product.title.split("-")[0].trim()}.
                </strong>
                <span>
                  Update L and XL chest values. Future kept orders validate the change before trust improves.
                </span>
              </div>

              {fixSuccess ? (
                <div className="seller-fix-success">
                  <div>
                    <CheckCircle2 size={36} />
                  </div>
                  <strong>Measurements corrected!</strong>
                  <p>
                    Saved as a pending correction. Buyer trust improves only after future kept outcomes validate the change.
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
                <span className="eyebrow sheet-eyebrow-primary">{copy.proofAdminReview}</span>
                <h3 className="sheet-title">{copy.reviewAndSubmit}</h3>
              </div>
              <button className="bottom-sheet-close" onClick={closeProofTask}>
                <X size={16} />
              </button>
            </div>

            <form className="seller-proof-form-body" onSubmit={handleSubmitProof}>
              <div className="seller-proof-context">
                <strong>{activeProofTask.title}</strong>
                <span>
                  {activeProofTask.product_title.split("-")[0].trim()} needs {proofTypeLabel(activeProofTask.recommended_proof_type)} for {labelize(activeProofTask.attribute)}.
                </span>
              </div>

              {activeSuggestedProofDraft && (
                <section className="seller-proof-draft-card" aria-label={copy.suggestedDraft}>
                  <div className="seller-proof-draft-head">
                    <div>
                      <span className="eyebrow">{copy.suggestedDraft}</span>
                      <strong>{activeSuggestedProofDraft.title}</strong>
                    </div>
                    <button
                      type="button"
                      className="seller-secondary-action"
                      onClick={() => applySuggestedProof(activeProofTask)}
                      disabled={proofMatchesSuggested}
                    >
                      {proofMatchesSuggested ? copy.draftApplied : copy.applyDraft}
                    </button>
                  </div>
                  <div className="seller-proof-draft-preview">
                    <span>
                      <b>{copy.requiredAsset}</b>
                      <small>{activeSuggestedProofDraft.assetUrl || activeSuggestedProofDraft.assetHint}</small>
                    </span>
                    <span>
                      <b>{copy.adminNote}</b>
                      <small>{activeSuggestedProofDraft.description}</small>
                    </span>
                  </div>
                  {proofMatchesSuggested && (
                    <p className="seller-proof-draft-state">
                      <CheckCircle2 size={14} />
                      {copy.suggestedDraftApplied}
                    </p>
                  )}
                </section>
              )}

              {activeProofQuality && (
                <ProofDraftQualityPanel quality={activeProofQuality} reuseCount={activeProofReuse.length} copy={copy} />
              )}
              <SellerUploadWarningList title={copy.wrongProofGuard} warnings={activeProofWarnings} />

              <label>
                <span>{copy.proofTitle}</span>
                <input
                  value={proofTitle}
                  onChange={(event) => setProofTitle(event.target.value)}
                  required
                />
              </label>
              <label className="seller-file-upload">
                <UploadCloud size={15} />
                <span>{proofAssetUrl.startsWith("data:") ? copy.proofFileSelected : copy.uploadProofFile}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => void handleProofFileSelect(event)} />
              </label>

              <label>
                <span>{copy.proofFileOrLink}</span>
                <input
                  value={proofAssetUrl}
                  onChange={(event) => setProofAssetUrl(event.target.value)}
                  placeholder={copy.proofFilePlaceholder}
                  required
                />
              </label>

              <label>
                <span>{copy.whatProofShows}</span>
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
                  !proofAssetUrl.trim() ||
                  Boolean(activeProofQuality && activeProofQuality.score < 55)
                }
              >
                <Plus size={14} />
                {proofSubmittingId ? copy.submittingProof : copy.submitProofReference}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function SellerWorkbenchNav({
  active,
  counts,
  panelAvailable,
  onSelect,
  copy
}: {
  active: SellerWorkbenchTab;
  counts: { products: number; openProofTasks: number; drafts: number; submittedProofs: number; facts: number };
  panelAvailable: boolean;
  onSelect: (tab: SellerWorkbenchTab) => void;
  copy: SellerCopy;
}) {
  const items: Array<{ key: SellerWorkbenchTab; label: string; detail: string; count?: number; disabled?: boolean }> = [
    { key: "overview", label: copy.workbenchToday, detail: copy.workbenchTodayDetail },
    { key: "products", label: copy.workbenchProducts, detail: copy.workbenchProductsDetail, count: counts.products, disabled: !panelAvailable },
    { key: "proofs_submitted", label: copy.workbenchEvidence, detail: `${counts.openProofTasks} ${copy.workbenchEvidenceDetail}`, count: counts.submittedProofs },
    { key: "add_product", label: copy.workbenchNewListing, detail: copy.workbenchNewListingDetail, count: counts.drafts },
    { key: "performance", label: copy.workbenchMarket, detail: copy.workbenchMarketDetail, count: counts.facts, disabled: !panelAvailable }
  ];

  return (
    <nav className="seller-workbench-nav" aria-label={SELLER_WORKBENCH_NAV_LABEL}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={active === item.key ? "active" : ""}
          onClick={() => onSelect(item.key)}
          disabled={item.disabled}
        >
          <span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </span>
          {typeof item.count === "number" && <em>{item.count}</em>}
        </button>
      ))}
    </nav>
  );
}

function SellerMetricCard({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  tone: "brand" | "good" | "watch" | "risk" | "neutral";
}) {
  return (
    <article className={`seller-overview-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function SellerTopFeaturePage({
  feature,
  listings,
  tasks,
  actionBoard,
  topProofTask,
  proofNav,
  proofAssets,
  draftReadiness,
  draftWarnings,
  ratingText,
  ratingCount,
  liveProductCount,
  openRequestCount,
  resolvedProofCount,
  verificationStatus,
  onOpenProofTask,
  onOpenDetails,
  onOpenFix,
  onAddProduct,
  onOpenConsole,
  copy
}: {
  feature: Exclude<SellerTopFeature, "console">;
  listings: SellerPanelListing[];
  tasks: SellerEvidenceCoachTask[];
  actionBoard: SellerActionBoard | null;
  topProofTask: SellerEvidenceCoachTask | null;
  proofNav: SellerProofNav | null;
  proofAssets: SellerProofAsset[];
  draftReadiness: ReturnType<typeof draftReadinessScore>;
  draftWarnings: SellerUploadWarning[];
  ratingText: string;
  ratingCount: number;
  liveProductCount: number;
  openRequestCount: number;
  resolvedProofCount: number;
  verificationStatus: string;
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
  onOpenDetails: (listing: SellerPanelListing) => void;
  onOpenFix: (listing: SellerPanelListing) => void;
  onAddProduct: () => void;
  onOpenConsole: () => void;
  copy: SellerCopy;
}) {
  if (feature === "proofs") {
    return (
      <SellerProofCenterPage
        tasks={tasks}
        proofAssets={proofAssets}
        proofNav={proofNav}
        resolvedCount={resolvedProofCount}
        onOpenProofTask={onOpenProofTask}
        copy={copy}
      />
    );
  }

  return (
    <SellerTrustCoachPage
      actionBoard={actionBoard}
      listings={listings}
      tasks={tasks}
      topProofTask={topProofTask}
      draftReadiness={draftReadiness}
      draftWarnings={draftWarnings}
      verificationStatus={verificationStatus}
      ratingText={ratingText}
      ratingCount={ratingCount}
      liveProductCount={liveProductCount}
      openRequestCount={openRequestCount}
      proofNav={proofNav}
      onOpenProofTask={onOpenProofTask}
      onOpenDetails={onOpenDetails}
      onOpenFix={onOpenFix}
      onAddProduct={onAddProduct}
      onOpenConsole={onOpenConsole}
      copy={copy}
    />
  );
}

function SellerProofCenterPage({
  tasks,
  proofAssets,
  proofNav,
  resolvedCount,
  onOpenProofTask,
  copy
}: {
  tasks: SellerEvidenceCoachTask[];
  proofAssets: SellerProofAsset[];
  proofNav: SellerProofNav | null;
  resolvedCount: number;
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
  copy: SellerCopy;
}) {
  const rejected = proofAssets.filter((asset) => asset.status === "rejected").length;
  const inReview = proofAssets.filter((asset) => asset.status === "submitted").length;
  const approved = proofAssets.filter((asset) => asset.status === "verified").length;
  const topTask = tasks[0] ?? null;

  return (
    <section className="seller-top-tool seller-top-proof-tool">
      <div className="seller-top-tool-hero">
        <div>
          <span className="eyebrow">{copy.proofCenter}</span>
          <h3>{copy.proofCenterTitle}</h3>
          <p>{copy.proofCenterBody}</p>
        </div>
        {topTask && (
          <button type="button" className="seller-primary-action" onClick={() => onOpenProofTask(topTask)}>
            {copy.uploadNextProof}
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      <SellerProofLifecycle
        openTasks={tasks.length}
        submitted={proofAssets.length}
        inReview={proofNav?.in_review_count ?? inReview}
        approved={proofNav?.approved_count ?? approved}
        rejected={proofNav?.rejected_count ?? rejected}
        buyerVisible={resolvedCount}
        copy={copy}
      />

      <div className="seller-top-metric-grid">
        <SellerMetricCard label={copy.approved} value={String(proofNav?.approved_count ?? approved)} detail={`${resolvedCount} ${copy.buyerCanSeeProof}`} tone="good" />
        <SellerMetricCard label={copy.adminChecking} value={String(proofNav?.in_review_count ?? inReview)} detail={copy.doNotUploadDuplicate} tone={inReview ? "watch" : "neutral"} />
        <SellerMetricCard label={copy.needsRedo} value={String(proofNav?.rejected_count ?? rejected)} detail={copy.uploadClearerProof} tone={rejected ? "risk" : "good"} />
        <SellerMetricCard label={copy.trustPoints} value={`+${proofNav?.trust_lift_points ?? 0}`} detail={proofNav?.rating_forecast ?? copy.approvedProofReducesDoubt} tone="brand" />
      </div>

      <SellerProofLedger proofAssets={proofAssets} tasks={tasks} onOpenProofTask={onOpenProofTask} />
      <SellerProofSuggestionPanel proofNav={proofNav} tasks={tasks} proofAssets={proofAssets} onOpenProofTask={onOpenProofTask} />
    </section>
  );
}

function SellerProofLifecycle({
  openTasks,
  submitted,
  inReview,
  approved,
  rejected,
  buyerVisible,
  copy
}: {
  openTasks: number;
  submitted: number;
  inReview: number;
  approved: number;
  rejected: number;
  buyerVisible: number;
  copy: SellerCopy;
}) {
  const steps: Array<{ key: string; label: string; value: string; detail: string; tone: "good" | "watch" | "risk" | "neutral" }> = [
    {
      key: "ask",
      label: copy.buyerAsked,
      value: String(openTasks),
      detail: openTasks ? copy.buyerAskedDetail : copy.noBuyerAsk,
      tone: openTasks ? "watch" : "good"
    },
    {
      key: "upload",
      label: copy.youUploaded,
      value: String(submitted),
      detail: submitted ? copy.proofSaved : copy.uploadRealProof,
      tone: submitted ? "good" : "neutral"
    },
    {
      key: "review",
      label: copy.adminChecks,
      value: String(inReview),
      detail: inReview ? copy.adminCheckingDetail : copy.nothingWithAdmin,
      tone: inReview ? "watch" : "neutral"
    },
    {
      key: "approved",
      label: copy.approved,
      value: String(approved),
      detail: approved ? copy.proofBuildsConfidence : copy.approvedProofAppears,
      tone: approved ? "good" : "neutral"
    },
    {
      key: "visible",
      label: copy.buyerSees,
      value: String(buyerVisible),
      detail: buyerVisible ? copy.buyerVisible : copy.nothingBuyerVisible,
      tone: buyerVisible ? "good" : "neutral"
    }
  ];

  return (
    <section className="seller-proof-lifecycle" aria-label="Proof review lifecycle">
      <div className="seller-proof-lifecycle-head">
        <div>
          <span className="eyebrow">{copy.proofLifecycleEyebrow}</span>
          <h3>{copy.proofLifecycleTitle}</h3>
        </div>
        {rejected > 0 && (
          <span className="seller-status-pill risk">{rejected} {copy.needRedo}</span>
        )}
      </div>
      <div className="seller-proof-lifecycle-steps">
        {steps.map((step, index) => (
          <article key={step.key} className={step.tone}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <em>{step.value}</em>
              <p>{step.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SellerTrustCoachPage({
  actionBoard,
  listings,
  tasks,
  topProofTask,
  draftReadiness,
  draftWarnings,
  verificationStatus,
  ratingText,
  ratingCount,
  liveProductCount,
  openRequestCount,
  proofNav,
  onOpenProofTask,
  onOpenDetails,
  onOpenFix,
  onAddProduct,
  onOpenConsole,
  copy
}: {
  actionBoard: SellerActionBoard | null;
  listings: SellerPanelListing[];
  tasks: SellerEvidenceCoachTask[];
  topProofTask: SellerEvidenceCoachTask | null;
  draftReadiness: ReturnType<typeof draftReadinessScore>;
  draftWarnings: SellerUploadWarning[];
  verificationStatus: string;
  ratingText: string;
  ratingCount: number;
  liveProductCount: number;
  openRequestCount: number;
  proofNav: SellerProofNav | null;
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
  onOpenDetails: (listing: SellerPanelListing) => void;
  onOpenFix: (listing: SellerPanelListing) => void;
  onAddProduct: () => void;
  onOpenConsole: () => void;
  copy: SellerCopy;
}) {
  const focusRows = buildListingLabRows(listings, tasks, actionBoard?.cards ?? []).slice(0, 3);
  const forecast = ratingForecastLine(ratingText, proofNav?.trust_lift_points ?? 0, openRequestCount);
  const manualWork = openRequestCount + (actionBoard?.cards.filter((card) => card.priority !== "low").length ?? 0) + draftWarnings.filter((warning) => warning.tone !== "good").length;
  const blockerCount = verificationStatus === "verified" ? 0 : 1;
  const topCard = actionBoard?.cards[0] ?? null;
  const topCardListing = topCard ? listings.find((item) => item.product.product_id === topCard.product_id) ?? null : null;
  const trustAction = buildTrustCoachAction({
    verificationStatus,
    topProofTask,
    topCard,
    topCardListing,
    draftWarnings,
    onOpenProofTask,
    onOpenDetails,
    onOpenFix,
    onAddProduct,
    onOpenConsole,
    copy
  });

  return (
    <section className="seller-top-tool seller-trust-coach">
      <div className="seller-top-tool-hero seller-copilot-hero">
        <div>
          <span className="eyebrow">{copy.trustCoach}</span>
          <h3>{copy.trustCoachTitle}</h3>
          <p>{copy.trustCoachBody}</p>
          <div className={`seller-trust-next-action ${trustAction.tone}`}>
            <strong>{trustAction.title}</strong>
            <span>{trustAction.detail}</span>
          </div>
        </div>
        <button
          type="button"
          className="seller-primary-action"
          onClick={trustAction.run}
        >
          {trustAction.label}
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="seller-copilot-summary">
        <article>
          <ListChecks size={18} />
          <span>{copy.thingsToFix}</span>
          <strong>{manualWork}</strong>
          <p>{copy.groupedWork}</p>
        </article>
        <article>
          <ClipboardCheck size={18} />
          <span>{copy.trustPoints}</span>
          <strong>+{proofNav?.trust_lift_points ?? 0}</strong>
          <p>{proofNav?.rating_forecast ?? copy.approvedProofReducesDoubt}</p>
        </article>
        <article>
          <LineChart size={18} />
          <span>{copy.ratingChance}</span>
          <strong>{ratingText}</strong>
          <p>{ratingCount ? `${ratingCount.toLocaleString("en-IN")} ${copy.ratings}. ${forecast.detail}` : forecast.detail}</p>
        </article>
        <article className={blockerCount ? "risk" : "good"}>
          {blockerCount ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
          <span>{copy.accountReady}</span>
          <strong>{blockerCount ? copy.review : copy.clear}</strong>
          <p>{verificationStatus === "verified" ? `${liveProductCount} ${copy.productsTracked}` : copy.finishVerificationBeforeProof}</p>
        </article>
      </div>

      <div className="seller-copilot-grid">
        <article className={topProofTask ? topProofTask.priority : "good"}>
          <span className="eyebrow">{copy.buyerDoubts}</span>
          <h4>{topProofTask ? `${topProofTask.buyer_demand} buyer ask${topProofTask.buyer_demand === 1 ? "" : "s"} can be answered once` : copy.noBuyerProofAsk}</h4>
          <p>{topProofTask ? `${shortProductTitle(topProofTask.product_title)} needs ${proofTypeLabel(topProofTask.recommended_proof_type)} for ${labelize(topProofTask.attribute)}.` : copy.proofCenterClear}</p>
          <button type="button" className="seller-secondary-action" disabled={!topProofTask} onClick={() => topProofTask && onOpenProofTask(topProofTask)}>
            {copy.uploadProof}
          </button>
        </article>
        <article className={draftReadiness.tone}>
          <span className="eyebrow">{copy.newProductCheck}</span>
          <h4>{draftReadiness.score}/100 {copy.readyToSend}</h4>
          <p>{draftWarnings.find((warning) => warning.tone !== "good")?.detail ?? draftReadiness.message}</p>
          <button type="button" className="seller-secondary-action" onClick={onAddProduct}>
            {copy.checkListing}
          </button>
        </article>
        <article className={topCard?.priority ?? "good"}>
          <span className="eyebrow">{copy.productLosingTrust}</span>
          <h4>{topCard?.next_step || topCard?.action || copy.noUrgentProductFix}</h4>
          <p>{topCard?.buyer_impact || topCard?.issue_summary || copy.productFixesAppear}</p>
          <button
            type="button"
            className="seller-secondary-action"
            onClick={() => {
              if (topCardListing && shouldOpenSizeFix(topCardListing, topCard)) onOpenFix(topCardListing);
              else if (topCardListing) onOpenDetails(topCardListing);
              else onOpenConsole();
            }}
          >
            {topCardListing && shouldOpenSizeFix(topCardListing, topCard) ? copy.fixSize : copy.viewReason}
          </button>
        </article>
      </div>

      {focusRows.length > 0 && (
        <section className="seller-copilot-focus">
          <div className="seller-section-heading compact">
            <div>
              <span className="eyebrow">{copy.fixFirst}</span>
              <h3>{copy.productsLikelyAffectTrust}</h3>
            </div>
          </div>
          {focusRows.map((row) => (
            <article key={row.key} className={row.tone}>
              <img
                src={row.imageUrl || "/product-blue.svg"}
                alt={row.title}
                onError={(event) => { event.currentTarget.src = "/product-blue.svg"; }}
              />
              <div>
                <strong>{shortProductTitle(row.title)}</strong>
                <p>{row.suggestion}</p>
              </div>
              <div>
                {row.task && (
                  <button type="button" className="seller-primary-action" onClick={() => onOpenProofTask(row.task!)}>
                    {copy.proof}
                  </button>
                )}
                <button
                  type="button"
                  className="seller-secondary-action"
                  onClick={() => row.canFixSize ? onOpenFix(row.listing) : onOpenDetails(row.listing)}
                >
                  {row.canFixSize ? copy.fixSize : copy.plan}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

function SellerQuickActions({
  topProofTask,
  onOpenProofTask,
  onShowProducts,
  onAddProduct,
  copy
}: {
  topProofTask: SellerEvidenceCoachTask | null;
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
  onShowProducts: () => void;
  onAddProduct: () => void;
  copy: SellerCopy;
}) {
  return (
    <div className="seller-quick-actions" aria-label="Seller quick actions">
      <button
        type="button"
        className="seller-quick-action primary"
        disabled={!topProofTask}
        onClick={() => topProofTask && onOpenProofTask(topProofTask)}
      >
        <Camera size={15} />
        <span>{topProofTask ? `${copy.prepareProof}: ${shortProductTitle(topProofTask.product_title)}` : copy.noProofTask}</span>
      </button>
      <button type="button" className="seller-quick-action" onClick={onShowProducts}>
        <LineChart size={15} />
        <span>{copy.viewProductIssues}</span>
      </button>
      <button type="button" className="seller-quick-action" onClick={onAddProduct}>
        <Plus size={15} />
        <span>{copy.addProduct}</span>
      </button>
    </div>
  );
}

type SellerTrustOpsInsight = {
  key: string;
  label: string;
  value: string;
  detail: string;
  tone: "good" | "watch" | "risk" | "neutral";
  action?: string;
};

function SellerTrustOpsStrip({
  insights,
  onOpenProofTask,
  onShowProducts
}: {
  insights: SellerTrustOpsInsight[];
  onOpenProofTask?: () => void;
  onShowProducts: () => void;
}) {
  return (
    <section className="seller-trust-ops-strip" aria-label="Seller trust operations">
      {insights.map((item) => (
        <article key={item.key} className={item.tone}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          <p>{item.detail}</p>
          {item.action && (
            <button
              type="button"
              onClick={item.key === "proof_reuse" || item.key === "prepaid" ? onOpenProofTask : onShowProducts}
              disabled={(item.key === "proof_reuse" || item.key === "prepaid") && !onOpenProofTask}
            >
              {item.action}
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

function SellerProofImpactPanel({
  proofNav,
  proofAssets,
  tasks,
  ratingText,
  onOpenProofTask,
  copy
}: {
  proofNav: SellerProofNav;
  proofAssets: SellerProofAsset[];
  tasks: SellerEvidenceCoachTask[];
  ratingText: string;
  onOpenProofTask?: () => void;
  copy: SellerCopy;
}) {
  const forecast = ratingForecastLine(ratingText, proofNav.trust_lift_points, tasks.length);
  const rejected = proofAssets.filter((asset) => asset.status === "rejected").length;
  const inReview = proofAssets.filter((asset) => asset.status === "submitted").length;
  return (
    <section className="seller-proof-impact-panel" aria-label="Proof and rating forecast">
      <div>
        <span className="eyebrow">{copy.ratingChance}</span>
        <strong>{forecast.title}</strong>
        <p>{forecast.detail}</p>
      </div>
      <div className="seller-proof-impact-stats">
        <span><b>{proofNav.approved_count}</b> {copy.approved}</span>
        <span><b>{inReview}</b> {copy.adminChecking}</span>
        <span><b>{rejected}</b> {copy.needsRedo}</span>
        <span><b>+{proofNav.trust_lift_points}</b> {copy.trustPoints}</span>
      </div>
      {tasks.length > 0 && (
        <button type="button" className="seller-primary-action" onClick={onOpenProofTask} disabled={!onOpenProofTask}>
          {copy.uploadNextProof}
          <ChevronRight size={14} />
        </button>
      )}
    </section>
  );
}

function SellerUploadWarningList({ title, warnings }: { title: string; warnings: SellerUploadWarning[] }) {
  if (!warnings.length) return null;
  return (
    <section className="seller-upload-warning-list" aria-label={title}>
      <strong>{title}</strong>
      <div>
        {warnings.map((warning) => (
          <article key={warning.key} className={warning.tone}>
            {warning.tone === "good" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
            <span>
              <b>{warning.title}</b>
              <small>{warning.detail}</small>
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

type ProofDraftQuality = {
  score: number;
  label: string;
  checks: Array<{ label: string; passed: boolean }>;
};

function ProofDraftQualityPanel({ quality, reuseCount, copy }: { quality: ProofDraftQuality; reuseCount: number; copy: SellerCopy }) {
  return (
    <section className={`seller-proof-quality ${quality.score >= 75 ? "good" : quality.score >= 55 ? "watch" : "risk"}`}>
      <div className="seller-proof-quality-head">
        <div>
          <span>{copy.proofQualityCheck}</span>
          <strong>{quality.label}</strong>
        </div>
        <em>{quality.score}/100</em>
      </div>
      <div className="seller-proof-quality-checks">
        {quality.checks.map((check) => (
          <span key={check.label} className={check.passed ? "pass" : "wait"}>
            {check.passed ? copy.ok : "!"} {check.label}
          </span>
        ))}
      </div>
      <p>
        {reuseCount > 0
          ? `${copy.afterApprovalCanSupport} ${reuseCount} ${reuseCount === 1 ? copy.similarListingWithSameProof : copy.similarListingsWithSameProof}`
          : copy.proofCurrentListingOnly}
      </p>
    </section>
  );
}

function SellerActionBoardPanel({
  board,
  listings,
  tasks,
  onOpenDetails,
  onOpenFix,
  onOpenProofTask,
  copy
}: {
  board: SellerActionBoard;
  listings: SellerPanelListing[];
  tasks: SellerEvidenceCoachTask[];
  onOpenDetails: (listing: SellerPanelListing) => void;
  onOpenFix: (listing: SellerPanelListing) => void;
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
  copy: SellerCopy;
}) {
  const topCards = board.cards.slice(0, 5);
  const providerStatus = sellerCoachProviderStatus(board.agent.provider, copy);
  return (
    <section className="seller-action-board" aria-label="Product action board">
      <div className="seller-action-board-head">
        <div>
          <span className="eyebrow">{copy.actionPlan}</span>
          <h3>{copy.actionPlanTitle}</h3>
          <p>{board.summary}</p>
        </div>
        <div className="seller-action-board-head-actions">
          <span className={`seller-plan-chip ${providerStatus.tone}`}>{providerStatus.label}</span>
          <span className="seller-plan-chip">{copy.autoPrioritized}</span>
        </div>
      </div>

      <div className="seller-action-cards">
        {topCards.map((card) => {
          const listing = listings.find((item) => item.product.product_id === card.product_id) ?? null;
          const task = tasks.find((item) => item.product_id === card.product_id) ?? null;
          const canFixSize = Boolean(listing && (card.proof_type === "measurement_chart" || card.action.toLowerCase().includes("size")));
          const actionLabel = card.next_step || card.action;
          return (
            <article key={card.product_id} className={`seller-action-product-card ${card.priority}`}>
              <img
                src={card.image_url || "/product-blue.svg"}
                alt={card.product_title}
                onError={(event) => { event.currentTarget.src = "/product-blue.svg"; }}
              />
              <div className="seller-action-product-main">
                <div className="seller-action-product-top">
                  <strong>{shortProductTitle(card.product_title)}</strong>
                  <span>{card.metric}</span>
                </div>
                <p className="seller-coach-summary">{card.issue_summary || `${card.issue} is the main issue to fix.`}</p>
                <div className="seller-action-meta-grid">
                  <div>
                    <span>{copy.buyerWorry}</span>
                    <strong>{card.buyer_impact || card.why}</strong>
                  </div>
                  <div>
                    <span>{copy.doNow}</span>
                    <strong>{actionLabel}</strong>
                  </div>
                </div>
                <ul className="seller-trust-steps" aria-label="Trust steps">
                  {(card.trust_steps ?? []).slice(0, 3).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
              <div className="seller-action-product-side">
                <span className={`seller-status-pill ${card.priority === "high" ? "risk" : card.priority === "medium" ? "watch" : "good"}`}>
                  {card.priority}
                </span>
                <div className="seller-mini-score">
                  <strong>{Math.round(card.score)}</strong>
                  <span>{copy.trustScoreShort}</span>
                </div>
                {task ? (
                  <button type="button" className="seller-primary-action" onClick={() => onOpenProofTask(task)}>
                    {copy.addProof}
                  </button>
                ) : canFixSize && listing ? (
                  <button type="button" className="seller-primary-action" onClick={() => onOpenFix(listing)}>
                    {copy.fixSize}
                  </button>
                ) : listing ? (
                  <button type="button" className="seller-secondary-action" onClick={() => onOpenDetails(listing)}>
                    {copy.plan}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SellerRatingCoachPanel({ board, ratingText, copy }: { board: SellerActionBoard; ratingText: string; copy: SellerCopy }) {
  const plan = board.rating_plan ?? {
    title: "How to build buyer trust",
    summary: "Fix the biggest proof gaps first. Trust signals improve when product promises match delivery.",
    steps: ["Add proof for products with buyer asks", "Fix size charts where fit returns appear", "Keep fabric and daylight photos fresh"]
  };
  return (
    <section className="seller-rating-coach" aria-label="How to gain buyer trust">
      <div className="seller-rating-coach-main">
        <div className="seller-rating-coach-icon">
          <LineChart size={18} />
        </div>
        <div>
          <span className="eyebrow">{copy.improveTrustSignals}</span>
          <h3>{plan.title}</h3>
          <p>{plan.summary}</p>
        </div>
      </div>
      <div className="seller-rating-coach-score">
        <span>{copy.current}</span>
        <strong>{ratingText}</strong>
      </div>
      <div className="seller-rating-steps">
        {plan.steps.slice(0, 4).map((step, index) => (
          <article key={step}>
            <span>{index + 1}</span>
            <strong>{step}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function SellerReviewLoopPanel({
  onboarding,
  proofAssets,
  tasks,
  copy,
  onOpenProofTask,
  onAddProduct
}: {
  onboarding: SellerOnboardingResponse | null;
  proofAssets: SellerProofAsset[];
  tasks: SellerEvidenceCoachTask[];
  copy: SellerCopy;
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
  onAddProduct: () => void;
}) {
  const documentsInReview = (onboarding?.documents ?? []).filter((doc) => doc.status === "submitted" || doc.status === "under_review").length;
  const draftsInReview = (onboarding?.listing_drafts ?? []).filter((draft) => draft.status === "submitted").length;
  const draftsNeedingRevision = (onboarding?.listing_drafts ?? []).filter((draft) => draft.status === "needs_revision").length;
  const proofsInReview = proofAssets.filter((asset) => asset.status === "submitted").length;
  const rejectedProofs = proofAssets.filter((asset) => asset.status === "rejected").length;
  const approvedProofs = proofAssets.filter((asset) => asset.status === "verified").length;
  const adminQueue = documentsInReview + draftsInReview + proofsInReview;
  const sellerFixes = draftsNeedingRevision + rejectedProofs + tasks.length;
  const topTask = tasks[0] ?? null;
  const items = [
    {
      label: copy.adminQueue,
      value: adminQueue,
      detail: adminQueue ? copy.waitingForAdminDetail : copy.nothingWaitingAdminDetail,
      tone: adminQueue ? "watch" : "good"
    },
    {
      label: copy.needsSellerFix,
      value: sellerFixes,
      detail: sellerFixes ? copy.fixRejectedOrOpenDetail : copy.noSellerFixDetail,
      tone: sellerFixes ? "risk" : "good"
    },
    {
      label: copy.buyerVisibleProof,
      value: approvedProofs,
      detail: copy.approvedBuyerVisibleDetail,
      tone: approvedProofs ? "good" : "neutral"
    }
  ];

  return (
    <section className="seller-review-loop-panel" aria-label={copy.reviewLoopTitle}>
      <div className="seller-review-loop-head">
        <div>
          <span className="eyebrow">{copy.reviewLoop}</span>
          <h3>{copy.reviewLoopTitle}</h3>
          <p>{copy.reviewLoopBody}</p>
        </div>
        <button
          type="button"
          className="seller-secondary-action"
          onClick={() => topTask ? onOpenProofTask(topTask) : onAddProduct()}
        >
          {topTask ? copy.uploadNextProof : copy.prepareReviewItem}
        </button>
      </div>
      <div className="seller-review-loop-grid">
        {items.map((item) => (
          <article key={item.label} className={item.tone}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function SellerProductHealthTable({
  listings,
  tasks,
  actionCards,
  onOpenDetails,
  onOpenFix,
  onOpenProofTask
}: {
  listings: SellerPanelListing[];
  tasks: SellerEvidenceCoachTask[];
  actionCards: SellerActionBoard["cards"];
  onOpenDetails: (listing: SellerPanelListing) => void;
  onOpenFix: (listing: SellerPanelListing) => void;
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
}) {
  if (!listings.length) {
    return (
      <SellerEmptyState
        title="No products in this seller account"
        detail="Create a draft product and send it for review. Once live, product health appears here."
      />
    );
  }

  return (
    <div className="seller-health-board">
      {listings.map((listing) => {
        const task = proofTaskForProduct(tasks, listing.product.product_id);
        const coach = actionCards.find((card) => card.product_id === listing.product.product_id);
        const tone = task || listing.decision_status === "needs_seller_action" ? "risk" : listing.decision_status === "eligible_for_recommendation" ? "good" : "watch";
        return (
          <article key={listing.variant.variant_id} className={`seller-health-card ${tone}`}>
            <div className="seller-health-card-main">
              <img
                src={listing.product.image_url || "/product-blue.svg"}
                alt={listing.product.title}
                onError={(event) => { event.currentTarget.src = "/product-blue.svg"; }}
              />
              <div>
                <div className="seller-health-title-row">
                  <strong>{shortProductTitle(listing.product.title)}</strong>
                  <span className={`seller-status-pill ${tone}`}>{decisionStatusLabel(listing.decision_status)}</span>
                </div>
                <p>{coach?.issue_summary || listingImpactText(listing, task)}</p>
                <div className="seller-health-facts">
                  <span>{qualityScoreLabel(listing)} trust</span>
                  <span>{listing.metrics.delivered_orders_90d} orders</span>
                  <span>{listing.metrics.return_rate === null ? "New" : `${Math.round(listing.metrics.return_rate * 100)}% returns`}</span>
                </div>
              </div>
            </div>

            <div className="seller-health-action-panel">
              <div>
                <span className="seller-health-label">Buyer issue</span>
                <strong>{coach?.issue || productIssueLabel(listing, task)}</strong>
                <p>{coach?.buyer_impact || listingImpactText(listing, task)}</p>
              </div>
              <div>
                <span className="seller-health-label">Do now</span>
                <strong>{coach?.next_step || proofNeededLabel(listing, task)}</strong>
                <p>{coach?.rating_lift || "This keeps buyer trust clear before checkout."}</p>
              </div>
              <div className="seller-health-actions">
                {task && (
                  <button type="button" className="seller-primary-action" onClick={() => onOpenProofTask(task)}>
                    Add proof
                  </button>
                )}
                <button type="button" className="seller-secondary-action" onClick={() => onOpenDetails(listing)}>
                  Plan
                </button>
                <button type="button" className="seller-secondary-action" onClick={() => onOpenFix(listing)}>
                  Fix size
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function SellerProofLibraryPanel({
  tasks,
  listings,
  onOpenProofTask
}: {
  tasks: SellerEvidenceCoachTask[];
  listings: SellerPanelListing[];
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
}) {
  const proofTypes = [
    { title: "Daylight colour", detail: "Real colour, no filter.", icon: Camera },
    { title: "Fabric close-up", detail: "Shows thickness and texture.", icon: ShieldCheck },
    { title: "Size proof", detail: "Chest and length visible.", icon: LineChart },
    { title: "Dispatch proof", detail: "Builds prepaid trust.", icon: CheckCircle2 }
  ];

  return (
    <section className="seller-workbench-panel">
      <div className="seller-section-heading clean">
        <div>
          <span className="eyebrow">Evidence queue</span>
          <h3>Open proof work from buyer doubts</h3>
          <p>Prepare the exact proof needed for buyer trust. Submitted proof status lives in the top Proof center.</p>
        </div>
        <span className="seller-status-pill watch">{tasks.length} open</span>
      </div>

      <div className="seller-proof-type-grid">
        {proofTypes.map((item) => {
          const Icon = item.icon;
          return (
          <article key={item.title}>
            <Icon size={18} />
            <strong>{item.title}</strong>
            <p>{item.detail}</p>
          </article>
          );
        })}
      </div>

      <div className="seller-section-heading compact">
        <div>
          <span className="eyebrow">Still needed</span>
          <h3>{tasks.length ? `${tasks.length} proof task${tasks.length === 1 ? "" : "s"} from buyer asks` : "No proof task"}</h3>
        </div>
      </div>

      {tasks.length ? (
        <div className="seller-proof-work-list">
          {tasks.map((task) => {
            const listing = listings.find((item) => item.product.product_id === task.product_id);
            return (
            <article key={proofTaskId(task)} className={`seller-proof-work-row ${task.priority}`}>
              <img
                src={listing?.product.image_url || "/product-blue.svg"}
                alt={task.product_title}
                onError={(event) => { event.currentTarget.src = "/product-blue.svg"; }}
              />
              <div className="seller-proof-work-main">
                <div className="seller-proof-work-title">
                  <strong>{shortProductTitle(task.product_title)}</strong>
                  <span>{task.buyer_demand} asks</span>
                </div>
                  <p><b>{labelize(task.attribute)} doubt</b> | {proofTypeLabel(task.recommended_proof_type)}</p>
                <small>{sellerFriendlyProofReason(task)}</small>
              </div>
              <div className="seller-proof-work-action">
                <span className={`seller-status-pill ${task.priority === "high" ? "risk" : "watch"}`}>{task.priority}</span>
                <button type="button" className="seller-primary-action" onClick={() => onOpenProofTask(task)}>
                  Prepare
                </button>
              </div>
            </article>
            );
          })}
        </div>
      ) : (
        <SellerEmptyState title="Proof queue is clear" detail="Keep product photos fresh. New buyer doubts will appear here automatically." />
      )}
    </section>
  );
}

function SellerProofLedger({
  proofAssets,
  tasks,
  onOpenProofTask
}: {
  proofAssets: SellerProofAsset[];
  tasks: SellerEvidenceCoachTask[];
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
}) {
  if (!proofAssets.length) {
    return (
      <section className="seller-proof-ledger empty">
        <strong>No uploaded proof yet</strong>
        <p>Use an open buyer ask to submit proof. Admin status will appear here after upload.</p>
      </section>
    );
  }

  return (
    <section className="seller-proof-ledger" aria-label="Uploaded proof review status">
      <div className="seller-section-heading compact">
        <div>
          <span className="eyebrow">Uploaded proofs</span>
          <h3>Admin review status</h3>
        </div>
      </div>
      <div className="seller-proof-ledger-list">
        {proofAssets.map((asset) => {
          const matchingTask = tasks.find((task) => task.product_id === asset.product_id && task.attribute === asset.attribute);
          return (
            <article key={asset.proof_id} className={`seller-proof-ledger-row ${proofStatusTone(asset.status)}`}>
              <img
                src={asset.product_image_url || "/product-blue.svg"}
                alt={asset.product_title}
                onError={(event) => { event.currentTarget.src = "/product-blue.svg"; }}
              />
              <div className="seller-proof-ledger-main">
                <div className="seller-proof-ledger-top">
                  <strong>{shortProductTitle(asset.product_title)}</strong>
                  <span className={`seller-status-pill ${proofStatusTone(asset.status)}`}>{proofStatusLabel(asset.status)}</span>
                </div>
                <p>{proofTypeLabel(asset.proof_type)} for {labelize(asset.attribute)} | {asset.quality_label}</p>
                <small>
                  {asset.status === "rejected"
                    ? asset.review_notes || "Admin rejected this proof. Upload a clearer file that matches the product claim."
                    : asset.status === "verified"
                      ? asset.review_notes || "Approved proof is now buyer-visible evidence."
                      : "Admin is checking this proof before it affects buyer trust."}
                </small>
              </div>
              <div className="seller-proof-ledger-side">
                <span>Quality {asset.quality_score}/100</span>
                <strong>+{asset.trust_lift_points}</strong>
                {asset.status === "rejected" && matchingTask && (
                  <button type="button" className="seller-secondary-action" onClick={() => onOpenProofTask(matchingTask)}>
                    Redo
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SellerProofSuggestionPanel({
  proofNav,
  tasks,
  proofAssets,
  onOpenProofTask
}: {
  proofNav: SellerProofNav | null;
  tasks: SellerEvidenceCoachTask[];
  proofAssets: SellerProofAsset[];
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
}) {
  const suggestions = buildProofSuggestions(proofNav, tasks, proofAssets);
  const topTask = tasks[0] ?? null;
  return (
    <section className="seller-proof-suggestion-panel" aria-label="Sarthi proof suggestions">
      <div className="seller-section-heading compact">
        <div>
          <span className="eyebrow">Sarthi coach</span>
          <h3>What to do after admin review</h3>
        </div>
        {topTask && (
          <button type="button" className="seller-secondary-action" onClick={() => onOpenProofTask(topTask)}>
            Prepare next proof
          </button>
        )}
      </div>
      <div className="seller-proof-suggestion-grid">
        {suggestions.map((suggestion) => (
          <article key={suggestion.title} className={suggestion.tone}>
            {suggestion.tone === "good" ? <CheckCircle2 size={16} /> : suggestion.tone === "risk" ? <AlertTriangle size={16} /> : <ListChecks size={16} />}
            <div>
              <strong>{suggestion.title}</strong>
              <p>{suggestion.detail}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SellerPerformancePanel({
  panel,
  selectedClusterId,
  onClusterChange
}: {
  panel: SellerPanelResponse;
  selectedClusterId: string;
  onClusterChange: (clusterId: string) => void;
}) {
  return (
    <section className="seller-workbench-panel">
      <div className="seller-section-heading clean">
        <div>
          <span className="eyebrow">Compare</span>
          <h3>{panel.cluster.label}</h3>
          <p>Masked market context. You see your position, not private buyer profiles.</p>
        </div>
        <label className="seller-cluster-select">
          Product cluster
          <select value={selectedClusterId} onChange={(event) => onClusterChange(event.target.value)}>
            {panel.seller.cluster_ids.map((clusterId) => (
              <option key={clusterId} value={clusterId}>
                {clusterLabel(clusterId)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="seller-overview-grid performance">
        <SellerMetricCard label="Seller options" value={String(panel.cluster.seller_count)} detail={`${panel.cluster.listing_count} comparable listings`} tone="neutral" />
        <SellerMetricCard label="Median returns" value={panel.cluster.stats.median_return_rate === null ? "N/A" : `${Math.round(panel.cluster.stats.median_return_rate * 100)}%`} detail={`${panel.cluster.stats.delivered_orders_90d} delivered orders`} tone="watch" />
        <SellerMetricCard label="Dispatch median" value={panel.cluster.stats.median_dispatch_hours === null ? "N/A" : `${panel.cluster.stats.median_dispatch_hours}h`} detail="Cluster benchmark" tone="neutral" />
        <SellerMetricCard label="Facts used" value={String(panel.fact_ids.length)} detail={labelize(panel.data_freshness.overall_status)} tone={panel.data_freshness.blocking ? "risk" : "good"} />
      </div>

      <div className="seller-performance-grid">
        <div className="seller-health-table-wrap">
          <table className="seller-health-table compact">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Kept rate</th>
                <th>Top issue</th>
                <th>Rank</th>
              </tr>
            </thead>
            <tbody>
              {panel.seller_listings.map((listing) => (
                <tr key={listing.variant.variant_id}>
                  <td>{shortProductTitle(listing.product.title)}</td>
                  <td>{formatRate(listing.metrics.kept_rate)}</td>
                  <td>{listing.top_issue ? `${listing.top_issue.count} ${labelize(listing.top_issue.return_reason)}` : "No major issue"}</td>
                  <td>{listing.cluster_position ? `#${listing.cluster_position}` : "Pending"}</td>
                </tr>
              ))}
              {panel.competing_listings.map((listing, index) => (
                <tr key={listing.variant.variant_id}>
                  <td>Other seller #{index + 1}</td>
                  <td>{formatRate(listing.metrics.kept_rate)}</td>
                  <td>{listing.top_issue ? labelize(listing.top_issue.return_reason) : "No major issue"}</td>
                  <td>Masked</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="seller-policy-panel">
          <span className="eyebrow">What affects ranking</span>
          <h3>Inputs used for ranking</h3>
          <div>
            {panel.decision_policy.inputs_used.map((input) => (
              <span key={input}>{labelize(input)}</span>
            ))}
          </div>
          <p>Not used: {panel.decision_policy.inputs_not_used.map(labelize).join(", ") || "none"}</p>
        </aside>
      </div>
    </section>
  );
}

function SellerEmptyState({
  title,
  detail,
  action,
  onAction
}: {
  title: string;
  detail: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <section className="seller-empty-state">
      <strong>{title}</strong>
      <p>{detail}</p>
      {action && onAction && (
        <button type="button" className="seller-primary-action" onClick={onAction}>
          {action}
        </button>
      )}
    </section>
  );
}

function SellerAgentInsight({ insight, copy }: { insight: SellerInsight; copy: SellerCopy }) {
  return (
    <section className={`seller-agent-insight ${insight.tone}`}>
      <div className="seller-agent-insight-icon">
        <ListChecks size={18} />
      </div>
      <div>
        <span className="eyebrow">{copy.thisWeek}</span>
        <strong>{insight.title}</strong>
        <p>{insight.summary}</p>
      </div>
      <span className="seller-agent-insight-action">{insight.action}</span>
    </section>
  );
}

type SellerInsight = {
  title: string;
  summary: string;
  action: string;
  tone: "good" | "watch" | "risk";
};

function buildSellerInsight(
  panel: SellerPanelResponse | null,
  evidenceCoach: SellerEvidenceCoachResponse | null,
  onboarding: SellerOnboardingResponse | null,
  copy: SellerCopy
): SellerInsight {
  if (panel?.action_board) {
    const firstPriority = panel.action_board.cards[0]?.priority ?? "low";
    return {
      title: panel.action_board.headline,
      summary: panel.action_board.summary,
      action: copy.plan,
      tone: firstPriority === "high" ? "risk" : firstPriority === "medium" ? "watch" : "good"
    };
  }
  if (evidenceCoach?.tasks.length) {
    const topTask = [...evidenceCoach.tasks].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))[0];
    return {
      title: `${topTask.buyer_demand} buyer proof request(s) need ${labelize(topTask.attribute)}`,
      summary: `${topTask.product_title.split("-")[0].trim()} should get ${topTask.recommended_proof_type.replace(/_/g, " ")} before buyer trust improves.`,
      action: copy.addProof,
      tone: topTask.priority === "high" ? "risk" : "watch"
    };
  }
  const listingWithIssue = panel?.seller_listings.find((listing) => listing.top_issue || listing.action_items.length);
  if (listingWithIssue?.top_issue) {
    return {
      title: `${listingWithIssue.top_issue.count} ${labelize(listingWithIssue.top_issue.return_reason)} complaints detected`,
      summary: "Update proof or measurement before this issue becomes a bigger return pattern.",
      action: copy.checkListing,
      tone: "watch"
    };
  }
  if (onboarding?.seller_verification.verification_status !== "verified") {
    return {
      title: "Verification is the next blocker",
      summary: "Upload GST, PAN, address, and bank proof so listings can move from draft to buyer feed.",
      action: copy.uploadDocsReview,
      tone: "watch"
    };
  }
  return {
    title: "Listings are stable this week",
    summary: "No urgent proof gap is open. Keep measurement and fabric photos updated before new buyer doubts appear.",
    action: copy.clear,
    tone: "good"
  };
}

function productDraftWarnings(input: {
  title: string;
  category: string;
  garmentType: string;
  fabric: string;
  color: string;
  price: number;
  imageUrl: string;
  verificationStatus: string;
}, copy: SellerCopy): SellerUploadWarning[] {
  const warnings: SellerUploadWarning[] = [];
  const title = input.title.trim().toLowerCase();
  const garment = input.garmentType.trim().toLowerCase();
  const image = input.imageUrl.trim();
  if (input.verificationStatus !== "verified") {
    warnings.push({
      key: "seller-verification",
      title: copy.verificationBlocksTitle,
      detail: copy.verificationBlocksDetail,
      tone: "risk"
    });
  }
  if (!image) {
    warnings.push({
      key: "missing-image",
      title: copy.productImageMissingTitle,
      detail: copy.productImageMissingDetail,
      tone: "risk"
    });
  } else if (!isRecognizedAssetReference(image)) {
    warnings.push({
      key: "image-reference",
      title: copy.imageReferenceWrongTitle,
      detail: copy.imageReferenceWrongDetail,
      tone: "risk"
    });
  }
  if (input.title.trim().length < 8) {
    warnings.push({
      key: "short-title",
      title: copy.titleThinTitle,
      detail: copy.titleThinDetail,
      tone: "watch"
    });
  }
  if (garment && title && !title.includes(garment.split(" ")[0])) {
    warnings.push({
      key: "title-type-mismatch",
      title: copy.titleTypeMismatchTitle,
      detail: copy.titleTypeMismatchDetail,
      tone: "watch"
    });
  }
  if (!Number.isFinite(input.price) || input.price < 100) {
    warnings.push({
      key: "price",
      title: copy.priceInvalidTitle,
      detail: copy.priceInvalidDetail,
      tone: "risk"
    });
  }
  if (input.fabric.trim().length < 3 || input.color.trim().length < 3 || input.category.trim().length < 3) {
    warnings.push({
      key: "taxonomy",
      title: copy.factsIncompleteTitle,
      detail: copy.factsIncompleteDetail,
      tone: "watch"
    });
  }
  if (!warnings.length) {
    warnings.push({
      key: "ready",
      title: copy.uploadReadyTitle,
      detail: copy.uploadReadyDetail,
      tone: "good"
    });
  }
  return warnings;
}

function proofUploadWarnings(
  task: SellerEvidenceCoachTask,
  draft: { title: string; description: string; assetUrl: string },
  copy: SellerCopy
): SellerUploadWarning[] {
  const warnings: SellerUploadWarning[] = [];
  const asset = draft.assetUrl.trim();
  if (!asset) {
    warnings.push({
      key: "proof-file",
      title: copy.proofFileMissingTitle,
      detail: `${proofTypeLabel(task.recommended_proof_type)} is required for ${labelize(task.attribute)}.`,
      tone: "risk"
    });
  } else if (!isRecognizedAssetReference(asset)) {
    warnings.push({
      key: "proof-reference",
      title: copy.proofReferenceWrongTitle,
      detail: copy.proofReferenceWrongDetail,
      tone: "risk"
    });
  }
  if (!proofTypeMatchesAttribute(task.attribute, task.recommended_proof_type)) {
    warnings.push({
      key: "proof-type",
      title: copy.proofTypeMismatchTitle,
      detail: `${labelize(task.attribute)} needs ${proofTypeLabel(recommendedProofTypeForAttribute(task.attribute))}.`,
      tone: "risk"
    });
  }
  if (draft.description.trim().length < 30) {
    warnings.push({
      key: "proof-description",
      title: copy.explainProofTitle,
      detail: copy.explainProofDetail,
      tone: "watch"
    });
  }
  if (draft.title.trim().length < 8) {
    warnings.push({
      key: "proof-title",
      title: copy.proofTitleTooShortTitle,
      detail: copy.proofTitleTooShortDetail,
      tone: "watch"
    });
  }
  if (!warnings.length) {
    warnings.push({
      key: "proof-ready",
      title: copy.proofReadyTitle,
      detail: copy.proofReadyDetail,
      tone: "good"
    });
  }
  return warnings;
}

function buildProofSuggestions(
  proofNav: SellerProofNav | null,
  tasks: SellerEvidenceCoachTask[],
  proofAssets: SellerProofAsset[]
): Array<{ title: string; detail: string; tone: "good" | "watch" | "risk" }> {
  const suggestions: Array<{ title: string; detail: string; tone: "good" | "watch" | "risk" }> = [];
  const rejected = proofAssets.filter((asset) => asset.status === "rejected");
  const inReview = proofAssets.filter((asset) => asset.status === "submitted");
  const approved = proofAssets.filter((asset) => asset.status === "verified");
  const topTask = [...tasks].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority))[0];

  if (rejected.length) {
    const asset = rejected[0];
    suggestions.push({
      title: `Redo ${proofTypeLabel(asset.proof_type)} for ${shortProductTitle(asset.product_title)}`,
      detail: asset.review_notes || "Admin rejected this proof. Upload a clearer file that matches the exact product claim.",
      tone: "risk"
    });
  }

  if (topTask) {
    suggestions.push({
      title: `${topTask.buyer_demand} buyer asks need ${proofTypeLabel(topTask.recommended_proof_type)}`,
      detail: `${shortProductTitle(topTask.product_title)} should be handled before adding generic photos.`,
      tone: topTask.priority === "high" ? "risk" : "watch"
    });
  }

  if (inReview.length) {
    suggestions.push({
      title: `${inReview.length} proof${inReview.length === 1 ? "" : "s"} under admin review`,
      detail: "Avoid resubmitting the same proof while review is pending. Use this time to prepare the next high-demand proof.",
      tone: "watch"
    });
  }

  if (approved.length) {
    suggestions.push({
      title: `${approved.length} approved proof${approved.length === 1 ? "" : "s"} can protect trust`,
      detail: proofNav?.rating_forecast ?? "Approved proof becomes buyer-visible evidence and can reduce repeat doubts.",
      tone: "good"
    });
  }

  if (proofNav && proofNav.trust_lift_points > 0) {
    suggestions.push({
      title: `+${proofNav.trust_lift_points} trust lift already unlocked`,
      detail: "Keep improving proof coverage on products with weak evidence before pushing prepaid or high-volume traffic.",
      tone: "good"
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      title: "No submitted proof yet",
      detail: "Start with the highest-demand buyer ask. The submitted proof and admin status will appear here.",
      tone: "watch"
    });
  }

  return suggestions.slice(0, 4);
}

type SellerListingLabRow = {
  key: string;
  listing: SellerPanelListing;
  task: SellerEvidenceCoachTask | null;
  canFixSize: boolean;
  title: string;
  imageUrl: string | null;
  scoreLabel: string;
  issue: string;
  suggestion: string;
  tone: "good" | "watch" | "risk";
};

function buildListingLabRows(
  listings: SellerPanelListing[],
  tasks: SellerEvidenceCoachTask[],
  actionCards: SellerActionBoard["cards"]
): SellerListingLabRow[] {
  return listings.map((listing) => {
    const task = proofTaskForProduct(tasks, listing.product.product_id);
    const coach = actionCards.find((card) => card.product_id === listing.product.product_id);
    const tone: SellerListingLabRow["tone"] = task || listing.decision_status === "needs_seller_action"
      ? "risk"
      : listing.decision_status === "eligible_for_recommendation" && (listing.quality_score ?? 0) >= 70
        ? "good"
        : "watch";
    const scoreLabel = listing.quality_score === null ? "New" : `${Math.round(listing.quality_score)} trust`;
    const issue = coach?.issue_summary || productIssueLabel(listing, task);
    const suggestion = task
      ? `Add ${proofTypeLabel(task.recommended_proof_type)} for ${labelize(task.attribute)} so admin can clear the buyer doubt.`
      : coach?.next_step || coach?.rating_lift || proofNeededLabel(listing, task);

    return {
      key: listing.variant.variant_id,
      listing,
      task,
      canFixSize: shouldOpenSizeFix(listing, coach ?? null),
      title: listing.product.title,
      imageUrl: listing.product.image_url,
      scoreLabel,
      issue,
      suggestion,
      tone
    };
  }).sort((a, b) => priorityRankForTone(a.tone) - priorityRankForTone(b.tone));
}

function buildTrustCoachAction({
  verificationStatus,
  topProofTask,
  topCard,
  topCardListing,
  draftWarnings,
  onOpenProofTask,
  onOpenDetails,
  onOpenFix,
  onAddProduct,
  onOpenConsole,
  copy
}: {
  verificationStatus: string;
  topProofTask: SellerEvidenceCoachTask | null;
  topCard: SellerActionBoard["cards"][number] | null;
  topCardListing: SellerPanelListing | null;
  draftWarnings: SellerUploadWarning[];
  onOpenProofTask: (task: SellerEvidenceCoachTask) => void;
  onOpenDetails: (listing: SellerPanelListing) => void;
  onOpenFix: (listing: SellerPanelListing) => void;
  onAddProduct: () => void;
  onOpenConsole: () => void;
  copy: SellerCopy;
}): { label: string; title: string; detail: string; tone: "good" | "watch" | "risk"; run: () => void } {
  if (verificationStatus !== "verified") {
    return {
      label: copy.uploadDocsReview,
      title: copy.finishVerificationBeforeProof,
      detail: copy.uploadSellerProof,
      tone: "risk",
      run: onAddProduct
    };
  }

  if (topCardListing && shouldOpenSizeFix(topCardListing, topCard)) {
    return {
      label: copy.fixSize,
      title: `${shortProductTitle(topCardListing.product.title)} needs clearer size proof`,
      detail: topCard?.buyer_impact || "Wrong size information can create returns and lower trust.",
      tone: topCard?.priority === "high" ? "risk" : "watch",
      run: () => onOpenFix(topCardListing)
    };
  }

  if (topProofTask) {
    return {
      label: copy.uploadProof,
      title: `${topProofTask.buyer_demand} buyer ask${topProofTask.buyer_demand === 1 ? "" : "s"} need proof`,
      detail: `${shortProductTitle(topProofTask.product_title)} needs ${proofTypeLabel(topProofTask.recommended_proof_type)} for ${labelize(topProofTask.attribute)}.`,
      tone: topProofTask.priority === "high" ? "risk" : "watch",
      run: () => onOpenProofTask(topProofTask)
    };
  }

  if (topCardListing) {
    return {
      label: copy.plan,
      title: topCard?.next_step || topCard?.action || "Review this product first",
      detail: topCard?.issue_summary || topCard?.buyer_impact || "This product has the next highest trust improvement opportunity.",
      tone: topCard?.priority === "high" ? "risk" : topCard?.priority === "medium" ? "watch" : "good",
      run: () => onOpenDetails(topCardListing)
    };
  }

  const draftWarning = draftWarnings.find((warning) => warning.tone !== "good");
  if (draftWarning) {
    return {
      label: copy.checkListing,
      title: draftWarning.title,
      detail: draftWarning.detail,
      tone: draftWarning.tone,
      run: onAddProduct
    };
  }

  return {
    label: copy.sellerConsole,
    title: copy.noUrgentProductFix,
    detail: copy.proofCenterClear,
    tone: "good",
    run: onOpenConsole
  };
}

function shouldOpenSizeFix(listing: SellerPanelListing, card?: SellerActionBoard["cards"][number] | null) {
  const issueText = `${card?.action ?? ""} ${card?.issue ?? ""} ${card?.next_step ?? ""} ${card?.proof_type ?? ""}`.toLowerCase();
  return issueText.includes("size") ||
    issueText.includes("measurement") ||
    card?.proof_type === "measurement_chart" ||
    (listing.metrics.fit_as_expected_rate !== null && listing.metrics.fit_as_expected_rate < 0.85);
}

function priorityRankForTone(tone: "good" | "watch" | "risk") {
  if (tone === "risk") return 0;
  if (tone === "watch") return 1;
  return 2;
}

function ratingForecastLine(ratingText: string, trustLiftPoints: number, openTasks: number) {
  const current = Number(ratingText);
  if (!Number.isFinite(current)) {
    return {
      title: "Build first rating signal",
      detail: "Approved proof and kept orders can create a stronger first trust base."
    };
  }
  const possibleLift = Math.min(0.3, Math.max(0, trustLiftPoints / 75));
  const target = Math.min(5, current + possibleLift);
  if (trustLiftPoints <= 0 && openTasks > 0) {
    return {
      title: `${current.toFixed(1)} can improve after proof`,
      detail: `${openTasks} open proof task${openTasks === 1 ? "" : "s"} still limit buyer confidence.`
    };
  }
  return {
    title: `${current.toFixed(1)} -> ${target.toFixed(1)} potential`,
    detail: "This is a trust-lift forecast, not a guaranteed marketplace rating change."
  };
}

function draftReadinessScore(input: {
  title: string;
  category: string;
  garmentType: string;
  fabric: string;
  color: string;
  price: number;
  imageUrl: string;
  verified: boolean;
}, copy: SellerCopy) {
  const checks = [
    input.title.trim().length >= 8,
    input.category.trim().length >= 3,
    input.garmentType.trim().length >= 3,
    input.fabric.trim().length >= 3,
    input.color.trim().length >= 3,
    Number.isFinite(input.price) && input.price >= 100,
    input.imageUrl.trim().length > 0,
    input.verified
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return {
    score,
    tone: score >= 75 ? "good" : score >= 50 ? "watch" : "risk",
    message: !input.verified
      ? copy.readinessBlockedByVerification
      : score >= 75
        ? copy.readinessGood
        : copy.readinessIncomplete
  };
}

function proofTaskForProduct(tasks: SellerEvidenceCoachTask[], productId: string) {
  return tasks.find((task) => task.product_id === productId) ?? null;
}

function shortProductTitle(title: string) {
  return title.split("-")[0].trim();
}

function qualityScoreLabel(listing: SellerPanelListing) {
  if (listing.quality_score === null) return "New";
  return `${Math.round(listing.quality_score)}/100`;
}

function formatRate(value: number | null) {
  if (value === null) return "N/A";
  return `${Math.round(value * 100)}%`;
}

function productIssueLabel(listing: SellerPanelListing, task: SellerEvidenceCoachTask | null) {
  if (listing.top_issue) {
    return `${listing.top_issue.count} ${labelize(listing.top_issue.return_reason)}`;
  }
  if (task) return labelize(task.attribute);
  if (listing.metrics.evidence_strength === "weak" || listing.metrics.evidence_strength === "unknown") {
    return "New data";
  }
  return "No major issue";
}

function proofNeededLabel(listing: SellerPanelListing, task: SellerEvidenceCoachTask | null) {
  if (task) return proofTypeLabel(task.recommended_proof_type);
  const highPriorityAction = listing.action_items.find((action) => action.priority === "high") ?? listing.action_items[0];
  if (highPriorityAction) return highPriorityAction.title;
  if (listing.metrics.fit_as_expected_rate !== null && listing.metrics.fit_as_expected_rate < 0.85) return "Clear size chart";
  if (listing.metrics.color_match_rate !== null && listing.metrics.color_match_rate < 0.9) return "Daylight colour photo";
  return "Keep proof updated";
}

function buildSellerTrustOps(
  listings: SellerPanelListing[],
  tasks: SellerEvidenceCoachTask[],
  board: SellerActionBoard | null,
  verificationStatus: string,
  ratingText: string,
  copy: SellerCopy
): SellerTrustOpsInsight[] {
  const totalAsks = tasks.reduce((sum, task) => sum + task.buyer_demand, 0);
  const topTask = tasks[0] ?? null;
  const spikeCard = board?.cards.find((card) => card.priority === "high" && (card.metric.includes("returns") || card.issue.toLowerCase().includes("return")))
    ?? board?.cards.find((card) => card.priority === "high");
  const thinEvidence = listings.filter((listing) => listing.metrics.evidence_strength === "weak" || listing.metrics.evidence_strength === "unknown").length;
  const prepaidReady = listings.filter((listing) =>
    listing.metrics.median_dispatch_hours <= 24 &&
    listing.metrics.evidence_strength !== "unknown" &&
    (listing.metrics.return_rate ?? 0.12) <= 0.18
  ).length;
  const reuseCount = topTask ? proofReuseCandidates(topTask, listings).length : 0;

  return [
    {
      key: "doubt_cluster",
      label: copy.buyerDoubts,
      value: totalAsks ? `${totalAsks} asks` : "Clear",
      detail: totalAsks ? "Repeated questions are grouped into proof tasks." : "No repeated proof doubt is open.",
      tone: totalAsks ? "watch" : "good",
      action: totalAsks ? copy.prepareProof : undefined
    },
    {
      key: "return_spike",
      label: copy.returnSpike,
      value: spikeCard ? spikeCard.metric : "Stable",
      detail: spikeCard ? `${shortProductTitle(spikeCard.product_title)} needs attention first.` : "No urgent return spike in live listings.",
      tone: spikeCard ? "risk" : "good",
      action: spikeCard ? copy.viewProducts : undefined
    },
    {
      key: "rating_protection",
      label: copy.ratingProtection,
      value: ratingText,
      detail: verificationStatus === "verified"
        ? `${thinEvidence} low-evidence listing${thinEvidence === 1 ? "" : "s"} can improve without exposing buyer data.`
        : "Finish verification before buyer-visible trust can grow.",
      tone: verificationStatus === "verified" ? "good" : "watch",
      action: thinEvidence ? copy.viewProducts : undefined
    },
    {
      key: "proof_reuse",
      label: copy.proofReuse,
      value: reuseCount ? `${reuseCount} matches` : "Ready",
      detail: reuseCount ? "One approved proof can support similar listings." : "Next proof will be checked for reuse.",
      tone: reuseCount ? "good" : "neutral",
      action: topTask ? copy.useProof : undefined
    },
    {
      key: "prepaid",
      label: copy.prepaidTrust,
      value: `${prepaidReady}/${Math.max(1, listings.length)}`,
      detail: "Fast dispatch plus clear packaging proof helps buyers trust prepaid.",
      tone: prepaidReady ? "good" : "watch",
      action: topTask ? copy.addProof : undefined
    },
    {
      key: "approved_loop",
      label: copy.approvedLoop,
      value: board?.cards.some((card) => card.score >= 70) ? "Visible" : "Building",
      detail: "Approved proof becomes buyer-facing evidence, not just an admin file.",
      tone: board?.cards.some((card) => card.score >= 70) ? "good" : "watch"
    }
  ];
}

function proofDraftQuality(task: SellerEvidenceCoachTask, draft: { title: string; description: string; assetUrl: string }, copy: SellerCopy): ProofDraftQuality {
  const asset = draft.assetUrl.trim();
  const title = draft.title.trim();
  const description = draft.description.trim();
  const isReference = isRecognizedAssetReference(asset);
  const mentionsProduct = description.toLowerCase().includes(shortProductTitle(task.product_title).toLowerCase().split(" ")[0] ?? "");
  const checks = [
    { label: copy.proofFileAdded, passed: isReference },
    { label: copy.clearTitle, passed: title.length >= 8 },
    { label: copy.explainsBuyerAsked, passed: description.length >= 30 },
    { label: copy.matchesProduct, passed: mentionsProduct || asset.includes(task.product_id) },
    { label: proofTypeLabel(task.recommended_proof_type), passed: Boolean(task.recommended_proof_type) }
  ];
  const baseScore = Math.min(100,
    (isReference ? 40 : 0) +
    (title.length >= 8 ? 15 : 0) +
    (description.length >= 30 ? 20 : 0) +
    (mentionsProduct || asset.includes(task.product_id) ? 15 : 0) +
    (task.recommended_proof_type ? 10 : 0)
  );
  const score = isReference ? baseScore : Math.min(50, baseScore);
  return {
    score,
    label: !isReference ? copy.addProofFile : score >= 80 ? copy.readyForReview : score >= 55 ? copy.almostReady : copy.improveBeforeSubmit,
    checks
  };
}

function proofReuseCandidates(task: SellerEvidenceCoachTask, listings: SellerPanelListing[]) {
  const current = listings.find((listing) => listing.product.product_id === task.product_id);
  return listings.filter((listing) =>
    listing.product.product_id !== task.product_id &&
    listing.product.cluster_id === current?.product.cluster_id &&
    (
      listing.product.fabric === current?.product.fabric ||
      listing.product.color_family === current?.product.color_family ||
      task.attribute === "size"
    )
  );
}

function suggestedProofTitle(task: SellerEvidenceCoachTask) {
  if (task.recommended_proof_type === "daylight_photo") return `${labelize(task.attribute)} daylight proof`;
  if (task.recommended_proof_type === "fabric_closeup") return "Fabric close-up proof";
  if (task.recommended_proof_type === "measurement_chart") return "Size measurement proof";
  if (task.recommended_proof_type === "packaging_photo") return "Packaging proof";
  return `${labelize(task.attribute)} proof`;
}

function suggestedProofDescription(task: SellerEvidenceCoachTask) {
  const productName = shortProductTitle(task.product_title);
  if (task.recommended_proof_type === "measurement_chart") {
    return `${productName}: chest and length measurements are shown clearly for ${labelize(task.attribute)} questions.`;
  }
  if (task.recommended_proof_type === "fabric_closeup") {
    return `${productName}: close fabric photo shows texture, thickness, and transparency clearly.`;
  }
  if (task.recommended_proof_type === "daylight_photo") {
    return `${productName}: daylight photo shows real colour without filters.`;
  }
  return `${productName}: seller proof answers the buyer doubt about ${labelize(task.attribute)}.`;
}

function suggestedProofDraft(task: SellerEvidenceCoachTask, listing?: SellerPanelListing | null) {
  return {
    title: suggestedProofTitle(task),
    description: suggestedProofDescription(task),
    assetUrl: suggestedProofAssetReference(task, listing),
    assetHint: suggestedProofAssetHint(task)
  };
}

function suggestedProofAssetReference(task: SellerEvidenceCoachTask, listing?: SellerPanelListing | null) {
  if (listing?.product.image_url && task.recommended_proof_type === "daylight_photo" && listing.product.image_url.startsWith("data:image/")) {
    return listing.product.image_url;
  }
  return "";
}

function suggestedProofAssetHint(task: SellerEvidenceCoachTask) {
  if (task.recommended_proof_type === "measurement_chart") {
    return "Upload a size chart or measurement photo where chest/length values are readable.";
  }
  if (task.recommended_proof_type === "fabric_closeup") {
    return "Upload a close fabric photo showing texture, thickness, and transparency.";
  }
  if (task.recommended_proof_type === "daylight_photo") {
    return "Upload a daylight product photo or paste the real image URL admin should inspect.";
  }
  if (task.recommended_proof_type === "packaging_photo") {
    return "Upload packaging proof that shows how the shipped product is protected.";
  }
  return "Upload the actual proof file or paste a real URL admin can inspect.";
}

function sellerFriendlyProofReason(task: SellerEvidenceCoachTask) {
  if (task.buyer_demand >= 5) return "High buyer demand. Submit this first to protect trust on this listing.";
  if (task.attribute === "size") return "Fit doubts can become returns. Clear measurements help genuine sellers.";
  if (task.attribute === "fabric" || task.attribute === "transparency") return "Fabric clarity reduces avoidable returns and rating drops.";
  if (task.attribute === "color") return "Daylight proof helps buyers trust the real shade.";
  return "This proof can answer repeated buyer doubts before checkout.";
}

function listingImpactText(listing: SellerPanelListing, task: SellerEvidenceCoachTask | null) {
  if (task) {
    return `${task.buyer_demand} shopper doubt(s) can block stronger trust until proof is added.`;
  }
  if (listing.top_issue) {
    return `${listing.top_issue.count} return issue(s) can reduce buyer confidence and ranking.`;
  }
  if (listing.quality_score !== null && listing.quality_score < 60) {
    return "Trust score is low. Improve product facts before pushing prepaid.";
  }
  if (listing.metrics.evidence_strength === "weak" || listing.metrics.evidence_strength === "unknown") {
    return "Evidence is still thin. More kept orders and proof will stabilize the score.";
  }
  return "Stable listing. Keep photos, size chart, and dispatch proof current.";
}

function statusTone(listing: SellerPanelListing) {
  if (listing.decision_status === "eligible_for_recommendation") return "good";
  if (listing.decision_status === "needs_seller_action") return "risk";
  return "watch";
}

function decisionStatusLabel(status: SellerPanelListing["decision_status"]) {
  if (status === "eligible_for_recommendation") return "Ready";
  if (status === "needs_seller_action") return "Fix needed";
  return "Building";
}

function proofTypeLabel(value: string) {
  if (value === "daylight_photo") return "Daylight photo";
  if (value === "fabric_closeup") return "Fabric close-up";
  if (value === "measurement_chart") return "Measurement chart";
  if (value === "measurement_photo") return "Measurement photo";
  if (value === "dispatch_screenshot") return "Dispatch proof";
  if (value === "packaging_photo") return "Packaging photo";
  return labelize(value);
}

function proofStatusTone(status: SellerProofAsset["status"]) {
  if (status === "verified") return "good";
  if (status === "rejected") return "risk";
  return "watch";
}

function proofStatusLabel(status: SellerProofAsset["status"]) {
  if (status === "verified") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Admin review";
}

function recommendedProofTypeForAttribute(attribute: string) {
  if (attribute === "size") return "measurement_chart";
  if (attribute === "fabric") return "fabric_closeup";
  if (attribute === "packaging") return "packaging_photo";
  if (attribute === "offer") return "seller_note";
  return "daylight_photo";
}

function proofTypeMatchesAttribute(attribute: string, proofType: string) {
  return recommendedProofTypeForAttribute(attribute) === proofType;
}

function sellerCoachProviderStatus(provider: SellerActionBoard["agent"]["provider"], copy: SellerCopy) {
  if (provider === "gemini") {
    return { label: copy.aiCoachLive, tone: "good" as const };
  }
  if (provider === "fallback_after_llm_error") {
    return { label: copy.aiFallbackActive, tone: "watch" as const };
  }
  return { label: copy.evidenceRulesActive, tone: "neutral" as const };
}

function isRecognizedAssetReference(value: string) {
  return value.startsWith("https://") ||
    value.startsWith("seller-asset://") ||
    value.startsWith("seeded://") ||
    value.startsWith("uploaded://") ||
    value.startsWith("data:image/") ||
    value.startsWith("data:application/pdf");
}

function isAllowedUploadFile(file: File, acceptedTypes: string[], maxBytes: number) {
  return acceptedTypes.includes(file.type) && file.size <= maxBytes;
}

function proofTypeAcceptsFile(proofType: string, file: File) {
  if (proofType === "seller_note") return file.type === "application/pdf" || file.type.startsWith("image/");
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(value: string) {
  const marker = ";base64,";
  const index = value.indexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

function priorityRank(priority: SellerEvidenceCoachTask["priority"]) {
  if (priority === "high") return 0;
  if (priority === "medium") return 1;
  return 2;
}

function parseSellerTopFeature(pathname: string): SellerTopFeature {
  const normalized = pathname.replace(/\/$/, "") || "/seller";
  if (normalized === "/seller/proofs" || normalized.startsWith("/seller/proofs/")) return "proofs";
  if (normalized === "/seller/trust-coach" || normalized.startsWith("/seller/trust-coach/")) return "trust_coach";
  if (normalized === "/seller/copilot" || normalized.startsWith("/seller/copilot/")) return "trust_coach";
  if (normalized === "/seller/autopilot" || normalized.startsWith("/seller/autopilot/")) return "trust_coach";
  if (normalized === "/seller/listing-lab" || normalized.startsWith("/seller/listing-lab/")) return "trust_coach";
  if (normalized === "/seller/rating-forecast" || normalized.startsWith("/seller/rating-forecast/")) return "trust_coach";
  return "console";
}

function parseSellerWorkbenchTab(value: string | null): SellerWorkbenchTab | null {
  if (value === "requests" || value === "proof_library") return "proofs_submitted";
  if (value === "overview" ||
    value === "products" ||
    value === "proofs_submitted" ||
    value === "add_product" ||
    value === "performance") {
    return value;
  }
  return null;
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
