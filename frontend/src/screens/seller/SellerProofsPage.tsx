import { CheckCircle2, Clock3, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import type { SellerEvidenceCoachTask } from "../../types/api";
import type { SellerCopy } from "./sellerCopy";
import { proofTaskReason, proofTypeLabel, type SellerProofAsset, type SellerProofLanes } from "./sellerModel";

type ProofLane = "action" | "review" | "visible";

type SellerProofsPageProps = {
  lanes: SellerProofLanes;
  copy: SellerCopy;
  onOpenTask: (task: SellerEvidenceCoachTask) => void;
};

export function SellerProofsPage({ lanes, copy, onOpenTask }: SellerProofsPageProps) {
  const actionCount = lanes.openTasks.length + lanes.rejected.length;
  const [lane, setLane] = useState<ProofLane>(actionCount ? "action" : lanes.inReview.length ? "review" : "visible");
  const rejectedTasks = useMemo(() => lanes.rejected.map(taskFromRejected), [lanes.rejected]);

  return (
    <div className="seller-page seller-proofs-page">
      <header className="seller-page-header">
        <div>
          <p className="seller-kicker">Buyer evidence</p>
          <h2>Proof requests</h2>
          <p>Answer a specific buyer concern, then track what the reviewer accepts and what buyers can see.</p>
        </div>
      </header>

      <div className="seller-proof-tabs" role="tablist" aria-label="Proof status">
        <ProofTab active={lane === "action"} label={copy.needsAction} count={actionCount} onClick={() => setLane("action")} />
        <ProofTab active={lane === "review"} label={copy.withReviewer} count={lanes.inReview.length} onClick={() => setLane("review")} />
        <ProofTab active={lane === "visible"} label={copy.buyerVisible} count={lanes.buyerVisible.length} onClick={() => setLane("visible")} />
      </div>

      <section className="seller-proof-lane" role="tabpanel">
        {lane === "action" && (
          <>
            {rejectedTasks.map((task) => <ProofTaskRow key={`rejected-${task.product_id}-${task.attribute}`} task={task} rejected onOpen={() => onOpenTask(task)} />)}
            {lanes.openTasks.map((task) => <ProofTaskRow key={`${task.product_id}-${task.attribute}`} task={task} onOpen={() => onOpenTask(task)} />)}
            {!actionCount && <ProofEmpty icon={<CheckCircle2 size={21} />} title="No proof action is waiting" detail="New buyer concerns will appear here when they need evidence." />}
          </>
        )}
        {lane === "review" && (
          lanes.inReview.length ? lanes.inReview.map((asset) => <ProofAssetRow key={asset.proof_id} asset={asset} icon={<Clock3 size={18} />} />) : <ProofEmpty icon={<Clock3 size={21} />} title="Nothing is with the reviewer" detail="Submitted proof will appear here until a decision is made." />
        )}
        {lane === "visible" && (
          lanes.buyerVisible.length ? lanes.buyerVisible.map((asset) => <ProofAssetRow key={asset.proof_id} asset={asset} icon={<CheckCircle2 size={18} />} />) : <ProofEmpty icon={<CheckCircle2 size={21} />} title="No buyer-visible proof yet" detail="Approved proof will appear here with its product and review date." />
        )}
      </section>

      <p className="seller-privacy-line">{copy.privacy}</p>
    </div>
  );
}

function ProofTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? "active" : ""} onClick={onClick}><span>{label}</span><strong>{count}</strong></button>;
}

function ProofTaskRow({ task, rejected = false, onOpen }: { task: SellerEvidenceCoachTask; rejected?: boolean; onOpen: () => void }) {
  return (
    <article className={`seller-proof-row ${rejected ? "rejected" : ""}`}>
      <div className="seller-proof-row-icon" aria-hidden="true">{rejected ? <RotateCcw size={18} /> : <span>{task.buyer_demand}</span>}</div>
      <div className="seller-proof-row-main">
        <span>{task.product_title}</span>
        <h3>{task.title}</h3>
        <p>{proofTaskReason(task)}</p>
        <small>{proofTypeLabel(task.recommended_proof_type)} · {task.buyer_demand} buyer {task.buyer_demand === 1 ? "request" : "requests"}</small>
      </div>
      <button type="button" className="seller-button seller-button-primary" onClick={onOpen}>{rejected ? "Replace proof" : "Upload proof"}</button>
    </article>
  );
}

function ProofAssetRow({ asset, icon }: { asset: SellerProofAsset; icon: React.ReactNode }) {
  return (
    <article className="seller-proof-row seller-proof-history-row">
      <div className="seller-proof-row-icon" aria-hidden="true">{icon}</div>
      <div className="seller-proof-row-main"><span>{asset.product_title}</span><h3>{proofTypeLabel(asset.proof_type)}</h3><p>{asset.review_notes || (asset.status === "verified" ? "Approved evidence is available to buyer trust checks." : "The reviewer is checking this evidence.")}</p></div>
      <span className={`seller-state seller-state-${asset.status === "verified" ? "healthy" : "review"}`}>{asset.status === "verified" ? "Buyer-visible" : "With reviewer"}</span>
    </article>
  );
}

function ProofEmpty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="seller-empty-state">{icon}<h3>{title}</h3><p>{detail}</p></div>;
}

function taskFromRejected(asset: SellerProofAsset): SellerEvidenceCoachTask {
  return {
    type: "missing_buyer_proof",
    priority: "high",
    product_id: asset.product_id,
    product_title: asset.product_title,
    attribute: asset.attribute,
    title: `Replace rejected ${proofTypeLabel(asset.proof_type)}`,
    rationale: asset.review_notes || "The reviewer needs clearer evidence for this product.",
    recommended_proof_type: asset.proof_type,
    buyer_demand: 1,
    first_seen_at: asset.submitted_at,
    last_seen_at: asset.reviewed_at || asset.submitted_at,
    fact_ids: []
  };
}
