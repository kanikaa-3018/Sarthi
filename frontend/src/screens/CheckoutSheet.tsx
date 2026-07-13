import { useEffect, useState } from "react";
import { ShieldCheck, X, HelpCircle, FileText, CheckCircle2 } from "lucide-react";
import { verifyOffer } from "../api/client";
import { t } from "../i18n";
import type { CheckoutResponse } from "../types/api";
import { OutcomeScreen } from "./OutcomeScreen";

type Props = {
  buyerId: string;
  variantId: string;
  onOpenAudit: (traceId: string) => void;
  onClose: () => void;
  language: string;
  experienceMode: "simple" | "standard";
};

export function CheckoutSheet({ buyerId, variantId, onOpenAudit, onClose, language, experienceMode }: Props) {
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [ordered, setOrdered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSimple = experienceMode === "simple";

  useEffect(() => {
    setCheckout(null);
    setOrdered(false);
    verifyOffer(buyerId, variantId)
      .then(setCheckout)
      .catch((err: Error) => setError(err.message));
  }, [buyerId, variantId]);

  // Determine copy based on backend pricing status
  function getDealStatusContent() {
    if (!checkout) return { label: "Checking offer...", className: "status-checking", text: "Retrieving pricing history..." };
    
    const status = checkout.offer.status;
    if (status === "verified_price_drop") {
      return {
        label: "Verified Price Drop",
        className: "status-success",
        text: "Verified deal. Rs 80 below the recent 30-day median; offer ends at 9 PM."
      };
    } else if (status === "no_need_to_rush") {
      return {
        label: "No need to rush",
        className: "status-warning",
        text: "No need to rush. This price has been active for 5 days."
      };
    } else {
      // not_enough_history
      return {
        label: "No claim made",
        className: "status-neutral",
        text: "Sarthi has not enough history to analyze this offer."
      };
    }
  }

  const dealStatus = getDealStatusContent();
  const size = variantId.split("_").pop() || "XL";

  return (
    <div style={{ textAlign: "left" }}>
      {error && <div className="notice error">{error}</div>}

      {!ordered ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Order Details Grid Checklist */}
          <div style={{
            backgroundColor: "var(--bg-surface-muted)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "12px",
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "8px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Size {size}</span>
              <strong style={{ fontSize: "12px", color: "var(--success)" }}>Confirmed</strong>
            </div>

            {!isSimple && (
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Product confidence</span>
                <strong style={{ fontSize: "12px", color: "var(--success)" }}>Strong</strong>
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-subtle)", paddingBottom: "8px" }}>
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Deal status</span>
              <strong style={{
                fontSize: "11px",
                color: checkout?.offer.status === "verified_price_drop" ? "var(--success)" : "var(--warning)"
              }}>
                {dealStatus.label}
              </strong>
            </div>
            
            <p style={{ fontSize: "12px", color: "var(--text-primary)", margin: "4px 0 0" }}>
              {isSimple ? `${dealStatus.label}. ${dealStatus.text}` : dealStatus.text}
            </p>
          </div>

          {/* Place COD Order Button */}
          <button 
            onClick={() => setOrdered(true)}
            disabled={!checkout}
            style={{
              width: "100%",
              backgroundColor: "var(--accent-primary)",
              color: "var(--text-on-accent)",
              border: "none",
              borderRadius: "8px",
              padding: "14px",
              fontSize: "14px",
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              cursor: "pointer"
            }}
          >
            <CheckCircle2 size={16} />
            <span>Place COD order</span>
          </button>

          {/* Audit trail trigger */}
          {checkout && (
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button 
                onClick={() => onOpenAudit(checkout.trace_id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  background: "transparent",
                  border: "none"
                }}
              >
                <HelpCircle size={12} />
                <span>{isSimple ? "Proof" : "Inspect price events log"}</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Screen 5: Outcome survey selector */
        <OutcomeScreen 
          buyerId={buyerId} 
          variantId={variantId} 
          onClose={onClose} 
        />
      )}
    </div>
  );
}
