import { useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Database,
  EyeOff,
  Gauge,
  Lock,
  RefreshCcw,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Trash2,
  type LucideIcon
} from "lucide-react";
import {
  deleteMemory,
  getBuyerDashboard,
  getMemory,
  getSystemReadiness,
  updateMemorySettings
} from "../api/client";
import type {
  BuyerDashboardResponse,
  BuyerMemoryResponse,
  FitMemory,
  SystemReadiness
} from "../types/api";

type Props = {
  buyerId: string;
};

type Tone = "safe" | "watch" | "danger" | "neutral";

export function TrustCenter({ buyerId }: Props) {
  const [data, setData] = useState<BuyerMemoryResponse | null>(null);
  const [dashboard, setDashboard] = useState<BuyerDashboardResponse | null>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [preferredFit, setPreferredFit] = useState("comfort");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [buyerId]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const [payload, dashboardPayload, readinessPayload] = await Promise.all([
        getMemory(buyerId),
        getBuyerDashboard(buyerId),
        getSystemReadiness()
      ]);
      setData(payload);
      setDashboard(dashboardPayload);
      setReadiness(readinessPayload);
      setPreferredFit(dashboardPayload.profile.preferred_fit ?? payload.memory[0]?.preferred_fit ?? "comfort");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load trust settings");
    } finally {
      setBusy(false);
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

  async function savePreference() {
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      await updateMemorySettings(buyerId, { preferred_fit: preferredFit });
      await load();
      setStatus("Fit choice saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update fit preference");
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

  const privacy = data?.privacy ?? dashboard?.privacy;

  return (
    <main className="trust-center-shell">
      <section className="trust-hero-section trust-hero-simple">
        <div>
          <span className="eyebrow">Trust Center</span>
          <h2>Your trust controls</h2>
          <p>Choose what Sarthi can use. Sellers never see your fit memory.</p>
        </div>
        <button className="btn-reset-db" onClick={load} disabled={busy} title="Refresh trust center">
          <RefreshCcw size={15} className={busy ? "spin-icon" : ""} />
        </button>
      </section>

      {error && <div className="notice error">{error}</div>}
      {status && <div className="notice success">{status}</div>}

      {data && privacy && dashboard ? (
        <>
          <section className="trust-summary-grid" aria-label="Trust summary">
            <TrustMetric
              Icon={ShieldCheck}
              label="Fit help"
              value={privacy.fit_memory_enabled ? "On" : "Paused"}
              detail={`${privacy.memory_record_count} saved size fact${privacy.memory_record_count === 1 ? "" : "s"}`}
              tone={privacy.fit_memory_enabled ? "safe" : "watch"}
            />
            <TrustMetric
              Icon={Gauge}
              label="Review weight"
              value={`${Math.round(dashboard.review_credibility.weight * 100)}%`}
              detail={reviewBandLabel(dashboard.review_credibility.risk_band)}
              tone={reviewTone(dashboard.review_credibility.risk_band)}
            />
            <TrustMetric
              Icon={ShoppingBag}
              label="Orders learnt"
              value={String(dashboard.activity.total_outcomes)}
              detail={`${dashboard.activity.kept_orders} kept, ${dashboard.activity.returned_orders} returned`}
              tone={dashboard.activity.total_outcomes ? "safe" : "watch"}
            />
            <TrustMetric
              Icon={Activity}
              label="Checkout"
              value={dashboard.checkout_guidance.prepaid_nudge_allowed ? "Allowed" : "Careful"}
              detail={checkoutModeLabel(dashboard.checkout_guidance.mode)}
              tone={dashboard.checkout_guidance.prepaid_nudge_allowed ? "safe" : "watch"}
            />
          </section>

          <section className="trust-center-grid">
            <div className="trust-main-column">
              <section className="trust-card trust-decision-card">
                <div className="trust-card-header">
                  <div>
                    <span className="eyebrow">How Sarthi decides</span>
                    <h3>Four checks before advice</h3>
                  </div>
                </div>
                <div className="trust-step-grid">
                  <TrustStep Icon={Database} title="Product facts" detail="Returns, price, proof" />
                  <TrustStep Icon={ShieldCheck} title="Seller proof" detail="Size, fabric, color" />
                  <TrustStep Icon={Lock} title="Private fit" detail="Only on your phone view" />
                  <TrustStep Icon={CheckCircle2} title="Final nudge" detail="Buy, check, or wait" />
                </div>
                <div className={`trust-guidance-box ${dashboard.checkout_guidance.prepaid_nudge_allowed ? "safe" : "watch"}`}>
                  {dashboard.checkout_guidance.prepaid_nudge_allowed ? <CheckCircle2 size={17} /> : <CircleAlert size={17} />}
                  <div>
                    <strong>{dashboard.checkout_guidance.prepaid_nudge_allowed ? "Prepaid can be shown" : "No pressure checkout"}</strong>
                    <span>{dashboard.checkout_guidance.message}</span>
                  </div>
                </div>
              </section>

              <section className="trust-card">
                <div className="trust-card-header">
                  <div>
                    <span className="eyebrow">Your control</span>
                    <h3>{privacy.fit_memory_enabled ? "Size help is active" : "Size help is paused"}</h3>
                  </div>
                  <span className={`trust-state-pill ${privacy.fit_memory_enabled ? "enabled" : "disabled"}`}>
                    {privacy.fit_memory_enabled ? "On" : "Off"}
                  </span>
                </div>

                <div className="trust-control-row">
                  <button
                    className={privacy.fit_memory_enabled ? "btn-secondary" : "btn-primary"}
                    onClick={() => toggleMemory(!privacy.fit_memory_enabled)}
                    disabled={busy}
                  >
                    <SlidersHorizontal size={15} />
                    {privacy.fit_memory_enabled ? "Pause fit help" : "Turn on fit help"}
                  </button>
                  <button className="btn-danger" onClick={eraseMemory} disabled={busy || data.memory.length === 0}>
                    <Trash2 size={15} />
                    Delete size facts
                  </button>
                </div>
              </section>

              <section className="trust-card">
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
