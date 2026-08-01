import { AlertTriangle, Bot, CheckCircle2, Clock3, Layers3, ListChecks, RotateCcw, ShieldCheck, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import type { SellerEvidenceCoachResponse, SellerEvidenceCoachTask } from "../../types/api";
import type { SellerCopy } from "./sellerCopy";
import { proofTaskReason, proofTypeLabel, type SellerAutomationSummary, type SellerProofAsset, type SellerProofLanes } from "./sellerModel";

type ProofLane = "action" | "review" | "visible";
type SellerProofAgent = SellerEvidenceCoachResponse["proof_agent"];

type SellerProofsPageProps = {
  lanes: SellerProofLanes;
  agent?: SellerProofAgent | null;
  automation?: SellerAutomationSummary | null;
  copy: SellerCopy;
  onOpenTask: (task: SellerEvidenceCoachTask) => void;
};

export function SellerProofsPage({ lanes, agent, automation, copy, onOpenTask }: SellerProofsPageProps) {
  const actionCount = lanes.openTasks.length + lanes.rejected.length;
  const [lane, setLane] = useState<ProofLane>(actionCount ? "action" : lanes.inReview.length ? "review" : "visible");
  const selectedTaskKey = agent?.selected_task_key ?? null;
  const rejectedTasks = useMemo(() => lanes.rejected.map(taskFromRejected), [lanes.rejected]);
  const actionRows = useMemo(() => {
    const rows = [
      ...rejectedTasks.map((task) => ({ task, rejected: true })),
      ...lanes.openTasks.map((task) => ({ task, rejected: false }))
    ];
    if (!selectedTaskKey) return rows;
    const selected = rows.find((row) => proofTaskKey(row.task) === selectedTaskKey);
    if (!selected) return rows;
    return [selected, ...rows.filter((row) => proofTaskKey(row.task) !== selectedTaskKey)];
  }, [lanes.openTasks, rejectedTasks, selectedTaskKey]);
  const selectedAgentTask = useMemo(
    () => selectedTaskKey ? actionRows.find((row) => proofTaskKey(row.task) === selectedTaskKey)?.task ?? null : null,
    [actionRows, selectedTaskKey]
  );

  return (
    <div className="seller-page seller-proofs-page">
      <header className="seller-page-header">
        <div>
          <p className="seller-kicker">Buyer evidence</p>
          <h2>Proof requests</h2>
          <p>Answer a specific buyer concern, then track what the reviewer accepts and what buyers can see.</p>
        </div>
      </header>

      {agent && (
        <ProofAgentPanel
          agent={agent}
          selectedTask={selectedAgentTask}
          onOpenSelected={() => selectedAgentTask && onOpenTask(selectedAgentTask)}
        />
      )}

      {automation?.bulkProofGroups.length ? (
        <BulkProofQueue automation={automation} onOpenTask={onOpenTask} />
      ) : null}

      <div className="seller-proof-tabs" role="tablist" aria-label="Proof status">
        <ProofTab active={lane === "action"} label={copy.needsAction} count={actionCount} onClick={() => setLane("action")} />
        <ProofTab active={lane === "review"} label={copy.withReviewer} count={lanes.inReview.length} onClick={() => setLane("review")} />
        <ProofTab active={lane === "visible"} label={copy.buyerVisible} count={lanes.buyerVisible.length} onClick={() => setLane("visible")} />
      </div>

      <ProofImpactSummary lanes={lanes} actionCount={actionCount} />

      <section className="seller-proof-lane" role="tabpanel">
        {lane === "action" && (
          <>
            {actionRows.map((row) => (
              <ProofTaskRow
                key={`${row.rejected ? "rejected" : "open"}-${row.task.product_id}-${row.task.attribute}`}
                task={row.task}
                rejected={row.rejected}
                highlighted={selectedTaskKey === proofTaskKey(row.task)}
                onOpen={() => onOpenTask(row.task)}
              />
            ))}
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

function BulkProofQueue({
  automation,
  onOpenTask
}: {
  automation: SellerAutomationSummary;
  onOpenTask: (task: SellerEvidenceCoachTask) => void;
}) {
  return (
    <section className="seller-bulk-proof-queue" aria-labelledby="seller-bulk-proof-heading">
      <header>
        <div>
          <span><Layers3 size={16} aria-hidden="true" /> Bulk proof queue</span>
          <h3 id="seller-bulk-proof-heading">Similar proof work grouped</h3>
        </div>
        <p>Use the same proof standard across repeated buyer asks. Each item still goes through reviewer approval.</p>
      </header>
      <div>
        {automation.bulkProofGroups.map((group) => (
          <article key={group.key}>
            <div className="seller-bulk-proof-meta">
              <span>{group.productCount} products</span>
              <span>{group.buyerDemand} buyer asks</span>
              <span>+{group.trustLift} trust</span>
            </div>
            <strong>{group.title}</strong>
            <p>{group.detail}</p>
            <ol className="seller-bulk-proof-steps" aria-label={`${group.title} batch flow`}>
              <li>Use one proof standard</li>
              <li>Start highest-demand item</li>
              <li>Reviewer clears each proof</li>
            </ol>
            <button type="button" className="seller-button seller-button-text" onClick={() => onOpenTask(group.firstTask)}>
              Start first packet
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProofAgentPanel({
  agent,
  selectedTask,
  onOpenSelected
}: {
  agent: SellerProofAgent;
  selectedTask: SellerEvidenceCoachTask | null;
  onOpenSelected: () => void;
}) {
  const metrics = [
    { label: "Buyer asks", value: String(agent.metrics.waiting_buyers), detail: "aggregate only" },
    { label: "At risk", value: String(agent.metrics.urgent_tasks), detail: agent.metrics.breached_tasks ? `${agent.metrics.breached_tasks} breached` : "inside SLA" },
    { label: "Open lift", value: `+${agent.metrics.open_trust_lift}`, detail: `+${agent.metrics.visible_trust_lift} visible` },
    { label: "With reviewer", value: String(agent.metrics.submitted_count), detail: `${agent.metrics.approved_count} approved` }
  ];
  return (
    <section className="seller-proof-agent" aria-labelledby="seller-proof-agent-title">
      <header className="seller-proof-agent-header">
        <div>
          <span><Bot size={17} aria-hidden="true" />Proof agent run</span>
          <h3 id="seller-proof-agent-title">{agent.headline}</h3>
        </div>
        <strong>{providerLabel(agent.provider)}</strong>
      </header>

      <div className="seller-proof-agent-grid">
        <div className="seller-proof-agent-copy">
          <p>{agent.summary}</p>
          <ul>
            {agent.reasoning.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <div className="seller-proof-agent-guardrail">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>{agent.guardrail}</span>
          </div>
        </div>

        <div className="seller-proof-agent-metrics" aria-label="Proof agent metrics">
          {metrics.map((metric) => (
            <dl key={metric.label}>
              <dt>{metric.label}</dt>
              <dd>{metric.value}</dd>
              <dd>{metric.detail}</dd>
            </dl>
          ))}
        </div>
      </div>

      <div className="seller-proof-agent-playbook" aria-label="Agent playbook">
        <div className="seller-proof-agent-subhead"><ListChecks size={16} aria-hidden="true" /><span>Tool chain</span></div>
        <ol>
          {agent.playbook.map((step) => (
            <li key={`${step.tool}-${step.label}`} className={`agent-step-${step.status}`}>
              <strong>{step.label}</strong>
              <p>{step.detail}</p>
              <small>{step.tool}</small>
            </li>
          ))}
        </ol>
      </div>

      <div className="seller-proof-agent-tools" aria-label="Agent tools">
        {agent.tools.map((tool) => (
          <article key={tool.key} className={`agent-tool-${tool.status}`}>
            <span>{tool.label}</span>
            <p>{tool.detail}</p>
          </article>
        ))}
      </div>

      <footer className="seller-proof-agent-footer">
        <span>{agent.recommended_action}</span>
        {selectedTask && <button type="button" className="seller-button seller-button-primary" onClick={onOpenSelected}>Start selected proof</button>}
      </footer>
    </section>
  );
}

function ProofImpactSummary({ lanes, actionCount }: { lanes: SellerProofLanes; actionCount: number }) {
  const tasks = [...lanes.openTasks, ...lanes.rejected.map(taskFromRejected)];
  const waitingBuyers = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.buyer_demand ?? 0)), 0);
  const urgentTasks = tasks.filter((task) => task.sla_state === "breached" || task.sla_state === "due_today" || task.priority === "high").length;
  const trustLift = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.trust_lift_points ?? proofTaskFallbackTrustLift(task))), 0);
  const visibleLift = lanes.buyerVisible.reduce((sum, asset) => sum + Math.max(0, Number(asset.trust_lift_points ?? 0)), 0);

  return (
    <section className="seller-proof-impact-summary" aria-label="Proof request impact">
      <ProofImpactMetric
        icon={<AlertTriangle size={16} />}
        label="Needs action"
        value={String(actionCount)}
        detail={urgentTasks ? `${urgentTasks} time-sensitive` : "No urgent breach"}
        tone={urgentTasks ? "warn" : "good"}
      />
      <ProofImpactMetric
        icon={<ShieldCheck size={16} />}
        label="Buyer asks waiting"
        value={String(waitingBuyers)}
        detail="Aggregate demand only"
        tone={waitingBuyers ? "warn" : "good"}
      />
      <ProofImpactMetric
        icon={<TrendingUp size={16} />}
        label="Trust lift open"
        value={`+${trustLift}`}
        detail={`${visibleLift ? `+${visibleLift} already visible` : "Visible after approval"}`}
        tone={trustLift ? "good" : "neutral"}
      />
    </section>
  );
}

function ProofImpactMetric({
  icon,
  label,
  value,
  detail,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "good" | "warn" | "neutral";
}) {
  return (
    <article className={`seller-proof-impact-metric ${tone}`}>
      <span>{icon}</span>
      <div>
        <strong>{value}</strong>
        <small>{label}</small>
        <p>{detail}</p>
      </div>
    </article>
  );
}

function ProofTab({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return <button type="button" role="tab" aria-selected={active} className={active ? "active" : ""} onClick={onClick}><span>{label}</span><strong>{count}</strong></button>;
}

function ProofTaskRow({
  task,
  rejected = false,
  highlighted = false,
  onOpen
}: {
  task: SellerEvidenceCoachTask;
  rejected?: boolean;
  highlighted?: boolean;
  onOpen: () => void;
}) {
  const replacement = rejected || Boolean(task.rejection_note);
  const sla = proofTaskSla(task);
  const trustLift = task.trust_lift_points ?? proofTaskFallbackTrustLift(task);
  return (
    <article className={`seller-proof-row ${replacement ? "rejected" : ""} ${highlighted ? "agent-selected" : ""}`}>
      <div className="seller-proof-row-icon" aria-hidden="true">{replacement ? <RotateCcw size={18} /> : <span>{task.buyer_demand}</span>}</div>
      <div className="seller-proof-row-main">
        {highlighted && <em className="seller-proof-agent-match"><Bot size={13} aria-hidden="true" /> Agent pick</em>}
        <span>{task.product_title}</span>
        <h3>{task.title}</h3>
        <p>{proofTaskReason(task)}</p>
        <dl className="seller-proof-evidence-grid">
          <div>
            <dt>Required</dt>
            <dd>{proofTypeLabel(task.recommended_proof_type)}</dd>
          </div>
          <div>
            <dt>Target</dt>
            <dd className={sla.tone}>{sla.label}</dd>
          </div>
          <div>
            <dt>Unlocks</dt>
            <dd>+{trustLift} trust</dd>
          </div>
        </dl>
        <small>{task.buyer_impact || (replacement ? "Reviewer asked for clearer replacement proof." : `${task.buyer_demand} buyer ${task.buyer_demand === 1 ? "request" : "requests"} can be answered after review.`)}</small>
        {task.proof_loop && <ProofLoopNote loop={task.proof_loop} />}
      </div>
      <button type="button" className="seller-button seller-button-primary" onClick={onOpen}>{replacement ? "Replace proof" : "Upload proof"}</button>
    </article>
  );
}

function ProofAssetRow({ asset, icon }: { asset: SellerProofAsset; icon: React.ReactNode }) {
  return (
    <article className="seller-proof-row seller-proof-history-row">
      <div className="seller-proof-row-icon" aria-hidden="true">{icon}</div>
      <div className="seller-proof-row-main">
        <span>{asset.product_title}</span>
        <h3>{proofTypeLabel(asset.proof_type)}</h3>
        <p>{asset.review_notes || (asset.status === "verified" ? "Approved evidence is available to buyer trust checks." : "The reviewer is checking this evidence.")}</p>
        <dl className="seller-proof-evidence-grid compact">
          <div>
            <dt>Quality</dt>
            <dd>{asset.quality_label}</dd>
          </div>
          <div>
            <dt>Trust lift</dt>
            <dd>+{asset.trust_lift_points}</dd>
          </div>
          <div>
            <dt>{asset.status === "verified" ? "Reviewed" : "Submitted"}</dt>
            <dd>{formatShortDate(asset.reviewed_at || asset.submitted_at)}</dd>
          </div>
        </dl>
        {asset.proof_loop && <ProofLoopNote loop={asset.proof_loop} />}
      </div>
      <span className={`seller-state seller-state-${asset.status === "verified" ? "healthy" : "review"}`}>{asset.status === "verified" ? "Buyer-visible" : "With reviewer"}</span>
    </article>
  );
}

function ProofLoopNote({
  loop
}: {
  loop: NonNullable<SellerEvidenceCoachTask["proof_loop"]>;
}) {
  return (
    <div className="seller-proof-loop-note">
      <div>
        <span>Marketplace loop</span>
        <strong>{loop.aggregate_demand}</strong>
        <p>{loop.buyer_notification_preview}</p>
      </div>
      <ol>
        {loop.steps.map((step) => (
          <li key={step.key} className={step.done ? "done" : ""}>{step.label}</li>
        ))}
      </ol>
    </div>
  );
}

function ProofEmpty({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="seller-empty-state">{icon}<h3>{title}</h3><p>{detail}</p></div>;
}

function taskFromRejected(asset: SellerProofAsset): SellerEvidenceCoachTask {
  return {
    type: "broken_expectation",
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
    age_hours: hoursSince(asset.reviewed_at || asset.submitted_at),
    response_sla_hours: 12,
    sla_state: proofTaskSlaState(hoursSince(asset.reviewed_at || asset.submitted_at), 12),
    trust_lift_points: Math.max(2, asset.trust_lift_points || 2),
    buyer_impact: "Rejected proof keeps this buyer-facing evidence unresolved until a clearer replacement is approved.",
    fact_ids: []
  };
}

function providerLabel(provider: SellerProofAgent["provider"]) {
  if (provider === "bedrock") return "Bedrock grounded";
  if (provider === "gemini") return "Gemini grounded";
  if (provider === "fallback_after_llm_error") return "Rules fallback";
  return "Deterministic";
}

function proofTaskKey(task: SellerEvidenceCoachTask) {
  return `${task.product_id}:${task.attribute}`;
}

function proofTaskSla(task: SellerEvidenceCoachTask) {
  const age = Number(task.age_hours ?? hoursSince(task.last_seen_at || task.first_seen_at));
  const slaHours = Number(task.response_sla_hours ?? (task.priority === "high" ? 12 : 24));
  const state = task.sla_state ?? proofTaskSlaState(age, slaHours);
  const ageLabel = age < 24 ? `${age}h` : `${Math.round(age / 24)}d`;
  const slaLabel = slaHours < 24 ? `${slaHours}h` : `${Math.round(slaHours / 24)}d`;
  return {
    tone: state === "breached" ? "bad" : state === "due_today" ? "warn" : "good",
    label: `${ageLabel} / ${slaLabel}`
  };
}

function proofTaskSlaState(ageHours: number, slaHours: number): "ok" | "due_today" | "breached" {
  if (ageHours > slaHours) return "breached";
  if (ageHours > slaHours * 0.75) return "due_today";
  return "ok";
}

function proofTaskFallbackTrustLift(task: SellerEvidenceCoachTask) {
  const baseByAttribute: Partial<Record<SellerEvidenceCoachTask["attribute"], number>> = {
    size: 7,
    fabric: 6,
    transparency: 6,
    color: 5,
    packaging: 4,
    offer: 3
  };
  const demandBoost = task.buyer_demand >= 5 ? 2 : task.buyer_demand >= 3 ? 1 : 0;
  return Math.max(2, Math.min(10, (baseByAttribute[task.attribute] ?? 4) + demandBoost));
}

function hoursSince(iso: string | null | undefined) {
  if (!iso) return 0;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.round((Date.now() - timestamp) / 36e5));
}

function formatShortDate(iso: string | null | undefined) {
  if (!iso) return "Not yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not yet";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short" }).format(date);
}
