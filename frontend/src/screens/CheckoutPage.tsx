import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Banknote, CheckCircle2, CreditCard, Gift, PackageCheck, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { createExpectationContract, getProductDetail, placeCheckoutOrder, verifyOffer } from "../api/client";
import { t, type LanguageCode } from "../i18n";
import type {
  BuyerOrderItem,
  CheckoutResponse,
  ExpectationContract,
  PaymentAssist,
  Product,
  ProductDetailResponse,
  Variant
} from "../types/api";

type Props = {
  buyerId: string;
  language: LanguageCode;
};

type WearerMode = "self" | "mother" | "sister" | "friend";

type CheckoutRouteState = {
  contract?: ExpectationContract;
  item?: {
    product: Product;
    variant: Variant;
  };
};

const wearerOptions: Array<{ value: WearerMode }> = [
  { value: "self" },
  { value: "mother" },
  { value: "sister" },
  { value: "friend" }
];

export function CheckoutPage({ buyerId, language }: Props) {
  const navigate = useNavigate();
  const { productId, variantId } = useParams<{ productId: string; variantId: string }>();
  const routeState = useLocation().state as CheckoutRouteState | null;
  const copy = checkoutPageCopy(language);
  const [detail, setDetail] = useState<ProductDetailResponse | null>(null);
  const [checkout, setCheckout] = useState<CheckoutResponse | null>(null);
  const [contract, setContract] = useState<ExpectationContract | null>(null);
  const [paymentMode, setPaymentMode] = useState<"prepaid" | "cod">("cod");
  const [wearerMode, setWearerMode] = useState<WearerMode>("self");
  const [loading, setLoading] = useState(true);
  const [contractError, setContractError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<BuyerOrderItem | null>(null);

  useEffect(() => {
    if (!productId || !variantId) {
      setError(copy.missingCheckout);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);
    setContractError(null);
    setPlacedOrder(null);
    setWearerMode("self");

    const routedContract = routeState?.contract?.variant_id === variantId ? routeState.contract : null;
    const contractRequest = routedContract
      ? Promise.resolve(routedContract)
      : createExpectationContract({
          buyer_id: buyerId,
          variant_id: variantId,
          preferred_fit: "comfort"
        });

    Promise.allSettled([
      getProductDetail(buyerId, productId),
      verifyOffer(buyerId, variantId),
      contractRequest
    ]).then(([detailResult, checkoutResult, contractResult]) => {
      if (!active) return;

      if (detailResult.status === "fulfilled") {
        setDetail(detailResult.value);
      } else {
        setError(detailResult.reason instanceof Error ? detailResult.reason.message : copy.loadFailed);
      }

      if (checkoutResult.status === "fulfilled") {
        setCheckout(checkoutResult.value);
        setPaymentMode(checkoutResult.value.cart_confidence?.checkout_nudge.prepaid_recommended ? "prepaid" : "cod");
      } else {
        setError(checkoutResult.reason instanceof Error ? checkoutResult.reason.message : copy.loadFailed);
      }

      if (contractResult.status === "fulfilled") {
        setContract(contractResult.value);
      } else {
        setContractError(contractResult.reason instanceof Error ? contractResult.reason.message : copy.contractFailed);
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [buyerId, copy.contractFailed, copy.loadFailed, copy.missingCheckout, productId, routeState?.contract, variantId]);

  const product = detail?.product ?? routeState?.item?.product ?? null;
  const selectedVariant = useMemo(() => {
    if (!variantId) return routeState?.item?.variant ?? detail?.selected_variant ?? null;
    return detail?.variants.find((variant) => variant.variant_id === variantId)
      ?? routeState?.item?.variant
      ?? detail?.selected_variant
      ?? null;
  }, [detail, routeState?.item?.variant, variantId]);
  const cartConfidence = checkout?.cart_confidence ?? null;
  const keepConfidence = checkout?.keep_confidence ?? null;
  const paymentAssist = cartConfidence?.payment_assist ?? null;
  const prepaidRecommended = Boolean(cartConfidence?.checkout_nudge.prepaid_recommended || paymentAssist?.recommended_mode === "prepaid");
  const trustScore = cartConfidence ? Math.round(cartConfidence.overall_score * 100) : null;
  const keepScore = keepConfidence ? Math.round(keepConfidence.score * 100) : null;
  const totalBenefit = paymentAssist?.total_prepaid_benefit_rupees ?? 0;
  const rewardPoints = paymentAssist?.reward_points ?? 0;
  const currentPrice = checkout?.offer.price_evidence.latest_price ?? selectedVariant?.current_price ?? 0;
  const referencePrice = checkout?.offer.price_evidence.reference_price ?? null;
  const priceDelta = checkout?.offer.price_evidence.price_delta ?? null;
  const payablePrice = selectedVariant?.current_price ?? currentPrice;
  const referenceSavings = referencePrice && payablePrice && referencePrice > payablePrice ? referencePrice - payablePrice : 0;
  const orderDisabled = !checkout || !selectedVariant || !contract || ordering;
  const recommendedPaymentLabel = prepaidRecommended ? t(language, "payOnline") : t(language, "cashOnDelivery");
  const selectedPaymentBenefit =
    paymentMode === "prepaid" && totalBenefit > 0
      ? `Rs ${totalBenefit}${rewardPoints > 0 ? ` + ${rewardPoints} ${copy.points}` : ""}`
      : paymentMode === "prepaid"
        ? copy.onlineSafe
        : copy.codStillOpen;
  const paymentSafetyChecks = paymentAssist?.safety_checks.slice(0, 2) ?? [];
  const paymentAgentActions = paymentAssist?.agent_actions.slice(0, 1) ?? [];
  const protectionItems = contract?.contract.items.slice(0, 3) ?? [];
  const primaryProtection = protectionItems[0]?.claim ?? contract?.contract.summary ?? copy.protectionPending;
  const decisionFacts = [
    {
      label: copy.trustScore,
      value: trustScore === null ? t(language, "checkingEllipsis") : `${trustScore}/100`
    },
    {
      label: copy.priceProof,
      value: currentPrice ? `Rs ${currentPrice}` : t(language, "checkingEllipsis")
    },
    {
      label: copy.productFit,
      value: keepScore === null ? t(language, "checkingEllipsis") : `${keepScore}/100`
    }
  ];

  async function handlePlaceOrder() {
    if (!selectedVariant || !checkout || !contract || ordering) return;
    setOrdering(true);
    setError(null);
    try {
      const response = await placeCheckoutOrder({
        buyer_id: buyerId,
        variant_id: selectedVariant.variant_id,
        contract_id: contract.contract_id,
        payment_mode: paymentMode,
        buying_for_someone_else: wearerMode !== "self",
        wearer_label: wearerLabelFor(wearerMode, language)
      });
      setPlacedOrder(response.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(language, "orderPlaceError"));
    } finally {
      setOrdering(false);
    }
  }

  if (placedOrder) {
    return (
      <section className="checkout-page-shell">
        <div className="checkout-success-panel">
          <span className="checkout-success-icon"><PackageCheck size={30} /></span>
          <div>
            <span className="eyebrow">{t(language, "orderPlaced")}</span>
            <h1>{copy.orderPlacedTitle}</h1>
            <p>{paymentMode === "prepaid" ? copy.prepaidOrderBody : copy.codOrderBody}</p>
          </div>
          <div className="checkout-success-actions">
            <button type="button" className="checkout-page-primary" onClick={() => navigate("/shop/orders")}>
              {t(language, "viewMyOrders")}
            </button>
            <button type="button" className="checkout-page-secondary" onClick={() => navigate("/shop")}>
              {t(language, "continueShopping")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page-shell">
      <header className="checkout-page-header">
        <button type="button" onClick={() => navigate(product ? `/shop/product/${encodeURIComponent(product.product_id)}${variantId ? `?variant=${encodeURIComponent(variantId)}` : ""}` : "/shop")}>
          <ArrowLeft size={16} />
          {copy.back}
        </button>
        <div>
          <span className="eyebrow">{t(language, "secureCheckout")}</span>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
      </header>

      <nav className="checkout-progress" aria-label="Checkout steps">
        <span className="active"><b>1</b> Review item</span>
        <span><b>2</b> Choose payment</span>
        <span><b>3</b> Place order</span>
      </nav>
      <p className="checkout-continuity-note">
        <ShieldCheck size={15} />
        Your item, payment choice, and buyer protection stay visible until you place the order.
      </p>

      {error && <div className="notice error">{error}</div>}
      {contractError && <div className="notice error">{contractError}</div>}

      <div className="checkout-page-layout">
        <main className="checkout-page-main">
          <section className="checkout-step-card checkout-order-card">
            <div className="checkout-step-head">
              <span>1</span>
              <div>
                <h2>{copy.reviewItemTitle}</h2>
                <p>{copy.reviewItemBody}</p>
              </div>
            </div>

            <div className="checkout-page-item">
              {product ? (
                <>
                  <img
                    src={checkoutProductImage(product)}
                    alt={product.title}
                    onError={(event) => { event.currentTarget.src = fallbackProductImage(product.color_family); }}
                  />
                  <div>
                    <span>{t(language, "soldBy")} {product.seller_name}</span>
                    <h3>{product.title.split("-")[0].trim()}</h3>
                    <p>{selectedVariant ? `${t(language, "size")} ${selectedVariant.size}` : copy.confirmingItem}</p>
                  </div>
                  <strong className="checkout-line-price">Rs {payablePrice || "--"}</strong>
                </>
              ) : (
                <div>
                  <span className="eyebrow">{copy.itemInCheckout}</span>
                  <h3>{loading ? t(language, "checkingEllipsis") : copy.confirmingItem}</h3>
                </div>
              )}
            </div>

            <div className="checkout-protection-line">
              <ShieldCheck size={17} />
              <div>
                <strong>{contract ? copy.protectionLocked : copy.protectionPending}</strong>
                <p>{primaryProtection}</p>
              </div>
            </div>
          </section>

          <section className="checkout-step-card checkout-payment-section">
            <div className="checkout-step-head">
              <span>2</span>
              <div>
                <h2>{copy.paymentMethodTitle}</h2>
                <p>{copy.paymentMethodBody}</p>
              </div>
            </div>

            <div className={`checkout-payment-recommendation ${prepaidRecommended ? "prepaid" : "cod"}`}>
              <div>
                <span>{copy.sarthiRecommendation}</span>
                <strong>{recommendedPaymentLabel}</strong>
                <p>{paymentAssist?.summary ?? (prepaidRecommended ? copy.payOnlineBody : copy.codBody)}</p>
              </div>
              <div className="checkout-recommendation-facts" aria-label={copy.whatSarthiChecked}>
                {decisionFacts.map((fact) => (
                  <span key={fact.label}>
                    <b>{fact.value}</b>
                    <small>{fact.label}</small>
                  </span>
                ))}
              </div>
            </div>

            {(paymentSafetyChecks.length > 0 || paymentAgentActions.length > 0) && (
              <div className="checkout-payment-proofline" aria-label={copy.paymentConfidence}>
                {paymentSafetyChecks.map((check) => (
                  <span key={check.key} className={check.status}>
                    {check.status === "passed" ? <CheckCircle2 size={13} /> : <ShieldCheck size={13} />}
                    {check.label}
                  </span>
                ))}
                {paymentAgentActions.map((action) => (
                  <span key={action.label} className={action.done ? "passed" : "watch"}>
                    {action.done ? <CheckCircle2 size={13} /> : <ShieldCheck size={13} />}
                    {action.label}
                  </span>
                ))}
              </div>
            )}

            <div className="checkout-payment-options-page" aria-label={copy.paymentOptions}>
              <PaymentChoiceCard
                mode="prepaid"
                selected={paymentMode === "prepaid"}
                recommended={prepaidRecommended}
                disabled={!checkout}
                title={t(language, "payOnline")}
                badge={prepaidRecommended ? copy.recommended : copy.available}
                body={prepaidRecommended ? benefitLine(paymentAssist, language, copy) : copy.onlineAvailableButNotPushed}
                onSelect={setPaymentMode}
              />
              <PaymentChoiceCard
                mode="cod"
                selected={paymentMode === "cod"}
                recommended={!prepaidRecommended}
                disabled={!checkout}
                title={t(language, "cashOnDelivery")}
                badge={!prepaidRecommended ? copy.recommended : copy.backup}
                body={!prepaidRecommended ? copy.codRecommendedReason : copy.codBackupReason}
                onSelect={setPaymentMode}
              />
            </div>

            {paymentAssist && paymentAssist.offers.length > 0 && (
              <div className="checkout-offer-strip" aria-label={copy.offersChecked}>
                <span>{copy.offersChecked}</span>
                <div>
                  {paymentAssist.offers.slice(0, 3).map((offer) => (
                    <b key={offer.offer_id} className={offer.eligible ? "eligible" : ""}>
                      {offer.label}: {offer.eligible && offer.amount_rupees > 0 ? `Rs ${offer.amount_rupees}` : copy.notEligible}
                    </b>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section className="checkout-step-card checkout-wearer-page">
            <div className="checkout-step-head">
              <span>3</span>
              <div>
                <h2>{t(language, "whoIsThisOrderFor")}</h2>
                <p>{t(language, "fitMemorySelfOnly")}</p>
              </div>
            </div>
            <div className="checkout-wearer-toggle-page" role="group" aria-label={t(language, "whoIsThisOrderFor")}>
              {wearerOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={wearerMode === option.value ? "active" : ""}
                  onClick={() => setWearerMode(option.value)}
                >
                  {wearerLabelFor(option.value, language)}
                </button>
              ))}
            </div>
          </section>

          <details className="checkout-page-details">
            <summary>{copy.viewTrustDetails}</summary>
            <div className="checkout-page-detail-grid">
              <div>
                <span>{copy.trustScore}</span>
                <strong>{trustScore === null ? t(language, "checkingEllipsis") : `${trustScore}/100`}</strong>
                <small>{cartConfidence?.checkout_nudge.trust_condition ?? copy.trustChecked}</small>
              </div>
              <div>
                <span>{copy.priceProof}</span>
                <strong>Rs {currentPrice || selectedVariant?.current_price || "--"}</strong>
                <small>{priceDelta === null ? copy.priceLedgerChecked : priceDelta > 0 ? `Rs ${priceDelta} ${copy.lower}` : copy.noPricePressure}</small>
              </div>
              <div>
                <span>{copy.productFit}</span>
                <strong>{keepScore === null ? t(language, "checkingEllipsis") : `${keepScore}/100`}</strong>
                <small>{keepConfidence?.headline ?? copy.fitChecked}</small>
              </div>
            </div>
            {contract && (
              <div className="checkout-contract-mini">
                <strong>{copy.protectionLocked}</strong>
                <p>{contract.contract.summary}</p>
                {protectionItems.length > 0 && (
                  <ul>
                    {protectionItems.map((item) => (
                      <li key={`${item.dimension}-${item.claim}`}>{item.claim}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </details>
        </main>

        <aside className="checkout-page-summary" aria-label={copy.orderSummary}>
          <div className="checkout-summary-card">
            <h2>{copy.orderSummary}</h2>
            {product && (
              <div className="checkout-summary-mini-item">
                <img
                  src={checkoutProductImage(product)}
                  alt=""
                  onError={(event) => { event.currentTarget.src = fallbackProductImage(product.color_family); }}
                />
                <div>
                  <strong>{product.title.split("-")[0].trim()}</strong>
                  <span>{selectedVariant ? `${t(language, "size")} ${selectedVariant.size}` : copy.confirmingItem}</span>
                </div>
              </div>
            )}
            <div className="checkout-summary-price">
              <span>{copy.toPay}</span>
              <strong>Rs {payablePrice || "--"}</strong>
            </div>
            <div className="checkout-summary-row">
              <span>{copy.itemTotal}</span>
              <b>Rs {payablePrice || "--"}</b>
            </div>
            {referenceSavings > 0 && (
              <div className="checkout-summary-row">
                <span>{copy.productDiscount}</span>
                <b>- Rs {referenceSavings}</b>
              </div>
            )}
            <div className="checkout-summary-row">
              <span>{copy.paymentChoice}</span>
              <b>{paymentMode === "prepaid" ? t(language, "payOnline") : t(language, "cashOnDelivery")}</b>
            </div>
            <div className="checkout-summary-row benefit">
              <span>{copy.benefit}</span>
              <b>{selectedPaymentBenefit}</b>
            </div>
            <div className="checkout-summary-safety">
              <span><ShieldCheck size={14} /> {copy.trustChecked}</span>
              <span><Gift size={14} /> {copy.protectionLocked}</span>
            </div>
            <button
              type="button"
              className="checkout-page-primary"
              disabled={orderDisabled}
              onClick={() => void handlePlaceOrder()}
            >
              {ordering ? t(language, "placingOrder") : paymentMode === "prepaid" ? t(language, "placePrepaidOrder") : t(language, "placeCodOrder")}
            </button>
            {!contract && (
              <small className="checkout-summary-note">
                {loading ? copy.lockingProtection : copy.protectionMissing}
              </small>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function PaymentChoiceCard({
  mode,
  selected,
  recommended,
  disabled,
  title,
  badge,
  body,
  onSelect
}: {
  mode: "prepaid" | "cod";
  selected: boolean;
  recommended: boolean;
  disabled: boolean;
  title: string;
  badge: string;
  body: string;
  onSelect: (mode: "prepaid" | "cod") => void;
}) {
  const Icon = mode === "prepaid" ? CreditCard : Banknote;
  return (
    <button
      type="button"
      className={`checkout-pay-card ${mode} ${selected ? "selected" : ""} ${recommended ? "recommended" : ""}`}
      onClick={() => onSelect(mode)}
      disabled={disabled}
    >
      <span className="checkout-pay-icon"><Icon size={19} /></span>
      <span>
        <em>{badge}</em>
        <strong>{title}</strong>
        <small>{body}</small>
      </span>
      {selected && <CheckCircle2 size={18} />}
    </button>
  );
}

function wearerLabelFor(value: WearerMode, language: LanguageCode) {
  if (value === "mother") return t(language, "mother");
  if (value === "sister") return t(language, "sister");
  if (value === "friend") return t(language, "friend");
  return t(language, "myself");
}

function benefitLine(paymentAssist: PaymentAssist | null, language: LanguageCode, copy: CheckoutPageCopy) {
  if (!paymentAssist) return copy.onlineSafe;
  if (paymentAssist.total_prepaid_benefit_rupees > 0) {
    return `Rs ${paymentAssist.total_prepaid_benefit_rupees} + ${paymentAssist.reward_points} ${copy.points}`;
  }
  return language === "hindi" ? "Trust check pass hone par online pay useful hai." : "Useful when Sarthi trust checks pass.";
}

function fallbackProductImage(color: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}

function checkoutProductImage(product: Product) {
  const source = product.image_url?.trim() ?? "";
  if (!source || source.includes("placehold.co") || source.includes("text=")) {
    return fallbackProductImage(product.color_family);
  }
  return source;
}

type CheckoutPageCopy = ReturnType<typeof checkoutPageCopy>;

function checkoutPageCopy(language: LanguageCode) {
  if (language === "hindi") {
    return {
      title: "Checkout",
      subtitle: "Item, protection, payment aur total confirm karo.",
      back: "Item par wapas",
      missingCheckout: "Checkout item missing hai.",
      loadFailed: "Checkout load nahi hua. Retry karo.",
      contractFailed: "Protection lock nahi hua. Retry karo.",
      itemInCheckout: "Checkout item",
      confirmingItem: "Selected item confirm ho raha hai",
      reviewItemTitle: "Item review karo",
      reviewItemBody: "Size, seller aur price confirm karke payment choose karo.",
      paymentMethodTitle: "Payment method",
      paymentMethodBody: "Available options me se ek choose karo. Sarthi recommendation side note hai, final choice aapki hai.",
      sarthiDecision: "Sarthi decision",
      sarthiRecommendation: "Sarthi recommendation",
      payOnlineTitle: "Pay online yahan safe lag raha hai",
      codTitle: "Is order ke liye COD safer hai",
      payOnlineBody: "Trust, price aur return risk checks pass hue. Online pay par reward mil sakta hai.",
      codBody: "Kuch proof weak hai, isliye Sarthi abhi COD suggest karta hai.",
      youGet: "Aapko mil sakta hai",
      safestNow: "Abhi safest",
      points: "Sarthi points",
      codStillOpen: "COD bhi available hai",
      paymentOptions: "Payment options",
      recommended: "Recommended",
      available: "Available",
      backup: "Backup",
      onlineAvailableButNotPushed: "Available hai, par Sarthi push nahi kar raha.",
      codRecommendedReason: "Proof strong hone tak money risk kam rahega.",
      codBackupReason: "Online pay safe hai, par COD open rahega.",
      offersChecked: "Bank aur UPI offers checked",
      notEligible: "not eligible",
      whatSarthiChecked: "Sarthi ne kya check kiya",
      paymentConfidence: "Payment confidence checks",
      viewTrustDetails: "Trust, price aur protection details",
      trustScore: "Trust score",
      priceProof: "Price proof",
      productFit: "Fit check",
      trustChecked: "Trust checked",
      priceLedgerChecked: "Server price ledger checked",
      lower: "lower than previous",
      noPricePressure: "No price pressure",
      fitChecked: "Size aur return signals checked",
      protectionLocked: "Order protection locked",
      protectionPending: "Protection lock ho raha hai",
      orderSummary: "Order summary",
      toPay: "To pay",
      itemTotal: "Item total",
      productDiscount: "Product discount",
      referencePrice: "Earlier price",
      paymentChoice: "Payment choice",
      benefit: "Benefit",
      onlineSafe: "Online pay safe",
      codSafer: "COD safer",
      lockingProtection: "Protection lock ho raha hai...",
      protectionMissing: "Protection lock ke bina order disabled hai.",
      orderPlacedTitle: "Order placed safely",
      prepaidOrderBody: "Pay online selected. Rewards delivery ke baad update honge.",
      codOrderBody: "COD selected. Sarthi ne trust ko pehle rakha."
    };
  }

  if (language === "hinglish") {
    return {
      title: "Checkout",
      subtitle: "Item, protection, payment aur total confirm karo.",
      back: "Back to item",
      missingCheckout: "Checkout item missing hai.",
      loadFailed: "Checkout load nahi hua. Retry karo.",
      contractFailed: "Protection lock nahi hua. Retry karo.",
      itemInCheckout: "Checkout item",
      confirmingItem: "Selected item confirm ho raha hai",
      reviewItemTitle: "Review item",
      reviewItemBody: "Size, seller aur price confirm karke payment choose karo.",
      paymentMethodTitle: "Payment method",
      paymentMethodBody: "Available options me se ek choose karo. Sarthi recommendation side note hai, final choice aapki hai.",
      sarthiDecision: "Sarthi decision",
      sarthiRecommendation: "Sarthi recommendation",
      payOnlineTitle: "Pay online yahan safe lag raha hai",
      codTitle: "Is order ke liye COD safer hai",
      payOnlineBody: "Trust, price aur return risk checks pass hue. Online pay par reward mil sakta hai.",
      codBody: "Kuch proof weak hai, isliye Sarthi abhi COD suggest karta hai.",
      youGet: "You can get",
      safestNow: "Safest now",
      points: "Sarthi points",
      codStillOpen: "COD bhi available hai",
      paymentOptions: "Payment options",
      recommended: "Recommended",
      available: "Available",
      backup: "Backup",
      onlineAvailableButNotPushed: "Available hai, par Sarthi push nahi kar raha.",
      codRecommendedReason: "Proof strong hone tak money risk kam rahega.",
      codBackupReason: "Online pay safe hai, par COD open rahega.",
      offersChecked: "Bank aur UPI offers checked",
      notEligible: "not eligible",
      whatSarthiChecked: "What Sarthi checked",
      paymentConfidence: "Payment confidence checks",
      viewTrustDetails: "Trust, price aur protection details",
      trustScore: "Trust score",
      priceProof: "Price proof",
      productFit: "Fit check",
      trustChecked: "Trust checked",
      priceLedgerChecked: "Server price ledger checked",
      lower: "lower than previous",
      noPricePressure: "No price pressure",
      fitChecked: "Size aur return signals checked",
      protectionLocked: "Order protection locked",
      protectionPending: "Locking order protection",
      orderSummary: "Order summary",
      toPay: "To pay",
      itemTotal: "Item total",
      productDiscount: "Product discount",
      referencePrice: "Earlier price",
      paymentChoice: "Payment choice",
      benefit: "Benefit",
      onlineSafe: "Online pay safe",
      codSafer: "COD safer",
      lockingProtection: "Protection lock ho raha hai...",
      protectionMissing: "Protection lock ke bina order disabled hai.",
      orderPlacedTitle: "Order placed safely",
      prepaidOrderBody: "Pay online selected. Rewards delivery ke baad update honge.",
      codOrderBody: "COD selected. Sarthi ne trust ko pehle rakha."
    };
  }

  return {
    title: "Checkout",
    subtitle: "Confirm the item, protection, payment method, and final total.",
    back: "Back to item",
    missingCheckout: "Checkout item is missing.",
    loadFailed: "Checkout could not load. Please retry.",
    contractFailed: "Could not lock order protection. Please retry.",
    itemInCheckout: "Checkout item",
    confirmingItem: "Confirming selected item",
    reviewItemTitle: "Review item",
    reviewItemBody: "Confirm the seller, size, price, and protection before payment.",
    paymentMethodTitle: "Payment method",
    paymentMethodBody: "Choose how you want to pay. Sarthi's recommendation is shown as a helper, not a separate step.",
    sarthiDecision: "Sarthi decision",
    sarthiRecommendation: "Sarthi recommendation",
    payOnlineTitle: "Pay online looks safe here",
    codTitle: "COD is safer for this order",
    payOnlineBody: "Trust, price, and return-risk checks passed. Online pay can unlock rewards.",
    codBody: "Some proof is still weak, so Sarthi recommends COD for now.",
    youGet: "You can get",
    safestNow: "Safest now",
    points: "Sarthi points",
    codStillOpen: "COD is still available",
    paymentOptions: "Payment options",
    recommended: "Recommended",
    available: "Available",
    backup: "Backup",
    onlineAvailableButNotPushed: "Available, but Sarthi is not pushing it.",
    codRecommendedReason: "Keeps money risk lower until proof improves.",
    codBackupReason: "Online pay is safe, but COD remains open.",
    offersChecked: "Bank and UPI offers checked",
    notEligible: "not eligible",
    whatSarthiChecked: "What Sarthi checked",
    paymentConfidence: "Payment confidence checks",
    viewTrustDetails: "Trust, price, and protection details",
    trustScore: "Trust score",
    priceProof: "Price proof",
    productFit: "Fit check",
    trustChecked: "Trust checked",
    priceLedgerChecked: "Server price ledger checked",
    lower: "lower than previous",
    noPricePressure: "No price pressure",
    fitChecked: "Size and return signals checked",
    protectionLocked: "Order protection locked",
    protectionPending: "Locking order protection",
    orderSummary: "Order summary",
    toPay: "To pay",
    itemTotal: "Item total",
    productDiscount: "Product discount",
    referencePrice: "Earlier price",
    paymentChoice: "Payment choice",
    benefit: "Benefit",
    onlineSafe: "Online pay safe",
    codSafer: "COD safer",
    lockingProtection: "Locking protection...",
    protectionMissing: "Order is disabled until protection is locked.",
    orderPlacedTitle: "Order placed safely",
    prepaidOrderBody: "Pay online selected. Rewards update after delivery.",
    codOrderBody: "COD selected. Sarthi kept trust first."
  };
}
