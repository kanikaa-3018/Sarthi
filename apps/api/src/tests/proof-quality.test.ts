import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { proofQualityPrescreen } from "../services/proofQuality.js";

describe("proof quality prescreen", () => {
  it("allows a relevant proof to move to human approval without making the final decision", () => {
    const result = proofQualityPrescreen({
      attribute: "fabric",
      proof_type: "fabric_closeup",
      title: "Cotton fabric closeup for kurti",
      description: "Close daylight fabric photo showing cotton texture and thickness for buyer fabric doubt.",
      product_title: "Cotton kurti",
      asset_url: "seller-asset://fabric-closeup.jpg",
      open_request_count: 12,
      buyer_doubt_examples: ["Is the fabric thin or transparent?"]
    });

    assert.equal(result.decision, "approve");
    assert.equal(result.human_final, true);
    assert.equal(result.trust_lift_ready, true);
    assert.ok(result.score >= 80);
    assert.ok(result.checks.every((check) => check.status === "pass"));
  });

  it("asks revision when size proof mentions measurements but lacks readable structured values", () => {
    const result = proofQualityPrescreen({
      attribute: "size",
      proof_type: "measurement_chart",
      title: "Size chart",
      description: "Measurement chart mentions chest inches for L and XL, but values are not readable.",
      product_title: "Printed kurta",
      asset_url: "seller-asset://size-chart.jpg",
      open_request_count: 5
    });

    assert.equal(result.decision, "ask_revision");
    assert.equal(result.trust_lift_ready, false);
    assert.ok(result.detected_issues.includes("Measurement is readable"));
  });

  it("rejects proof that uses the wrong proof type for the buyer claim", () => {
    const result = proofQualityPrescreen({
      attribute: "transparency",
      proof_type: "seller_note",
      title: "Seller says fabric is not transparent",
      description: "Seller note without daylight image for a transparency concern.",
      product_title: "White kurti",
      asset_url: "seller-asset://seller-note.txt",
      open_request_count: 9
    });

    assert.equal(result.decision, "reject");
    assert.equal(result.trust_lift_ready, false);
    assert.ok(result.checks.some((check) => check.key === "claim_match" && check.status === "fail"));
  });
});
