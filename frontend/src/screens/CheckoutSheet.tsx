import { useEffect, useState } from "react";
import { ShieldCheck, HelpCircle, CheckCircle2, Clock, PackageCheck, Tag } from "lucide-react";
import { verifyOffer } from "../api/client";
import type { CheckoutResponse, ExpectationContract, OfferCheck } from "../types/api";
import { OutcomeScreen } from "./OutcomeScreen";

type Props = {
  buyerId: string;
  variantId: string;
  expectationContract: ExpectationContract | null;
  onOpenAudit: (traceId: string) => void;
  onClose: () => void;
  language: string;
  experienceMode: "simple" | "standard";
};

export function CheckoutSheet({
  buyerId,
  variantId,
  expectationContract,
  onOpenAudit,
  onClose,
  language,
  experienceMode
}: Props) {
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
    if (!checkout) {
      return {
        label: "Checking offer",
        badgeVariant: "neutral",
        text: "Retrieving pricing history..."
      } as const;
    }

    const status = checkout.offer.status;
    if (status === "verified_price_drop") {
      return {
        label: "Verified Price Drop",
        badgeVariant: "positive",
        text: checkout.offer.message
      } as const;
    }
    if (status === "no_need_to_rush") {
      return {
        label: "No need to rush",
        badgeVariant: "neutral",
        text: checkout.offer.message
      } as const;
    }
    return {
      label: "No claim made",
      badgeVariant: "neutral",
      text: checkout.offer.message
    } as const;
  }

  const dealStatus = getDealStatusContent();
  const size = variantId.split("_").pop() || "XL";

  return (
    <div className="checkout-sheet-root">
      {error && <div className="notice error">{error}</div>}

      {!ordered ? (
        <div className="checkout-flow">
          {/* Order Details Grid Checklist */}
          <div className="checkout-check-card">
            <div className="kv-row">
              <span>Size</span>
              <strong>{size.toUpperCase()} <span className="ui-badge positive">Confirmed</span></strong>
            </div>

            {!isSimple && (
              <div className="kv-row">
                <span>Product confidence</span>
                <strong>Strong</strong>
              </div>
            )}

            <div className="kv-row">
              <span>Deal status</span>
              <strong className={`ui-badge ${dealStatus.badgeVariant}`}>
                {dealStatus.label}
              </strong>
            </div>

            <p className="checkout-supporting-copy">
              {isSimple ? `${dealStatus.label}. ${dealStatus.text}` : dealStatus.text}
            </p>
          </div>

          {checkout && <OfferTruthEvidence offer={checkout.offer} isSimple={isSimple} />}

          {expectationContract && (
            <CheckoutExpectationContract
              contract={expectationContract}
              isSimple={isSimple}
            />
          )}

          {/* Place COD Order Button */}
          <button
            className="checkout-primary-cta"
            onClick={() => setOrdered(true)}
            disabled={!checkout}
          >
            <CheckCircle2 size={16} />
            <span>Place COD order</span>
          </button>

          {/* Audit trail trigger */}
          {checkout && (
            <div className="checkout-footer-action">
              <button
                onClick={() => onOpenAudit(checkout.trace_id)}
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
          contractId={expectationContract?.contract_id ?? null}
          onClose={onClose} 
        />
      )}
    </div>
  );
}

function OfferTruthEvidence({
  offer,
  isSimple
}: {
  offer: OfferCheck;
  isSimple: boolean;
}) {
  const priceDelta = offer.price_evidence.price_delta;
  const campaign = offer.campaign_evidence;
  const inventory = offer.inventory_evidence;
  const facts = [
    {
      label: "Current price",
      value: offer.price_evidence.latest_price === null ? "Unknown" : `Rs ${offer.price_evidence.latest_price}`,
      helper:
        offer.price_evidence.reference_price === null
          ? `${offer.price_evidence.price_event_count} price event(s)`
          : `Reference Rs ${offer.price_evidence.reference_price}`,
      icon: <Tag size={15} />
    },
    {
      label: "Price movement",
      value:
        priceDelta === null
          ? "Not enough history"
          : priceDelta > 0
            ? `Rs ${priceDelta} lower`
            : priceDelta < 0
              ? `Rs ${Math.abs(priceDelta)} higher`
              : "No change",
      helper:
        offer.price_evidence.current_price_age_days === null
          ? "Age unavailable"
          : `${offer.price_evidence.current_price_age_days} day(s) at current price`,
      icon: <Clock size={15} />
    },
    {
      label: "Stock signal",
      value: inventory ? `${inventory.available_to_promise} units` : "No snapshot",
      helper: inventory ? `${inventory.sales_velocity_24h} sales velocity signal` : "Not used for urgency",
      icon: <PackageCheck size={15} />
    }
  ];

  return (
    <div className="offer-truth-card">
      <div className="offer-truth-header">
        <div>
          <span className="eyebrow">Offer Sach Check</span>
          <h4>{offer.buyer_guidance}</h4>
        </div>
        <span>{offer.fact_ids.length} facts</span>
      </div>

      <div className="offer-fact-grid">
        {facts.map((fact) => (
          <div key={fact.label}>
            <span>{fact.icon}{fact.label}</span>
            <strong>{fact.value}</strong>
            <small>{fact.helper}</small>
          </div>
        ))}
      </div>

      {!isSimple && (
        <div className="offer-check-list">
          {offer.checks.map((check) => (
            <div key={check.key} className={`offer-check-row ${check.status}`}>
              <span>{check.label}</span>
              <strong>{check.detail}</strong>
            </div>
          ))}
          {campaign && (
            <p>
              Campaign window is server-recorded from {formatDate(campaign.start_at)} to {formatDate(campaign.end_at)}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CheckoutExpectationContract({
  contract,
  isSimple
}: {
  contract: ExpectationContract;
  isSimple: boolean;
}) {
  const items = contract.contract.items.slice(0, isSimple ? 3 : 5);
  return (
    <div className="checkout-contract-card">
      <div className="checkout-contract-header">
        <div>
          <span className="eyebrow">Locked for this order</span>
          <strong>Expectation contract active</strong>
        </div>
        <span>{contract.contract.fact_ids.length} facts</span>
      </div>
      <div className="checkout-contract-list">
        {items.map((item) => (
          <div key={item.dimension}>
            <span>{labelize(item.dimension)}</span>
            <strong>{item.claim}</strong>
          </div>
        ))}
      </div>
      <div className="checkout-contract-privacy">
        <ShieldCheck size={14} />
        <span>Private memory stays buyer-only. Feedback later updates aggregate evidence after quality checks.</span>
      </div>
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  });
}
