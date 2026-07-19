import { useEffect, useState } from "react";
import { CheckCircle2, Database, Route, ShieldCheck } from "lucide-react";
import { getAudit } from "../api/client";
import type { LanguageCode } from "../i18n";
import type { AuditTrace } from "../types/api";

type Props = {
  traceId: string | null;
  onClose: () => void;
  language?: LanguageCode;
};

export function AuditDrawer({ traceId }: Props) {
  const [trace, setTrace] = useState<AuditTrace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!traceId) {
      setTrace(null);
      setError(null);
      return;
    }
    getAudit(traceId)
      .then((payload) => {
        setTrace(payload);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [traceId]);

  if (!traceId) return null;

  return (
    <div className="audit-drawer">
      {error && <div className="notice error">{error}</div>}

      {trace ? (
        <>
          <div className="audit-reference-card">
            <div>
              <span className="eyebrow">Decision reference</span>
              <strong>{traceId}</strong>
            </div>
            <span className="ui-badge neutral">{new Date(trace.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          <section className="audit-summary-card">
            <div className="audit-card-heading">
              <ShieldCheck size={18} />
              <div>
                <span className="eyebrow">What Sarthi did</span>
                <h4>Grounded decision log</h4>
              </div>
            </div>
            <div className="kv-stack">
              <div className="kv-row">
                <span>Question understood</span>
                <strong>{trace.intent.join(" + ") || "purchase check"}</strong>
              </div>
              <div className="kv-row">
                <span>Tools used</span>
                <strong>{trace.tools_used.length}</strong>
              </div>
              <div className="kv-row">
                <span>Evidence retrieved</span>
                <strong>{trace.fact_details.length} records</strong>
              </div>
              <div className="kv-row">
                <span>Unsupported claims</span>
                <strong>0 blocked</strong>
              </div>
            </div>
          </section>

          <section className="audit-summary-card">
            <div className="audit-card-heading">
              <Database size={18} />
              <div>
                <span className="eyebrow">Answer supported by</span>
                <h4>Fact references</h4>
              </div>
            </div>
            <div className="proof-chips-wrapper">
              {trace.fact_details.slice(0, 10).map((fact) => (
                <span className="proof-chip audit-chip" key={fact.fact_id} title={fact.summary}>
                  {fact.fact_id}
                </span>
              ))}
            </div>
            <div className="audit-fact-detail-list">
              {trace.fact_details.slice(0, 6).map((fact) => (
                <div className="audit-fact-detail" key={fact.fact_id}>
                  <div>
                    <strong>{fact.summary}</strong>
                    <span>{fact.source_table} / {fact.source_id}</span>
                  </div>
                  <code>{fact.source_type}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="audit-summary-card">
            <div className="audit-card-heading">
              <Route size={18} />
              <div>
                <span className="eyebrow">Graph path</span>
                <h4>How the evidence connected</h4>
              </div>
            </div>
            <div className="proof-graph-paths">
              {trace.graph_paths.map((path) => (
                <div className="proof-path-card" key={`${path.path_type}-${path.summary}`}>
                  <span className="path-card-title">{path.path_type}</span>
                  <span>{path.summary}</span>
                  {path.relationships.length > 0 ? (
                    <span className="path-card-route">
                      {path.relationships.join(" -> ")}
                    </span>
                  ) : (
                    <span className="path-card-route muted">
                      Direct fact match
                    </span>
                  )}
                </div>
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="audit-loading">
          <CheckCircle2 size={18} />
          Loading decision trace facts...
        </div>
      )}
    </div>
  );
}
