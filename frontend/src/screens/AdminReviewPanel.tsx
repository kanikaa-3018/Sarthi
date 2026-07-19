import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  Bot,
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
  FileCheck2,
  ClipboardCheck,
  Image as ImageIcon,
  FileText,
  Search,
  RefreshCcw,
  Send,
  ShieldCheck,
  Store,
  XCircle
} from "lucide-react";
import {
  approveListingDraft,
  approveSellerDocument,
  approveSellerEvidenceAsset,
  approveSellerApplication,
  getAdminReviewQueue,
  rejectSellerDocument,
  rejectSellerEvidenceAsset,
  rejectSellerApplication,
  requestListingRevision
} from "../api/client";
import type {
  AdminAuditEvent,
  AdminPrescreenSuggestion,
  AdminReviewQueue,
  AdminSellerDossier
} from "../types/api";
type AdminTab = "reports" | "uploads" | "drafts" | "audit";
type AdminMode = "command" | "agent" | "policy" | "impact";

type SellerApplicationReview = AdminReviewQueue["seller_applications"][number];
type VerificationDocumentReview = AdminReviewQueue["documents"][number];
type ListingDraftReview = AdminReviewQueue["listing_drafts"][number];
type ProofAssetReview = AdminReviewQueue["proof_assets"][number];
type SellerLaneId = "needs_decision" | "docs_blocked" | "products" | "proofs" | "clear";
type SellerLane = {
  id: SellerLaneId;
  label: string;
  count: number;
};
type SellerReport = ReturnType<typeof buildSellerReport>;
type PacketItemKind = "application" | "document" | "draft" | "proof";
type SellerPacketItem =
  | {
      id: string;
      kind: "application";
      title: string;
      subtitle: string;
      status: string;
      group: string;
      readyForReview: boolean;
      prescreen: AdminPrescreenSuggestion;
      item: SellerApplicationReview;
    }
  | {
      id: string;
      kind: "document";
      title: string;
      subtitle: string;
      status: string;
      group: string;
      readyForReview: boolean;
      prescreen: AdminPrescreenSuggestion;
      item: VerificationDocumentReview;
    }
  | {
      id: string;
      kind: "draft";
      title: string;
      subtitle: string;
      status: string;
      group: string;
      readyForReview: boolean;
      prescreen: AdminPrescreenSuggestion;
      item: ListingDraftReview;
    }
  | {
      id: string;
      kind: "proof";
      title: string;
      subtitle: string;
      status: string;
      group: string;
      readyForReview: boolean;
      prescreen: AdminPrescreenSuggestion;
      item: ProofAssetReview;
    };
type UploadFilter = "needs_review" | "documents" | "proofs" | "all";
type UploadQueueRow =
  | {
      id: string;
      kind: "document";
      title: string;
      subtitle: string;
      sellerName: string;
      status: string;
      submittedAt: string | null;
      readyForReview: boolean;
      prescreen: AdminPrescreenSuggestion;
      searchText: string;
      item: VerificationDocumentReview;
    }
  | {
      id: string;
      kind: "proof";
      title: string;
      subtitle: string;
      sellerName: string;
      status: string;
      submittedAt: string | null;
      readyForReview: boolean;
      prescreen: AdminPrescreenSuggestion;
      searchText: string;
      item: ProofAssetReview;
    };

const MIN_REJECT_NOTE_LENGTH = 8;

const REVIEW_TAB_META: Record<AdminTab, { navLabel: string; title: string; description: string }> = {
  reports: {
    navLabel: "Sellers",
    title: "Seller review queue",
    description: "Pick a seller, clear the next blocker, and move to the next item."
  },
  uploads: {
    navLabel: "Uploads",
    title: "Upload review",
    description: "Review submitted documents and proof files that need a human decision."
  },
  drafts: {
    navLabel: "Drafts",
    title: "Draft review",
    description: "Approve clean product drafts or send precise fixes back to sellers."
  },
  audit: {
    navLabel: "Audit",
    title: "History",
    description: "Review recent decisions, notes, and affected seller items."
  }
};

const ADMIN_MODE_META: Record<Exclude<AdminMode, "command">, { kicker: string; title: string; description: string }> = {
  agent: {
    kicker: "Triage",
    title: "Prioritized work",
    description: "See the queue ordered by blockers, SLA, risk, and confidence."
  },
  policy: {
    kicker: "Policy",
    title: "Rules and blockers",
    description: "Check source health, validation gates, and items that need senior review."
  },
  impact: {
    kicker: "Impact",
    title: "Review effort saved",
    description: "Track pre-checks, suggestions, and where reviewers still spend time."
  }
};
type NotesById = Record<string, string>;

  const location = useLocation();
  const navigate = useNavigate();
export function AdminReviewPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>(() => adminTabFromPath(location.pathname));
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [sellerSearch, setSellerSearch] = useState("");
  const [queue, setQueue] = useState<AdminReviewQueue | null>(null);
  const [notes, setNotes] = useState<NotesById>({});
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeMode = adminModeFromPath(location.pathname);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void refreshQueue();
  }, []);

  useEffect(() => {
    setActiveTab(adminTabFromPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (!queue?.seller_dossiers.length) return;
    const currentStillExists =
      selectedSellerId && queue.seller_dossiers.some((seller) => seller.seller_id === selectedSellerId);
    if (currentStillExists) return;

    const firstAutomationSeller = queue.automation_plan.first_queue_item_id
      ? queue.active_queue.find((item) => item.queue_item_id === queue.automation_plan.first_queue_item_id)?.seller_id
      : null;
    const firstActiveSeller = queue.seller_dossiers.find((seller) => seller.open_review_items > 0)?.seller_id;
    setSelectedSellerId(firstAutomationSeller ?? firstActiveSeller ?? queue.seller_dossiers[0].seller_id);
  }, [queue, selectedSellerId]);

  const selectedReport = useMemo(() => {
    if (!queue || !selectedSellerId) return null;
    const seller = queue.seller_dossiers.find((item) => item.seller_id === selectedSellerId) ?? null;
    if (!seller) return null;
    return buildSellerReport(queue, seller);
  }, [queue, selectedSellerId]);

  async function refreshQueue() {
    setLoading(true);
    setError(null);
    try {
      setQueue(await getAdminReviewQueue());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load seller reports.");
    } finally {
      setLoading(false);
    }
  }

  function updateNote(id: string, value: string) {
    setNotes((current) => ({ ...current, [id]: value }));
  }

  async function runAction(
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) {
    setBusyAction(actionKey);
    setError(null);
    setSuccess(null);
    try {
      setQueue(await handler());
      if (noteId) {
        setNotes((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== noteId)));
      }
      setSuccess(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed.");
    } finally {
      setBusyAction(null);
    }
  }
  const tabs = [
    {
      id: "reports" as const,
      label: REVIEW_TAB_META.reports.navLabel,
      count: queue?.seller_dossiers.filter((seller) => seller.open_review_items > 0 || seller.pending_documents.length > 0).length ?? 0
    },
    {
      id: "uploads" as const,
      label: REVIEW_TAB_META.uploads.navLabel,
      count: (queue?.summary.document_checks ?? 0) + (queue?.summary.proof_reviews ?? 0)
    },
    {
      id: "drafts" as const,
      label: REVIEW_TAB_META.drafts.navLabel,
      count: queue?.listing_drafts.length ?? 0
    },
    {
      id: "audit" as const,
      label: REVIEW_TAB_META.audit.navLabel,
      count: queue?.audit_events.length ?? 0
    }
  ];
  const activeTabMeta = REVIEW_TAB_META[activeTab];
  const headerMeta = activeMode === "command"
    ? {
        kicker: "Review desk",
        title: activeTabMeta.title,
        description: activeTabMeta.description
      }
    : ADMIN_MODE_META[activeMode];

  function openAdminTab(tab: AdminTab) {
    setActiveTab(tab);
    navigate(adminPathForTab(tab));
  }

  function openSellerInCommand(sellerId: string) {
    setSelectedSellerId(sellerId);
    openAdminTab("reports");
  }


  return (
    <main className="seller-report-shell">
      <section className="seller-report-header">
        <div>
          <span className="seller-report-kicker">{headerMeta.kicker}</span>
          <h2>{headerMeta.title}</h2>
          <p>{headerMeta.description}</p>
        </div>
        <button className="seller-report-refresh" type="button" onClick={refreshQueue} disabled={loading}>
          <RefreshCcw size={15} className={loading ? "spin-icon" : ""} />
          Refresh
        </button>
      </section>

      {error && <div className="notice error">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      {queue ? (
        <>
          {activeMode === "command" && (
            <>
              <nav className="seller-report-tabs" aria-label="Admin review sections">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={activeTab === tab.id ? "active" : ""}
                    onClick={() => openAdminTab(tab.id)}
                  >
                    <span className="seller-tab-main">
                      <span className="seller-tab-icon">{adminTabIcon(tab.id)}</span>
                      <span>{tab.label}</span>
                    </span>
                    <em>{tab.count}</em>
                  </button>
                ))}
              </nav>

              <AgentBriefingStrip queue={queue} onOpenSeller={openSellerInCommand} />

              {activeTab === "reports" && (
                <SellerReportsView
                  queue={queue}
                  selectedReport={selectedReport}
                  selectedSellerId={selectedSellerId}
                  sellerSearch={sellerSearch}
                  notes={notes}
                  busyAction={busyAction}
                  onSearchChange={setSellerSearch}
                  onSelectSeller={setSelectedSellerId}
                  onNoteChange={updateNote}
                  onRunAction={runAction}
                />
              )}

              {activeTab === "drafts" && (
                <DraftsView
                  queue={queue}
                  notes={notes}
                  busyAction={busyAction}
                  onNoteChange={updateNote}
                  onRunAction={runAction}
                />
              )}

              {activeTab === "uploads" && (
                <UploadsView
                  queue={queue}
                  notes={notes}
                  busyAction={busyAction}
                  onNoteChange={updateNote}
                  onRunAction={runAction}
                />
              )}

              {activeTab === "audit" && <AuditView events={queue.audit_events} />}
            </>
          )}

          {activeMode === "agent" && <AgentRoomView queue={queue} onOpenSeller={openSellerInCommand} />}
          {activeMode === "policy" && <PolicyBrainView queue={queue} />}
          {activeMode === "impact" && <ImpactView queue={queue} />}
        </>
      ) : (
        <EmptyPanel message="Loading seller reports..." />
      )}
    </main>
  );
}

function AgentBriefingStrip({
  queue,
  onOpenSeller
}: {
  queue: AdminReviewQueue;
  onOpenSeller: (sellerId: string) => void;
}) {
  const firstQueueItem = queue.automation_plan.first_queue_item_id
    ? queue.active_queue.find((item) => item.queue_item_id === queue.automation_plan.first_queue_item_id)
    : null;
  const nextStep = readableNextStep(
    queue.automation_plan.next_steps[0] ?? "Review the oldest active item first.",
    firstQueueItem
  );
  const nextTarget = firstQueueItem ? readableQueueTitle(firstQueueItem) : queue.automation_plan.headline;

  return (
    <section className="admin-agent-strip">
      <div className="admin-agent-orb">
        <Bot size={17} />
      </div>
      <div className="admin-agent-main">
        <span>Next up</span>
        <strong>{nextTarget}</strong>
        <p>{nextStep}</p>
      </div>
      <div className="admin-agent-stats" aria-label="Agent triage counts">
        <span><b>{queue.summary.active_count}</b> active</span>
        <span><b>{queue.summary.blocked_items}</b> blocked</span>
        <span><b>{queue.summary.breached_sla_count}</b> SLA</span>
      </div>
      <ProviderPill provider={queue.automation_plan.agent_provider} />
      {firstQueueItem && (
        <button className="admin-agent-action" type="button" onClick={() => onOpenSeller(firstQueueItem.seller_id)}>
          Open seller
        </button>
      )}
    </section>
  );
}

function readableQueueTitle(item: AdminReviewQueue["active_queue"][number]) {
  const sellerName = item.seller_name.trim();
  const rawTitle = item.title.trim();
  const duplicateTitle = `${sellerName} - ${sellerName}`.toLowerCase();
  const normalizedTitle = rawTitle.toLowerCase();
  if (!rawTitle || normalizedTitle === duplicateTitle || normalizedTitle === sellerName.toLowerCase()) {
    return sellerName;
  }
  if (normalizedTitle.startsWith(`${sellerName.toLowerCase()} - `)) {
    const remainder = rawTitle.slice(sellerName.length + 3).trim();
    return remainder && remainder.toLowerCase() !== sellerName.toLowerCase() ? `${sellerName} - ${remainder}` : sellerName;
  }
  return `${sellerName} - ${rawTitle}`;
}

function readableQueueSubtitle(item: AdminReviewQueue["active_queue"][number]) {
  const sellerName = item.seller_name.trim();
  const rawSubtitle = item.subtitle.trim();
  if (!rawSubtitle) return sellerName;

  const sellerLower = sellerName.toLowerCase();
  const normalizedSubtitle = rawSubtitle.toLowerCase();
  if (normalizedSubtitle === sellerLower) {
    return sellerName;
  }
  if (normalizedSubtitle.startsWith(`${sellerLower} | `)) {
    return rawSubtitle.slice(sellerName.length + 3).trim() || sellerName;
  }
  return rawSubtitle;
}

function readableNextStep(step: string, item: AdminReviewQueue["active_queue"][number] | null | undefined) {
  if (!item) return step;

  const sellerName = item.seller_name.trim();
  const normalizedStep = step.trim();
  if (!sellerName || !normalizedStep.toLowerCase().startsWith(`${sellerName.toLowerCase()}:`)) {
    return normalizedStep;
  }

  const withoutSellerPrefix = normalizedStep.slice(sellerName.length + 1).trim();
  return withoutSellerPrefix ? sentenceCase(withoutSellerPrefix) : normalizedStep;
}

function sentenceCase(value: string) {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : value;
}

function AgentRoomView({
  queue,
  onOpenSeller
}: {
  queue: AdminReviewQueue;
  onOpenSeller: (sellerId: string) => void;
}) {
  const prioritizedItems = queue.active_queue.slice(0, 7);
  const fastClearItems = queue.active_queue.filter(
    (item) => item.confidence === "high" && item.route_to === "standard_review" && item.risk_level !== "high" && !item.blocker
  );
  const seniorItems = queue.active_queue.filter((item) => item.route_to === "senior_reviewer" || item.risk_level === "high");
  const blockedItems = queue.active_queue.filter((item) => item.blocker || item.sla_state === "breached");
  const firstQueueItem = queue.automation_plan.first_queue_item_id
    ? queue.active_queue.find((item) => item.queue_item_id === queue.automation_plan.first_queue_item_id)
    : prioritizedItems[0];
  const providerKicker = queue.automation_plan.agent_provider === "gemini"
    ? "Gemini assisted triage"
    : queue.automation_plan.agent_provider === "fallback_after_llm_error"
      ? "LLM fallback triage"
      : "Rules fallback triage";

  return (
    <section className="admin-agent-room-view">
      <div className="admin-mode-hero">
        <div className="admin-mode-hero-icon">
          <Bot size={18} />
        </div>
        <div>
          <span>{providerKicker}</span>
          <h3>{queue.automation_plan.headline}</h3>
          <p>{queue.automation_plan.summary}</p>
        </div>
        <ProviderPill provider={queue.automation_plan.agent_provider} />
      </div>

      <div className="admin-agent-lanes">
        <AgentLane
          title="Can clear fast"
          count={fastClearItems.length}
          detail={`${queue.automation_plan.can_batch_count} can be batched after spot check`}
          tone="good"
        />
        <AgentLane
          title="Needs senior"
          count={seniorItems.length}
          detail="High-risk or low-confidence items stay human-led"
          tone="bad"
        />
        <AgentLane
          title="Blocked"
          count={blockedItems.length}
          detail="Missing proof, source issue, or SLA breach"
          tone="warn"
        />
      </div>

      {queue.automation_plan.caution && (
        <div className="admin-mode-alert">
          <AlertTriangle size={15} />
          <span>{queue.automation_plan.caution}</span>
        </div>
      )}

      <div className="admin-mode-split">
        <section className="admin-mode-panel">
          <div className="admin-mode-panel-head">
            <div>
              <h3>Priority queue</h3>
              <p>Open the seller packet only when a human decision is needed.</p>
            </div>
            <span>{queue.active_queue.length}</span>
          </div>

          {prioritizedItems.length ? (
            <div className="admin-priority-list">
              {prioritizedItems.map((item) => (
                <AgentQueueCard key={item.queue_item_id} item={item} onOpenSeller={onOpenSeller} />
              ))}
            </div>
          ) : (
            <EmptyPanel message="No active queue items need reviewer attention." compact />
          )}
        </section>

        <aside className="admin-mode-panel admin-plan-panel">
          <div className="admin-mode-panel-head">
            <div>
              <h3>Work plan</h3>
              <p>Short steps generated from the current queue.</p>
            </div>
          </div>
          <div className="admin-plan-list">
            {(queue.automation_plan.next_steps.length ? queue.automation_plan.next_steps : ["Review the oldest active item first."]).map(
              (step, index) => (
                <div className="admin-plan-step" key={`${step}-${index}`}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              )
            )}
          </div>
          {firstQueueItem && (
            <button className="admin-agent-action admin-plan-action" type="button" onClick={() => onOpenSeller(firstQueueItem.seller_id)}>
              Open recommended seller
            </button>
          )}
        </aside>
    </section>
  );
}

function AgentLane({
  title,
  count,
  detail,
  tone
}: {
  title: string;
  count: number;
  detail: string;
  tone: "good" | "warn" | "bad";
}) {
  return (
    <article className={`admin-agent-lane ${tone}`}>
      <span>{title}</span>
      <strong>{count}</strong>
      <p>{detail}</p>
      </div>
    </article>
  );
}

function AgentQueueCard({
  item,
  onOpenSeller
}: {
  item: AdminReviewQueue["active_queue"][number];
  onOpenSeller: (sellerId: string) => void;
}) {
  const title = readableQueueTitle(item);
  const subtitle = readableQueueSubtitle(item);
  return (
    <article className={`admin-priority-card ${item.sla_state}`}>
      <ItemTypeIcon itemType={item.item_type} />
      <div className="admin-priority-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
        <small>{item.primary_action}</small>
      <div className="admin-priority-meta">
        <RiskPill level={item.risk_level} score={item.risk_score} />
        <SlaPill value={item.sla_state} ageHours={item.age_hours} />
        <ProviderPill provider={item.agent_provider} />
      </div>
      <button className="seller-upload-review-button" type="button" onClick={() => onOpenSeller(item.seller_id)}>
        Open
      </button>
    </article>
  );
}
      </div>

function PolicyBrainView({ queue }: { queue: AdminReviewQueue }) {
  const prescreens = collectPrescreens(queue);
  const checkCounts = countPrescreenChecks(prescreens);
  const staleSources = queue.source_health.sources.filter((source) => source.effective_status !== "operational" || !source.fresh);
  const geminiChecks = prescreens.filter((prescreen) => prescreen.agent_provider === "gemini").length;
  const seniorRouted = queue.active_queue.filter((item) => item.route_to === "senior_reviewer").length;
  const blockedDrafts = queue.listing_drafts.filter(
    (draft) => draft.status === "submitted" && draft.verification_status !== "verified"
  ).length;
  const unresolvedProofRequests = queue.proof_assets.filter((proof) => proof.open_request_count > 0 && proof.status === "submitted").length;
  const policyGates = [
    {
      label: "Seller KYC before publish",
      status: blockedDrafts ? "warn" : "pass",
      detail: blockedDrafts
        ? `${blockedDrafts} submitted draft${blockedDrafts === 1 ? "" : "s"} blocked until seller verification clears`
        : "Submitted drafts are not bypassing seller verification"
    },
    {
      label: "Proof must answer buyer request",
      status: unresolvedProofRequests ? "warn" : "pass",
      detail: unresolvedProofRequests
        ? `${unresolvedProofRequests} proof upload${unresolvedProofRequests === 1 ? "" : "s"} still need request matching`
        : "Open proof requests are matched before approval"
    },
    {
      label: "High risk stays human-led",
      status: seniorRouted ? "warn" : "pass",
      detail: seniorRouted
        ? `${seniorRouted} item${seniorRouted === 1 ? "" : "s"} routed to a senior reviewer`
        : "No high-risk item is waiting for senior review"
    },
    {
      label: "Source freshness",
      status: queue.source_health.blocking ? "fail" : staleSources.length ? "warn" : "pass",
      detail: staleSources.length
        ? `${staleSources.length} source${staleSources.length === 1 ? "" : "s"} need attention`
        : "Connected sources are fresh enough for review"
    }
  ] as const;

  return (
    <section className="admin-policy-view">
      <div className="admin-policy-metrics">
        <PolicyMetric label="Source health" value={labelize(queue.source_health.overall_status)} tone={queue.source_health.blocking ? "bad" : staleSources.length ? "warn" : "good"} />
        <PolicyMetric label="Checks passed" value={String(checkCounts.pass)} tone="good" />
        <PolicyMetric label="Warnings" value={String(checkCounts.warn)} tone={checkCounts.warn ? "warn" : "good"} />
        <PolicyMetric label="Failures" value={String(checkCounts.fail)} tone={checkCounts.fail ? "bad" : "good"} />
        <PolicyMetric label="Gemini prescreens" value={String(geminiChecks)} tone={geminiChecks ? "good" : "warn"} />
      </div>

      <div className="admin-mode-split">
        <section className="admin-mode-panel">
          <div className="admin-mode-panel-head">
            <div>
              <h3>Human-in-loop gates</h3>
              <p>These rules decide what can be fast-cleared and what must stay manual.</p>
            </div>
          </div>
          <div className="admin-policy-gate-list">
            {policyGates.map((gate) => (
              <PolicyGateRow key={gate.label} gate={gate} />
            ))}
          </div>
        </section>

        <section className="admin-mode-panel">
          <div className="admin-mode-panel-head">
            <div>
              <h3>Source freshness</h3>
              <p>Reviewer automation is only trusted when sources are usable.</p>
            </div>
            <span>{queue.source_health.sources.length}</span>
          </div>
          <div className="admin-source-list">
            {queue.source_health.sources.map((source) => (
              <article className={`admin-source-row ${source.effective_status}`} key={source.source_id}>
                <div>
                  <strong>{source.display_name}</strong>
                  <span>{source.owner_system} | SLA {source.freshness_sla_hours}h</span>
                </div>
                <StatusPill value={source.effective_status} />
                <small>{formatDate(source.last_synced_at)}</small>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function PolicyMetric({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad";
}) {
  return (
    <article className={`admin-policy-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function PolicyGateRow({
  gate
}: {
  gate: { label: string; status: "pass" | "warn" | "fail"; detail: string };
}) {
  return (
    <article className={`admin-policy-gate-row ${gate.status}`}>
      {gate.status === "pass" ? <CheckCircle2 size={16} /> : gate.status === "warn" ? <AlertTriangle size={16} /> : <XCircle size={16} />}
      <div>
        <strong>{gate.label}</strong>
        <span>{gate.detail}</span>
      </div>
    </article>
  );
}

function ImpactView({ queue }: { queue: AdminReviewQueue }) {
  const prescreens = collectPrescreens(queue);
  const checkCounts = countPrescreenChecks(prescreens);
  const totalChecks = checkCounts.pass + checkCounts.warn + checkCounts.fail;
  const highConfidence = queue.active_queue.filter((item) => item.confidence === "high" && item.route_to === "standard_review").length;
  const reviewMix = [
    { label: "Applications", value: queue.summary.pending_applications },
    { label: "Documents", value: queue.summary.document_checks },
    { label: "Drafts", value: queue.summary.submitted_drafts },
    { label: "Proof", value: queue.summary.proof_reviews }
  ];
  const largestMixValue = Math.max(...reviewMix.map((item) => item.value), 1);

  return (
    <section className="admin-impact-view">
      <div className="admin-impact-grid">
        <ImpactMetric label="Checks pre-read" value={totalChecks} detail="Validation rows the reviewer no longer scans first" />
        <ImpactMetric label="Suggested actions" value={queue.summary.suggested_actions} detail="Approve, reject, publish, or revise suggestions" />
        <ImpactMetric label="Fast decisions" value={highConfidence} detail="High-confidence standard-review items" />
        <ImpactMetric label="Trust lift waiting" value={queue.summary.trust_lift_pending} detail="Potential seller score points after review" />
      </div>

      <div className="admin-mode-split">
        <section className="admin-mode-panel">
          <div className="admin-mode-panel-head">
            <div>
              <h3>Where effort goes</h3>
              <p>Current queue split, so reviewers know which skill set is needed today.</p>
            </div>
          </div>
          <div className="admin-impact-bars">
            {reviewMix.map((item) => (
              <div className="admin-impact-bar-row" key={item.label}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.value}</span>
                </div>
                <em style={{ width: `${Math.max(8, Math.round((item.value / largestMixValue) * 100))}%` }} />
              </div>
            ))}
          </div>
        </section>

        <section className="admin-mode-panel">
          <div className="admin-mode-panel-head">
            <div>
              <h3>Automation guardrails</h3>
              <p>Numbers that keep the assistant useful without hiding risk.</p>
            </div>
          </div>
          <div className="admin-impact-guardrails">
            <DetailTile label="Senior routed" value={queue.summary.senior_routed} />
            <DetailTile label="Blocked items" value={queue.summary.blocked_items} />
            <DetailTile label="SLA breaches" value={queue.summary.breached_sla_count} />
            <DetailTile label="Buyer proof waits" value={queue.summary.buyer_requests_waiting} />
          </div>
        </section>
      </div>
    </section>
  );
}

function ImpactMetric({
  label,
  value,
  detail
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="admin-impact-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function SellerReportsView({
  queue,
  selectedReport,
  selectedSellerId,
  sellerSearch,
  notes,
  busyAction,
  onSearchChange,
  onSelectSeller,
  onNoteChange,
  onRunAction
}: {
  queue: AdminReviewQueue;
  selectedReport: SellerReport | null;
  selectedSellerId: string | null;
  sellerSearch: string;
  notes: NotesById;
  busyAction: string | null;
  onSearchChange: (value: string) => void;
  onSelectSeller: (sellerId: string) => void;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
}) {
  const [lane, setLane] = useState<SellerLaneId>("needs_decision");
  const lanes = useMemo(() => buildSellerLanes(queue), [queue]);
  const visibleLanes = useMemo(() => lanes.filter((item) => item.count > 0 || item.id === lane), [lane, lanes]);
  const clearedSellerCount = queue.seller_dossiers.filter((seller) => sellerMatchesLane(queue, seller, "clear")).length;
  const filteredSellers = useMemo(() => {
    const query = sellerSearch.trim().toLowerCase();
    return queue.seller_dossiers.filter((seller) => {
      if (!sellerMatchesLane(queue, seller, lane)) return false;
      if (!query) return true;
      const application = queue.seller_applications.find((item) => item.seller_id === seller.seller_id);
      return [
        seller.seller_name,
        seller.seller_id,
        seller.verification_status,
        seller.next_action,
        application?.business_name,
        application?.gst_number
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [lane, queue, sellerSearch]);

  useEffect(() => {
    if (!filteredSellers.length) return;
    if (!selectedSellerId || !filteredSellers.some((seller) => seller.seller_id === selectedSellerId)) {
      onSelectSeller(filteredSellers[0].seller_id);
    }
  }, [filteredSellers, onSelectSeller, selectedSellerId]);

  return (
    <section className="seller-report-layout">
      <aside className="seller-report-list-panel">
        <div className="seller-report-panel-head">
          <div>
            <h3>Sellers needing action</h3>
            <p>Completed sellers stay out of this queue.</p>
          </div>
          <span>{filteredSellers.length}</span>
        </div>

        <div className="seller-lane-list" aria-label="Seller lanes">
          {visibleLanes.map((item) => (
            <button
              key={item.id}
              type="button"
              className={lane === item.id ? "active" : ""}
              onClick={() => setLane(item.id)}
            >
              <span>{item.label}</span>
              <em>{item.count}</em>
            </button>
          ))}
        </div>

        <label className="seller-report-search" aria-label="Search seller reports">
          <Search size={15} />
          <input
            value={sellerSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search seller, GST, status"
          />
        </label>

        {clearedSellerCount > 0 && (
          <p className="seller-cleared-note">
            {clearedSellerCount} cleared seller{clearedSellerCount === 1 ? "" : "s"} moved to history.
          </p>
        )}

        <div className="seller-report-list">
          {filteredSellers.length ? (
            filteredSellers.map((seller) => (
              <SellerReportButton
                key={seller.seller_id}
                seller={seller}
                laneLabel={sellerLaneLabel(queue, seller)}
                selected={seller.seller_id === selectedSellerId}
                onSelect={() => onSelectSeller(seller.seller_id)}
              />
            ))
          ) : (
            <EmptyPanel message="No seller report matches this search." compact />
          )}
        </div>
      </aside>

      <section className="seller-report-detail-panel">
        {selectedReport ? (
          <SellerReportDetail
            report={selectedReport}
            notes={notes}
            busyAction={busyAction}
            onNoteChange={onNoteChange}
            onRunAction={onRunAction}
          />
        ) : (
          <EmptyPanel message="Select a seller report to review submissions." />
        )}
      </section>
    </section>
  );
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  return `${Math.round(value / 1024)} KB`;
}
