import type { EvidenceCapsule } from "./evidenceCapsule.js";

export type AgentAnswerShape = {
  title: string;
  summary: string;
  reasons: string[];
  caution: string | null;
};

export type AgentAnswerValidation = {
  ok: boolean;
  reasons: string[];
};

const GENERIC_PHRASES = [
  "some proof gaps",
  "some missing proof gaps",
  "could affect your decision",
  "meets your expectations and standards",
  "authenticity and quality",
  "product evidence is available",
  "lacks some details",
  "consider your needs",
  "make an informed decision",
  "based on the information provided",
  "it depends"
];

const OVERCLAIM_PHRASES = [
  "guaranteed",
  "100% safe",
  "definitely safe",
  "no risk",
  "always safe",
  "officially verified by brand",
  "refund guaranteed",
  "safe to buy"
];

export function validateAgentAnswer(
  generated: AgentAnswerShape,
  capsule: EvidenceCapsule
): AgentAnswerValidation {
  const reasons: string[] = [];
  const text = normalize([generated.title, generated.summary, ...generated.reasons, generated.caution ?? ""].join(" "));
  const summaryWords = generated.summary.trim().split(/\s+/).filter(Boolean).length;
  const reasonSet = new Set(generated.reasons.map((reason) => normalize(reason)));

  if (!generated.title.trim() || !generated.summary.trim()) reasons.push("missing_title_or_summary");
  if (!generated.reasons.length) reasons.push("missing_reasons");
  if (summaryWords > 46) reasons.push("summary_too_long");
  if (reasonSet.size < generated.reasons.length) reasons.push("repeated_reasons");

  for (const phrase of GENERIC_PHRASES) {
    if (text.includes(phrase)) reasons.push(`generic_phrase:${phrase}`);
  }
  for (const phrase of OVERCLAIM_PHRASES) {
    if (text.includes(phrase) && (capsule.missing_facts.length || capsule.verdict !== "safe")) {
      reasons.push(`unsafe_overclaim:${phrase}`);
    }
  }
  for (const topic of capsule.forbidden_topics) {
    if (topic && text.includes(normalize(topic))) reasons.push(`forbidden_topic:${topic}`);
  }

  validateIntentSpecificAnswer(generated, capsule, text, reasons);
  validateGrounding(capsule, text, reasons);

  return {
    ok: reasons.length === 0,
    reasons
  };
}

export function selectGroundedAnswer(
  generated: AgentAnswerShape,
  fallback: AgentAnswerShape,
  capsule: EvidenceCapsule
) {
  const validation = validateAgentAnswer(generated, capsule);
  if (!validation.ok) {
    return {
      answer: fallback,
      validation: {
        ...validation,
        used_fallback: true
      }
    };
  }
  return {
    answer: {
      title: generated.title.trim(),
      summary: generated.summary.trim(),
      reasons: normalizeReasons(generated.reasons, fallback.reasons),
      caution: generated.caution
    },
    validation: {
      ...validation,
      used_fallback: false
    }
  };
}

function validateIntentSpecificAnswer(
  generated: AgentAnswerShape,
  capsule: EvidenceCapsule,
  text: string,
  reasons: string[]
) {
  if (capsule.intent === "fit_question") {
    const requested = capsule.selected.requested_size?.toLowerCase();
    const selected = capsule.selected.selected_size?.toLowerCase();
    const recommended = capsule.selected.recommended_size?.toLowerCase();
    const mentionsSize = [requested, selected, recommended].filter(Boolean).some((size) => tokenPresent(text, size!));
    if (!mentionsSize) reasons.push("fit_answer_missing_size");
    if (!/(fit|size|chest|measurement|tight|loose)/.test(text)) reasons.push("fit_answer_missing_fit_language");
    if (/(daylight photo|color photo|timer reset|campaign timer)/.test(text)) reasons.push("fit_answer_irrelevant_topic");
  }

  if (capsule.intent === "proof_missing") {
    const attribute = capsule.classifier.proof_attribute;
    if (attribute && !text.includes(normalize(attribute))) reasons.push("proof_answer_missing_requested_attribute");
    if (!/(proof|evidence|photo|chart|close up|closeup|verified|missing)/.test(text)) reasons.push("proof_answer_missing_proof_language");
    if (capsule.missing_facts.length && /(no proof gap|proof is complete|no issue|fully trusted)/.test(text)) {
      reasons.push("proof_answer_overclaims_missing_evidence");
    }
  }

  if (capsule.intent === "compare_sellers") {
    if (!/(seller|option|compare|stronger|score)/.test(text)) reasons.push("comparison_answer_missing_seller_language");
    if (!text.includes(normalize(capsule.selected.seller_name))) reasons.push("comparison_answer_missing_selected_seller");
  }

  if (capsule.intent === "seller_trust" && !/(seller|verified|verification|dispatch|return|trust)/.test(text)) {
    reasons.push("seller_answer_missing_trust_language");
  }

  if (capsule.intent === "review_credibility" && !/(review|rating|weighted|return|credibility)/.test(text)) {
    reasons.push("review_answer_missing_review_language");
  }

  if (capsule.intent === "price_offer" && !/(price|offer|discount|timer|campaign|rs)/.test(text)) {
    reasons.push("price_answer_missing_offer_language");
  }

  if (capsule.intent === "return_risk" && !/(return|refund|exchange|risk|delivered)/.test(text)) {
    reasons.push("return_answer_missing_return_language");
  }

  if (capsule.intent === "checkout_payment" && !/(payment|prepaid|cod|cash|online|refund)/.test(text)) {
    reasons.push("checkout_answer_missing_payment_language");
  }

  if (capsule.intent === "unsupported" && !/(cannot|no evidence|not found|unsupported)/.test(text)) {
    reasons.push("unsupported_answer_not_refusing");
  }

  if (generated.reasons.some((reason) => reason.trim().length > 145)) {
    reasons.push("reason_too_long");
  }
}

function validateGrounding(capsule: EvidenceCapsule, text: string, reasons: string[]) {
  const requiredTerms = capsule.required_terms
    .map((term) => normalize(term))
    .filter((term) => term.length > 1);
  const hasRequiredTerm = !requiredTerms.length || requiredTerms.some((term) => tokenPresent(text, term));
  if (!hasRequiredTerm) reasons.push("answer_ignored_required_evidence_term");

  if (capsule.missing_facts.length) {
    const missingTerms = capsule.missing_facts.join(" ").toLowerCase();
    if (missingTerms.includes("measurement") && /(perfect fit|will fit|fits you)/.test(text)) {
      reasons.push("overclaims_fit_with_missing_measurement");
    }
    if (missingTerms.includes("proof") && /(fully trusted|safe to buy|no issue)/.test(text)) {
      reasons.push("overclaims_missing_proof");
    }
  }
}

function normalizeReasons(generated: string[], fallback: string[]) {
  const useful = generated
    .map((reason) => reason.trim())
    .filter(Boolean)
    .filter((reason) => normalize(reason).length > 8);
  return (useful.length >= 2 ? useful : fallback).slice(0, 3);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenPresent(text: string, token: string) {
  const clean = normalize(token);
  if (!clean) return false;
  if (clean.length <= 3) return new RegExp(`(^|\\s)${escapeRegExp(clean)}($|\\s)`).test(text);
  return text.includes(clean);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
