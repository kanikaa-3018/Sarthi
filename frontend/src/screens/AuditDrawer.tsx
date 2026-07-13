import { useEffect, useState } from "react";
import { getAudit } from "../api/client";
import type { AuditTrace } from "../types/api";

type Props = {
  traceId: string | null;
  onClose: () => void;
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
    <div style={{ width: "100%" }}>
      {error && <div className="notice error">{error}</div>}

      {trace ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Metadata Block Info */}
          <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            Diagnostic reference log: <strong style={{ color: "var(--forest-green)" }}>{traceId}</strong> &bull; Compiled: {new Date(trace.created_at).toLocaleString()}
          </div>

          {/* Grid Blocks */}
          <div className="proof-blocks-grid">
            {/* User Intent */}
            <div className="proof-block-card">
              <h4>Extracted Intent Signals</h4>
              <div className="proof-chips-wrapper">
                {trace.intent.map((value) => (
                  <span className="proof-chip" key={value}>
                    {value}
                  </span>
                ))}
              </div>
            </div>

            {/* Tools Used */}
            <div className="proof-block-card">
              <h4>Invoked Agent Tools</h4>
              <div className="proof-chips-wrapper">
                {trace.tools_used.map((value) => (
                  <span className="proof-chip" style={{ background: "var(--sage-light)", borderColor: "var(--sage-green)" }} key={value}>
                    {value}
                  </span>
                ))}
              </div>
            </div>

            {/* Fact References */}
            <div className="proof-block-card">
              <h4>Relational SQLite Facts</h4>
              <div className="proof-chips-wrapper">
                {trace.fact_details.slice(0, 8).map((fact) => (
                  <span
                    className="proof-chip"
                    style={{ background: "var(--accent-gold-bg)", borderColor: "var(--accent-gold)", color: "var(--accent-gold)" }}
                    key={fact.fact_id}
                    title={fact.summary}
                  >
                    {fact.source_type}: {fact.fact_id}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="audit-fact-detail-list">
            {trace.fact_details.slice(0, 8).map((fact) => (
              <div className="audit-fact-detail" key={fact.fact_id}>
                <div>
                  <strong>{fact.summary}</strong>
                  <span>{fact.source_table} / {fact.source_id}</span>
                </div>
                <code>{fact.fact_id}</code>
              </div>
            ))}
          </div>

          {/* Neo4j Graph Paths */}
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <h4 style={{ fontSize: "12px", textTransform: "uppercase", color: "var(--text-muted)", letterSpacing: "0.05em", fontWeight: 700 }}>
              Traversed Neo4j Knowledge Graph Pathways
            </h4>
            <div className="proof-graph-paths">
              {trace.graph_paths.map((path) => (
                <div className="proof-path-card" key={`${path.path_type}-${path.summary}`}>
                  <span className="path-card-title">{path.path_type}</span>
                  <span style={{ color: "var(--text-secondary)" }}>{path.summary}</span>
                  {path.relationships.length > 0 ? (
                    <span className="path-card-route">
                      {path.relationships.join(" ➔ ")}
                    </span>
                  ) : (
                    <span className="path-card-route" style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
                      Direct SQLite match
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center", color: "var(--text-muted)", padding: "20px" }}>
          Loading decision trace facts...
        </div>
      )}
    </div>
  );
}
