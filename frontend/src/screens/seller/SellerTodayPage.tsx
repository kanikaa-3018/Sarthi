import { ArrowRight, Bot, ListChecks, ShieldCheck } from "lucide-react";
import type { SellerEvidenceCoachResponse, SellerEvidenceCoachTask } from "../../types/api";
import type { SellerCopy } from "./sellerCopy";
import type { SellerActionItem, SellerAutomationSummary } from "./sellerModel";

type SellerFact = {
  label: string;
  value: string;
  detail: string;
};

type SellerTodayPageProps = {
  actions: SellerActionItem[];
  facts: SellerFact[];
  automation?: SellerAutomationSummary | null;
  proofAgent?: SellerEvidenceCoachResponse["proof_agent"] | null;
  copy: SellerCopy;
  onAction: (action: SellerActionItem) => void;
  onOpenProofs: () => void;
};

export function SellerTodayPage({ actions, facts, automation, proofAgent, copy, onAction, onOpenProofs }: SellerTodayPageProps) {
  const next = actions[0];
  const queue = actions.slice(1, 6);

  return (
    <div className="seller-page seller-today-page">
      {next ? (
        <section className={`seller-next-action priority-${next.priority}`} aria-label="Next action">
          <div className="seller-section-label-row">
            <p className="seller-kicker">{copy.nextAction}</p>
            <span>{priorityLabel(next.priority)}</span>
          </div>
          <div className="seller-next-action-body">
            <div>
              <h2>{next.title}</h2>
              <p>{next.reason}</p>
              <small>{next.meta}</small>
            </div>
            <button type="button" className="seller-button seller-button-primary" onClick={() => onAction(next)}>
              {next.actionLabel}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : (
        <section className="seller-next-action caught-up" aria-label="Next action">
          <p className="seller-kicker">{copy.nextAction}</p>
          <h2>{copy.caughtUp}</h2>
          <p>{copy.caughtUpDetail}</p>
        </section>
      )}

      {automation ? (
        <SellerAutomationPanel automation={automation} actions={actions} onAction={onAction} onOpenProofs={onOpenProofs} />
      ) : proofAgent && (
        <section className="seller-proof-agent-brief" aria-labelledby="seller-proof-agent-brief-title">
          <div className="seller-proof-agent-brief-main">
            <span><Bot size={17} aria-hidden="true" /> Proof agent</span>
            <h2 id="seller-proof-agent-brief-title">{proofAgent.headline}</h2>
            <p>{proofAgent.summary}</p>
            <small><ShieldCheck size={14} aria-hidden="true" /> {proofAgent.metrics.waiting_buyers} buyer asks, +{proofAgent.metrics.open_trust_lift} trust lift pending, {proofAgent.metrics.submitted_count} with reviewer</small>
          </div>
          <button type="button" className="seller-button seller-button-secondary" onClick={onOpenProofs}>
            Open proof center
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}

      <section className="seller-queue-section" aria-labelledby="seller-queue-heading">
        <div className="seller-section-heading">
          <div>
            <p className="seller-kicker">{copy.priorityQueue}</p>
            <h2 id="seller-queue-heading">Your short work queue</h2>
          </div>
          <span>{queue.length} {queue.length === 1 ? "task" : "tasks"}</span>
        </div>
        {queue.length ? (
          <ol className="seller-task-list">
            {queue.map((action) => (
              <li key={action.id}>
                <span className={`seller-priority-marker priority-${action.priority}`}>{priorityLabel(action.priority)}</span>
                <div>
                  <strong>{action.title}</strong>
                  <p>{action.reason}</p>
                  <small>{action.meta}</small>
                </div>
                <button type="button" className="seller-button seller-button-text" onClick={() => onAction(action)}>
                  {action.actionLabel}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="seller-empty-line">No other task needs attention.</p>
        )}
      </section>

      <section className="seller-facts" aria-label="Seller facts">
        {facts.map((fact) => (
          <dl key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
            <dd>{fact.detail}</dd>
          </dl>
        ))}
      </section>

      <p className="seller-privacy-line">{copy.privacy}</p>
    </div>
  );
}

function SellerAutomationPanel({
  automation,
  actions,
  onAction,
  onOpenProofs
}: {
  automation: SellerAutomationSummary;
  actions: SellerActionItem[];
  onAction: (action: SellerActionItem) => void;
  onOpenProofs: () => void;
}) {
  const packetAction = automation.proofPacket
    ? actions.find((action) => sameProofTask(action.proofTask, automation.proofPacket?.task))
    : undefined;
  const primaryAction = packetAction
    ? () => onAction(packetAction)
    : onOpenProofs;
  const secondaryCommand = automation.rootCause ? {
    key: "listing",
    label: "Listing fix",
    title: automation.rootCause.title,
    detail: automation.rootCause.reason,
    action: automation.rootCause.action
  } : automation.bulkProofGroups[0] ? {
    key: "bulk",
    label: "Bulk queue",
    title: automation.bulkProofGroups[0].title,
    detail: automation.bulkProofGroups[0].detail,
    action: "Review proof center"
  } : null;
  const commandItems = [
    automation.proofPacket ? {
      key: "packet",
      label: "Proof packet",
      title: automation.proofPacket.title,
      detail: `${automation.proofPacket.buyerDemand} buyer asks, +${automation.proofPacket.trustLift} trust after review`,
      action: "Open packet"
    } : null,
    secondaryCommand
  ].filter(Boolean) as Array<{ key: string; label: string; title: string; detail: string; action: string }>;
  const activityItems = automation.demoStory.slice(0, 4);

  return (
    <section className="seller-automation-panel" aria-labelledby="seller-automation-heading">
      <header className="seller-automation-header">
        <div>
          <span><Bot size={17} aria-hidden="true" /> Seller autopilot</span>
          <h2 id="seller-automation-heading">{automation.headline}</h2>
          <p>{automation.summary}</p>
        </div>
        <button type="button" className="seller-button seller-button-secondary" onClick={primaryAction}>
          {automation.proofPacket ? "Open proof packet" : "Open proof center"}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="seller-automation-stats" aria-label="Automation summary">
        {automation.stats.map((stat) => (
          <dl key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
            <dd>{stat.detail}</dd>
          </dl>
        ))}
      </div>

      <div className="seller-automation-grid">
        <div className="seller-automation-commands" aria-label="Prepared seller work">
          {commandItems.map((item) => (
            <article key={item.key}>
              <span>{item.label}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <small>{item.action}</small>
            </article>
          ))}
        </div>

        <div className="seller-automation-log seller-demo-story" aria-label="Trust loop">
          <div className="seller-automation-subhead"><ListChecks size={15} aria-hidden="true" /><span>Trust loop</span></div>
          <ol>
            {activityItems.map((entry) => (
              <li key={entry.key} className={`automation-${entry.status}`}>
                <strong>{entry.label}</strong>
                <p>{entry.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <p className="seller-automation-guardrail"><ShieldCheck size={15} aria-hidden="true" />{automation.guardrail}</p>
    </section>
  );
}

function sameProofTask(left: SellerEvidenceCoachTask | undefined, right: SellerEvidenceCoachTask | undefined): boolean {
  return Boolean(left && right && left.product_id === right.product_id && left.attribute === right.attribute);
}

function priorityLabel(priority: SellerActionItem["priority"]): string {
  return priority === "high" ? "Do first" : priority === "medium" ? "Next" : "When ready";
}
