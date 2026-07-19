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

          <section className="trust-control-strip" aria-label="Trust controls">
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
                  <select value={preferredFit} onChange={(event) => setPreferredFit(event.target.value)}>
                    <option value="comfort">Comfort fit</option>
                    <option value="regular">Regular fit</option>
                  </select>
                  <button className="btn-primary" onClick={savePreference} disabled={busy}>
                    Save
                  </button>
                </div>
              </section>

              <section className="trust-card">
                <div className="trust-card-header">
                  <div>
                    <span className="eyebrow">Saved size facts</span>
                    <h3>{data.memory.length ? "Used for better fit" : "No saved size yet"}</h3>
                  </div>
                </div>
                {data.memory.length ? (
                  <div className="memory-record-list">
                    {data.memory.map((memory) => (
                      <MemoryRow key={memory.memory_id} memory={memory} />
                    ))}
                  </div>
                ) : (
                  <div className="empty-memory-state">
                    Kept orders can build fit help later.
                  </div>
                )}
              </section>
            </div>

            <aside className="trust-side-column">
              <section className="trust-card trust-data-card">
                <div className="trust-icon-badge">
                  <Database size={18} />
                </div>
                <span className="eyebrow">Used for advice</span>
                <div className="trust-chip-list">
                  {privacy.used.map((item) => (
                    <span key={item}>
                      <CheckCircle2 size={13} />
                      {cleanDataLabel(item)}
                    </span>
                  ))}
                </div>
              </section>

              <section className="trust-card trust-data-card">
                <div className="trust-icon-badge">
                  <EyeOff size={18} />
                </div>
                <span className="eyebrow">Never shown to sellers</span>
                <div className="trust-chip-list muted">
                  {privacy.not_used.map((item) => (
                    <span key={item}>
                      <ShieldCheck size={13} />
                      {cleanDataLabel(item)}
                    </span>
                  ))}
                </div>
              </section>

              <section className="trust-card trust-data-card">
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

              {readiness && (
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
                    <strong>{labelize(readiness.runtime_integrations?.gemini.status ?? "disabled")}</strong>
                  </div>
                  <div className="trust-chip-list">
                    {dashboard.guardrails.slice(0, 3).map((item) => (
                      <span key={item}>
                        <CheckCircle2 size={13} />
                        {shortGuardrail(item)}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </aside>
          </section>
        </>
      ) : (
        <section className="trust-card">Loading trust controls...</section>
      )}
    </main>
  );
}

function TrustMetric({
  Icon,
  label,
  value,
  detail,
  tone
}: {
  Icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  tone: Tone;
}) {
  return (
    <article className={`trust-metric-card ${tone}`}>
      <Icon size={19} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function TrustStep({ Icon, title, detail }: { Icon: LucideIcon; title: string; detail: string }) {
  return (
    <article className="trust-step-card">
      <Icon size={17} />
      <div>
        <strong>{title}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function MemoryRow({ memory }: { memory: FitMemory }) {
  return (
    <article className="memory-record-row">
      <div>
        <strong>{labelize(memory.category)}</strong>
        <span>{memory.anchor_variant_id}</span>
      </div>
      <div>
        <span>Kept size</span>
        <strong>{memory.retained_size}</strong>
      </div>
      <div>
        <span>Fit</span>
        <strong>{memory.preferred_fit}</strong>
      </div>
      <div>
        <span>Confidence</span>
        <strong>{memory.confidence}</strong>
      </div>
    </article>
  );
}

function reviewTone(band: BuyerDashboardResponse["review_credibility"]["risk_band"]): Tone {
  if (band === "trusted") return "safe";
  if (band === "watch" || band === "new_user") return "watch";
  return "danger";
}

function reviewBandLabel(band: BuyerDashboardResponse["review_credibility"]["risk_band"]) {
  if (band === "trusted") return "Trusted";
  if (band === "watch") return "Watch";
  if (band === "new_user") return "New buyer";
  return "High return";
}

function checkoutModeLabel(mode: BuyerDashboardResponse["checkout_guidance"]["mode"]) {
  if (mode === "normal_prepaid_eligibility") return "Normal flow";
  if (mode === "balanced_checkout_guidance") return "Show proof";
  return "Proof first";
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

function labelize(value: string) {
  return value.replace(/_/g, " ");
}
