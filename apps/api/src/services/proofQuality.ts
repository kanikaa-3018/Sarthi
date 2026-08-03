export type ProofQualityCheck = {
  key: "relevance" | "clarity" | "measurement_readability" | "claim_match" | "human_decision";
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export type ProofQualityPrescreen = {
  score: number;
  decision: "approve" | "ask_revision" | "reject";
  headline: string;
  summary: string;
  reviewer_instruction: string;
  human_final: true;
  buyer_doubt: string;
  claim_checked: string;
  trust_lift_ready: boolean;
  checks: ProofQualityCheck[];
  detected_issues: string[];
};

export function proofQualityPrescreen(item: any): ProofQualityPrescreen {
  const attribute = String(item.attribute ?? "proof");
  const proofType = String(item.proof_type ?? "");
  const text = [
    item.title,
    item.description,
    item.product_title,
    ...(Array.isArray(item.buyer_doubt_examples) ? item.buyer_doubt_examples : [])
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");
  const buyerDemand = Number(item.open_request_count ?? 0);
  const hasAsset = Boolean(String(item.asset_url ?? "").trim());
  const expectedProofType = recommendedProofType(attribute);
  const typeMatches = expectedProofType === proofType;
  const relevance = buyerDemand > 0 || textMatchesAttribute(text, attribute) || text.includes(proofType.replace(/_/g, " "));
  const clarity = mediaLooksReviewable(item);
  const measurement = measurementReadable(item, text);
  const claim = typeMatches && (textMatchesAttribute(text, attribute) || attribute === "offer");

  const checks: ProofQualityCheck[] = [
    {
      key: "relevance",
      label: "Relevant to buyer doubt",
      status: relevance ? "pass" : "warn",
      detail: relevance
        ? buyerDemand > 0
          ? `${buyerDemand} buyer request${buyerDemand === 1 ? "" : "s"} are linked to this proof.`
          : `The upload text refers to ${labelize(attribute)}.`
        : "No linked buyer demand or clear attribute wording was found."
    },
    {
      key: "clarity",
      label: "Image or file is clear",
      status: !hasAsset ? "fail" : clarity ? "pass" : "warn",
      detail: !hasAsset
        ? "No proof file or secure reference is attached."
        : clarity
          ? "The asset reference and description are reviewable."
          : "The file exists, but the description is too thin for blind approval."
    },
    {
      key: "measurement_readability",
      label: "Measurement is readable",
      status: measurement.status,
      detail: measurement.detail
    },
    {
      key: "claim_match",
      label: "Matches product claim",
      status: !typeMatches ? "fail" : claim ? "pass" : "warn",
      detail: !typeMatches
        ? `${labelize(attribute)} proof should use ${labelize(expectedProofType)}, not ${labelize(proofType)}.`
        : claim
          ? `Proof type and wording match the ${labelize(attribute)} claim.`
          : "Proof type is acceptable, but the seller text should name the exact claim more clearly."
    }
  ];

  const failCount = checks.filter((check) => check.status === "fail").length;
  const warnCount = checks.filter((check) => check.status === "warn").length;
  const measurementNeedsRevision = checks.some((check) => check.key === "measurement_readability" && check.status !== "pass");
  const decision = failCount > 0
    ? criticalFailure(item, typeMatches) ? "reject" : "ask_revision"
    : measurementNeedsRevision || warnCount > 1
      ? "ask_revision"
      : "approve";
  const finalCheck: ProofQualityCheck = {
    key: "human_decision",
    label: "Human final decision",
    status: decision === "approve" ? "pass" : decision === "ask_revision" ? "warn" : "fail",
    detail: decision === "approve"
      ? "Copilot sees no blocker, but reviewer must still inspect the asset before approval."
      : decision === "reject"
        ? "Copilot found a hard blocker. Reviewer can reject with a clear seller note."
        : "Copilot recommends asking the seller for clearer replacement proof."
  };
  checks.push(finalCheck);
  const score = Math.max(0, Math.min(100, 100 - failCount * 32 - warnCount * 14 + Math.min(8, buyerDemand)));
  const detectedIssues = checks
    .filter((check) => check.status !== "pass" && check.key !== "human_decision")
    .map((check) => check.label);

  return {
    score,
    decision,
    headline: decision === "approve"
      ? "Proof can move to human approval"
      : decision === "reject"
        ? "Proof has a hard blocker"
        : "Ask seller for clearer proof",
    summary: decision === "approve"
      ? "The upload answers the buyer concern well enough for a reviewer to approve after visual inspection."
      : decision === "reject"
        ? "The proof cannot safely support the product claim in its current form."
        : "The proof has useful intent, but needs a clearer file, wording, or claim match before buyer confidence should improve.",
    reviewer_instruction: reviewerInstruction(decision, checks),
    human_final: true,
    buyer_doubt: buyerDemand > 0
      ? `${buyerDemand} buyer request${buyerDemand === 1 ? "" : "s"} waiting for ${labelize(attribute)} proof`
      : `No aggregate buyer demand is linked yet for ${labelize(attribute)}.`,
    claim_checked: `${labelize(attribute)} claim via ${labelize(proofType || expectedProofType)}`,
    trust_lift_ready: decision === "approve",
    checks,
    detected_issues: detectedIssues
  };
}

export function proofQualityRiskDelta(quality: ProofQualityPrescreen) {
  const failCount = quality.checks.filter((check) => check.status === "fail").length;
  const warnCount = quality.checks.filter((check) => check.status === "warn" && check.key !== "human_decision").length;
  return failCount * 24 + warnCount * 9 - (quality.decision === "approve" ? 8 : 0);
}

function mediaLooksReviewable(item: any) {
  const url = String(item.asset_url ?? "").trim();
  const description = String(item.description ?? "").trim();
  if (!url) return false;
  if (/^data:image\/|^https:\/\/|^seeded:\/\/|^seller-asset:\/\/|^\/catalog\//i.test(url) && description.length >= 24) return true;
  return description.length >= 40;
}

function measurementReadable(item: any, text: string): { status: "pass" | "warn" | "fail"; detail: string } {
  if (String(item.proof_type ?? "") !== "measurement_chart" && String(item.attribute ?? "") !== "size") {
    return { status: "pass", detail: "Measurement proof is not required for this claim." };
  }
  const lChest = Number(item.measurements?.l_chest_inches);
  const xlChest = Number(item.measurements?.xl_chest_inches);
  if (Number.isFinite(lChest) && Number.isFinite(xlChest)) {
    return { status: "pass", detail: `L ${lChest} in and XL ${xlChest} in are readable for reviewer verification.` };
  }
  if (/\b(chest|inch|inches|measurement|size chart|l |xl )\b/i.test(text)) {
    return { status: "warn", detail: "Seller mentions measurement, but structured L/XL values are not readable." };
  }
  return { status: "fail", detail: "Size proof is missing readable measurements." };
}

function criticalFailure(item: any, typeMatches: boolean) {
  return !String(item.asset_url ?? "").trim() || !typeMatches;
}

function reviewerInstruction(decision: ProofQualityPrescreen["decision"], checks: ProofQualityCheck[]) {
  const issue = checks.find((check) => check.status === "fail") ?? checks.find((check) => check.status === "warn");
  if (decision === "approve") return "Open the proof, confirm the claim visually, then approve with the suggested audit note.";
  if (decision === "reject") return `Reject if the opened asset confirms this blocker: ${issue?.detail ?? "proof does not support the claim"}`;
  return `Ask revision focused on: ${issue?.label ?? "clearer proof"}. Do not improve buyer score yet.`;
}

function recommendedProofType(attribute: string) {
  const map: Record<string, string> = {
    transparency: "daylight_photo",
    fabric: "fabric_closeup",
    color: "daylight_photo",
    size: "measurement_chart",
    packaging: "packaging_photo",
    offer: "seller_note"
  };
  return map[attribute] ?? "seller_note";
}

function textMatchesAttribute(text: string, attribute: string) {
  const synonyms: Record<string, string[]> = {
    transparency: ["transparent", "transparency", "lining", "see through", "thin"],
    fabric: ["fabric", "cloth", "material", "cotton", "polyester", "texture"],
    color: ["color", "colour", "shade", "daylight", "print"],
    size: ["size", "measurement", "chest", "fit", "xl", "l"],
    packaging: ["packaging", "packet", "label", "box", "seal"],
    offer: ["offer", "price", "discount", "timer", "campaign"]
  };
  return (synonyms[attribute] ?? [attribute]).some((word) => text.includes(word));
}

function labelize(value: string) {
  return String(value ?? "").replace(/_/g, " ");
}
