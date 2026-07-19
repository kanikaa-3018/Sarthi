import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  CircleAlert,
  CreditCard,
  Database,
  EyeOff,
  Gauge,
  Heart,
  Lock,
  PackageCheck,
  RefreshCcw,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Users,
  type LucideIcon
} from "lucide-react";
import {
  correctOrderOutcome,
  deleteMemory,
  getBuyerDashboard,
  getBuyerOrders,
  getMemory,
  getSystemReadiness,
  saveFitProfile,
  updateMemorySettings
} from "../api/client";
import { t, type LanguageCode } from "../i18n";
import type {
  BuyerDashboardResponse,
  BuyerMemoryResponse,
  BuyerOrderItem,
  BuyerOrdersResponse,
  FitMemory,
  PrivacySummary,
  SystemReadiness
} from "../types/api";

type Props = {
  buyerId: string;
  language: LanguageCode;
};

type Tone = "safe" | "watch" | "danger" | "neutral";
type FitQuiz = {
  usual_size: string;
  preferred_fit: "comfort" | "regular";
  body_cue: string;
};

const CORRECTION_REASONS = [
  { code: "too_small", label: "Size was small", group: "size" },
  { code: "too_large", label: "Size was large", group: "size" },
  { code: "fabric_different", label: "Fabric issue", group: "fabric" },
  { code: "color_different", label: "Colour issue", group: "color" },
  { code: "damaged", label: "Damaged item", group: "quality" },
  { code: "delivery_late", label: "Delivery issue", group: "delivery" }
] as const;

export function TrustCenter({ buyerId, language }: Props) {
  const navigate = useNavigate();
  const [data, setData] = useState<BuyerMemoryResponse | null>(null);
  const [dashboard, setDashboard] = useState<BuyerDashboardResponse | null>(null);
  const [orders, setOrders] = useState<BuyerOrdersResponse | null>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [preferredFit, setPreferredFit] = useState<"comfort" | "regular">("comfort");
  const [fitQuiz, setFitQuiz] = useState<FitQuiz>({
    usual_size: "M",
    preferred_fit: "comfort",
    body_cue: "between_sizes"
  });
  const [quizOpen, setQuizOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [correctionReasonByOrder, setCorrectionReasonByOrder] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, [buyerId]);

  async function load() {
    setBusy(true);
    setLoading(true);
    setError(null);
    try {
      const [payload, dashboardPayload, ordersPayload, readinessPayload] = await Promise.all([
        getMemory(buyerId),
        getBuyerDashboard(buyerId),
        getBuyerOrders(buyerId),
        getSystemReadiness()
      ]);
      const nextPreferredFit = normalizePreferredFit(
        dashboardPayload.profile.preferred_fit ?? payload.memory[0]?.preferred_fit ?? "comfort"
      );
      setData(payload);
      setDashboard(dashboardPayload);
      setOrders(ordersPayload);
      setReadiness(readinessPayload);
      setPreferredFit(nextPreferredFit);
      setFitQuiz((current) => ({ ...current, preferred_fit: nextPreferredFit }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load trust settings");
    } finally {
      setBusy(false);
      setLoading(false);
    }
  }

  async function toggleMemory(enabled: boolean) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await updateMemorySettings(buyerId, { fit_memory_enabled: enabled });
      await load();
      setStatus(enabled ? "Fit help is on." : "Fit help is paused.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update memory setting");
    } finally {
      setBusy(false);
    }
  }

  async function savePreference(nextFit = preferredFit) {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await updateMemorySettings(buyerId, { preferred_fit: nextFit });
      await load();
      setStatus("Fit choice saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update fit preference");
    } finally {
      setBusy(false);
    }
  }

  async function saveQuiz() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await Promise.all([
        updateMemorySettings(buyerId, { preferred_fit: fitQuiz.preferred_fit }),
        saveFitProfile(buyerId, {
          label: "My fit",
          relationship: "self",
          active: true,
          preferred_fit: fitQuiz.preferred_fit,
          size_map: { women_kurtis: fitQuiz.usual_size },
          notes: [`Body cue: ${fitQuiz.body_cue}`]
        })
      ]);
      setQuizOpen(false);
      await load();
      setStatus("Fit quiz saved. Sarthi has a better starting point now.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save fit quiz");
    } finally {
      setBusy(false);
    }
  }

  async function eraseMemory() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const result = await deleteMemory(buyerId);
      await load();
      setStatus(`${result.deleted_fit_memory_records} size record(s) deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete memory");
    } finally {
      setBusy(false);
    }
  }

  async function submitCorrection(order: BuyerOrderItem) {
    const selectedReason = correctionReasonByOrder[order.order_id] ?? order.return_reason ?? "fabric_different";
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await correctOrderOutcome(buyerId, order.order_id, {
        return_reason: selectedReason,
        correction_note: selectedReason.includes("too_")
          ? "Buyer confirmed this outcome was about size."
          : "Buyer corrected this outcome away from size fit."
      });
      await load();
      setExpandedOrderId(order.order_id);
      setStatus("Correction saved. Future advice will use the corrected reason.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save correction");
    } finally {
      setBusy(false);
    }
  }

  const copy = trustCenterCopy(language);
  const privacy = data?.privacy ?? dashboard?.privacy;
  const completedOrders = orders?.orders.filter((order) =>
    !["placed", "placed_pending_feedback", "delivered_needs_feedback"].includes(order.status)
  ) ?? [];
  const latestOrder = completedOrders[0] ?? null;
  const isLearning = Boolean(
    dashboard &&
    (dashboard.activity.total_outcomes < 3 ||
      (privacy?.memory_record_count ?? 0) < 2 ||
      dashboard.review_credibility.risk_band === "new_user")
  );

  return (
    <main className="trust-center-shell trust-center-v5">
      <section className="trust-hero-section trust-hero-simple trust-account-header">
        <div className="trust-title-block">
          <span className="eyebrow">{copy.trustCenter}</span>
          <h2>{copy.title}</h2>
          <p>{copy.subtitle}</p>
          <div className="trust-header-meta" aria-label="Trust center status">
            <span>
              <Lock size={13} />
              Fit memory private
            </span>
            <span>
              <PackageCheck size={13} />
              {dashboard ? `${dashboard.activity.total_outcomes} orders learnt` : "Orders loading"}
            </span>
          </div>
        </div>
        <div className="trust-header-actions">
          <div className="trust-quick-actions" aria-label="Trust center navigation">
            <button type="button" onClick={() => navigate("/shop")}>
              <ShoppingBag size={15} />
              {t(language, "shop")}
            </button>
            <button type="button" onClick={() => navigate("/shop/wishlist")}>
              <Heart size={15} />
              {t(language, "wishlist")}
            </button>
            <button type="button" onClick={() => navigate("/shop/orders")}>
              <PackageCheck size={15} />
              {t(language, "myOrders")}
            </button>
          </div>
          <button className="trust-refresh-button" onClick={load} disabled={busy} title="Refresh trust center" aria-label="Refresh trust center">
            <RefreshCcw size={15} className={busy ? "spin-icon" : ""} />
          </button>
        </div>
      </section>

      {(error || status) && (
        <div className="trust-message-row">
          {error && <div className="notice error trust-inline-message">{error}</div>}
          {status && <div className="notice success trust-inline-message">{status}</div>}
        </div>
      )}

      {data && privacy && dashboard ? (
        <>
          <TrustSnapshotBar dashboard={dashboard} privacy={privacy} />

          <section className="trust-controls-group" aria-label="Fit and privacy controls">
            <header>
              <div>
                <span className="eyebrow">Fit and privacy</span>
                <h3>You control what Sarthi remembers</h3>
              </div>
              <p>Use fit memory for better advice, pause it at any time, or delete the saved size facts below.</p>
            </header>
            <div className="trust-control-strip">
              <FitHelpControl
                enabled={privacy.fit_memory_enabled}
                memoryCount={privacy.memory_record_count}
                busy={busy}
                onToggle={() => void toggleMemory(!privacy.fit_memory_enabled)}
                copy={copy}
              />

              {isLearning ? (
                <FitLearningCard
                  quiz={fitQuiz}
                  open={quizOpen}
                  busy={busy}
                  copy={copy}
                  onOpenChange={setQuizOpen}
                  onQuizChange={setFitQuiz}
                  onSave={() => void saveQuiz()}
                />
              ) : (
                <FitJourneyPreview
                  latestOrder={latestOrder}
                  memoryCount={privacy.memory_record_count}
                  onOpenOrder={(orderId) => setExpandedOrderId(orderId)}
                />
              )}
            </div>
          </section>

          <CheckoutGuidanceLine guidance={dashboard.checkout_guidance} copy={copy} />

          <section className="trust-center-grid">
            <div className="trust-main-column">
              <ProofChecklist
                dashboard={dashboard}
                privacy={privacy}
                readiness={readiness}
                open={proofOpen}
                copy={copy}
                onToggle={() => setProofOpen((current) => !current)}
              />

              <section className="trust-card trust-preference-card">
                <div className="trust-card-header">
                  <div>
                    <span className="eyebrow">Fit choice</span>
                    <h3>How clothes should feel</h3>
                  </div>
                </div>
                <div className="fit-preference-row">
                  <select value={preferredFit} onChange={(event) => setPreferredFit(normalizePreferredFit(event.target.value))}>
                    <option value="comfort">Comfort fit</option>
                    <option value="regular">Regular fit</option>
                  </select>
                  <button className="btn-primary" onClick={() => void savePreference()} disabled={busy}>
                    Save
                  </button>
                  <button className="btn-danger" onClick={eraseMemory} disabled={busy || data.memory.length === 0}>
                    <Trash2 size={15} />
                    Delete size facts
                  </button>
                </div>
              </section>

              <FitJourneyTimeline
                orders={completedOrders}
                memories={data.memory}
                expandedOrderId={expandedOrderId}
                correctionReasonByOrder={correctionReasonByOrder}
                busy={busy}
                onExpandedOrderChange={setExpandedOrderId}
                onCorrectionChange={(orderId, reason) =>
                  setCorrectionReasonByOrder((current) => ({ ...current, [orderId]: reason }))
                }
                onSubmitCorrection={(order) => void submitCorrection(order)}
              />
            </div>

            <aside className="trust-side-column">
              <PrivacyDataCard
                Icon={Database}
                title="Used for advice"
                items={privacy.used}
                tone="safe"
              />
              <PrivacyDataCard
                Icon={EyeOff}
                title="Never shown to sellers"
                items={privacy.not_used}
                tone="neutral"
              />
              <ReviewFairnessCard dashboard={dashboard} />
              {readiness && <SystemReadinessCard readiness={readiness} guardrails={dashboard.guardrails} />}
            </aside>
          </section>
        </>
      ) : loading ? (
        <TrustCenterSkeleton />
      ) : (
        <section className="trust-card trust-load-error">
          <CircleAlert size={20} />
          <div>
            <h3>Trust controls are not available right now</h3>
            <p>Try loading your controls again. Your saved preferences have not been changed.</p>
          </div>
          <button type="button" className="btn-secondary" onClick={load}>Try again</button>
        </section>
      )}
    </main>
  );
}

function TrustSnapshotBar({
  dashboard,
  privacy
}: {
  dashboard: BuyerDashboardResponse;
  privacy: PrivacySummary;
}) {
  const paymentLabel = dashboard.checkout_guidance.prepaid_nudge_allowed ? "Online pay looks okay" : "COD safer for now";
  return (
    <section className="trust-snapshot-bar" aria-label="Trust summary">
      <div className={privacy.fit_memory_enabled ? "safe" : "watch"}>
        <ShieldCheck size={15} />
        <span>Fit help</span>
        <strong>{privacy.fit_memory_enabled ? "On" : "Paused"}</strong>
      </div>
      <div>
        <PackageCheck size={15} />
        <span>Size memory</span>
        <strong>{dashboard.activity.kept_orders} kept</strong>
      </div>
      {dashboard.activity.returned_orders > 0 && (
        <div className="watch">
          <RotateCcw size={15} />
          <span>Returns corrected</span>
          <strong>{dashboard.activity.returned_orders}</strong>
        </div>
      )}
      <div className={dashboard.checkout_guidance.prepaid_nudge_allowed ? "safe" : "watch"}>
        <CreditCard size={15} />
        <span>Before payment</span>
        <strong>{paymentLabel}</strong>
      </div>
    </section>
  );
}

function FitHelpControl({
  enabled,
  memoryCount,
  busy,
  copy,
  onToggle
}: {
  enabled: boolean;
  memoryCount: number;
  busy: boolean;
  copy: ReturnType<typeof trustCenterCopy>;
  onToggle: () => void;
}) {
  return (
    <article className={`fit-help-control ${enabled ? "enabled" : "paused"}`}>
      <div>
        <span className="eyebrow">{copy.realControl}</span>
        <h3>{copy.fitHelp}</h3>
        <p>{enabled ? copy.fitHelpOn(memoryCount) : copy.fitHelpOff}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        className="trust-switch-button"
        onClick={onToggle}
        disabled={busy}
      >
        <span className="trust-switch-track"><span /></span>
        <strong>{enabled ? copy.on : copy.paused}</strong>
      </button>
    </article>
  );
}

function FitLearningCard({
  quiz,
  open,
  busy,
  copy,
  onOpenChange,
  onQuizChange,
  onSave
}: {
  quiz: FitQuiz;
  open: boolean;
  busy: boolean;
  copy: ReturnType<typeof trustCenterCopy>;
  onOpenChange: (open: boolean) => void;
  onQuizChange: (quiz: FitQuiz) => void;
  onSave: () => void;
}) {
  return (
    <article className="fit-learning-card">
      <div className="fit-learning-head">
        <UserRound size={20} />
        <div>
          <span className="eyebrow">{copy.learning}</span>
          <h3>{copy.learningTitle}</h3>
          <p>{copy.learningBody}</p>
        </div>
      </div>
      {!open ? (
        <button type="button" className="btn-primary" onClick={() => onOpenChange(true)}>
          {copy.answerThree}
        </button>
      ) : (
        <div className="fit-quiz-panel">
          <label>
            <span>Usual kurti size</span>
            <select
              value={quiz.usual_size}
              onChange={(event) => onQuizChange({ ...quiz, usual_size: event.target.value })}
            >
              {["S", "M", "L", "XL", "XXL"].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Fit preference</span>
            <select
              value={quiz.preferred_fit}
              onChange={(event) => onQuizChange({ ...quiz, preferred_fit: normalizePreferredFit(event.target.value) })}
            >
              <option value="comfort">Comfort fit</option>
              <option value="regular">Regular fit</option>
            </select>
          </label>
          <label>
            <span>Body cue</span>
            <select
              value={quiz.body_cue}
              onChange={(event) => onQuizChange({ ...quiz, body_cue: event.target.value })}
            >
              <option value="between_sizes">Between sizes</option>
              <option value="shoulder_tight">Shoulder gets tight</option>
              <option value="chest_tight">Chest gets tight</option>
              <option value="likes_loose">Likes loose fit</option>
            </select>
          </label>
          <div className="fit-quiz-actions">
            <button type="button" className="btn-secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={onSave} disabled={busy}>
              Save fit answers
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

function FitJourneyPreview({
  latestOrder,
  memoryCount,
  onOpenOrder
}: {
  latestOrder: BuyerOrderItem | null;
  memoryCount: number;
  onOpenOrder: (orderId: string) => void;
}) {
  return (
    <article className="fit-journey-preview">
      <div>
        <span className="eyebrow">Size memory</span>
        <h3>{memoryCount} useful signal{memoryCount === 1 ? "" : "s"} saved</h3>
        <p>{latestOrder ? payoffLine(latestOrder) : "Kept and returned orders will make future size advice clearer."}</p>
      </div>
      {latestOrder && (
        <button type="button" className="btn-secondary" onClick={() => onOpenOrder(latestOrder.order_id)}>
          Check latest
        </button>
      )}
    </article>
  );
}

function CheckoutGuidanceLine({
  guidance,
  copy
}: {
  guidance: BuyerDashboardResponse["checkout_guidance"];
  copy: ReturnType<typeof trustCenterCopy>;
}) {
  const safe = guidance.prepaid_nudge_allowed;
  return (
    <section className={`checkout-guidance-line ${safe ? "safe" : "watch"}`}>
      {safe ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
      <div>
        <strong>{copy.beforePay}</strong>
        <p>{guidance.message}</p>
      </div>
    </section>
  );
}

function ProofChecklist({
  dashboard,
  privacy,
  readiness,
  open,
  copy,
  onToggle
}: {
  dashboard: BuyerDashboardResponse;
  privacy: PrivacySummary;
  readiness: SystemReadiness | null;
  open: boolean;
  copy: ReturnType<typeof trustCenterCopy>;
  onToggle: () => void;
}) {
  const items = [
    {
      status: privacy.fit_memory_enabled ? "pass" : "warn",
      text: privacy.fit_memory_enabled
        ? copy.checkFitPrivate(privacy.memory_record_count)
        : copy.checkFitPaused
    },
    {
      status: dashboard.activity.total_outcomes ? "pass" : "warn",
      text: dashboard.activity.total_outcomes
        ? copy.checkOutcomes(dashboard.activity.kept_orders, dashboard.activity.returned_orders)
        : copy.checkNoOutcomes
    },
    {
      status: dashboard.review_credibility.risk_band === "high_return" ? "warn" : "pass",
      text: copy.checkReviews(reviewBandLabel(dashboard.review_credibility.risk_band))
    },
    {
      status: dashboard.checkout_guidance.prepaid_nudge_allowed ? "pass" : "warn",
      text: dashboard.checkout_guidance.prepaid_nudge_allowed
        ? copy.checkPaymentSafe
        : copy.checkPaymentCareful
    }
  ] as const;

  return (
    <section className="trust-card proof-checklist-card">
      <div className="trust-card-header">
        <div>
          <span className="eyebrow">{copy.proofLayer}</span>
          <h3>{copy.proofTitle}</h3>
          <p>{copy.proofSubtitle}</p>
        </div>
      </div>
      <div className="plain-proof-list">
        {items.map((item) => (
          <div key={item.text} className={`plain-proof-row ${item.status}`}>
            {item.status === "pass" ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
            <span>{item.text}</span>
          </div>
        ))}
      </div>
      <button type="button" className="proof-detail-toggle" onClick={onToggle} aria-expanded={open}>
        {open ? copy.hideEverything : copy.seeEverything}
      </button>
      {open && (
        <div className="proof-technical-panel">
          <div>
            <strong>Privacy boundary</strong>
            <p>{dashboard.guardrails[0]}</p>
          </div>
          <div>
            <strong>Review fairness</strong>
            <p>{dashboard.review_credibility.explanation}</p>
          </div>
          <div>
            <strong>Data freshness</strong>
            <p>{readiness ? `Sources are ${labelize(readiness.source_health.overall_status)}.` : "Source health is loading."}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function FitJourneyTimeline({
  orders,
  memories,
  expandedOrderId,
  correctionReasonByOrder,
  busy,
  onExpandedOrderChange,
  onCorrectionChange,
  onSubmitCorrection
}: {
  orders: BuyerOrderItem[];
  memories: FitMemory[];
  expandedOrderId: string | null;
  correctionReasonByOrder: Record<string, string>;
  busy: boolean;
  onExpandedOrderChange: (orderId: string | null) => void;
  onCorrectionChange: (orderId: string, reason: string) => void;
  onSubmitCorrection: (order: BuyerOrderItem) => void;
}) {
  const recentOrders = orders.slice(0, 6);
  const keptCount = recentOrders.filter((order) => order.status === "delivered_kept").length;
  const returnCount = recentOrders.filter((order) => order.status === "returned" || order.status === "exchanged").length;
  const excludedCount = recentOrders.filter((order) => order.buying_for_someone_else || order.fit_memory_excluded).length;
  return (
    <section className="trust-card fit-journey-card">
      <div className="trust-card-header">
        <div>
          <span className="eyebrow">Size memory</span>
          <h3>{recentOrders.length ? "What Sarthi remembers for you" : "No size memory yet"}</h3>
          <p>Sarthi uses kept and returned orders to suggest safer sizes. Open a row only if the reason is wrong.</p>
        </div>
      </div>
      {recentOrders.length ? (
        <>
          <div className="fit-journey-meter" aria-label="Size memory summary">
            <span className="safe"><strong>{keptCount}</strong> Kept sizes</span>
            <span className="watch"><strong>{returnCount}</strong> Returns fixed</span>
            <span><strong>{excludedCount}</strong> Not used for your fit</span>
          </div>
          <div className="fit-journey-list">
            {recentOrders.map((order) => {
              const expanded = expandedOrderId === order.order_id;
              const tone = orderTone(order);
              return (
                <article key={order.order_id} className={`fit-journey-item ${order.status} ${expanded ? "expanded" : ""}`}>
                  <button
                    type="button"
                    className="fit-journey-summary"
                    onClick={() => onExpandedOrderChange(expanded ? null : order.order_id)}
                    aria-expanded={expanded}
                  >
                    <span className={`journey-result-icon ${tone}`} aria-hidden="true">
                      {tone === "safe" ? <CheckCircle2 size={18} /> : tone === "watch" ? <RotateCcw size={18} /> : <PackageCheck size={18} />}
                    </span>
                    <span className="fit-journey-copy">
                      <span className="fit-journey-product">{order.product.title}</span>
                      <strong>{orderLearningTitle(order)}</strong>
                      <span className="fit-journey-payoff">{payoffLine(order)}</span>
                      <span className="fit-journey-tags">
                        <span>Size {order.variant.size}</span>
                        <span>{order.product.seller_name ?? "Seller checked"}</span>
                      </span>
                    </span>
                    <span className={`journey-status-pill ${tone}`}>{orderStatusLabel(order)}</span>
                  </button>
                  {expanded && (
                    <OrderCorrectionPanel
                      order={order}
                      selectedReason={correctionReasonByOrder[order.order_id] ?? order.return_reason ?? ""}
                      busy={busy}
                      onReasonChange={(reason) => onCorrectionChange(order.order_id, reason)}
                      onSubmit={() => onSubmitCorrection(order)}
                    />
                  )}
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-memory-state">
          Kept or returned orders will appear here after delivery. Until then, Sarthi asks for more seller proof before giving strong advice.
        </div>
      )}
      {memories.length > 0 && (
        <div className="fit-memory-mini-list" aria-label="Saved size facts">
          <strong>Sarthi will remember</strong>
          {memories.slice(0, 3).map((memory) => (
            <span key={memory.memory_id}>
              {labelize(memory.category)}: size {memory.retained_size}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function OrderCorrectionPanel({
  order,
  selectedReason,
  busy,
  onReasonChange,
  onSubmit
}: {
  order: BuyerOrderItem;
  selectedReason: string;
  busy: boolean;
  onReasonChange: (reason: string) => void;
  onSubmit: () => void;
}) {
  const canCorrect = ["returned", "exchanged"].includes(order.status);
  return (
    <div className="order-correction-panel">
      <div className="correction-panel-head">
        <div>
          <span>Saved reason</span>
          <strong>{order.return_reason ? labelize(order.corrected_return_reason ?? order.return_reason) : "No return reason saved"}</strong>
        </div>
        <span className={`correction-confidence ${orderTone(order)}`}>{canCorrect ? "Can correct" : "No action needed"}</span>
      </div>
      {order.buying_for_someone_else && (
        <div className="order-exclusion-line">
          <Users size={14} />
          <span>This order was for someone else, so it will not change your personal size advice.</span>
        </div>
      )}
      {canCorrect ? (
        <>
          <p className="correction-help-text">If this reason is wrong, choose the correct one. Sarthi will use it next time before suggesting a size.</p>
          <div className="correction-chip-grid">
            {CORRECTION_REASONS.map((reason) => (
              <button
                key={reason.code}
                type="button"
                className={selectedReason === reason.code ? "selected" : ""}
                onClick={() => onReasonChange(reason.code)}
              >
                {reason.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn-primary correction-save-button" onClick={onSubmit} disabled={busy || !selectedReason}>
            Save reason
          </button>
        </>
      ) : (
        <p className="correction-help-text">{order.fit_memory_excluded ? "Sarthi kept this out of your personal fit memory." : "This kept order can improve future size advice."}</p>
      )}
    </div>
  );
}

function PrivacyDataCard({
  Icon,
  title,
  items,
  tone
}: {
  Icon: LucideIcon;
  title: string;
  items: string[];
  tone: Tone;
}) {
  return (
    <section className={`trust-card trust-data-card ${tone}`}>
      <div className="trust-icon-badge">
        <Icon size={18} />
      </div>
      <span className="eyebrow">{title}</span>
      <div className={`trust-chip-list ${tone === "neutral" ? "muted" : ""}`}>
        {items.map((item) => (
          <span key={item}>
            <ShieldCheck size={13} />
            {cleanDataLabel(item)}
          </span>
        ))}
      </div>
    </section>
  );
}

function ReviewFairnessCard({ dashboard }: { dashboard: BuyerDashboardResponse }) {
  return (
    <section className="trust-card trust-data-card review-fairness-card">
      <div className="trust-icon-badge">
        <Gauge size={18} />
      </div>
      <span className="eyebrow">Review fairness</span>
      <h3>{reviewBandLabel(dashboard.review_credibility.risk_band)}</h3>
      <p>{dashboard.review_credibility.explanation}</p>
      <div className="trust-chip-list muted">
        {dashboard.review_credibility.signals.slice(0, 4).map((signal) => (
          <span key={signal}>
            <CircleAlert size={13} />
            {labelize(signal)}
          </span>
        ))}
      </div>
    </section>
  );
}

function SystemReadinessCard({ readiness, guardrails }: { readiness: SystemReadiness; guardrails: string[] }) {
  return (
    <section className="trust-card trust-data-card readiness-card">
      <div className="trust-icon-badge">
        <Database size={18} />
      </div>
      <span className="eyebrow">Live systems</span>
      <div className="readiness-status-row">
        <span>Facts</span>
        <strong>{labelize(readiness.source_health.overall_status)}</strong>
      </div>
      <div className="readiness-status-row">
        <span>AI</span>
        <strong>{labelize(
          readiness.runtime_integrations?.ai.primary_provider === "bedrock"
            ? readiness.runtime_integrations.bedrock.status
            : readiness.runtime_integrations?.ai.primary_provider === "gemini"
              ? readiness.runtime_integrations.gemini.status
              : "disabled"
        )}</strong>
      </div>
      <div className="trust-chip-list muted">
        {guardrails.slice(0, 3).map((item) => (
          <span key={item}>
            <CheckCircle2 size={13} />
            {shortGuardrail(item)}
          </span>
        ))}
      </div>
    </section>
  );
}

function TrustCenterSkeleton() {
  return (
    <section className="trust-center-skeleton" aria-label="Loading trust controls">
      <span />
      <span />
      <span />
      <span />
    </section>
  );
}

function trustCenterCopy(language: LanguageCode) {
  if (language === "hindi") {
    return {
      trustCenter: "ट्रस्ट सेंटर",
      title: "आपके भरोसे के कंट्रोल",
      subtitle: "Sarthi क्या इस्तेमाल कर सकता है, आप चुनते हैं। सेलर आपकी फिट मेमोरी नहीं देखते।",
      realControl: "आपका कंट्रोल",
      fitHelp: "फिट हेल्प",
      on: "चालू",
      paused: "रुका",
      fitHelpOn: (count: number) => `${count} साइज संकेत से फिट सलाह बेहतर होगी।`,
      fitHelpOff: "Sarthi अभी सिर्फ प्रोडक्ट और ऑर्डर संकेत इस्तेमाल करेगा।",
      learning: "जल्दी सेट करें",
      learningTitle: "Sarthi अभी आपकी फिट सीख रहा है",
      learningBody: "3 छोटे जवाब देकर साइज सलाह जल्दी बेहतर करें।",
      answerThree: "3 जवाब दें",
      beforePay: "पेमेंट से पहले",
      proofLayer: "प्रूफ चेक",
      proofTitle: "Sarthi ने क्या चेक किया",
      proofSubtitle: "छोटी checklist. पूरा technical proof अलग से देखें।",
      seeEverything: "Sarthi ने सब क्या देखा",
      hideEverything: "Technical detail छुपाएं",
      checkFitPrivate: (count: number) => `आपकी फिट मेमोरी private है; ${count} size संकेत इस्तेमाल हुए।`,
      checkFitPaused: "फिट मेमोरी रुकी है; private size संकेत इस्तेमाल नहीं हुए।",
      checkOutcomes: (kept: number, returned: number) => `${kept} kept और ${returned} return outcomes check हुए।`,
      checkNoOutcomes: "अभी order outcome कम हैं, इसलिए Sarthi extra proof मांगता है।",
      checkReviews: (band: string) => `Reviews fairness से check हुए: ${band}.`,
      checkPaymentSafe: "Payment nudge तभी दिखता है जब product trust ठीक है।",
      checkPaymentCareful: "Payment pressure रोका गया; पहले proof/size check करें।"
    };
  }
  if (language === "hinglish") {
    return {
      trustCenter: "Trust Center",
      title: "Aapke trust controls",
      subtitle: "Aap choose karte ho Sarthi kya use kare. Seller aapki fit memory nahi dekhte.",
      realControl: "Aapka control",
      fitHelp: "Fit help",
      on: "On",
      paused: "Paused",
      fitHelpOn: (count: number) => `${count} size signal se fit advice better hogi.`,
      fitHelpOff: "Sarthi abhi sirf product aur order signals use karega.",
      learning: "Quick setup",
      learningTitle: "Sarthi abhi aapki fit seekh raha hai",
      learningBody: "3 quick answers se size advice jaldi better hogi.",
      answerThree: "3 answers do",
      beforePay: "Pay karne se pehle",
      proofLayer: "Proof check",
      proofTitle: "Sarthi ne kya check kiya",
      proofSubtitle: "Simple checklist. Full technical proof ek tap ke peeche hai.",
      seeEverything: "Sarthi ne sab kya dekha",
      hideEverything: "Technical detail chhupao",
      checkFitPrivate: (count: number) => `Aapki fit memory private hai; ${count} size signals use hue.`,
      checkFitPaused: "Fit memory paused hai; private size signals use nahi hue.",
      checkOutcomes: (kept: number, returned: number) => `${kept} kept aur ${returned} returned outcomes check hue.`,
      checkNoOutcomes: "Order outcomes kam hain, isliye Sarthi extra proof maangta hai.",
      checkReviews: (band: string) => `Reviews fairness se check hue: ${band}.`,
      checkPaymentSafe: "Payment nudge tabhi dikhta hai jab product trust theek hai.",
      checkPaymentCareful: "Payment pressure roka gaya; pehle proof/size check karo."
    };
  }
  return {
    trustCenter: "Trust Center",
    title: "Your trust controls",
    subtitle: "Choose what Sarthi can use. Sellers never see your fit memory.",
    realControl: "Your control",
    fitHelp: "Fit help",
    on: "On",
    paused: "Paused",
    fitHelpOn: (count: number) => `${count} saved size signal${count === 1 ? "" : "s"} can improve fit advice.`,
    fitHelpOff: "Sarthi will use only product and order evidence for now.",
    learning: "Quick setup",
    learningTitle: "Sarthi is still learning your fit",
    learningBody: "Answer 3 quick questions to speed this up.",
    answerThree: "Answer 3 questions",
    beforePay: "Before you pay",
    proofLayer: "Proof check",
    proofTitle: "What Sarthi checked",
    proofSubtitle: "Simple checklist first. Full technical proof is one tap away.",
    seeEverything: "See everything Sarthi checked",
    hideEverything: "Hide technical detail",
    checkFitPrivate: (count: number) => `Your fit memory is private; ${count} size signal${count === 1 ? "" : "s"} used.`,
    checkFitPaused: "Fit memory is paused; private size signals were not used.",
    checkOutcomes: (kept: number, returned: number) => `${kept} kept and ${returned} returned outcomes checked.`,
    checkNoOutcomes: "Order outcomes are still thin, so Sarthi asks for extra proof.",
    checkReviews: (band: string) => `Reviews were checked for fairness: ${band}.`,
    checkPaymentSafe: "Payment nudges show only when product trust is strong enough.",
    checkPaymentCareful: "Payment pressure is paused; proof or size should be checked first."
  };
}

function reviewBandLabel(band: BuyerDashboardResponse["review_credibility"]["risk_band"]) {
  if (band === "trusted") return "Trusted";
  if (band === "watch") return "Watch";
  if (band === "new_user") return "New buyer";
  return "High return";
}

function orderTone(order: BuyerOrderItem): Tone {
  if (order.status === "delivered_kept") return "safe";
  if (order.status === "returned" || order.status === "exchanged") return "watch";
  return "neutral";
}

function orderStatusLabel(order: BuyerOrderItem) {
  if (order.buying_for_someone_else || order.fit_memory_excluded) return "Not used";
  if (order.status === "delivered_kept") return "Kept";
  if (order.status === "returned") return "Returned";
  if (order.status === "exchanged") return "Exchanged";
  return labelize(order.status);
}

function orderLearningTitle(order: BuyerOrderItem) {
  if (order.buying_for_someone_else || order.fit_memory_excluded) {
    return "Not added to your size memory";
  }
  if (order.status === "delivered_kept") {
    return `Size ${order.variant.size} worked for you`;
  }
  if (order.status === "returned") {
    return `${labelize(order.corrected_return_reason ?? order.return_reason ?? "Return")} noted`;
  }
  if (order.status === "exchanged") {
    return "Exchange reason saved";
  }
  return "Waiting for delivery feedback";
}

function payoffLine(order: BuyerOrderItem) {
  const sellerName = order.product.seller_name ?? "this seller";
  if (order.buying_for_someone_else) {
    return "Sarthi will not use this order for your personal size advice.";
  }
  if (order.status === "delivered_kept") {
    return `Similar fits from ${sellerName} can be trusted more for you.`;
  }
  if (order.status === "exchanged") {
    return "This helps Sarthi warn you before the same fit issue repeats.";
  }
  if (order.status === "returned") {
    return `${labelize(order.corrected_return_reason ?? order.return_reason ?? "Return")} can prevent the same mistake later.`;
  }
  return "This order can improve future checks after feedback.";
}

function cleanDataLabel(value: string) {
  return value
    .replace("fit memory for size guidance", "Fit memory")
    .replace("aggregate order outcomes", "Order outcomes")
    .replace("seller cannot access buyer memory", "No buyer memory")
    .replace("payment credentials", "Payment details")
    .replace("contacts", "Contacts")
    .replace("raw voice", "Raw voice")
    .replace("SMS", "SMS");
}

function shortGuardrail(value: string) {
  if (value.includes("fit memory")) return "Fit memory stays private";
  if (value.includes("Review weight")) return "Reviews cannot easily fake trust";
  if (value.includes("Prepaid")) return "Prepaid needs product trust";
  return value.length > 44 ? `${value.slice(0, 41)}...` : value;
}

function normalizePreferredFit(value: string): "comfort" | "regular" {
  return value === "regular" ? "regular" : "comfort";
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}
