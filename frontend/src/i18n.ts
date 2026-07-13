export type LanguageCode =
  | "hinglish"
  | "english"
  | "hindi"
  | "bengali"
  | "tamil"
  | "telugu"
  | "marathi"
  | "gujarati"
  | "kannada"
  | "malayalam"
  | "odia"
  | "punjabi"
  | "assamese";

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
  { code: "hinglish", label: "Hinglish", shortLabel: "Hin" },
  { code: "english", label: "English", shortLabel: "En" },
  { code: "hindi", label: "हिन्दी", shortLabel: "हि" },
  { code: "bengali", label: "বাংলা", shortLabel: "বাং" },
  { code: "tamil", label: "தமிழ்", shortLabel: "த" },
  { code: "telugu", label: "తెలుగు", shortLabel: "తె" },
  { code: "marathi", label: "मराठी", shortLabel: "म" },
  { code: "gujarati", label: "ગુજરાતી", shortLabel: "ગુ" },
  { code: "kannada", label: "ಕನ್ನಡ", shortLabel: "ಕ" },
  { code: "malayalam", label: "മലയാളം", shortLabel: "മ" },
  { code: "odia", label: "ଓଡ଼ିଆ", shortLabel: "ଓ" },
  { code: "punjabi", label: "ਪੰਜਾਬੀ", shortLabel: "ਪੰ" },
  { code: "assamese", label: "অসমীয়া", shortLabel: "অ" }
];

const ENGLISH_COPY: Record<CopyKey, string> = {
  shop: "Shop",
  trust: "Trust",
  sellerConsole: "Seller Console",
  reviewQueue: "Review Queue",
  language: "Language",
  simpleMode: "Simple mode",
  standardMode: "Detailed mode",
  awaitingScanTitle: "Awaiting Sarthi Scan",
  awaitingScanBody: "Choose Scan & Compare when similar listings need size, seller, return, and offer proof.",
  trustReceipt: "Trust Receipt",
  agentChecks: "What Sarthi checked",
  whatThisMeans: "What this means",
  nextStep: "Next best step",
  proofAvailable: "Proof available",
  recommendationAllowed: "Recommendation allowed",
  recommendationPaused: "Recommendation paused",
  offerTruth: "Offer truth",
  sellerChecked: "Seller verified",
  returnsChecked: "Return history checked",
  sizeChecked: "Size fit checked",
  priceChecked: "Price check ready",
  privacyChecked: "Private memory protected",
  notEnoughProof: "Not enough proof yet",
  safeToCompare: "Safe to compare",
  checkOnce: "Check once before buying",
  resolveListings: "Resolve duplicate listings"
};

const HINGLISH_COPY: Partial<Record<CopyKey, string>> = {
  awaitingScanTitle: "Sarthi scan ka wait",
  awaitingScanBody: "Similar listings ho to Scan & Compare use karo. Sarthi size, seller, return aur offer proof check karega.",
  trustReceipt: "Trust Receipt",
  agentChecks: "Sarthi ne kya check kiya",
  whatThisMeans: "Iska simple matlab",
  nextStep: "Ab kya karna hai",
  recommendationAllowed: "Recommend kar sakte hain",
  recommendationPaused: "Recommendation roki gayi",
  notEnoughProof: "Abhi proof kam hai",
  safeToCompare: "Compare karna safe hai",
  checkOnce: "Order se pehle ek baar check karo",
  resolveListings: "Duplicate listings resolve karo"
};

const SIMPLE_KEY_COPY: Partial<Record<LanguageCode, Partial<Record<CopyKey, string>>>> = {
  hindi: {
    trustReceipt: "भरोसा पर्ची",
    agentChecks: "सार्थी ने ये जांचा",
    whatThisMeans: "सरल मतलब",
    nextStep: "अब क्या करें",
    recommendationAllowed: "सलाह दी जा सकती है",
    recommendationPaused: "सलाह रोकी गई",
    notEnoughProof: "अभी सबूत कम है",
    checkOnce: "खरीदने से पहले जांचें"
  },
  bengali: {
    trustReceipt: "ভরসার সারাংশ",
    agentChecks: "সার্থি যা পরীক্ষা করেছে",
    whatThisMeans: "সহজ মানে",
    nextStep: "এখন কী করবেন",
    recommendationAllowed: "পরামর্শ দেওয়া যাবে",
    recommendationPaused: "পরামর্শ থামানো হয়েছে",
    notEnoughProof: "এখনও প্রমাণ কম",
    checkOnce: "কেনার আগে একবার দেখুন"
  },
  tamil: {
    trustReceipt: "நம்பிக்கை சுருக்கம்",
    agentChecks: "சாரதி பார்த்தவை",
    whatThisMeans: "எளிய அர்த்தம்",
    nextStep: "அடுத்து என்ன செய்ய வேண்டும்",
    recommendationAllowed: "பரிந்துரை செய்யலாம்",
    recommendationPaused: "பரிந்துரை நிறுத்தப்பட்டது",
    notEnoughProof: "இன்னும் ஆதாரம் குறைவு",
    checkOnce: "வாங்குவதற்கு முன் சரிபார்க்கவும்"
  },
  telugu: {
    trustReceipt: "నమ్మక సారాంశం",
    agentChecks: "సార్థి చూసినవి",
    whatThisMeans: "సులభమైన అర్థం",
    nextStep: "తర్వాత చేయాల్సింది",
    recommendationAllowed: "సిఫార్సు చేయవచ్చు",
    recommendationPaused: "సిఫార్సు ఆపబడింది",
    notEnoughProof: "ఇంకా ఆధారం తక్కువ",
    checkOnce: "కొనేప్రంటే ఒకసారి చూడండి"
  },
  marathi: {
    trustReceipt: "विश्वास सारांश",
    agentChecks: "सार्थीने तपासले",
    whatThisMeans: "सोपे अर्थ",
    nextStep: "आता काय करावे",
    recommendationAllowed: "शिफारस करता येईल",
    recommendationPaused: "शिफारस थांबवली",
    notEnoughProof: "अजून पुरावा कमी आहे",
    checkOnce: "खरेदीपूर्वी तपासा"
  },
  gujarati: {
    trustReceipt: "વિશ્વાસ સારાંશ",
    agentChecks: "સારથીએ તપાસ્યું",
    whatThisMeans: "સરળ અર્થ",
    nextStep: "હવે શું કરવું",
    recommendationAllowed: "ભલામણ કરી શકાય",
    recommendationPaused: "ભલામણ રોકાઈ",
    notEnoughProof: "હજુ પુરાવો ઓછો છે",
    checkOnce: "ખરીદતા પહેલા તપાસો"
  },
  kannada: {
    trustReceipt: "ನಂಬಿಕೆ ಸಾರಾಂಶ",
    agentChecks: "ಸಾರ್ಥಿ ಪರಿಶೀಲಿಸಿದವು",
    whatThisMeans: "ಸರಳ ಅರ್ಥ",
    nextStep: "ಮುಂದೆ ಏನು ಮಾಡಬೇಕು",
    recommendationAllowed: "ಶಿಫಾರಸು ಮಾಡಬಹುದು",
    recommendationPaused: "ಶಿಫಾರಸು ನಿಲ್ಲಿಸಲಾಗಿದೆ",
    notEnoughProof: "ಇನ್ನೂ ಸಾಕ್ಷ್ಯ ಕಡಿಮೆ",
    checkOnce: "ಖರೀದಿಸುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ"
  },
  malayalam: {
    trustReceipt: "വിശ്വാസ സംഗ്രഹം",
    agentChecks: "സാർഥി പരിശോധിച്ചത്",
    whatThisMeans: "ലളിതമായ അർത്ഥം",
    nextStep: "ഇനി ചെയ്യേണ്ടത്",
    recommendationAllowed: "ശുപാർശ ചെയ്യാം",
    recommendationPaused: "ശുപാർശ നിർത്തി",
    notEnoughProof: "ഇനിയും തെളിവ് കുറവാണ്",
    checkOnce: "വാങ്ങുന്നതിന് മുമ്പ് പരിശോധിക്കുക"
  },
  odia: {
    trustReceipt: "ଭରସା ସାରାଂଶ",
    agentChecks: "ସାରଥି ଯାଞ୍ଚ କରିଛି",
    whatThisMeans: "ସହଜ ଅର୍ଥ",
    nextStep: "ଏବେ କଣ କରିବେ",
    recommendationAllowed: "ସୁପାରିଶ କରାଯାଇପାରେ",
    recommendationPaused: "ସୁପାରିଶ ରୋକାଯାଇଛି",
    notEnoughProof: "ଏଯାଏ ପ୍ରମାଣ କମ୍",
    checkOnce: "କିଣିବା ପୂର୍ବରୁ ଯାଞ୍ଚ କରନ୍ତୁ"
  },
  punjabi: {
    trustReceipt: "ਭਰੋਸਾ ਸਾਰ",
    agentChecks: "ਸਾਰਥੀ ਨੇ ਜਾਂਚਿਆ",
    whatThisMeans: "ਸੌਖਾ ਮਤਲਬ",
    nextStep: "ਹੁਣ ਕੀ ਕਰਨਾ ਹੈ",
    recommendationAllowed: "ਸਿਫਾਰਸ਼ ਕੀਤੀ ਜਾ ਸਕਦੀ ਹੈ",
    recommendationPaused: "ਸਿਫਾਰਸ਼ ਰੋਕੀ ਗਈ",
    notEnoughProof: "ਹਾਲੇ ਸਬੂਤ ਘੱਟ ਹੈ",
    checkOnce: "ਖਰੀਦਣ ਤੋਂ ਪਹਿਲਾਂ ਜਾਂਚੋ"
  },
  assamese: {
    trustReceipt: "বিশ্বাসৰ সাৰাংশ",
    agentChecks: "সাৰথিয়ে পৰীক্ষা কৰিলে",
    whatThisMeans: "সহজ অৰ্থ",
    nextStep: "এতিয়া কি কৰিব",
    recommendationAllowed: "পৰামৰ্শ দিব পাৰি",
    recommendationPaused: "পৰামৰ্শ ৰখা হৈছে",
    notEnoughProof: "এতিয়াও প্ৰমাণ কম",
    checkOnce: "কিনাৰ আগতে চাওক"
  }
};

export function t(language: LanguageCode, key: CopyKey): string {
  return SIMPLE_KEY_COPY[language]?.[key] ?? (language === "hinglish" ? HINGLISH_COPY[key] : undefined) ?? ENGLISH_COPY[key];
}

export function languageLabel(language: LanguageCode): string {
  return LANGUAGE_OPTIONS.find((item) => item.code === language)?.label ?? "English";
}

export function simpleTrustMeaning(status: string, canRecommend: boolean, language: LanguageCode): string {
  if (!canRecommend) {
    if (status === "limited_evidence") return t(language, "notEnoughProof");
    if (status === "data_degraded") return "Fresh proof is unavailable right now.";
    if (status === "seller_restricted") return "Seller check did not pass.";
    return t(language, "recommendationPaused");
  }
  if (status === "specific_caution") return t(language, "checkOnce");
  if (status === "conflicting_evidence") return "Some proof disagrees. Compare carefully.";
  return t(language, "safeToCompare");
}
