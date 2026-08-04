import { ArrowRight, Bot, ListChecks, ShieldCheck } from "lucide-react";
import { roleText, type LanguageCode } from "../../i18n";
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
  language: LanguageCode;
  onAction: (action: SellerActionItem) => void;
  onOpenProofs: () => void;
};

export function SellerTodayPage({ actions, facts, automation, proofAgent, copy, language, onAction, onOpenProofs }: SellerTodayPageProps) {
  const tx = (text: string) => roleText(language, text);
  const next = actions[0];
  const queue = actions.slice(1, 6);

  return (
    <div className="seller-page seller-today-page">
      {next ? (
        <section className={`seller-next-action priority-${next.priority}`} aria-label={copy.nextAction}>
          <div className="seller-section-label-row">
            <p className="seller-kicker">{copy.nextAction}</p>
            <span>{priorityLabel(next.priority, language)}</span>
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
        <section className="seller-next-action caught-up" aria-label={copy.nextAction}>
          <p className="seller-kicker">{copy.nextAction}</p>
          <h2>{copy.caughtUp}</h2>
          <p>{copy.caughtUpDetail}</p>
        </section>
      )}

      {automation ? (
        <SellerAutomationPanel automation={automation} actions={actions} language={language} onAction={onAction} onOpenProofs={onOpenProofs} />
      ) : proofAgent && (
        <section className="seller-proof-agent-brief" aria-labelledby="seller-proof-agent-brief-title">
          <div className="seller-proof-agent-brief-main">
            <span><Bot size={17} aria-hidden="true" /> {tx("Proof agent")}</span>
            <h2 id="seller-proof-agent-brief-title">{proofAgent.headline}</h2>
            <p>{proofAgent.summary}</p>
            <small><ShieldCheck size={14} aria-hidden="true" /> {proofAgent.metrics.waiting_buyers} {tx("buyer asks")}, +{proofAgent.metrics.open_trust_lift} {tx("trust lift pending")}, {proofAgent.metrics.submitted_count} {tx("with reviewer")}</small>
          </div>
          <button type="button" className="seller-button seller-button-secondary" onClick={onOpenProofs}>
            {tx("Open proof center")}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </section>
      )}

      <section className="seller-queue-section" aria-labelledby="seller-queue-heading">
        <div className="seller-section-heading">
          <div>
            <p className="seller-kicker">{copy.priorityQueue}</p>
            <h2 id="seller-queue-heading">{tx("Your short work queue")}</h2>
          </div>
          <span>{queue.length} {tx(queue.length === 1 ? "task" : "tasks")}</span>
        </div>
        {queue.length ? (
          <ol className="seller-task-list">
            {queue.map((action) => (
              <li key={action.id}>
                <span className={`seller-priority-marker priority-${action.priority}`}>{priorityLabel(action.priority, language)}</span>
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
          <p className="seller-empty-line">{tx("No other task needs attention.")}</p>
        )}
      </section>

      <section className="seller-facts" aria-label={copy.sellerFacts}>
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
  language,
  onAction,
  onOpenProofs
}: {
  automation: SellerAutomationSummary;
  actions: SellerActionItem[];
  language: LanguageCode;
  onAction: (action: SellerActionItem) => void;
  onOpenProofs: () => void;
}) {
  const tx = (text: string) => roleText(language, text);
  const packetAction = automation.proofPacket
    ? actions.find((action) => sameProofTask(action.proofTask, automation.proofPacket?.task))
    : undefined;
  const listingAction = automation.rootCause
    ? actions.find((action) => action.action.id === automation.rootCause?.productId || action.meta === automation.rootCause?.title)
    : undefined;
  const bulkAction = automation.bulkProofGroups[0]
    ? actions.find((action) => sameProofTask(action.proofTask, automation.bulkProofGroups[0]?.firstTask))
    : undefined;
  const primaryAction = packetAction
    ? () => onAction(packetAction)
    : onOpenProofs;
  const secondaryCommand = automation.rootCause ? {
    key: "listing",
    label: tx("Listing fix"),
    title: automation.rootCause.title,
    detail: automation.rootCause.reason,
    action: automation.rootCause.action,
    helper: tx("Review the safer product promise before it goes live."),
    onSelect: listingAction ? () => onAction(listingAction) : onOpenProofs
  } : automation.bulkProofGroups[0] ? {
    key: "bulk",
    label: tx("Bulk queue"),
    title: automation.bulkProofGroups[0].title,
    detail: automation.bulkProofGroups[0].detail,
    action: tx("Review proof center"),
    helper: tx("Use one proof standard for similar buyer asks."),
    onSelect: bulkAction ? () => onAction(bulkAction) : onOpenProofs
  } : null;
  const commandItems = [
    automation.proofPacket ? {
      key: "packet",
      label: tx("Proof packet"),
      title: automation.proofPacket.title,
      detail: `${automation.proofPacket.buyerDemand} ${tx("buyer asks")}, +${automation.proofPacket.trustLift} ${tx("trust after review")}`,
      action: tx("Open packet"),
      helper: tx("Upload one reviewer-safe proof for this product."),
      onSelect: primaryAction
    } : null,
    secondaryCommand
  ].filter(Boolean) as Array<{ key: string; label: string; title: string; detail: string; action: string; helper: string; onSelect: () => void }>;
  const activityItems = automation.demoStory.slice(0, 4);

  return (
    <section className="seller-automation-panel" aria-labelledby="seller-automation-heading">
      <header className="seller-automation-header">
        <div>
          <span><Bot size={17} aria-hidden="true" /> {tx("Seller autopilot")}</span>
          <h2 id="seller-automation-heading">{automation.headline}</h2>
          <p>{automation.summary}</p>
        </div>
        <button type="button" className="seller-button seller-button-secondary" onClick={primaryAction}>
          {automation.proofPacket ? tx("Open proof packet") : tx("Open proof center")}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="seller-automation-stats" aria-label={tx("Automation summary")}>
        {automation.stats.map((stat) => (
          <dl key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
            <dd>{stat.detail}</dd>
          </dl>
        ))}
      </div>

      <div className="seller-automation-grid">
        <div className="seller-automation-commands" aria-label={tx("Prepared seller work")}>
          {commandItems.map((item) => (
            <button key={item.key} type="button" onClick={item.onSelect}>
              <span>{item.label}</span>
              <strong>{item.title}</strong>
              <p>{item.detail}</p>
              <small>
                <em>{item.helper}</em>
                <b>{item.action}<ArrowRight size={14} aria-hidden="true" /></b>
              </small>
            </button>
          ))}
        </div>

        <div className="seller-automation-log seller-demo-story" aria-label={tx("Trust loop")}>
          <div className="seller-automation-subhead"><ListChecks size={15} aria-hidden="true" /><span>{tx("Trust loop")}</span></div>
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

function priorityLabel(priority: SellerActionItem["priority"], language: LanguageCode): string {
  const text = priority === "high" ? "Do first" : priority === "medium" ? "Next" : "When ready";
  return roleText(language, text);
}
