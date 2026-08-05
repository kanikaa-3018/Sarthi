import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Banknote, CheckCircle2, CreditCard, LockKeyhole, ShieldCheck } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { createExpectationContract, getProductDetail, placeCheckoutOrder, verifyOffer } from "../api/client";
import { t, type LanguageCode } from "../i18n";
import type {
  BuyerOrderItem,
  CheckoutResponse,
  ExpectationContract,
  PaymentAssist,
  PaymentAssistChoice,
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

  // --- Address State Machine ---
  type CheckoutStep = "address" | "payment" | "otp" | "success";
  const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>("address");
  const [address, setAddress] = useState({ name: "", phone: "", flat: "", area: "", city: "", pincode: "" });
  const [addressErrors, setAddressErrors] = useState<Partial<typeof address>>({});

  // COD OTP state
  const [generatedOtp] = useState(() => String(Math.floor(100000 + Math.random() * 900000)));
  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  // Order invoice
  const [invoiceNo] = useState(() => `SRTH${Date.now().toString().slice(-8)}`);
  const [trackingId] = useState(() => `TRK${Date.now().toString().slice(-10)}`);
  const deliveryDate = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

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
      getProductDetail(buyerId, productId, variantId),
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
  const darkPatternShield = paymentAssist?.dark_pattern_shield ?? checkout?.offer.dark_pattern_shield ?? null;
  const checkoutDecision = paymentAssist?.checkout_confidence ?? null;
  const prepaidRecommended = Boolean(cartConfidence?.checkout_nudge.prepaid_recommended || paymentAssist?.recommended_mode === "prepaid");
  const trustScore = cartConfidence ? Math.round(cartConfidence.overall_score * 100) : null;
  const keepScore = keepConfidence ? Math.round(keepConfidence.score * 100) : null;
  const totalBenefit = paymentAssist?.total_prepaid_benefit_rupees ?? 0;
  const paymentEconomics = paymentAssist?.payment_economics ?? null;
  const rewardPoints = paymentAssist?.reward_points ?? 0;
  const currentPrice = checkout?.offer.price_evidence.latest_price ?? selectedVariant?.current_price ?? 0;
  const referencePrice = checkout?.offer.price_evidence.reference_price ?? null;
  const priceDelta = checkout?.offer.price_evidence.price_delta ?? null;
  const payablePrice = selectedVariant?.current_price ?? currentPrice;
  const referenceSavings = referencePrice && payablePrice && referencePrice > payablePrice ? referencePrice - payablePrice : 0;
  const orderDisabled = !checkout || !selectedVariant || !contract || ordering;
  const selectedPaymentBenefit =
    paymentMode === "prepaid" && totalBenefit > 0
      ? `Rs ${totalBenefit}${rewardPoints > 0 ? ` + ${rewardPoints} ${copy.points}` : ""}`
      : paymentMode === "prepaid"
        ? copy.onlineSafe
        : copy.codStillOpen;
  const recommendationTitle = checkoutDecision?.headline ?? (prepaidRecommended ? copy.payOnlineTitle : copy.codTitle);
  const recommendationReason = checkoutDecision?.payment_reason ?? paymentAssist?.summary ?? (prepaidRecommended ? copy.payOnlineBody : copy.codBody);
  const paymentBenefitLine = paymentEconomics?.buyer_benefit_copy ?? (prepaidRecommended ? copy.payOnlineBody : copy.codBody);
  const paymentImpactLine = paymentEconomics?.company_benefit_copy ?? cartConfidence?.checkout_nudge.company_benefit ?? copy.paymentImpactFallback;
  const paymentSafetyChecks = paymentAssist?.safety_checks.slice(0, 2) ?? [];
  const paymentAgentActions = paymentAssist?.agent_actions.slice(0, 1) ?? [];
  const protectionItems = contract?.contract.items ?? [];
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

  function validateAddress() {
    const errs: Partial<typeof address> = {};
    if (!address.name.trim()) errs.name = "Name required";
    if (!/^\d{10}$/.test(address.phone)) errs.phone = "10-digit number required";
    if (!address.flat.trim()) errs.flat = "House / flat required";
    if (!address.area.trim()) errs.area = "Area required";
    if (!address.city.trim()) errs.city = "City required";
    if (!/^\d{6}$/.test(address.pincode)) errs.pincode = "6-digit pincode";
    setAddressErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleAddressNext() {
    if (validateAddress()) setCheckoutStep("payment");
  }

  async function handlePlaceOrder() {
    if (!selectedVariant || !checkout || !contract || ordering) return;
    if (paymentMode === "cod") {
      setCheckoutStep("otp");
      return;
    }
    setOrdering(true);
    try {
      const response = await placeCheckoutOrder({
        buyer_id: buyerId,
        variant_id: selectedVariant!.variant_id,
        contract_id: contract!.contract_id,
        payment_mode: "prepaid",
        buying_for_someone_else: wearerMode !== "self",
        wearer_label: wearerLabelFor(wearerMode, language)
      });
      setPlacedOrder(response.order);
      setCheckoutStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : t(language, "orderPlaceError"));
    } finally {
      setOrdering(false);
    }
  }

  async function handleOtpConfirm() {
    if (otpInput.trim() !== generatedOtp) {
      setOtpError("OTP does not match. Please check and retry.");
      return;
    }
    setOtpError(null);
    setOrdering(true);
    try {
      const response = await placeCheckoutOrder({
        buyer_id: buyerId,
        variant_id: selectedVariant!.variant_id,
        contract_id: contract!.contract_id,
        payment_mode: "cod",
        buying_for_someone_else: wearerMode !== "self",
        wearer_label: wearerLabelFor(wearerMode, language)
      });
      setPlacedOrder(response.order);
      setCheckoutStep("success");
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : t(language, "orderPlaceError"));
    } finally {
      setOrdering(false);
    }
  }

  // ---- Render: Success ----
  if (checkoutStep === "success" || placedOrder) {
    const successCopy = checkoutSuccessCopy(language, paymentMode);
    return (
      <section className="checkout-page-shell">
        <div className="checkout-success-shell">
          <div className="checkout-success-badge-container">
            <div className="checkout-success-icon-check">✓</div>
          </div>
          <h1>{successCopy.title}</h1>
          <p className="checkout-success-sub">
            {successCopy.subtitle}
          </p>
          
          <div className="checkout-success-invoice">
            {product && (
              <div className="checkout-success-product-strip">
                <img
                  src={checkoutProductImage(product)}
                  alt=""
                  onError={(event) => { event.currentTarget.src = fallbackProductImage(product.color_family); }}
                  className="checkout-success-product-img"
                />
                <div className="checkout-success-product-info">
                  <h4>{product.title.split("-")[0].trim()}</h4>
                  <p>{t(language, "size")} {selectedVariant?.size || "XL"}</p>
                </div>
              </div>
            )}
            
            <div className="checkout-success-receipt-divider" />

            <div className="checkout-invoice-row">
              <span>{successCopy.invoiceNo}</span>
              <strong>{invoiceNo}</strong>
            </div>
            <div className="checkout-invoice-row">
              <span>{successCopy.trackingId}</span>
              <strong>{trackingId}</strong>
            </div>
            <div className="checkout-invoice-row">
              <span>{successCopy.estimatedDelivery}</span>
              <strong>{deliveryDate}</strong>
            </div>
            <div className="checkout-invoice-row">
              <span>{successCopy.amount}</span>
              <strong>Rs {payablePrice || "--"}</strong>
            </div>
            <div className="checkout-invoice-row">
              <span>{successCopy.payment}</span>
              <strong>{successCopy.paymentMode}</strong>
            </div>
            <div className="checkout-invoice-row">
              <span>{successCopy.deliveryTo}</span>
              <strong>{address.name}, {address.flat}, {address.area}, {address.city} - {address.pincode}</strong>
            </div>
          </div>
          <div className="checkout-success-actions">
            <button type="button" className="checkout-page-primary" onClick={() => navigate("/shop/orders")}>
              {successCopy.trackOrder}
            </button>
            <button type="button" className="checkout-page-secondary" onClick={() => navigate("/shop")}>
              {t(language, "continueShopping")}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ---- Render: COD OTP ----
  if (checkoutStep === "otp") {
    return (
      <section className="checkout-page-shell">
        <div className="checkout-otp-shell">
          <button type="button" className="checkout-back-link" onClick={() => setCheckoutStep("payment")}>
            <ArrowLeft size={16} /> Back
          </button>
          <div className="checkout-otp-card">
            <Banknote size={28} style={{ color: "var(--accent-green, #16a34a)" }} />
            <h2>Confirm your order with OTP</h2>
            <p>A one-time password has been sent to <strong>{address.phone}</strong></p>
            <div className="checkout-otp-display">
              <span>Your OTP: </span>
              <strong className="otp-code">{generatedOtp}</strong>
              <small>Use this code to confirm this order.</small>
            </div>
            <label className="checkout-otp-label">
              Enter OTP
              <input
                type="text"
                maxLength={6}
                value={otpInput}
                onChange={e => setOtpInput(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit OTP"
                className="checkout-otp-input"
                autoFocus
              />
            </label>
            {otpError && <div className="notice error">{otpError}</div>}
            <button
              type="button"
              className="checkout-page-primary"
              onClick={() => void handleOtpConfirm()}
              disabled={ordering || otpInput.length < 6}
            >
              {ordering ? "Placing order..." : "Verify & Place Order"}
            </button>
          </div>
        </div>
      </section>
    );
  }

  // ---- Render: Address ----
  if (checkoutStep === "address") {
    return (
      <section className="checkout-page-shell">
        <header className="checkout-page-header">
          <button type="button" onClick={() => navigate(product ? `/shop/product/${encodeURIComponent(product.product_id)}` : "/shop")}>
            <ArrowLeft size={16} />
            Back
          </button>
          <div>
            <span className="eyebrow">Step 1 of 3</span>
            <h1>Delivery address</h1>
          </div>
        </header>
        <nav className="checkout-progress" aria-label="Checkout steps">
          <span className="active"><b>1</b> Address</span>
          <span><b>2</b> Payment</span>
          <span><b>3</b> Confirm</span>
        </nav>

        <div className="checkout-address-form">
          <div className="address-form-grid">
            {([
              { key: "name", label: "Full name", placeholder: "Your name", type: "text" },
              { key: "phone", label: "Phone number", placeholder: "10-digit mobile", type: "tel" },
              { key: "flat", label: "House / flat / floor", placeholder: "e.g. 12B, 2nd floor", type: "text" },
              { key: "area", label: "Area / street", placeholder: "Colony, street name", type: "text" },
              { key: "city", label: "City", placeholder: "Mumbai, Delhi...", type: "text" },
              { key: "pincode", label: "Pincode", placeholder: "6-digit pincode", type: "text" }
            ] as const).map(({ key, label, placeholder, type }) => (
              <label key={key} className="address-field">
                <span>{label}</span>
                <input
                  type={type}
                  value={address[key]}
                  onChange={e => setAddress(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className={addressErrors[key] ? "error" : ""}
                />
                {addressErrors[key] && <small className="field-error">{addressErrors[key]}</small>}
              </label>
            ))}
          </div>
          <button
            type="button"
            className="checkout-page-primary"
            onClick={handleAddressNext}
            disabled={loading}
          >
            Continue to Payment
          </button>
        </div>
      </section>
    );
  }

  if (loading) {
    return (
      <div className="checkout-page-shell loading-skeleton" aria-hidden="true">
        <header className="checkout-page-header">
          <div className="skeleton-btn" />
          <div className="skeleton-title-group" style={{ display: "inline-block", verticalAlign: "middle", marginLeft: "12px", width: "180px" }}>
            <span className="skeleton-text short" style={{ height: "10px", margin: "2px 0" }} />
            <span className="skeleton-text medium" style={{ height: "16px", margin: 0 }} />
          </div>
        </header>

        <div className="checkout-page-layout">
          <main className="checkout-page-main">
            {/* Review Items Card */}
            <div className="skeleton-card" style={{ height: "160px" }}>
              <span className="skeleton-text short" />
              <div style={{ display: "flex", gap: "16px", marginTop: "16px" }}>
                <div className="skeleton-image" style={{ width: "80px", height: "100px", borderRadius: "6px" }} />
                <div style={{ flex: 1 }}>
                  <span className="skeleton-text medium" />
                  <span className="skeleton-text long" />
                </div>
              </div>
            </div>

            {/* Buying for who Card */}
            <div className="skeleton-card" style={{ height: "140px" }}>
              <span className="skeleton-text short" />
              <div style={{ display: "flex", gap: "8px", margin: "12px 0" }}>
                <div className="skeleton-btn" style={{ borderRadius: "6px", width: "70px", height: "35px" }} />
                <div className="skeleton-btn" style={{ borderRadius: "6px", width: "70px", height: "35px" }} />
                <div className="skeleton-btn" style={{ borderRadius: "6px", width: "70px", height: "35px" }} />
              </div>
            </div>

            {/* Billing Card */}
            <div className="skeleton-card" style={{ height: "180px" }}>
              <span className="skeleton-text short" />
              <span className="skeleton-text long" />
              <span className="skeleton-text medium" />
            </div>
          </main>

          <aside className="checkout-page-sidebar">
            {/* Summary / Price Details Card */}
            <div className="skeleton-card" style={{ height: "200px" }}>
              <span className="skeleton-text short" />
              <span className="skeleton-text long" style={{ margin: "12px 0" }} />
              <span className="skeleton-text medium" />
              <span className="skeleton-text long" />
            </div>

            {/* Safe Payment Guide */}
            <div className="skeleton-card" style={{ height: "160px" }}>
              <span className="skeleton-text short" />
              <span className="skeleton-text long" />
              <span className="skeleton-text medium" />
            </div>

            {/* Place Order Sticky Buy Button */}
            <div className="skeleton-card" style={{ height: "80px", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <div className="skeleton-btn" style={{ width: "80%", height: "44px", borderRadius: "8px" }} />
            </div>
          </aside>
        </div>
      </div>
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
              <div>
                <span className="checkout-protection-badge">Guarantee Active</span>
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

            <PaymentCoachPanel
              paymentAssist={paymentAssist}
              paymentMode={paymentMode}
              onSelect={setPaymentMode}
              disabled={!checkout}
              prepaidRecommended={prepaidRecommended}
              decisionFacts={decisionFacts}
              darkPatternShield={darkPatternShield}
              checkoutDecision={checkoutDecision}
              contractLocked={Boolean(contract)}
              totalBenefit={totalBenefit}
              rewardPoints={rewardPoints}
              codCharge={paymentEconomics?.cod_extra_charge_rupees ?? 0}
              copy={copy}
              language={language}
            />
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
                  <table className="checkout-protection-table">
                    <thead>
                      <tr>
                        <th>Guarantee</th>
                        <th>Coverage details</th>
                        <th>Lock status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {protectionItems.map((item) => {
                        const statusClass = (item.status || item.confidence || "").toLowerCase();
                        return (
                          <tr key={`${item.dimension}-${item.claim}`} className={`status-${statusClass}`}>
                            <td className="col-guarantee">{labelize(item.dimension)}</td>
                            <td className="col-claim">{item.claim}</td>
                            <td className="col-status">
                              <span className={`status-pill status-pill--${statusClass}`}>
                                {item.status ? labelize(item.status) : labelize(item.confidence)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
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
              <span className="safety-tag safety-tag--trust">{copy.trustChecked}</span>
              <span className="safety-tag safety-tag--protection">{contract ? copy.protectionLocked : copy.protectionPending}</span>
              <span className="safety-tag safety-tag--payment">{checkoutDecision?.payment_choice.message ?? copy.noForcedPayment}</span>
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

function PaymentCoachPanel({
  paymentAssist,
  paymentMode,
  onSelect,
  disabled,
  prepaidRecommended,
  decisionFacts,
  darkPatternShield,
  checkoutDecision,
  contractLocked,
  totalBenefit,
  rewardPoints,
  codCharge,
  copy,
  language
}: {
  paymentAssist: PaymentAssist | null;
  paymentMode: "prepaid" | "cod";
  onSelect: (mode: "prepaid" | "cod") => void;
  disabled: boolean;
  prepaidRecommended: boolean;
  decisionFacts: Array<{ label: string; value: string }>;
  darkPatternShield: PaymentAssist["dark_pattern_shield"] | null;
  checkoutDecision: PaymentAssist["checkout_confidence"] | null;
  contractLocked: boolean;
  totalBenefit: number;
  rewardPoints: number;
  codCharge: number;
  copy: CheckoutPageCopy;
  language: LanguageCode;
}) {
  const saving = totalBenefit > 0 ? totalBenefit : 38;
  const pts = rewardPoints > 0 ? rewardPoints : 25;
  const codFee = codCharge > 0 ? codCharge : 0;
  const coach = paymentCoachCopy(language, saving, pts, codFee);

  return (
    <div className="pcp-root" aria-label="Payment method">

      {/* PREPAID CARD (Pay Online) */}
      <button
        type="button"
        className={`pcp-card pcp-card--prepaid ${paymentMode === "prepaid" ? "pcp-card--active" : ""}`}
        onClick={() => onSelect("prepaid")}
        disabled={disabled}
        aria-pressed={paymentMode === "prepaid"}
      >
        <div className="pcp-card__indicator" />
        <div className="pcp-card__body">
          <div className="pcp-card__label-row">
            <span className="pcp-card__mode">{coach.payOnlineMode}</span>
            {prepaidRecommended && <span className="pcp-badge pcp-badge--best">{coach.bestChoice}</span>}
          </div>
          
          <div className="pcp-card__trust-list">
            <div className="pcp-card__trust-item">
              <span className="pcp-card__bullet-dot" />
              <span>{coach.refundLine}</span>
            </div>
            <div className="pcp-card__trust-item">
              <span className="pcp-card__bullet-dot" />
              <span>{coach.bankLine}</span>
            </div>
            <div className="pcp-card__trust-item">
              <span className="pcp-card__bullet-dot" />
              <span>{coach.saveLine}</span>
            </div>
          </div>
        </div>
        <div className="pcp-card__radio" />
      </button>

      {/* CASH ON DELIVERY CARD */}
      <button
        type="button"
        className={`pcp-card pcp-card--cod ${paymentMode === "cod" ? "pcp-card--active" : ""}`}
        onClick={() => onSelect("cod")}
        disabled={disabled}
        aria-pressed={paymentMode === "cod"}
      >
        <div className="pcp-card__indicator" />
        <div className="pcp-card__body">
          <div className="pcp-card__label-row">
            <span className="pcp-card__mode">{coach.codMode}</span>
            {codFee > 0 && <span className="pcp-badge pcp-badge--warn">{coach.codFee}</span>}
          </div>
          
          <div className="pcp-card__trust-list">
            <div className="pcp-card__trust-item">
              <span className="pcp-card__bullet-dot" />
              <span>{coach.codPayLine}</span>
            </div>
            <div className="pcp-card__trust-item">
              <span className="pcp-card__bullet-dot" />
              <span>{coach.codTradeoffLine}</span>
            </div>
          </div>
        </div>
        <div className="pcp-card__radio" />
      </button>

      {/* Prepaid switch micro-nudge */}
      {paymentMode === "cod" && prepaidRecommended && (
        <div className="pcp-nudge-bar">
          <span>{coach.switchLine}</span>
          <button type="button" className="pcp-nudge-cta" onClick={() => onSelect("prepaid")} disabled={disabled}>
            {coach.switchCta}
          </button>
        </div>
      )}
    </div>
  );
}

function checkoutSuccessCopy(language: LanguageCode, paymentMode: "prepaid" | "cod") {
  if (language === "hindi") {
    return {
      title: "ऑर्डर प्लेस हुआ",
      subtitle: paymentMode === "cod" ? "कैश ऑन डिलीवरी चुना गया. डिलीवरी पर पेमेंट करें." : "UPI पेमेंट कन्फर्म हुआ.",
      invoiceNo: "इनवॉइस नंबर",
      trackingId: "ट्रैकिंग ID",
      estimatedDelivery: "अनुमानित डिलीवरी",
      amount: "राशि",
      payment: "पेमेंट",
      paymentMode: paymentMode === "cod" ? "कैश ऑन डिलीवरी" : "UPI प्रीपेड",
      deliveryTo: "डिलीवरी पता",
      trackOrder: "ऑर्डर ट्रैक करें"
    };
  }
  if (language === "hinglish") {
    return {
      title: "Order placed",
      subtitle: paymentMode === "cod" ? "COD selected. Delivery par payment karna." : "Online payment confirm ho gaya.",
      invoiceNo: "Invoice no.",
      trackingId: "Tracking ID",
      estimatedDelivery: "Estimated delivery",
      amount: "Amount",
      payment: "Payment",
      paymentMode: paymentMode === "cod" ? "Cash on Delivery" : "Online Payment",
      deliveryTo: "Delivery to",
      trackOrder: "Track order"
    };
  }
  return {
    title: "Order placed",
    subtitle: paymentMode === "cod" ? "Cash on delivery selected. Pay when you receive it." : "Online payment confirmed.",
    invoiceNo: "Invoice no.",
    trackingId: "Tracking ID",
    estimatedDelivery: "Estimated delivery",
    amount: "Amount",
    payment: "Payment",
    paymentMode: paymentMode === "cod" ? "Cash on Delivery" : "Online payment",
    deliveryTo: "Delivery to",
    trackOrder: "Track order"
  };
}

function paymentCoachCopy(language: LanguageCode, saving: number, points: number, codFee: number) {
  if (language === "hindi") {
    return {
      payOnlineMode: "ऑनलाइन पेमेंट (UPI, कार्ड, नेटबैंकिंग)",
      bestChoice: "बेहतर विकल्प",
      refundLine: "रिफंड भरोसा: रिटर्न पिकअप के बाद रिफंड उसी स्रोत में शुरू होगा.",
      bankLine: "बैंक सुरक्षा: नेटवर्क या बैंक दिक्कत पर ट्रांजैक्शन सुरक्षित तरीके से संभलता है.",
      saveLine: `इस चेकआउट पर Rs ${saving} बचत और ${points} Sarthi points मिल सकते हैं.`,
      codMode: "कैश ऑन डिलीवरी (COD)",
      codFee: `+Rs ${codFee} हैंडलिंग शुल्क`,
      codPayLine: "डिलीवरी पर ही पेमेंट करें.",
      codTradeoffLine: "दरवाजे पर UPI या कैश चलेगा. ऑनलाइन डिस्काउंट और points लागू नहीं होंगे.",
      switchLine: `Rs ${saving} बचत और रिफंड भरोसा पाने के लिए ऑनलाइन पेमेंट चुनें.`,
      switchCta: "ऑनलाइन पेमेंट चुनें"
    };
  }
  if (language === "hinglish") {
    return {
      payOnlineMode: "Pay online (UPI, Card, Netbanking)",
      bestChoice: "Best choice",
      refundLine: "Refund promise: return pickup ke baad source refund start hota hai.",
      bankLine: "Bank protection: network ya bank issue aaye toh payment safely handle hoti hai.",
      saveLine: `Is checkout par Rs ${saving} save + ${points} Sarthi points mil sakte hain.`,
      codMode: "Cash on delivery (COD)",
      codFee: `+Rs ${codFee} handling fee`,
      codPayLine: "Item deliver hone par payment karo.",
      codTradeoffLine: "Door par UPI/cash chalega. Online discount aur reward points apply nahi honge.",
      switchLine: `Pay online choose karke Rs ${saving} save aur refund promise unlock karo.`,
      switchCta: "Pay online choose karo"
    };
  }
  return {
    payOnlineMode: "Pay online (UPI, Card, Netbanking)",
    bestChoice: "Best choice",
    refundLine: "Refund promise: source refund starts after return pickup.",
    bankLine: "Bank protection: payment is handled safely if a network or bank issue happens.",
    saveLine: `Save Rs ${saving} on this checkout and earn ${points} Sarthi points.`,
    codMode: "Cash on delivery (COD)",
    codFee: `+Rs ${codFee} handling fee`,
    codPayLine: "Pay only when your item is delivered.",
    codTradeoffLine: "UPI or cash is accepted at the door. Online discount and reward points will not apply.",
    switchLine: `Switch to Pay online to save Rs ${saving} and unlock the refund promise.`,
    switchCta: "Switch to Pay online"
  };
}

function paymentModeLabel(choice: PaymentAssistChoice, language: LanguageCode) {
  return choice.mode === "prepaid" ? t(language, "payOnline") : t(language, "cashOnDelivery");
}

function fallbackPaymentFacts(
  choice: PaymentAssistChoice,
  totalBenefit: number,
  rewardPoints: number,
  codCharge: number,
  copy: CheckoutPageCopy
): NonNullable<PaymentAssistChoice["quick_facts"]> {
  if (choice.mode === "prepaid") {
    const unlocked = choice.recommended && totalBenefit > 0;
    return [
      {
        key: "saving",
        label: "Save",
        value: unlocked ? `Rs ${totalBenefit}` : copy.notUnlocked,
        status: unlocked ? "positive" : "warning",
        detail: unlocked ? "Offer saving is shown after trust and price checks." : choice.next_step
      },
      {
        key: "reward",
        label: "Reward",
        value: unlocked ? `${rewardPoints} pts` : "Pending",
        status: unlocked ? "positive" : "neutral",
        detail: unlocked ? "Reward points are estimated for this checkout." : copy.onlineAvailableButNotPushed
      },
      {
        key: "refund",
        label: "Refund",
        value: "Locked",
        status: "positive",
        detail: "Return and refund expectations are locked before payment."
      }
    ];
  }

  return [
    {
      key: "pay_later",
      label: "Pay",
      value: "On delivery",
      status: "neutral",
      detail: "Cash payment remains open for buyer comfort."
    },
    {
      key: "charge",
      label: "Charge",
      value: codCharge > 0 ? `Rs ${codCharge}` : "Rs 0",
      status: codCharge > 0 ? "warning" : "positive",
      detail: codCharge > 0 ? "The COD charge is disclosed before order placement." : "No COD charge is added here."
    },
    {
      key: "choice",
      label: "Choice",
      value: "Not forced",
      status: "positive",
      detail: copy.noForcedPayment
    }
  ];
}

function fallbackPaymentChoices(
  prepaidRecommended: boolean,
  totalBenefit: number,
  rewardPoints: number,
  codCharge: number,
  copy: CheckoutPageCopy
): PaymentAssistChoice[] {
  return [
    {
      mode: "prepaid",
      label: "Pay online",
      recommended: prepaidRecommended,
      enabled: true,
      confidence_score: prepaidRecommended ? 70 : 50,
      headline: prepaidRecommended ? copy.payOnlineTitle : copy.onlineAvailableButNotPushed,
      one_line: prepaidRecommended ? copy.payOnlineBody : copy.codBody,
      primary_benefit: prepaidRecommended && totalBenefit > 0 ? `Rs ${totalBenefit} + ${rewardPoints} ${copy.points}` : copy.notUnlocked,
      buyer_outcome: prepaidRecommended ? copy.payOnlineBody : copy.onlineAvailableButNotPushed,
      marketplace_outcome: copy.paymentImpactFallback,
      risk_label: prepaidRecommended ? copy.onlineSafe : copy.codSafer,
      cta: prepaidRecommended ? t("english", "payOnline") : copy.backup,
      quick_facts: [
        {
          key: "saving",
          label: "Save",
          value: prepaidRecommended && totalBenefit > 0 ? `Rs ${totalBenefit}` : copy.notUnlocked,
          status: prepaidRecommended ? "positive" : "warning",
          detail: prepaidRecommended ? copy.payOnlineBody : copy.onlineAvailableButNotPushed
        },
        {
          key: "reward",
          label: "Reward",
          value: prepaidRecommended && rewardPoints > 0 ? `${rewardPoints} pts` : "Pending",
          status: prepaidRecommended ? "positive" : "neutral",
          detail: prepaidRecommended ? "Rewards are estimated before order placement." : copy.codRecommendedReason
        },
        {
          key: "refund",
          label: "Refund",
          value: "Locked",
          status: "positive",
          detail: "Return and refund expectations are locked before payment."
        }
      ],
      checks: [],
      next_step: prepaidRecommended ? copy.payOnlineBody : copy.codRecommendedReason
    },
    {
      mode: "cod",
      label: "Cash on delivery",
      recommended: !prepaidRecommended,
      enabled: true,
      confidence_score: prepaidRecommended ? 64 : 72,
      headline: prepaidRecommended ? copy.codStillOpen : copy.codTitle,
      one_line: codCharge > 0 ? `Rs ${codCharge} ${copy.codCharge}` : copy.codStillOpen,
      primary_benefit: codCharge > 0 ? `Rs ${codCharge} ${copy.codCharge}` : copy.codStillOpen,
      buyer_outcome: copy.codRecommendedReason,
      marketplace_outcome: copy.paymentImpactFallback,
      risk_label: copy.noForcedPayment,
      cta: t("english", "cashOnDelivery"),
      quick_facts: [
        {
          key: "pay_later",
          label: "Pay",
          value: "On delivery",
          status: "neutral",
          detail: "Cash payment remains open for buyer comfort."
        },
        {
          key: "charge",
          label: "Charge",
          value: codCharge > 0 ? `Rs ${codCharge}` : "Rs 0",
          status: codCharge > 0 ? "warning" : "positive",
          detail: codCharge > 0 ? "The COD charge is shown before order placement." : "No COD charge is added here."
        },
        {
          key: "choice",
          label: "Choice",
          value: "Not forced",
          status: "positive",
          detail: copy.noForcedPayment
        }
      ],
      checks: [],
      next_step: copy.codBackupReason
    }
  ];
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

function DarkPatternShieldPanel({ shield }: { shield: NonNullable<PaymentAssist["dark_pattern_shield"]> }) {
  const issues = shield.checks.filter((check) => check.status !== "clear");
  const visibleChecks = issues.length
    ? issues.slice(0, 4)
    : shield.checks
        .filter((check) => ["repeating_countdown_timer", "drip_pricing", "forced_prepaid", "hidden_return_conditions"].includes(check.key))
        .slice(0, 4);
  return (
    <section className={`checkout-compliance-shield ${shield.status}`} aria-label="Dark pattern disruptor">
      <div className="checkout-compliance-head">
        <span className="checkout-compliance-icon">
          {shield.status === "clear" ? <ShieldCheck size={17} /> : <AlertTriangle size={17} />}
        </span>
        <div>
          <span>{shield.status === "clear" ? "Pressure check" : "Checkout warning"}</span>
          <strong>{shield.headline}</strong>
          <p>{shield.plain_copy}</p>
        </div>
        <b>{shield.risk_count === 0 ? "Clear" : `${shield.risk_count} risks`}</b>
      </div>
      {visibleChecks.length > 0 && (
        <div className="checkout-compliance-checks">
          {visibleChecks.map((check) => (
            <span key={`${check.key}-${check.product_id ?? "cart"}`} className={check.status}>
              {check.status === "clear" ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
              {shortDarkPatternLabel(check.key, check.label)}
            </span>
          ))}
        </div>
      )}
      {issues.length > 0 && (
        <details className="checkout-compliance-details">
          <summary>Why Sarthi slowed this down</summary>
          <ul>
            {issues.slice(0, 5).map((check) => (
              <li key={`${check.key}-detail-${check.product_id ?? "cart"}`}>
                <strong>{check.label}</strong>
                <span>{check.buyer_copy}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function CheckoutConfidencePanel({
  decision,
  contractLocked
}: {
  decision: NonNullable<PaymentAssist["checkout_confidence"]>;
  contractLocked: boolean;
}) {
  const watchFactors = decision.factors.filter((factor) => factor.status !== "passed");
  const visibleFactors = (watchFactors.length ? watchFactors : decision.factors).slice(0, 4);
  return (
    <section className={`checkout-confidence-panel ${decision.recommended_mode}`} aria-label="Checkout confidence">
      <div className="checkout-confidence-copy">
        <span>Payment guidance</span>
        <strong>{decision.headline}</strong>
        <p>{decision.buyer_next_step}</p>
      </div>
      <div className="checkout-confidence-factors" aria-label="Checkout confidence factors">
        {visibleFactors.map((factor) => (
          <span key={factor.key} className={factor.status}>
            {factor.status === "passed" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
            {factor.label}
          </span>
        ))}
      </div>
      <div className="checkout-safeguard-list" aria-label="Checkout safeguards">
        {decision.safeguards.map((item) => {
          const status = item.key === "refund_lock" ? contractLocked ? "passed" : "watch" : item.status;
          const detail = item.key === "refund_lock" && contractLocked
            ? "Refund expectation is locked before payment."
            : item.detail;
          return (
            <span key={item.key} className={status}>
              {item.key === "refund_lock" ? <LockKeyhole size={13} /> : status === "passed" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              <b>{item.label}</b>
              <small>{detail}</small>
            </span>
          );
        })}
      </div>
    </section>
  );
}

function shortDarkPatternLabel(key: string, fallback: string) {
  const labels: Record<string, string> = {
    repeating_countdown_timer: "Timer stable",
    fake_scarcity: "Scarcity checked",
    sudden_price_hike_before_discount: "Price history checked",
    drip_pricing: "No hidden fee",
    basket_sneaking: "No add-on sneaked",
    forced_prepaid: "Payment choice open",
    misleading_only_today_offer: "Offer wording checked",
    hidden_return_conditions: "Return terms visible"
  };
  return labels[key] ?? fallback;
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

type CheckoutPageCopy = Record<string, string>;

function checkoutPageCopy(language: LanguageCode): CheckoutPageCopy {
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
      paymentMethodBody: "Pay Online ya COD choose karo. Mode force nahi hota.",
      sarthiDecision: "Sarthi decision",
      sarthiRecommendation: "Sarthi recommendation",
      checkoutAdvice: "Checkout advice",
      payOnlineTitle: "Pay online yahan safe lag raha hai",
      codTitle: "Is order ke liye COD safer hai",
      payOnlineBody: "Trust, price aur return risk checks pass hue. Online pay par reward mil sakta hai.",
      codBody: "Kuch proof weak hai, isliye Sarthi abhi COD suggest karta hai.",
      youGet: "Aapko mil sakta hai",
      onlineBenefit: "Online benefit",
      notUnlocked: "Not unlocked",
      codCharge: "COD charge",
      whyThisRecommendation: "Why this recommendation",
      buyerBenefit: "Buyer benefit",
      marketplaceBenefit: "Marketplace benefit",
      choiceControl: "Payment choice",
      paymentImpactFallback: "Pay online push tabhi dikhta hai jab buyer trust checks pass hote hain.",
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
      paymentCoachLabel: "Interactive payment guide",
      sarthiRecommends: "Sarthi recommends",
      scoreLabel: "score",
      yourChoice: "Your choice",
      benefitLabel: "Benefit",
      riskLabel: "Risk",
      nextStepLabel: "Next step",
      tapCheck: "Tap a check",
      checksPassed: "checks passed",
      noRushSignal: "Price proof signal",
      clear: "Clear",
      risks: "risks",
      fullCheckoutProof: "Full checkout proof",
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
      noForcedPayment: "No forced payment mode",
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
      paymentMethodBody: "Pay Online ya COD choose karo. Mode force nahi hota.",
      sarthiDecision: "Sarthi decision",
      sarthiRecommendation: "Sarthi recommendation",
      checkoutAdvice: "Checkout advice",
      payOnlineTitle: "Pay online yahan safe lag raha hai",
      codTitle: "Is order ke liye COD safer hai",
      payOnlineBody: "Trust, price aur return risk checks pass hue. Online pay par reward mil sakta hai.",
      codBody: "Kuch proof weak hai, isliye Sarthi abhi COD suggest karta hai.",
      youGet: "You can get",
      onlineBenefit: "Online benefit",
      notUnlocked: "Not unlocked",
      codCharge: "COD charge",
      whyThisRecommendation: "Why this recommendation",
      buyerBenefit: "Buyer benefit",
      marketplaceBenefit: "Marketplace benefit",
      choiceControl: "Payment choice",
      paymentImpactFallback: "Pay online push tabhi dikhta hai jab buyer trust checks pass hote hain.",
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
      paymentCoachLabel: "Interactive payment guide",
      sarthiRecommends: "Sarthi recommends",
      scoreLabel: "score",
      yourChoice: "Your choice",
      benefitLabel: "Benefit",
      riskLabel: "Risk",
      nextStepLabel: "Next step",
      tapCheck: "Tap a check",
      checksPassed: "checks passed",
      noRushSignal: "Price proof signal",
      clear: "Clear",
      risks: "risks",
      fullCheckoutProof: "Full checkout proof",
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
      noForcedPayment: "No forced payment mode",
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
    paymentMethodBody: "Choose Pay online or COD. No forced mode.",
    sarthiDecision: "Sarthi decision",
    sarthiRecommendation: "Sarthi recommendation",
    checkoutAdvice: "Checkout advice",
    payOnlineTitle: "Pay online looks safe here",
    codTitle: "COD is safer for this order",
    payOnlineBody: "Trust, price, and return-risk checks passed. Online pay can unlock rewards.",
    codBody: "Some proof is still weak, so Sarthi recommends COD for now.",
    youGet: "You can get",
    onlineBenefit: "Online benefit",
    notUnlocked: "Not unlocked",
    codCharge: "COD charge",
    whyThisRecommendation: "Why this recommendation",
    buyerBenefit: "Buyer benefit",
    marketplaceBenefit: "Marketplace benefit",
    choiceControl: "Payment choice",
    paymentImpactFallback: "Pay online is shown only when buyer trust checks pass first.",
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
    paymentCoachLabel: "Interactive payment guide",
    sarthiRecommends: "Sarthi recommends",
    scoreLabel: "score",
    yourChoice: "Your choice",
    benefitLabel: "Benefit",
    riskLabel: "Risk",
    nextStepLabel: "Next step",
    tapCheck: "Tap a check",
    checksPassed: "checks passed",
    noRushSignal: "Price proof signal",
    clear: "Clear",
    risks: "risks",
    fullCheckoutProof: "Full checkout proof",
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
    noForcedPayment: "No forced payment mode",
    lockingProtection: "Locking protection...",
    protectionMissing: "Order is disabled until protection is locked.",
    orderPlacedTitle: "Order placed safely",
    prepaidOrderBody: "Pay online selected. Rewards update after delivery.",
    codOrderBody: "COD selected. Sarthi kept trust first."
  };
}

function labelize(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
