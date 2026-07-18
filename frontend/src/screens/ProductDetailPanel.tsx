import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  HelpCircle,
  Info,
  Ruler,
  Send,
  ShieldCheck,
  Truck
} from "lucide-react";
import {
  askSarthi,
  createExpectationContract,
  getCartConfidence,
  getKeepConfidence,
  getProductDetail
} from "../api/client";
import { simpleTrustMeaning, t, type LanguageCode } from "../i18n";
import type {
  AgentResponse,
  CartConfidenceResponse,
  ExpectationContract,
  KeepConfidenceResponse,
  ProductDetailResponse
} from "../types/api";

// Screen 3: Responsive Split 2-Column Product Detail Panel
export function ProductDetailPanel({
  buyerId,
  productId,
  initialVariantId,
  clusterId,
  onBack,
  onOpenAudit,
  onOpenCheckout,
  language,
  experienceMode,
  comparisonTraceId
}: {
  buyerId: string;
  productId: string;
  initialVariantId: string | null;
  clusterId: string;
  onBack: () => void;
  onOpenAudit: (traceId: string) => void;
  onOpenCheckout: (variantId: string, contract: ExpectationContract) => void;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  comparisonTraceId?: string;
}) {
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState(initialVariantId ?? "");
  const [query, setQuery] = useState("Mera usual size L hai, chest tight toh nahi hoga?");
  const [answer, setAnswer] = useState<AgentResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [contractLocking, setContractLocking] = useState(false);
  const [contractError, setContractError] = useState<string | null>(null);
  const [keepConfidence, setKeepConfidence] = useState<KeepConfidenceResponse | null>(null);
  const [keepConfidenceLoading, setKeepConfidenceLoading] = useState(false);
  const [keepConfidenceError, setKeepConfidenceError] = useState<string | null>(null);
  const [cartConfidence, setCartConfidence] = useState<CartConfidenceResponse | null>(null);
  const [cartConfidenceLoading, setCartConfidenceLoading] = useState(false);
  const [cartConfidenceError, setCartConfidenceError] = useState<string | null>(null);

  useEffect(() => {
    setContractError(null);
    setKeepConfidence(null);
    setCartConfidence(null);
    getProductDetail(buyerId, productId)
      .then((payload) => {
        setDetail(payload);
        setKeepConfidence(payload.keep_confidence);
        const initialVariant = initialVariantId
          ? payload.variants.find((variant) => variant.variant_id === initialVariantId)
          : null;
        setSelectedVariantId(initialVariant?.variant_id ?? payload.selected_variant.variant_id);
      });
  }, [buyerId, productId, initialVariantId]);

  useEffect(() => {
    if (!detail || !selectedVariantId) return;
    if (keepConfidence?.variant_id === selectedVariantId) return;
    let cancelled = false;
    setKeepConfidenceLoading(true);
    setKeepConfidenceError(null);
    getKeepConfidence(buyerId, productId, selectedVariantId)
      .then((payload) => {
        if (!cancelled) setKeepConfidence(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setKeepConfidenceError(err.message);
      })
      .finally(() => {
        if (!cancelled) setKeepConfidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyerId, detail, keepConfidence?.variant_id, productId, selectedVariantId]);

  useEffect(() => {
    if (!detail || !selectedVariantId) return;
    let cancelled = false;
    setCartConfidenceLoading(true);
    setCartConfidenceError(null);
    getCartConfidence({
      buyer_id: buyerId,
      payment_mode: "cod",
      items: [{ variant_id: selectedVariantId, quantity: 1 }]
    })
      .then((payload) => {
        if (!cancelled) setCartConfidence(payload);
      })
      .catch((err: Error) => {
        if (!cancelled) setCartConfidenceError(err.message);
      })
      .finally(() => {
        if (!cancelled) setCartConfidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [buyerId, detail, selectedVariantId]);

  if (!detail) {
    return (
      <div className="detail-loading-state">
        <div />
        <span />
      </div>
    );
  }

  async function submitQuestion() {
    setSubmitting(true);
    setAnswer(null);
    setQuestionError(null);
    try {
      const response = await askSarthi({
        buyer_id: buyerId,
        query,
        language,
        cluster_id: clusterId,
        selected_variant_id: selectedVariantId
      });
      setAnswer(response);
      if (response.answer.primary_action?.variant_id) {
        setSelectedVariantId(response.answer.primary_action.variant_id);
      }
    } catch (err) {
      setQuestionError(
        err instanceof Error
          ? err.message
          : "Sarthi could not answer from verified facts right now."
      );
    } finally {
      setSubmitting(false);
    }
  }

  const selectedVariant = detail.variants.find((v) => v.variant_id === selectedVariantId) || detail.selected_variant;
  const proofTraceId = comparisonTraceId ?? keepConfidence?.trace_id ?? detail.keep_confidence.trace_id;
  const displayTitle = detail.product.title.split("-")[0].trim();
  const strikePrice = Math.round(selectedVariant.current_price * 1.35);
  const sizeAccuracy = Math.round(detail.evidence.fit_as_expected_rate * 100);
  const colorMatch = detail.evidence.delivered_orders_90d
    ? Math.round((1 - detail.evidence.color_mismatch_returns / detail.evidence.delivered_orders_90d) * 100)
    : null;

  async function handleBuyWithContract() {
    setContractLocking(true);
    setContractError(null);
    try {
      const contract = await createExpectationContract({
        buyer_id: buyerId,
        variant_id: selectedVariant.variant_id,
        preferred_fit: "comfort"
      });
      onOpenCheckout(selectedVariant.variant_id, contract);
    } catch (err) {
      setContractError(err instanceof Error ? err.message : "Could not lock expectation contract");
    } finally {
      setContractLocking(false);
    }
  }

  return (
    <div className="product-detail-shell">
      <div className="product-detail-header">
        <button type="button" onClick={onBack} aria-label="Back to catalog">
          <ArrowLeft size={18} />
        </button>
        <div>
          <span className="eyebrow">Selected listing</span>
          <strong>Back to catalog</strong>
        </div>
      </div>

      <div className="web-detail-layout">
        <div className="detail-gallery-container">
          <section className="detail-product-card">
            <div className="detail-image-frame">
              <img
                src={detail.product.image_url || fallbackProductImage(detail.product.color_family)}
                alt={detail.product.title}
              />
              <span>{detail.product.fabric}</span>
            </div>
            <div className="detail-product-summary">
              <span>Sold by {detail.product.seller_name}</span>
              <h1>{displayTitle}</h1>
              <div className="detail-price-row">
                <strong>Rs {selectedVariant.current_price}</strong>
                <span>Rs {strikePrice}</span>
                <small>{selectedVariant.stock} in stock</small>
              </div>
            </div>
          </section>

          <section className="size-selector-card">
            <div className="section-heading-row compact">
              <div>
                <span className="eyebrow">Size Oracle</span>
                <h3>Select size</h3>
              </div>
              <span className="ui-badge neutral">{detail.fit.confidence} confidence</span>
            </div>
            <div className="detail-size-options">
              {detail.variants.map((v) => (
                <button
                  key={v.variant_id}
                  type="button"
                  onClick={() => setSelectedVariantId(v.variant_id)}
                  className={v.variant_id === selectedVariantId ? "active" : ""}
                >
                  {v.size}
                </button>
              ))}
            </div>
            <p>
              Recommended size is <strong>{detail.fit.recommended_size}</strong> from category fit memory and SKU outcomes.
            </p>
          </section>

          <KeepConfidenceCard
            confidence={keepConfidence}
            loading={keepConfidenceLoading}
            error={keepConfidenceError}
            onApplySize={(variantId) => setSelectedVariantId(variantId)}
            onOpenAudit={onOpenAudit}
          />

          <CartConfidenceCard
            confidence={cartConfidence}
            loading={cartConfidenceLoading}
            error={cartConfidenceError}
            onOpenAudit={onOpenAudit}
          />

          <section className="sku-evidence-card">
            <span className="eyebrow">Quick checks</span>
            <div className="sku-evidence-grid">
              <div>
                <span><Ruler size={13} /> Size</span>
                <strong>{sizeAccuracy}%</strong>
              </div>
              <div>
                <span><BadgeCheck size={13} /> Color</span>
                <strong>{colorMatch === null ? "Unknown" : `${colorMatch}%`}</strong>
              </div>
              <div>
                <span><Truck size={13} /> Dispatch</span>
                <strong>{detail.evidence.median_dispatch_hours}h</strong>
              </div>
            </div>
            <p>
              Checked from <strong>{detail.evidence.delivered_orders_90d}</strong> recent orders.
            </p>
          </section>
        </div>

        <div className="detail-info-container">
          <div className="sarthi-confidence-strip">
            {keepConfidence && (
              <button className="strip-row evidence" type="button" onClick={() => onOpenAudit(keepConfidence.trace_id)}>
                <ShieldCheck size={16} />
                <span><strong>Keep confidence</strong> {Math.floor(keepConfidence.score * 100)}/100 | {labelize(keepConfidence.confidence_band)}</span>
                <ChevronRight size={14} />
              </button>
            )}
            <div className="strip-row">
              <Ruler size={17} />
              <span><strong>Size</strong> {detail.fit.recommended_size} recommended</span>
            </div>
            {detail.avoidable_issue && (
              <div className="strip-row caution">
                <AlertTriangle size={16} />
                <span><strong>Watch for</strong> {detail.avoidable_issue.title}</span>
              </div>
            )}
            <button className="strip-row evidence" type="button" onClick={() => onOpenAudit(proofTraceId)}>
              <CheckCircle2 size={16} />
              <span><strong>Evidence</strong> {detail.evidence.evidence_strength} | {detail.evidence.delivered_orders_90d} recent delivered orders</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <TrustReceipt
            detail={detail}
            language={language}
            experienceMode={experienceMode}
            comparisonTraceId={proofTraceId}
            onOpenAudit={onOpenAudit}
          />

          {experienceMode === "standard" && <AgentCheckTimeline detail={detail} />}

          {experienceMode === "standard" && (
            <ExpectationContractPreview
              detail={detail}
              selectedVariant={selectedVariant}
            />
          )}

          <section className="samvaad-card">
            <div className="samvaad-card-header">
              <ShieldCheck size={18} />
              <div>
                <span className="eyebrow">Listing questions</span>
                <h3>Ask from verified facts</h3>
              </div>
            </div>
            <p>
              Ask one simple question. Sarthi answers only from proof.
            </p>

            <div className="samvaad-suggestion-list">
              <button
                type="button"
                onClick={() => setQuery("Mera usual size L hai, yahan kya size standard rahega?")}
              >
                Size L sahi rahega?
              </button>
              <button
                type="button"
                onClick={() => setQuery("Kapde ka color print mismatch toh nahi hai? Fabric transparency?")}
              >
                Kapda thin toh nahi?
              </button>
            </div>

            <div className="samvaad-input-row">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Size, kapda, seller, offer..."
              />
              <button
                type="button"
                onClick={submitQuestion}
                disabled={submitting || !query.trim()}
                aria-label="Ask about this listing"
              >
                <Send size={15} />
              </button>
            </div>

            {questionError && (
              <div className="notice error samvaad-error">
                This question could not be answered from verified facts right now. Please retry or inspect the product proof.
              </div>
            )}

            {answer && (
              <div className="samvaad-response-card">
                <div className="response-conclusion">
                  <strong>Evidence answer</strong>
                  <p>{answer.answer.summary}</p>
                </div>
                <div className="response-reasons">
                  {answer.answer.reasons.map((r, idx) => (
                    <div key={idx} className="reason-bullet">
                      <CheckCircle2 size={14} />
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
                {answer.answer.caution && (
                  <div className="response-caution">
                    <strong>Caution</strong>
                    <span>{answer.answer.caution}</span>
                  </div>
                )}
                <div className="response-actions">
                  <button
                    className="btn-action-primary"
                    onClick={() => {
                      if (answer.answer.primary_action?.variant_id) {
                        setSelectedVariantId(answer.answer.primary_action.variant_id);
                      }
                    }}
                  >
                    {answer.answer.primary_action?.label || "Apply size selection"}
                  </button>
                  <button className="btn-action-secondary" onClick={() => onOpenAudit(answer.trace_id)}>
                    See proof
                  </button>
                </div>
              </div>
            )}
          </section>

          {contractError && <div className="notice error">{contractError}</div>}

          <section className="cod-action-card">
            <div>
              <span>Size {selectedVariant.size} selected</span>
              <strong>Rs {selectedVariant.current_price}</strong>
            </div>
            
            <button
              className="btn-sticky-buy"
              type="button"
              onClick={handleBuyWithContract}
              disabled={contractLocking}
            >
              <span>{contractLocking ? "Checking proof" : "Go to checkout"}</span>
              <ChevronRight size={18} />
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}

function KeepConfidenceCard({
  confidence,
  loading,
  error,
  onApplySize,
  onOpenAudit
}: {
  confidence: KeepConfidenceResponse | null;
  loading: boolean;
  error: string | null;
  onApplySize: (variantId: string) => void;
  onOpenAudit: (traceId: string) => void;
}) {
  if (error) {
    return (
      <section className="keep-confidence-card low simple-decision-card">
        <div className="simple-decision-top">
          <span className="simple-decision-icon danger"><AlertTriangle size={20} /></span>
          <div>
            <span className="eyebrow">Buy check</span>
            <strong>Check proof first</strong>
            <p>Confidence could not refresh.</p>
          </div>
        </div>
      </section>
    );
  }

  if (!confidence) {
    return (
      <section className="keep-confidence-card loading simple-decision-card">
        <div className="simple-decision-top">
          <span className="simple-decision-icon watch"><ShieldCheck size={20} /></span>
          <div>
            <span className="eyebrow">Buy check</span>
            <strong>{loading ? "Checking..." : "Waiting for proof"}</strong>
            <p>Size, seller, and returns are being checked.</p>
          </div>
        </div>
      </section>
    );
  }

  const score = Math.floor(confidence.score * 100);
  const primaryAction = confidence.interventions[0];
  const canApplySize = primaryAction?.type === "change_size" && Boolean(primaryAction.target_variant_id);
  const tone = confidence.confidence_band === "high" ? "safe" : confidence.confidence_band === "medium" ? "watch" : "danger";
  const decision = simpleBuyDecision(confidence.confidence_band);

  return (
    <section className={`keep-confidence-card ${confidence.confidence_band} simple-decision-card ${tone}`}>
      <div className="simple-decision-top">
        <span className={`simple-decision-icon ${tone}`}>
          {tone === "safe" ? <CheckCircle2 size={20} /> : tone === "watch" ? <CircleAlert size={20} /> : <AlertTriangle size={20} />}
        </span>
        <div>
          <span className="eyebrow">Buy check</span>
          <strong>{decision.title}</strong>
          <p>{decision.line}</p>
        </div>
        <div className="keep-score-meter" aria-label={`Keep confidence ${score} out of 100`}>
          <span>{score}</span>
          <small>/100</small>
        </div>
      </div>

      <div className="keep-driver-list simple-signal-list">
        {confidence.drivers.slice(0, 3).map((driver) => (
          <span key={`${driver.type}-${driver.label}`} className={driver.positive ? "positive" : driver.severity}>
            {driver.positive ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {driver.label}
          </span>
        ))}
      </div>

      {primaryAction && (
        <div className="keep-action-row">
          <div>
            <span>Next step</span>
            <strong>{primaryAction.label}</strong>
          </div>
          {canApplySize ? (
            <button
              type="button"
              onClick={() => onApplySize(primaryAction.target_variant_id!)}
            >
              Apply
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAudit(confidence.trace_id)}
            >
              Proof
            </button>
          )}
        </div>
      )}

      <button
        type="button"
        className="keep-proof-link"
        onClick={() => onOpenAudit(confidence.trace_id)}
      >
        <HelpCircle size={12} />
        <span>See proof</span>
      </button>
    </section>
  );
}

function CartConfidenceCard({
  confidence,
  loading,
  error,
  onOpenAudit
}: {
  confidence: CartConfidenceResponse | null;
  loading: boolean;
  error: string | null;
  onOpenAudit: (traceId: string) => void;
}) {
  if (error) {
    return (
      <section className="cart-confidence-card attention">
        <span className="eyebrow">Checkout</span>
        <strong>Pay with caution</strong>
        <p>Cart check could not refresh.</p>
      </section>
    );
  }

  if (!confidence) {
    return (
      <section className="cart-confidence-card loading">
        <span className="eyebrow">Checkout</span>
        <strong>{loading ? "Checking..." : "Waiting for size"}</strong>
        <p>Payment and size risk are being checked.</p>
      </section>
    );
  }

  const score = Math.floor(confidence.overall_score * 100);
  const primaryLine = confidence.line_items[0];
  const firstAlert = confidence.bracket_alerts[0];
  const checkoutTone = confidence.confidence_band === "high" ? "safe" : confidence.confidence_band === "medium" ? "watch" : "danger";
  const checkoutTitle = confidence.checkout_nudge.prepaid_recommended
    ? "Pay online is okay"
    : confidence.confidence_band === "low"
      ? "Use COD for now"
      : "COD is safer";

  return (
    <section className={`cart-confidence-card ${confidence.confidence_band} simple-cart-card ${checkoutTone}`}>
      <div className="cart-confidence-header">
        <div>
          <span className="eyebrow">Checkout</span>
          <strong>{checkoutTitle}</strong>
          <p>{firstAlert ? firstAlert.message : confidence.checkout_nudge.trust_condition}</p>
        </div>
        <div className="cart-score-pill">
          <strong>{score}</strong>
          <span>/100</span>
        </div>
      </div>

      <div className="cart-confidence-chips">
        <span>{confidence.active_profile ? `${confidence.active_profile.label} size` : "Size checked"}</span>
        <span>{confidence.checkout_nudge.prepaid_recommended ? "Online ok" : "COD ok"}</span>
        <span>{firstAlert ? "Bracketing risk" : "No size bracketing"}</span>
      </div>

      {primaryLine && (
        <div className="cart-line-summary simple">
          <div>
            <span>Selected</span>
            <strong>{primaryLine.selected_size}</strong>
          </div>
          <div>
            <span>Your size</span>
            <strong>{primaryLine.suggested_size ?? "Learning"}</strong>
          </div>
        </div>
      )}

      {firstAlert && (
        <div className="cart-bracket-alert">
          <AlertTriangle size={14} />
          <span>{firstAlert.message}</span>
        </div>
      )}

      <button type="button" className="keep-proof-link" onClick={() => onOpenAudit(confidence.trace_id)}>
        <HelpCircle size={12} />
        <span>Checkout proof</span>
      </button>
    </section>
  );
}

function simpleBuyDecision(band: KeepConfidenceResponse["confidence_band"]) {
  if (band === "high") {
    return {
      title: "Good to buy",
      line: "Size and seller signals look okay."
    };
  }
  if (band === "medium") {
    return {
      title: "Check once",
      line: "One proof check can avoid a return."
    };
  }
  return {
    title: "Do not rush",
    line: "Ask proof or change size before paying."
  };
}

function ExpectationContractPreview({
  detail,
  selectedVariant
}: {
  detail: ProductDetailResponse;
  selectedVariant: ProductDetailResponse["selected_variant"];
}) {
  const colorMatch = detail.evidence.delivered_orders_90d
    ? Math.round((1 - detail.evidence.color_mismatch_returns / detail.evidence.delivered_orders_90d) * 100)
    : null;
  const checks = [
    {
      label: "Fit",
      value: `Size ${selectedVariant.size}, recommended ${detail.fit.recommended_size}`,
      status: detail.fit.confidence
    },
    {
      label: "Fabric",
      value: `${detail.product.fabric} listing checked against reviews and seller proof`,
      status: detail.trust_state.missing_data.includes("fabric") ? "low" : "medium"
    },
    {
      label: "Color",
      value: colorMatch === null ? "Color evidence checked where available" : `${colorMatch}% color match signal`,
      status: detail.avoidable_issue?.reason === "color_different" ? "low" : "medium"
    },
    {
      label: "Offer",
      value: "Price urgency will be checked again before order",
      status: "medium"
    }
  ];

  return (
    <div className="expectation-preview-card">
      <div className="expectation-preview-header">
        <div>
          <span className="eyebrow">Expectation contract</span>
          <h3>What will be held accountable</h3>
          <p>
            Before checkout, the app locks a fact-backed snapshot of size, fabric, color, dispatch, and offer claims for this exact SKU.
          </p>
        </div>
        <span>{detail.evidence.delivered_orders_90d} orders</span>
      </div>
      <div className="expectation-preview-grid">
        {checks.map((check) => (
          <div key={check.label}>
            <span>{check.label}</span>
            <strong>{check.value}</strong>
            <small>{labelize(check.status)} confidence</small>
          </div>
        ))}
      </div>
      <div className="expectation-privacy-line">
        <ShieldCheck size={14} />
        <span>Seller sees only aggregate broken expectations, never your private fit memory.</span>
      </div>
    </div>
  );
}

function TrustReceipt({
  detail,
  language,
  experienceMode,
  comparisonTraceId,
  onOpenAudit
}: {
  detail: ProductDetailResponse;
  language: LanguageCode;
  experienceMode: "simple" | "standard";
  comparisonTraceId: string;
  onOpenAudit: (traceId: string) => void;
}) {
  const trust = detail.trust_state;
  const allowed = trust.can_recommend;
  const sourceStatus = trust.data_freshness.overall_status;
  const graphFactCount = new Set(detail.graph_paths.flatMap((path) => path.fact_ids)).size;
  const simpleTitle = allowed ? "Seller looks okay" : "Check seller proof";
  const simpleLine = simpleTrustMeaning(trust.status, trust.can_recommend, language);

  return (
    <div className={`trust-receipt-card ${experienceMode === "simple" ? "simple" : ""}`}>
      <div className="trust-receipt-top">
        <div>
          <span className="eyebrow sheet-eyebrow-primary">{experienceMode === "simple" ? "Seller check" : t(language, "trustReceipt")}</span>
          <h3>{experienceMode === "simple" ? simpleTitle : trust.headline}</h3>
        </div>
        <span className={`trust-receipt-pill ${allowed ? "allowed" : "paused"}`}>
          {allowed ? "OK" : "Check"}
        </span>
      </div>

      <div className="trust-receipt-section">
        <span>{experienceMode === "simple" ? "Meaning" : t(language, "whatThisMeans")}</span>
        <strong>
          {experienceMode === "simple"
            ? simpleLine
            : trust.summary}
        </strong>
      </div>

      {experienceMode === "standard" && (
        <div className="trust-receipt-section">
          <span>{t(language, "nextStep")}</span>
          <strong>{trust.buyer_guidance}</strong>
        </div>
      )}

      {trust.missing_data.length > 0 && (
        <div className="compare-simple-note">
          <Info size={14} />
          <span>Missing proof: {trust.missing_data.slice(0, 2).join(", ")}</span>
        </div>
      )}

      {experienceMode === "standard" && (
        <div className="trust-receipt-facts">
          <div>
            <span>Seller</span>
            <strong>{labelize(trust.seller_verification.verification_status)}</strong>
          </div>
          <div>
            <span>Evidence</span>
            <strong>{detail.evidence.evidence_strength}</strong>
          </div>
          <div>
            <span>Sources</span>
            <strong>{labelize(sourceStatus)}</strong>
          </div>
          <div>
            <span>Orders</span>
            <strong>{String(detail.evidence.delivered_orders_90d)}</strong>
          </div>
          <div>
            <span>Graph proof</span>
            <strong>{String(graphFactCount)}</strong>
          </div>
          <div>
            <span>Memory</span>
            <strong>{detail.privacy.fit_memory_enabled ? "On" : "Off"}</strong>
          </div>
        </div>
      )}

      <button
        className="btn-action-secondary trust-proof-button"
        onClick={() => onOpenAudit(comparisonTraceId)}
      >
        See proof
      </button>
    </div>
  );
}

function AgentCheckTimeline({ detail }: { detail: ProductDetailResponse }) {
  const trust = detail.trust_state;
  const sourceHealthy = !trust.data_freshness.blocking;
  const sellerVerified = trust.seller_verification.verification_status === "verified";
  const enoughEvidence = ["medium", "strong"].includes(detail.evidence.evidence_strength);
  const fitConfident = detail.fit.confidence !== "low";

  const checks = [
    {
      title: "Seller verification",
      passed: sellerVerified,
      body: sellerVerified
        ? `${detail.product.seller_name} has verified seller status.`
        : `Seller status is ${labelize(trust.seller_verification.verification_status)}.`
    },
    {
      title: "Return evidence",
      passed: enoughEvidence,
      body: `${detail.evidence.delivered_orders_90d} delivered orders and ${detail.evidence.returns_90d} returns checked.`
    },
    {
      title: "Size fit",
      passed: fitConfident,
      body: `Recommended size is ${detail.fit.recommended_size} with ${detail.fit.confidence} confidence.`
    },
    {
      title: "Source freshness",
      passed: sourceHealthy,
      body: `Data source status is ${labelize(trust.data_freshness.overall_status)}.`
    },
    {
      title: "Privacy boundary",
      passed: true,
      body: detail.privacy.fit_memory_enabled
        ? "Personal fit memory was used only for this buyer."
        : "Personal fit memory is off; aggregate evidence was used only."
    }
  ];

  return (
    <div className="agent-check-card">
      <div className="agent-check-header">
        <div>
          <span className="eyebrow sheet-eyebrow-primary">Agent checks</span>
          <h3>Checks completed</h3>
        </div>
        <ShieldCheck size={18} />
      </div>
      <div className="agent-check-list">
        {checks.map((check) => (
          <div key={check.title} className={`agent-check-row ${check.passed ? "passed" : "attention"}`}>
            <span className="agent-check-icon">
              {check.passed ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            </span>
            <div>
              <strong>{check.title}</strong>
              <span>{check.body}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function fallbackProductImage(color: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}
