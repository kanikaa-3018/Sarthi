import { useState } from "react";
import { CheckCircle2, AlertTriangle, ArrowLeft, RotateCcw, Route, ShieldCheck, PackageSearch } from "lucide-react";
import { simulateOutcome } from "../api/client";
import type { OutcomeResponse } from "../types/api";

type Props = {
  buyerId: string;
  variantId: string;
  contractId: string | null;
  onClose: () => void;
};

type SurveyStep = "status" | "reason" | "confirm";
type ReturnReason = "too_small" | "too_large" | "color_different" | "fabric_different" | "damaged";

export function OutcomeScreen({ buyerId, variantId, contractId, onClose }: Props) {
  const [step, setStep] = useState<SurveyStep>("status");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<OutcomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [chosenReason, setChosenReason] = useState<string>("");

  async function submitOutcome(status: "delivered_kept" | "returned", reasonCode?: ReturnReason) {
    setLoading(true);
    setError(null);
    try {
      const response = await simulateOutcome({
        buyer_id: buyerId,
        variant_id: variantId,
        status,
        return_reason: status === "returned" ? (reasonCode || "too_small") : undefined,
        contract_id: contractId ?? undefined
      });
      setResult(response);
      setStep("confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save order outcome.");
    } finally {
      setLoading(false);
    }
  }

  const reasons: Array<{ label: string; code: ReturnReason }> = [
    { label: "Too small", code: "too_small" },
    { label: "Too large", code: "too_large" },
    { label: "Color different", code: "color_different" },
    { label: "Fabric different", code: "fabric_different" },
    { label: "Damaged", code: "damaged" }
  ];
  const selectedReason = reasons.find((reason) => reason.label === chosenReason);

  return (
    <div className="outcome-flow">
      {error && <div className="notice error">{error}</div>}

      {step === "status" && (
        <div className="outcome-step">
          <div className="outcome-heading">
            <h4>Did this order work for you?</h4>
            <p>
            This feedback updates your fit memory and checks whether the pre-order expectation was met.
            </p>
          </div>

          <div className="outcome-choice-grid">
            <button
              className="outcome-choice-card kept"
              onClick={() => submitOutcome("delivered_kept")}
              disabled={loading}
            >
              <CheckCircle2 size={24} />
              Kept it
            </button>

            <button
              className="outcome-choice-card returned"
              onClick={() => setStep("reason")}
              disabled={loading}
            >
              <RotateCcw size={24} />
              Returned it
            </button>
          </div>
        </div>
      )}

      {step === "reason" && (
        <div className="outcome-step">
          <div className="outcome-reason-header">
            <button
              onClick={() => setStep("status")}
              className="outcome-back-btn"
            >
              <ArrowLeft size={16} />
            </button>
            <h4>What did not work?</h4>
          </div>

          <div className="outcome-chip-grid">
            {reasons.map((r) => (
              <button
                key={r.label}
                onClick={() => {
                  setChosenReason(r.label);
                }}
                disabled={loading}
                className={chosenReason === r.label ? "selected" : ""}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            className="outcome-submit-btn"
            onClick={() => selectedReason && submitOutcome("returned", selectedReason.code)}
            disabled={loading || !selectedReason}
          >
            Submit return reason
          </button>
        </div>
      )}

      {step === "confirm" && result && (
        <div className="outcome-confirm-card">
          <div className={`outcome-confirm-icon ${result.expectation_contract?.status === "broken" ? "caution" : "positive"}`}>
            {result.expectation_contract?.status === "broken" ? <AlertTriangle size={36} /> : <CheckCircle2 size={36} />}
          </div>

          <div className="outcome-confirm-copy">
            <strong>
              {result.expectation_contract?.status === "broken"
                ? "Expectation gap captured."
                : "Outcome saved and contract closed."}
            </strong>
            <span>
              Aggregate product confidence will refresh after quality checks.
            </span>
          </div>

          <OutcomeLoopCard
            status={result.outcome.status}
            selectedReason={chosenReason}
            memoryUpdated={result.outcome.memory_update.updated}
            graphSynced={result.graph_sync.available}
          />

          <div className="outcome-confirm-facts">
            <div className="kv-row">
              <span>Outcome ID</span>
              <strong><code>{result.outcome.fact_id}</code></strong>
            </div>
            <div className="kv-row">
              <span>Closet memory</span>
              <strong>{result.outcome.memory_update.updated ? "Updated" : "No change needed"}</strong>
            </div>
            <div className="kv-row">
              <span>Expectation contract</span>
              <strong className={`ui-badge ${result.expectation_contract?.status === "broken" ? "caution" : "positive"}`}>
                {result.expectation_contract
                  ? labelize(result.expectation_contract.status)
                  : "Not attached"}
              </strong>
            </div>
            {result.expectation_contract?.broken_dimension && (
              <div className="kv-row">
                <span>Broken area</span>
                <strong>{labelize(result.expectation_contract.broken_dimension)}</strong>
              </div>
            )}
            <div className="kv-row">
              <span>Evidence map</span>
              <strong>{result.graph_sync.available ? "Synced" : "Grounded facts active"}</strong>
            </div>
          </div>

          <button
            className="outcome-done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function OutcomeLoopCard({
  status,
  selectedReason,
  memoryUpdated,
  graphSynced
}: {
  status: string;
  selectedReason: string;
  memoryUpdated: boolean;
  graphSynced: boolean;
}) {
  const returned = status === "returned";
  const returnReason = selectedReason || "Return reason";
  const items = returned
    ? [
        {
          label: "Buyer memory",
          value: memoryUpdated
            ? `${returnReason} will reduce similar mistakes in future recommendations.`
            : "No private fit-memory change was needed for this return.",
          icon: <ShieldCheck size={15} />
        },
        {
          label: "Seller signal",
          value: "Only aggregate reason counts are shared, so sellers can fix size, color, fabric, or packaging issues.",
          icon: <PackageSearch size={15} />
        },
        {
          label: "Return rescue",
          value: "Clean returns can move to exchange, nearby demand, or faster relisting instead of blindly moving backward.",
          icon: <Route size={15} />
        }
      ]
    : [
        {
          label: "Buyer memory",
          value: memoryUpdated
            ? "Your retained size signal improves future fit decisions."
            : "This kept order strengthens confidence without exposing private buyer data.",
          icon: <ShieldCheck size={15} />
        },
        {
          label: "Seller signal",
          value: "A kept outcome adds positive SKU evidence after quality checks.",
          icon: <PackageSearch size={15} />
        },
        {
          label: "Graph loop",
          value: graphSynced
            ? "Future decision evidence is refreshed with this outcome."
            : "Grounded facts stay active until the evidence sync is available.",
          icon: <Route size={15} />
        }
      ];

  return (
    <div className={`outcome-loop-card ${returned ? "returned" : "kept"}`}>
      <div className="outcome-loop-header">
        <span className="eyebrow">{returned ? "Return loop" : "Trust loop"}</span>
        <strong>{returned ? "What happens after this return" : "How this improves future checks"}</strong>
      </div>
      <div className="outcome-loop-list">
        {items.map((item) => (
          <div key={item.label}>
            <span>{item.icon}{item.label}</span>
            <p>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}
