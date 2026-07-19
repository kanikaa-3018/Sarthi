import { ArrowRight } from "lucide-react";
import type { SellerCopy } from "./sellerCopy";
import type { SellerActionItem } from "./sellerModel";

type SellerFact = {
  label: string;
  value: string;
  detail: string;
};

type SellerTodayPageProps = {
  actions: SellerActionItem[];
  facts: SellerFact[];
  copy: SellerCopy;
  onAction: (action: SellerActionItem) => void;
};

export function SellerTodayPage({ actions, facts, copy, onAction }: SellerTodayPageProps) {
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

function priorityLabel(priority: SellerActionItem["priority"]): string {
  return priority === "high" ? "Do first" : priority === "medium" ? "Next" : "When ready";
}
