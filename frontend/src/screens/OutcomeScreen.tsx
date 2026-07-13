import { useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { simulateOutcome } from "../api/client";
import type { OutcomeResponse } from "../types/api";

type Props = {
  buyerId: string;
  variantId: string;
};

export function OutcomeScreen({ buyerId, variantId }: Props) {
  const [result, setResult] = useState<OutcomeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function record(status: "delivered_kept" | "returned") {
    setLoading(true);
    setError(null);
    try {
      const response = await simulateOutcome({
        buyer_id: buyerId,
        variant_id: variantId,
        status,
        return_reason: status === "returned" ? "too_small" : undefined
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record outcome");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        <span className="eyebrow" style={{ color: "var(--moss-green)" }}>Outcome Simulator</span>
        <h4 style={{ fontSize: "14px", color: "var(--forest-green)" }}>Simulate Order Delivery Outcome</h4>
        <p style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
          Simulating if the buyer keeps or returns this kurta closes the feedback learning loop.
        </p>
      </div>

      <div className="outcome-buttons-row">
        <button 
          className="btn-outcome-action kept" 
          onClick={() => record("delivered_kept")} 
          disabled={loading || !!result}
        >
          <Check size={14} />
          <span>Keep (Satisfied)</span>
        </button>
        <button 
          className="btn-outcome-action returned" 
          onClick={() => record("returned")} 
          disabled={loading || !!result}
        >
          <RotateCcw size={14} />
          <span>Return (too small)</span>
        </button>
      </div>

      {result && (
        <div className="outcome-sync-badge">
          <strong style={{ color: "var(--forest-green)", fontSize: "12px" }}>
            {result.outcome.memory_update.updated ? "Closet Fit Memory Retrained" : "Transaction Logged"}
          </strong>
          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            Relational Fact: <strong style={{ fontFamily: "monospace" }}>{result.outcome.fact_id}</strong>
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
            Neo4j Sync Status: <strong style={{ color: "var(--primary-green)" }}>
              {result.graph_sync.available ? "Graph edge weight updated successfully" : "Graph engine sync disabled"}
            </strong>
          </span>
        </div>
      )}

      {error && <div className="notice error">{error}</div>}
    </div>
  );
}
