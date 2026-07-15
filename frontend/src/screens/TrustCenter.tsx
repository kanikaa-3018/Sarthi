import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  EyeOff,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2
} from "lucide-react";
import { deleteMemory, getMemory, getSystemReadiness, updateMemorySettings } from "../api/client";
import type { BuyerMemoryResponse, FitMemory, SystemReadiness } from "../types/api";

type Props = {
  buyerId: string;
};

export function TrustCenter({ buyerId }: Props) {
  const [data, setData] = useState<BuyerMemoryResponse | null>(null);
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
      const [payload, readinessPayload] = await Promise.all([
        getMemory(buyerId),
        getSystemReadiness()
      ]);
      setData(payload);
      setReadiness(readinessPayload);
      setPreferredFit(payload.memory[0]?.preferred_fit ?? "comfort");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load privacy settings");
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
      setStatus(enabled ? "Fit memory enabled for future kept outcomes." : "Fit memory paused. Product advice now uses aggregate evidence only.");
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
      setStatus("Fit preference updated.");
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
      setStatus(`${result.deleted_fit_memory_records} memory record(s) deleted.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete memory");
    } finally {
      setBusy(false);
    }
  }

  const privacy = data?.privacy;

  return (
    <main className="trust-center-shell">
      <section className="trust-hero-section">
        <div>
          <span className="eyebrow">Trust Center</span>
          <h2>Personalization and Privacy Controls</h2>
          <p>
            Control how Sarthi uses fit memory. Product ranking and seller tools continue to use aggregate evidence without exposing personal buyer memory.
          </p>
        </div>
        <button className="btn-reset-db" onClick={load} disabled={busy} title="Refresh trust center">
          <RefreshCcw size={15} className={busy ? "spin-icon" : ""} />
        </button>
      </section>

      {error && <div className="notice error">{error}</div>}
      {status && <div className="notice success">{status}</div>}

      {data && privacy ? (
        <section className="trust-center-grid">
          <div className="trust-main-column">
            <section className="trust-card">
              <div className="trust-card-header">
                <div>
                  <span className="eyebrow">Fit Memory</span>
                  <h3>{privacy.fit_memory_enabled ? "Memory is active" : "Memory is paused"}</h3>
                </div>
                <span className={`trust-state-pill ${privacy.fit_memory_enabled ? "enabled" : "disabled"}`}>
                  {privacy.fit_memory_enabled ? "On" : "Off"}
                </span>
              </div>

              <p>
                {privacy.memory_record_count} fit memory record(s) are available for this buyer. When memory is paused, size advice uses catalog, review, and aggregate outcome facts only.
              </p>

              <div className="trust-control-row">
                <button
                  className={privacy.fit_memory_enabled ? "btn-secondary" : "btn-primary"}
                  onClick={() => toggleMemory(!privacy.fit_memory_enabled)}
                  disabled={busy}
                >
                  <SlidersHorizontal size={15} />
                  {privacy.fit_memory_enabled ? "Pause memory" : "Enable memory"}
                </button>
                <button className="btn-danger" onClick={eraseMemory} disabled={busy || data.memory.length === 0}>
                  <Trash2 size={15} />
                  Delete fit memory
                </button>
              </div>
            </section>

            <section className="trust-card">
              <div className="trust-card-header">
                <div>
                  <span className="eyebrow">Fit Preference</span>
                  <h3>How size advice should lean</h3>
                </div>
              </div>
              <div className="fit-preference-row">
                <select value={preferredFit} onChange={(event) => setPreferredFit(event.target.value)}>
                  <option value="comfort">Comfort fit</option>
                  <option value="regular">Regular fit</option>
                </select>
                <button className="btn-primary" onClick={savePreference} disabled={busy}>
                  Save preference
                </button>
              </div>
            </section>

            <section className="trust-card">
              <div className="trust-card-header">
                <div>
                  <span className="eyebrow">Stored Memory</span>
                  <h3>Category-specific fit anchors</h3>
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
                  No fit memory is stored. Future kept outcomes can rebuild memory only if memory is enabled.
                </div>
              )}
            </section>
          </div>

          <aside className="trust-side-column">
            <section className="trust-card trust-data-card">
              <div className="trust-icon-badge">
                <Database size={18} />
              </div>
              <span className="eyebrow">Data used</span>
              <div className="trust-chip-list">
                {privacy.used.map((item) => (
                  <span key={item}>
                    <CheckCircle2 size={13} />
                    {item}
                  </span>
                ))}
              </div>
            </section>

            <section className="trust-card trust-data-card">
              <div className="trust-icon-badge">
                <EyeOff size={18} />
              </div>
              <span className="eyebrow">Never used</span>
              <div className="trust-chip-list muted">
                {privacy.not_used.map((item) => (
                  <span key={item}>
                    <ShieldCheck size={13} />
                    {item}
                  </span>
                ))}
              </div>
            </section>

            {readiness && (
              <section className="trust-card trust-data-card readiness-card">
                <div className="trust-icon-badge">
                  <Database size={18} />
                </div>
                <span className="eyebrow">Product readiness</span>
                <h3>{labelize(readiness.data_mode)}</h3>
                <p>{readiness.user_disclosure}</p>
                <div className="readiness-status-row">
                  <span>Source health</span>
                  <strong>{readiness.source_health.overall_status}</strong>
                </div>
                <div className="trust-chip-list">
                  {readiness.implemented_controls.slice(0, 4).map((item) => (
                    <span key={item}>
                      <CheckCircle2 size={13} />
                      {item}
                    </span>
                  ))}
                </div>
                <div className="readiness-blocker-list">
                  {readiness.production_blockers.slice(0, 3).map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </section>
            )}
          </aside>
        </section>
      ) : (
        <section className="trust-card">Loading privacy controls...</section>
      )}
    </main>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function MemoryRow({ memory }: { memory: FitMemory }) {
  return (
    <article className="memory-record-row">
      <div>
        <strong>{memory.category}</strong>
        <span>{memory.anchor_variant_id}</span>
      </div>
      <div>
        <span>Kept size</span>
        <strong>{memory.retained_size}</strong>
      </div>
      <div>
        <span>Preference</span>
        <strong>{memory.preferred_fit}</strong>
      </div>
      <div>
        <span>Confidence</span>
        <strong>{memory.confidence}</strong>
      </div>
    </article>
  );
}
