import { useEffect, useState } from "react";
import { CreditCard, ShieldCheck, X, HelpCircle } from "lucide-react";
import { verifyOffer } from "../api/client";
import { t, type ExperienceMode, type LanguageCode } from "../i18n";
import type { CheckoutResponse } from "../types/api";
import { OutcomeScreen } from "./OutcomeScreen";

type Props = {
  buyerId: string;
  variantId: string;
  onOpenAudit: (traceId: string) => void;
  onClose: () => void;
  language: LanguageCode;
  experienceMode: ExperienceMode;
};

export function CheckoutSheet({ buyerId, variantId, onOpenAudit, onClose, language, experienceMode }: Props) {
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [ordered, setOrdered] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCheckout(null);
    setOrdered(false);
    verifyOffer(buyerId, variantId)
      .then(setCheckout)
      .catch((err: Error) => setError(err.message));
  }, [buyerId, variantId]);

  return (
    <div className="receipt-overlay">
      <div className={`receipt-modal ${experienceMode === "simple" ? "simple-mode" : ""}`}>
        {/* Header */}
        <div className="receipt-header">
          <div>
            <span className="eyebrow" style={{ color: "var(--primary-green)" }}>{t(language, "offerTruth")}</span>
            <h3 style={{ fontSize: "18px", marginTop: "2px" }}>Secure COD Order Verification</h3>
          </div>
          <button 
            onClick={onClose} 
            className="btn-reset-db" 
            title="Cancel checkout"
            style={{ width: "28px", height: "28px", borderRadius: "50%" }}
          >
            <X size={14} />
          </button>
        </div>

        {error && <div className="notice error">{error}</div>}

        {/* Verified Order Receipt Details */}
        <div className="receipt-data-table">
          <div className="receipt-row-data">
            <span>Ordered SKU:</span>
            <strong>{variantId}</strong>
          </div>
          <div className="receipt-row-data">
            <span>Sarthi Offer Check:</span>
            <strong style={{ color: "var(--primary-green)" }}>
              {checkout ? labelForOffer(checkout.offer.status) : "Scanning pricing..."}
            </strong>
          </div>
          {checkout && (
            <div className="receipt-row-data" style={{ borderTop: "1px solid var(--border-beige)", paddingTop: "8px", marginTop: "4px" }}>
              <span>Price analysis:</span>
              <strong style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-secondary)", textAlign: "right" }}>
                {checkout.offer.message}
              </strong>
            </div>
          )}
        </div>

        {checkout && (
          <div className="disruptor-banner" style={{ background: "var(--bg-beige)", borderStyle: "dashed" }}>
            <ShieldCheck size={16} style={{ color: "var(--primary-green)" }} />
            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
              <strong>{labelForOffer(checkout.offer.status)}</strong>
              <p style={{ marginTop: "2px" }}>
                {checkout.offer.message}
              </p>
              <p style={{ marginTop: "4px" }}>
                Sarthi checks price events and urgency signals before the order is placed, not after the buyer is locked in.
              </p>
            </div>
          </div>
        )}

        {/* Place Order CTA */}
        {!ordered ? (
          <button 
            className="btn-buy-cod"
            onClick={() => setOrdered(true)}
            disabled={!checkout}
          >
            <CreditCard size={15} />
            <span>Confirm COD Purchase</span>
          </button>
        ) : (
          <div className="outcome-loop-box">
            <OutcomeScreen buyerId={buyerId} variantId={variantId} />
          </div>
        )}

        {checkout && (
          <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "11px" }}>
            <button 
              className="btn-text-link" 
              onClick={() => onOpenAudit(checkout.trace_id)}
            >
              <HelpCircle size={10} />
              <span>Inspect price events log</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function labelForOffer(status: CheckoutResponse["offer"]["status"]) {
  if (status === "verified_price_drop") return "Verified Price Drop";
  if (status === "not_enough_history") return "Insufficient Price History";
  return "No Urgency Indicators Detected";
}
