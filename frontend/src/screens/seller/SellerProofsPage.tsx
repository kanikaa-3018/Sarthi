import { AlertTriangle, Bot, Camera, CheckCircle2, CheckSquare, Clock3, Grid3X3, Info, Layers3, List, ListChecks, RotateCcw, Search, ShieldCheck, TrendingUp, Upload } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { roleText, type LanguageCode } from "../../i18n";
import type { SellerEvidenceCoachResponse, SellerEvidenceCoachTask } from "../../types/api";
import type { SellerCopy } from "./sellerCopy";
import { proofTaskReason, proofTypeLabel, type SellerAutomationSummary, type SellerProductRow, type SellerProofAsset, type SellerProofLanes } from "./sellerModel";

type ProofLane = "action" | "review" | "visible";
type SellerProofAgent = SellerEvidenceCoachResponse["proof_agent"];

type SellerProofsPageProps = {
  lanes: SellerProofLanes;
  agent?: SellerProofAgent | null;
  automation?: SellerAutomationSummary | null;
  rows?: SellerProductRow[];
  copy: SellerCopy;
  language: LanguageCode;
  onOpenTask: (task: SellerEvidenceCoachTask) => void;
};

type ProofBatchCard = {
  key: string;
  label: string;
  title: string;
  detail: string;
  urgentCount: number;
  buyerDemand: number;
  trustLift: number;
  tasks: SellerEvidenceCoachTask[];
};

type ProofViewMode = "grid" | "list";

export function SellerProofsPage({ lanes, agent, automation, rows = [], copy, language, onOpenTask }: SellerProofsPageProps) {
  const actionCount = lanes.openTasks.length + lanes.rejected.length;
  const tx = (text: string) => roleText(language, text);
  const [lane, setLane] = useState<ProofLane>(actionCount ? "action" : lanes.inReview.length ? "review" : "visible");
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useState<ProofViewMode>("grid");
  const [suggestedOnly, setSuggestedOnly] = useState(true);
  const [selectedBatchKey, setSelectedBatchKey] = useState<string | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
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
  const taskRows = useMemo(() => actionRows.map((row) => row.task), [actionRows]);
  const proofBatches = useMemo(() => buildProofBatchCards(taskRows), [taskRows]);
  const activeBatch = proofBatches.find((batch) => batch.key === selectedBatchKey) ?? proofBatches[0] ?? null;
  const activeBatchTasks = activeBatch?.tasks ?? [];
  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const base = suggestedOnly ? activeBatchTasks.slice(0, Math.max(2, Math.min(4, activeBatchTasks.length))) : activeBatchTasks;
    if (!normalizedQuery) return base;
    return base.filter((task) => `${task.product_title} ${task.product_id} ${task.attribute} ${proofTypeLabel(task.recommended_proof_type)}`.toLowerCase().includes(normalizedQuery));
  }, [activeBatchTasks, query, suggestedOnly]);
  const selectedTasks = useMemo(() => {
    const selected = activeBatchTasks.filter((task) => selectedProductIds.includes(task.product_id));
    return selected.length ? selected : activeBatchTasks.slice(0, Math.min(2, activeBatchTasks.length));
  }, [activeBatchTasks, selectedProductIds]);
  const waitingBuyers = taskRows.reduce((sum, task) => sum + Math.max(0, Number(task.buyer_demand ?? 0)), 0);
  const openTrustLift = taskRows.reduce((sum, task) => sum + Math.max(0, Number(task.trust_lift_points ?? proofTaskFallbackTrustLift(task))), 0);
  const productImageById = useMemo(() => buildProductImageMap(rows, lanes.buyerVisible, lanes.inReview, lanes.rejected), [lanes.buyerVisible, lanes.inReview, lanes.rejected, rows]);

  useEffect(() => {
    if (!proofBatches.length) return;
    if (!selectedBatchKey || !proofBatches.some((batch) => batch.key === selectedBatchKey)) {
      setSelectedBatchKey(proofBatches[0].key);
    }
  }, [proofBatches, selectedBatchKey]);

  return (
    <div className="seller-page seller-proofs-page seller-proof-studio">
      <header className="seller-page-header">
        <div>
          <p className="seller-kicker">{tx("Buyer evidence")}</p>
          <h2>{tx("Proof center")}</h2>
          <p>{tx("Fix the proof gaps buyers see before they buy.")}</p>
        </div>
      </header>

      <section className="seller-proof-bulk-workbench" aria-labelledby="seller-proof-bulk-title">
        <header className="seller-proof-bulk-head">
          <div>
            <span><Layers3 size={15} aria-hidden="true" /> {tx("Proof work")}</span>
            <h3 id="seller-proof-bulk-title">{tx("Upload proof once")}</h3>
            <p>{tx("Pick matching products. Send one clear photo or file. Reviewers approve it before buyers see it.")}</p>
          </div>
          <dl aria-label="Proof work summary">
            <div><dt>{proofBatches.length}</dt><dd>batches</dd></div>
            <div><dt>{waitingBuyers}</dt><dd>buyer asks</dd></div>
            <div><dt>{taskRows.length}</dt><dd>products</dd></div>
          </dl>
        </header>

        <div className="seller-proof-batch-heading">
          <strong>{tx("Proof batches")}</strong>
          <span>{tx("Choose issue, then products.")}</span>
        </div>

        {proofBatches.length ? (
          <>
            <div className="seller-proof-batch-strip" aria-label="Proof batches">
              {proofBatches.map((batch) => (
                <button
                  key={batch.key}
                  type="button"
                  className={batch.key === activeBatch?.key ? "active" : ""}
                  onClick={() => {
                    setSelectedBatchKey(batch.key);
                    setSelectedProductIds(batch.tasks.slice(0, Math.min(2, batch.tasks.length)).map((task) => task.product_id));
                  }}
                >
                  <ProofStackThumb tasks={batch.tasks} imageById={productImageById} />
                  <span>{batch.label}</span>
                  <strong>{batch.title}</strong>
                  <small>{batch.detail}</small>
                  {batch.urgentCount ? <em>{batch.urgentCount} urgent</em> : null}
                </button>
              ))}
            </div>

            <div className="seller-proof-instruction-grid">
              <section>
                <span><Camera size={14} aria-hidden="true" /> {tx("What to upload")}</span>
                <h4>{activeBatch ? proofUploadInstruction(activeBatch, tx) : tx("Upload one clear product proof.")}</h4>
                <p>{tx("Use natural light and the actual product shade. Avoid catalog screenshots.")}</p>
              </section>
              <section>
                <span><CheckSquare size={14} aria-hidden="true" /> {tx("Suggested")}</span>
                <ul>
                  <li>{tx("Start with the products buyers are asking about.")}</li>
                  <li>{tx("Remove products this proof does not match.")}</li>
                  <li>{tx("Each product still goes to review.")}</li>
                </ul>
              </section>
              <aside>
                <span><Upload size={14} aria-hidden="true" /> {tx("Send for review")}</span>
                <strong>{selectedTasks.length} product{selectedTasks.length === 1 ? "" : "s"} selected</strong>
                <p>{tx("One file must match every selected product.")}</p>
                <div className="seller-proof-selected-thumbs">
                  {selectedTasks.slice(0, 4).map((task) => <ProofProductThumb key={task.product_id} task={task} imageById={productImageById} />)}
                </div>
                <button type="button" className="seller-proof-upload-box" onClick={() => selectedTasks[0] && onOpenTask(selectedTasks[0])} disabled={!selectedTasks.length}>
                  <Upload size={20} aria-hidden="true" />
                  <strong>{tx("Choose one proof file")}</strong>
                  <span>{tx("Use only if this proof matches every selected product.")}</span>
                </button>
              </aside>
            </div>

            <div className="seller-proof-product-tools">
              <label className="seller-proof-search">
                <Search size={16} aria-hidden="true" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={tx("Search product or SKU")} />
              </label>
              <div className="seller-proof-product-actions">
                <button type="button" className={suggestedOnly ? "active" : ""} onClick={() => setSuggestedOnly(true)}>{tx("Suggested")}</button>
                <button type="button" className={!suggestedOnly ? "active" : ""} onClick={() => setSuggestedOnly(false)}>{tx("Select visible")}</button>
                <div className="seller-proof-view-toggle" aria-label="Product view">
                  <button type="button" className={viewMode === "grid" ? "active" : ""} onClick={() => setViewMode("grid")}><Grid3X3 size={14} /> {tx("Grid")}</button>
                  <button type="button" className={viewMode === "list" ? "active" : ""} onClick={() => setViewMode("list")}><List size={14} /> {tx("List")}</button>
                </div>
              </div>
            </div>

            <div className="seller-proof-selection-status">
              <span>{selectedTasks.length} selected</span>
              <strong>{tx("Answers")} {activeBatch?.buyerDemand ?? 0} {tx("asks")} / +{activeBatch?.trustLift ?? openTrustLift} {tx("after review")}</strong>
            </div>

            <div className={`seller-proof-product-picker ${viewMode}`}>
              {visibleTasks.map((task) => {
                const selected = selectedTasks.some((item) => item.product_id === task.product_id);
                return (
                  <button
                    key={proofTaskKey(task)}
                    type="button"
                    className={selected ? "selected" : ""}
                    onClick={() => setSelectedProductIds((current) => toggleProductSelection(current, task.product_id))}
                  >
                    <ProofProductThumb task={task} imageById={productImageById} />
                    <span className="seller-proof-sku-badge">{task.product_id}</span>
                    <strong className="seller-proof-title">{task.product_title}</strong>
                    <small className="seller-proof-meta">{task.buyer_demand} asks · +{task.trust_lift_points ?? proofTaskFallbackTrustLift(task)} trust</small>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <ProofEmpty icon={<CheckCircle2 size={21} />} title="No proof action is waiting" detail="New buyer concerns will appear here when they need evidence." />
        )}
      </section>

      <div className="seller-proof-tabs compact" role="tablist" aria-label="Proof status">
        <ProofTab active={lane === "action"} label={copy.needsAction} count={actionCount} onClick={() => setLane("action")} />
        <ProofTab active={lane === "review"} label={copy.withReviewer} count={lanes.inReview.length} onClick={() => setLane("review")} />
        <ProofTab active={lane === "visible"} label={copy.buyerVisible} count={lanes.buyerVisible.length} onClick={() => setLane("visible")} />
      </div>

      <section className="seller-proof-lane compact" role="tabpanel">
        {lane === "action" && <CompactProofQueue tasks={taskRows} selectedTaskKey={selectedTaskKey} language={language} onOpenTask={onOpenTask} />}
        {lane === "review" && (
          lanes.inReview.length ? lanes.inReview.map((asset) => <ProofAssetRow key={asset.proof_id} asset={asset} icon={<Clock3 size={18} />} language={language} />) : <ProofEmpty icon={<Clock3 size={21} />} title={tx("Nothing is with the reviewer")} detail={tx("Submitted proof will appear here until a decision is made.")} />
        )}
        {lane === "visible" && (
          lanes.buyerVisible.length ? lanes.buyerVisible.map((asset) => <ProofAssetRow key={asset.proof_id} asset={asset} icon={<CheckCircle2 size={18} />} language={language} />) : <ProofEmpty icon={<CheckCircle2 size={21} />} title={tx("No buyer-visible proof yet")} detail={tx("Approved proof will appear here with its product and review date.")} />
        )}
      </section>

      <p className="seller-privacy-line">{copy.privacy}</p>
    </div>
  );
}

function buildProofBatchCards(tasks: SellerEvidenceCoachTask[]): ProofBatchCard[] {
  const grouped = new Map<string, SellerEvidenceCoachTask[]>();
  for (const task of tasks) {
    const key = `${task.attribute}:${task.recommended_proof_type}`;
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  }

  return [...grouped.entries()]
    .map(([key, group]) => {
      const sorted = [...group].sort((left, right) => Number(right.buyer_demand ?? 0) - Number(left.buyer_demand ?? 0));
      const first = sorted[0];
      const buyerDemand = sorted.reduce((sum, task) => sum + Math.max(0, Number(task.buyer_demand ?? 0)), 0);
      const trustLift = sorted.reduce((sum, task) => sum + Math.max(0, Number(task.trust_lift_points ?? proofTaskFallbackTrustLift(task))), 0);
      const urgentCount = sorted.filter((task) => task.priority === "high" || task.sla_state === "breached" || task.sla_state === "due_today").length;
      return {
        key,
        label: proofTypeLabel(first.recommended_proof_type),
        title: shortProductTitle(first.product_title),
        detail: `${sorted.length} product${sorted.length === 1 ? "" : "s"} / ${buyerDemand} asks`,
        urgentCount,
        buyerDemand,
        trustLift,
        tasks: sorted
      };
    })
    .sort((left, right) => right.urgentCount - left.urgentCount || right.buyerDemand - left.buyerDemand || right.trustLift - left.trustLift);
}

function buildProductImageMap(
  rows: SellerProductRow[],
  buyerVisible: SellerProofAsset[],
  inReview: SellerProofAsset[],
  rejected: SellerProofAsset[]
) {
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.listing.product.image_url) map.set(row.listing.product.product_id, row.listing.product.image_url);
  }
  for (const asset of [...buyerVisible, ...inReview, ...rejected]) {
    if (asset.product_image_url && !map.has(asset.product_id)) map.set(asset.product_id, asset.product_image_url);
  }
  return map;
}

function ProofStackThumb({
  tasks,
  imageById
}: {
  tasks: SellerEvidenceCoachTask[];
  imageById: Map<string, string>;
}) {
  return (
    <span className="seller-proof-stack-thumb" aria-hidden="true">
      {tasks.slice(0, 2).map((task) => {
        const image = imageById.get(task.product_id);
        return image ? <img key={task.product_id} src={image} alt="" /> : <span key={task.product_id}>{task.product_title.slice(0, 1)}</span>;
      })}
    </span>
  );
}

function ProofProductThumb({
  task,
  imageById
}: {
  task: SellerEvidenceCoachTask;
  imageById: Map<string, string>;
}) {
  const image = imageById.get(task.product_id);
  return (
    <span className="seller-proof-product-thumb" aria-hidden="true">
      {image ? <img src={image} alt="" /> : <Camera size={18} />}
    </span>
  );
}

function proofUploadInstruction(batch: ProofBatchCard, tx: (text: string) => string) {
  const first = batch.tasks[0];
  const proofType = proofTypeLabel(first.recommended_proof_type).toLowerCase();
  const attribute = prettyLabel(first.attribute).toLowerCase();
  if (first.attribute === "color") return tx("Upload a daylight colour photo only for products that match this colour family.");
  if (first.attribute === "size") return tx("Upload the measurement chart only for products using this exact size table.");
  if (first.attribute === "fabric") return tx("Upload one fabric close-up only for products made from the same material.");
  return tx(`Upload one ${proofType} only for products with the same ${attribute} proof need.`);
}

function toggleProductSelection(current: string[], productId: string) {
  return current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [...current, productId];
}

function CompactProofQueue({
  tasks,
  selectedTaskKey,
  language,
  onOpenTask
}: {
  tasks: SellerEvidenceCoachTask[];
  selectedTaskKey: string | null;
  language: LanguageCode;
  onOpenTask: (task: SellerEvidenceCoachTask) => void;
}) {
  const tx = (text: string) => roleText(language, text);
  if (!tasks.length) {
    return <ProofEmpty icon={<CheckCircle2 size={21} />} title={tx("No proof action is waiting")} detail={tx("New buyer concerns will appear here when they need evidence.")} />;
  }

  return (
    <div className="seller-proof-compact-list">
      {tasks.slice(0, 5).map((task) => (
        <article key={proofTaskKey(task)} className={selectedTaskKey === proofTaskKey(task) ? "agent-selected" : ""}>
          <div>
            <span>{proofTypeLabel(task.recommended_proof_type)}</span>
            <strong>{task.product_title}</strong>
            <p>{task.buyer_demand} buyer ask{task.buyer_demand === 1 ? "" : "s"} / +{task.trust_lift_points ?? proofTaskFallbackTrustLift(task)} after review</p>
          </div>
          <button type="button" className="seller-button seller-button-text" onClick={() => onOpenTask(task)}>{tx("Upload")}</button>
        </article>
      ))}
    </div>
  );
}

function shortProductTitle(title: string) {
  return title.replace(/\s+(Everyday Wear|Verified Batch|Festival Edit|Queen Set)$/i, "").trim();
}

function prettyLabel(value: string) {
  return value.replace(/_/g, " ");
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
            <div className="seller-proof-meta">
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

function ProofImpactSummary({ lanes, actionCount, language }: { lanes: SellerProofLanes; actionCount: number; language: LanguageCode }) {
  const tx = (text: string) => roleText(language, text);
  const tasks = [...lanes.openTasks, ...lanes.rejected.map(taskFromRejected)];
  const waitingBuyers = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.buyer_demand ?? 0)), 0);
  const urgentTasks = tasks.filter((task) => task.sla_state === "breached" || task.sla_state === "due_today" || task.priority === "high").length;
  const trustLift = tasks.reduce((sum, task) => sum + Math.max(0, Number(task.trust_lift_points ?? proofTaskFallbackTrustLift(task))), 0);
  const visibleLift = lanes.buyerVisible.reduce((sum, asset) => sum + Math.max(0, Number(asset.trust_lift_points ?? 0)), 0);

  return (
    <section className="seller-proof-impact-summary" aria-label="Proof request impact">
      <ProofImpactMetric
        icon={<AlertTriangle size={16} />}
        label={tx("Needs action")}
        value={String(actionCount)}
        detail={urgentTasks ? `${urgentTasks} ${tx("time-sensitive")}` : tx("No urgent breach")}
        tone={urgentTasks ? "warn" : "good"}
      />
      <ProofImpactMetric
        icon={<ShieldCheck size={16} />}
        label={tx("Buyer asks waiting")}
        value={String(waitingBuyers)}
        detail={tx("Aggregate demand only")}
        tone={waitingBuyers ? "warn" : "good"}
      />
      <ProofImpactMetric
        icon={<TrendingUp size={16} />}
        label={tx("Trust lift open")}
        value={`+${trustLift}`}
        detail={`${visibleLift ? `+${visibleLift} ${tx("already visible")}` : tx("Visible after approval")}`}
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
  language,
  onOpen
}: {
  task: SellerEvidenceCoachTask;
  rejected?: boolean;
  highlighted?: boolean;
  language: LanguageCode;
  onOpen: () => void;
}) {
  const tx = (text: string) => roleText(language, text);
  const replacement = rejected || Boolean(task.rejection_note);
  const sla = proofTaskSla(task);
  const trustLift = task.trust_lift_points ?? proofTaskFallbackTrustLift(task);
  return (
    <article className={`seller-proof-row ${replacement ? "rejected" : ""} ${highlighted ? "agent-selected" : ""}`}>
      <div className="seller-proof-row-icon" aria-hidden="true">{replacement ? <RotateCcw size={18} /> : <span>{task.buyer_demand}</span>}</div>
      <div className="seller-proof-row-main">
        {highlighted && <em className="seller-proof-agent-match"><Bot size={13} aria-hidden="true" /> {tx("Agent pick")}</em>}
        <span>{task.product_title}</span>
        <h3>{tx(task.title)}</h3>
        <p>{proofTaskReason(task)}</p>
        <dl className="seller-proof-evidence-grid">
          <div>
            <dt>{tx("Required")}</dt>
            <dd>{proofTypeLabel(task.recommended_proof_type)}</dd>
          </div>
          <div>
            <dt>{tx("Target")}</dt>
            <dd className={sla.tone}>{sla.label}</dd>
          </div>
          <div>
            <dt>{tx("Unlocks")}</dt>
            <dd>+{trustLift} {tx("trust")}</dd>
          </div>
        </dl>
        <small>{task.buyer_impact || (replacement ? tx("Reviewer asked for clearer replacement proof.") : `${task.buyer_demand} ${tx(task.buyer_demand === 1 ? "buyer request" : "buyer requests")} ${tx("can be answered after review.")}`)}</small>
        {task.proof_loop && <ProofLoopNote loop={task.proof_loop} language={language} />}
      </div>
      <button type="button" className="seller-button seller-button-primary" onClick={onOpen}>{replacement ? tx("Replace proof") : tx("Upload proof")}</button>
    </article>
  );
}

function ProofAssetRow({ asset, icon, language }: { asset: SellerProofAsset; icon: React.ReactNode; language: LanguageCode }) {
  const tx = (text: string) => roleText(language, text);
  return (
    <article className="seller-proof-row seller-proof-history-row">
      <div className="seller-proof-row-icon" aria-hidden="true">{icon}</div>
      <div className="seller-proof-row-main">
        <span>{asset.product_title}</span>
        <h3>{proofTypeLabel(asset.proof_type)}</h3>
        <p>{asset.review_notes || (asset.status === "verified" ? tx("Approved evidence is available to buyer trust checks.") : tx("The reviewer is checking this evidence."))}</p>
        <dl className="seller-proof-evidence-grid compact">
          <div>
            <dt>{tx("Quality")}</dt>
            <dd>{asset.quality_label}</dd>
          </div>
          <div>
            <dt>{tx("Trust lift")}</dt>
            <dd>+{asset.trust_lift_points}</dd>
          </div>
          <div>
            <dt>{asset.status === "verified" ? tx("Reviewed") : tx("Submitted")}</dt>
            <dd>{formatShortDate(asset.reviewed_at || asset.submitted_at)}</dd>
          </div>
        </dl>
        {asset.proof_loop && <ProofLoopNote loop={asset.proof_loop} language={language} />}
      </div>
      <span className={`seller-state seller-state-${asset.status === "verified" ? "healthy" : "review"}`}>{asset.status === "verified" ? tx("Buyer-visible") : tx("With reviewer")}</span>
    </article>
  );
}

function ProofLoopNote({
  loop,
  language
}: {
  loop: NonNullable<SellerEvidenceCoachTask["proof_loop"]>;
  language: LanguageCode;
}) {
  const tx = (text: string) => roleText(language, text);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const stepDetails: Record<string, string> = {
    buyer_doubt: tx("A buyer questioned listing claims (e.g. color mismatch or size doubt)."),
    contract_locked: tx("Catalog promise is logged to establish a clear expectation contract."),
    buyer_outcome: tx("Buyer returns/outcomes flagged a gap in the expected promise."),
    aggregate_demand: tx("Sarthi aggregates demands across similar items for bulk resolution."),
    seller_upload: tx("Seller uploads a single high-quality daylight photo or document."),
    seller_fix: tx("Seller provides clear catalog proof to resolve the expectation gap."),
    admin_review: tx("A reviewer verifies authenticity before making it buyer-visible."),
    buyer_update: tx("Buyers get notified and see verified evidence on the product page."),
    score_update: tx("Product trust score updates dynamically and protects seller rating.")
  };

  const currentText = hoveredKey ? stepDetails[hoveredKey] : loop.buyer_notification_preview;

  return (
    <div className="seller-proof-loop-note">
      <div className="loop-note-header">
        <div>
          <span>{tx("Marketplace loop")}</span>
          <strong>{loop.aggregate_demand}</strong>
        </div>
        <div className="loop-note-info-pill">
          <Info size={11} aria-hidden="true" />
          <span>{tx("Interactive steps")}</span>
        </div>
      </div>
      
      <div className="loop-stepper-container">
        <ol className="loop-stepper">
          {loop.steps.map((step, idx) => {
            const isDone = step.done;
            const isHovered = hoveredKey === step.key;
            return (
              <li
                key={step.key}
                className={`loop-step-item ${isDone ? "done" : ""} ${isHovered ? "hovered" : ""}`}
                onMouseEnter={() => setHoveredKey(step.key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <div className="step-circle">
                  {isDone ? <span className="check-mark">{"\u2713"}</span> : <span className="step-num">{idx + 1}</span>}
                </div>
                <span className="step-label">{tx(step.label)}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <p className="loop-note-desc">
        {currentText}
      </p>
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

