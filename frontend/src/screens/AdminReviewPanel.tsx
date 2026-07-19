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

function SellerReportDetail({
  report,
  notes,
  busyAction,
  onNoteChange,
  onRunAction
}: {
  report: SellerReport;
  notes: NotesById;
  busyAction: string | null;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
}) {
  const seller = report.seller;

  return (
    <div className="seller-report-detail-stack">
      <section className="seller-selected-summary-card">
        <div>
          <span>Current seller</span>
          <h3>{seller.seller_name}</h3>
          <p>
            {seller.pending_documents.length
              ? "Seller approval is blocked until required documents are reviewed."
              : seller.open_review_items > 0
                ? seller.next_action
                : "No action needed."}
          </p>
          <div className="seller-selected-summary-counts">
            <span>{seller.open_review_items} open</span>
            {seller.pending_documents.length > 0 && <span>{seller.pending_documents.length} doc blocker{seller.pending_documents.length === 1 ? "" : "s"}</span>}
            {seller.submitted_draft_count > 0 && <span>{seller.submitted_draft_count} draft{seller.submitted_draft_count === 1 ? "" : "s"}</span>}
            {seller.submitted_proof_count > 0 && <span>{seller.submitted_proof_count} proof{seller.submitted_proof_count === 1 ? "" : "s"}</span>}
          </div>
        </div>
        <div className="seller-selected-summary-meta">
          <StatusPill value={seller.verification_status} />
          <RiskPill level={riskLevelFromScore(seller.highest_risk_score)} score={seller.highest_risk_score} />
        </div>
      </section>

      <SellerPacketReview
        report={report}
        notes={notes}
        busyAction={busyAction}
        onNoteChange={onNoteChange}
        onRunAction={onRunAction}
      />

    </div>
  );
}

function SellerPacketReview({
  report,
  notes,
  busyAction,
  onNoteChange,
  onRunAction
}: {
  report: SellerReport;
  notes: NotesById;
  busyAction: string | null;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
}) {
  const packetItems = useMemo(() => buildSellerPacketItems(report), [report]);
  const actionItems = useMemo(() => packetItems.filter((item) => item.readyForReview), [packetItems]);
  const historyItems = useMemo(() => packetItems.filter((item) => !item.readyForReview), [packetItems]);
  const [selectedPacketId, setSelectedPacketId] = useState<string | null>(null);

  useEffect(() => {
    if (!packetItems.length) {
      if (selectedPacketId) setSelectedPacketId(null);
      return;
    }
    const selectedExists = Boolean(selectedPacketId && packetItems.some((item) => item.id === selectedPacketId));
    const selectedNeedsAction = Boolean(selectedPacketId && actionItems.some((item) => item.id === selectedPacketId));
    if (selectedExists && (selectedNeedsAction || actionItems.length === 0)) {
      return;
    }
    setSelectedPacketId(actionItems[0]?.id ?? null);
  }, [actionItems, packetItems, selectedPacketId]);

  const selectedItem = packetItems.find((item) => item.id === selectedPacketId) ?? null;
  const actionGroups = buildPacketGroups(actionItems);
  const historyGroups = buildPacketGroups(historyItems);

  return (
    <section className="seller-packet-layout">
      <div className="seller-packet-list-panel">
        <div className="seller-packet-head">
          <div>
            <h3>Needs decision</h3>
            <p>{actionItems.length ? `${actionItems.length} item${actionItems.length === 1 ? "" : "s"} waiting. Start at the top.` : "Nothing needs reviewer action."}</p>
          </div>
          <span>{actionItems.length}</span>
        </div>

        {actionGroups.length ? (
          <SellerPacketGroups groups={actionGroups} selectedPacketId={selectedPacketId} onSelect={setSelectedPacketId} />
        ) : (
          <div className="seller-packet-clear-state">
            <CheckCircle2 size={18} />
            <div>
              <strong>No action needed</strong>
              <span>Completed uploads and documents are kept in history.</span>
            </div>
          </div>
        )}

        {historyItems.length > 0 && (
          <details className="seller-packet-history">
            <summary>
              <span>History</span>
              <em>{historyItems.length}</em>
            </summary>
            <SellerPacketGroups groups={historyGroups} selectedPacketId={selectedPacketId} onSelect={setSelectedPacketId} />
          </details>
        )}
      </div>

      {selectedItem && (
        <aside className="seller-packet-review-panel">
          <SellerPacketSelectedItem
            report={report}
            item={selectedItem}
            notes={notes}
            busyAction={busyAction}
            onNoteChange={onNoteChange}
            onRunAction={onRunAction}
          />
        </aside>
      )}
    </section>
  );
}

function SellerPacketGroups({
  groups,
  selectedPacketId,
  onSelect
}: {
  groups: Array<{ group: string; items: SellerPacketItem[] }>;
  selectedPacketId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="seller-packet-groups">
      {groups.map((group) => (
        <div className="seller-packet-group" key={group.group}>
          <div className="seller-packet-group-title">
            <strong>{group.group}</strong>
            <span>{group.items.length}</span>
          </div>
          <div className="seller-packet-row-list">
            {group.items.map((item) => (
              <SellerPacketRow
                key={item.id}
                item={item}
                selected={selectedPacketId === item.id}
                onSelect={() => onSelect(item.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
function SellerPacketRow({
  item,
  selected,
  onSelect
}: {
  item: SellerPacketItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const checks = uploadCheckSummary(item.prescreen);
  return (
    <button className={`seller-packet-row ${selected ? "selected" : ""} ${item.readyForReview ? "" : "history"}`} type="button" onClick={onSelect}>
      <ItemTypeIcon itemType={packetKindToItemType(item.kind)} />
      <div>
        <strong>{item.title}</strong>
        <span>{item.subtitle}</span>
      </div>
      <div className="seller-packet-row-meta">
        <StatusPill value={item.status} />
        {item.readyForReview && <span className={`seller-upload-check ${checks.tone}`}>{checks.label}</span>}
      </div>
    </button>
  );
}

function SellerPacketSelectedItem({
  report,
  item,
  notes,
  busyAction,
  onNoteChange,
  onRunAction
}: {
  report: SellerReport;
  item: SellerPacketItem;
  notes: NotesById;
  busyAction: string | null;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
}) {
  return (
    <div className="seller-packet-selected-stack">
      <div className="seller-packet-selected-head">
        <div>
          <span>{item.group}</span>
          <h3>{item.title}</h3>
          <p>{item.readyForReview ? "Review the brief, confirm the evidence, then take the final action." : "No action needed right now."}</p>
        </div>
        <StatusPill value={item.status} />
      </div>

      <DecisionBrief prescreen={item.prescreen} readyForReview={item.readyForReview} />

      {item.kind === "application" && (
        <SellerApplicationCard
          application={item.item}
          seller={report.seller}
          note={notes[item.item.application_id] ?? ""}
          busyAction={busyAction}
          onNoteChange={(value) => onNoteChange(item.item.application_id, value)}
          onUseSuggestedNote={() => onNoteChange(item.item.application_id, suggestedAuditNote(item.item.prescreen, "Seller application reviewed."))}
          onApprove={() =>
            onRunAction(
              `approve-app-${item.item.application_id}`,
              () =>
                approveSellerApplication(
                  item.item.application_id,
                  notes[item.item.application_id]?.trim() || suggestedAuditNote(item.item.prescreen, "Seller identity reviewed and approved.")
                ),
              "Seller application approved.",
              item.item.application_id
            )
          }
          onReject={() =>
            onRunAction(
              `reject-app-${item.item.application_id}`,
              () => rejectSellerApplication(item.item.application_id, notes[item.item.application_id].trim()),
              "Seller application rejected with audit note.",
              item.item.application_id
            )
          }
        />
      )}

      {item.kind === "document" && (
        <DocumentReviewCard
          document={item.item}
          note={notes[item.item.document_id] ?? ""}
          busyAction={busyAction}
          onNoteChange={(value) => onNoteChange(item.item.document_id, value)}
          onUseSuggestedNote={() => onNoteChange(item.item.document_id, suggestedAuditNote(item.item.prescreen, "Document reviewed."))}
          onApprove={() =>
            onRunAction(
              `approve-doc-${item.item.document_id}`,
              () =>
                approveSellerDocument(
                  item.item.document_id,
                  notes[item.item.document_id]?.trim() || suggestedAuditNote(item.item.prescreen, "Document metadata and reference reviewed.")
                ),
              "Verification document approved.",
              item.item.document_id
            )
          }
          onReject={() =>
            onRunAction(
              `reject-doc-${item.item.document_id}`,
              () => rejectSellerDocument(item.item.document_id, notes[item.item.document_id].trim()),
              "Verification document rejected with seller note.",
              item.item.document_id
            )
          }
        />
      )}

      {item.kind === "draft" && (
        <ListingDraftCard
          draft={item.item}
          note={notes[item.item.draft_id] ?? ""}
          busyAction={busyAction}
          onNoteChange={(value) => onNoteChange(item.item.draft_id, value)}
          onUseSuggestedNote={() => onNoteChange(item.item.draft_id, suggestedAuditNote(item.item.prescreen, "Listing draft reviewed."))}
          onPublish={() =>
            onRunAction(
              `publish-draft-${item.item.draft_id}`,
              () =>
                approveListingDraft(
                  item.item.draft_id,
                  notes[item.item.draft_id]?.trim() || suggestedAuditNote(item.item.prescreen, "Catalog draft reviewed and published.")
                ),
              "Listing published to the buyer feed.",
              item.item.draft_id
            )
          }
          onRevision={() =>
            onRunAction(
              `revision-draft-${item.item.draft_id}`,
              () => requestListingRevision(item.item.draft_id, notes[item.item.draft_id].trim()),
              "Listing sent back for seller revision.",
              item.item.draft_id
            )
          }
        />
      )}

      {item.kind === "proof" && (
        <ProofAssetCard
          proof={item.item}
          note={notes[item.item.proof_id] ?? ""}
          busyAction={busyAction}
          onNoteChange={(value) => onNoteChange(item.item.proof_id, value)}
          onUseSuggestedNote={() => onNoteChange(item.item.proof_id, suggestedAuditNote(item.item.prescreen, "Proof upload reviewed."))}
          onApprove={() =>
            onRunAction(
              `approve-proof-${item.item.proof_id}`,
              () =>
                approveSellerEvidenceAsset(
                  item.item.proof_id,
                  notes[item.item.proof_id]?.trim() || suggestedAuditNote(item.item.prescreen, "Proof reviewed and approved.")
                ),
              "Seller proof approved.",
              item.item.proof_id
            )
          }
          onReject={() =>
            onRunAction(
              `reject-proof-${item.item.proof_id}`,
              () => rejectSellerEvidenceAsset(item.item.proof_id, notes[item.item.proof_id].trim()),
              "Seller proof rejected with seller note.",
              item.item.proof_id
            )
          }
        />
      )}
    </div>
  );
}

function DraftsView({
  queue,
  notes,
  busyAction,
  onNoteChange,
  onRunAction
}: {
  queue: AdminReviewQueue;
  notes: NotesById;
  busyAction: string | null;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
}) {
  const drafts = sortByReviewState(queue.listing_drafts);
  const firstReviewDraftId = drafts.find((draft) => draft.status === "submitted")?.draft_id ?? null;
  return (
    <section className="seller-single-column">
      <ReportSection
        icon={<Store size={17} />}
        title="Product drafts"
        subtitle="Open only the draft you want to inspect."
        count={drafts.length}
      >
        {drafts.length ? (
          drafts.map((draft) => (
            <DraftAccordionItem
              key={draft.draft_id}
              draft={draft}
              defaultOpen={draft.draft_id === firstReviewDraftId}
              note={notes[draft.draft_id] ?? ""}
              busyAction={busyAction}
              onNoteChange={(value) => onNoteChange(draft.draft_id, value)}
              onUseSuggestedNote={() => onNoteChange(draft.draft_id, suggestedAuditNote(draft.prescreen, "Listing draft reviewed."))}
              onPublish={() =>
                onRunAction(
                  `publish-draft-${draft.draft_id}`,
                  () =>
                    approveListingDraft(
                      draft.draft_id,
                      notes[draft.draft_id]?.trim() || suggestedAuditNote(draft.prescreen, "Catalog draft reviewed and published.")
                    ),
                  "Listing published to the buyer feed.",
                  draft.draft_id
                )
              }
              onRevision={() =>
                onRunAction(
                  `revision-draft-${draft.draft_id}`,
                  () => requestListingRevision(draft.draft_id, notes[draft.draft_id].trim()),
                  "Listing sent back for seller revision.",
                  draft.draft_id
                )
              }
            />
          ))
        ) : (
          <EmptyPanel message="No product drafts found." compact />
        )}
      </ReportSection>
    </section>
  );
}

function DraftAccordionItem({
  draft,
  defaultOpen,
  note,
  busyAction,
  onNoteChange,
  onUseSuggestedNote,
  onPublish,
  onRevision
}: {
  draft: ListingDraftReview;
  defaultOpen: boolean;
  note: string;
  busyAction: string | null;
  onNoteChange: (value: string) => void;
  onUseSuggestedNote: () => void;
  onPublish: () => void;
  onRevision: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const checks = uploadCheckSummary(draft.prescreen);
  const submitted = draft.status === "submitted";
  const sellerVerified = draft.verification_status === "verified";
  const draftSignal = draftReviewSignal(draft, checks.label);

  return (
    <article className={`seller-draft-accordion ${open ? "open" : ""}`}>
      <button
        className="seller-draft-accordion-toggle"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <ChevronDown size={17} className="seller-foldout-chevron" />
        <div className="seller-draft-thumb">
          {isRenderableImage(draft.image_url) ? (
            <img src={draft.image_url} alt="" />
          ) : (
            <Store size={17} />
          )}
        </div>
        <div className="seller-draft-row-copy">
          <strong>{draft.title}</strong>
          <span>{draft.seller_name} | {labelize(draft.category)} | {formatPrice(draft.base_price)}</span>
          <small>{draftSignal}</small>
        </div>
        <div className="seller-draft-row-meta">
          <StatusPill value={draft.status} />
          {submitted && !sellerVerified ? (
            <span className="seller-upload-check warn">Seller blocked</span>
          ) : (
            <span className={`seller-upload-check ${checks.tone}`}>{checks.label}</span>
          )}
        </div>
      </button>

      {open && (
        <div className="seller-draft-accordion-body">
          <ListingDraftCard
            draft={draft}
            note={note}
            busyAction={busyAction}
            onNoteChange={onNoteChange}
            onUseSuggestedNote={onUseSuggestedNote}
            onPublish={onPublish}
            onRevision={onRevision}
            hideHeader
          />
        </div>
      )}
    </article>
  );
}

function UploadsView({
  queue,
  notes,
  busyAction,
  onNoteChange,
  onRunAction
}: {
  queue: AdminReviewQueue;
  notes: NotesById;
  busyAction: string | null;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UploadFilter>("needs_review");
  const [selectedUploadId, setSelectedUploadId] = useState<string | null>(null);
  const uploadRows = useMemo(() => buildUploadRows(queue), [queue]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return uploadRows.filter((row) => {
      const matchesFilter =
        filter === "all" ||
        (filter === "needs_review" && row.readyForReview) ||
        (filter === "documents" && row.kind === "document") ||
        (filter === "proofs" && row.kind === "proof");
      if (!matchesFilter) return false;
      return !normalizedQuery || row.searchText.includes(normalizedQuery);
    });
  }, [filter, query, uploadRows]);

  useEffect(() => {
    if (selectedUploadId && !filteredRows.some((row) => row.id === selectedUploadId)) {
      setSelectedUploadId(null);
    }
  }, [filteredRows, selectedUploadId]);

  const selectedRow = filteredRows.find((row) => row.id === selectedUploadId) ?? null;
  const filters: Array<{ id: UploadFilter; label: string; count: number }> = [
    { id: "needs_review", label: "Needs review", count: uploadRows.filter((row) => row.readyForReview).length },
    { id: "documents", label: "Documents", count: uploadRows.filter((row) => row.kind === "document").length },
    { id: "proofs", label: "Proof", count: uploadRows.filter((row) => row.kind === "proof").length },
    { id: "all", label: "All", count: uploadRows.length }
  ];

  return (
    <section className={`seller-uploads-layout ${selectedRow ? "has-selection" : ""}`}>
      <section className="seller-uploads-table-panel">
        <div className="seller-uploads-head">
          <div>
            <h3>Uploads queue</h3>
            <p>Documents and seller proof uploads in one review list.</p>
          </div>
          <span>{filteredRows.length}</span>
        </div>

        <div className="seller-uploads-controls">
          <label className="seller-report-search" aria-label="Search uploads">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search seller, document, product"
            />
          </label>
          <div className="seller-upload-filters" aria-label="Upload filters">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                className={filter === item.id ? "active" : ""}
                onClick={() => setFilter(item.id)}
              >
                <span>{item.label}</span>
                <em>{item.count}</em>
              </button>
            ))}
          </div>
        </div>

        {filteredRows.length ? (
          <div className="seller-upload-table-wrap">
            <table className="seller-upload-table">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Upload</th>
                  <th>Status</th>
                  <th>Checks</th>
                  <th>Submitted</th>
                  <th>Open</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const checks = uploadCheckSummary(row.prescreen);
                  return (
                    <tr key={row.id} className={selectedUploadId === row.id ? "selected" : ""}>
                      <td>
                        <strong>{row.sellerName}</strong>
                        <span>{row.kind === "document" ? "Verification doc" : "Seller proof"}</span>
                      </td>
                      <td>
                        <strong>{row.title}</strong>
                        <span>{row.subtitle}</span>
                      </td>
                      <td>
                        <StatusPill value={row.status} />
                      </td>
                      <td>
                        <span className={`seller-upload-check ${checks.tone}`}>{checks.label}</span>
                      </td>
                      <td>
                        <span>{formatDate(row.submittedAt)}</span>
                      </td>
                      <td>
                        <button
                          className="seller-upload-review-button"
                          type="button"
                          onClick={() => setSelectedUploadId(row.id)}
                        >
                          Review
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPanel message="No uploads match this view." compact />
        )}
      </section>

      {selectedRow && (
        <aside className="seller-upload-review-panel">
          <UploadReviewPanel
            row={selectedRow}
            notes={notes}
            busyAction={busyAction}
            onNoteChange={onNoteChange}
            onRunAction={onRunAction}
          />
        </aside>
      )}
    </section>
  );
}

function UploadReviewPanel({
  row,
  notes,
  busyAction,
  onNoteChange,
  onRunAction
}: {
  row: UploadQueueRow;
  notes: NotesById;
  busyAction: string | null;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
}) {
  return (
    <div className="seller-upload-review-stack">
      <div className="seller-upload-review-head">
        <div>
          <span>Selected upload</span>
          <h3>{row.title}</h3>
          <p>{row.subtitle}</p>
        </div>
        <StatusPill value={row.status} />
      </div>

      {row.kind === "document" ? (
        <DocumentReviewCard
          document={row.item}
          note={notes[row.item.document_id] ?? ""}
          busyAction={busyAction}
          onNoteChange={(value) => onNoteChange(row.item.document_id, value)}
          onUseSuggestedNote={() => onNoteChange(row.item.document_id, suggestedAuditNote(row.item.prescreen, "Document reviewed."))}
          onApprove={() =>
            onRunAction(
              `approve-doc-${row.item.document_id}`,
              () =>
                approveSellerDocument(
                  row.item.document_id,
                  notes[row.item.document_id]?.trim() || suggestedAuditNote(row.item.prescreen, "Document metadata and reference reviewed.")
                ),
              "Verification document approved.",
              row.item.document_id
            )
          }
          onReject={() =>
            onRunAction(
              `reject-doc-${row.item.document_id}`,
              () => rejectSellerDocument(row.item.document_id, notes[row.item.document_id].trim()),
              "Verification document rejected with seller note.",
              row.item.document_id
            )
          }
        />
      ) : (
        <ProofAssetCard
          proof={row.item}
          note={notes[row.item.proof_id] ?? ""}
          busyAction={busyAction}
          onNoteChange={(value) => onNoteChange(row.item.proof_id, value)}
          onUseSuggestedNote={() => onNoteChange(row.item.proof_id, suggestedAuditNote(row.item.prescreen, "Proof upload reviewed."))}
          onApprove={() =>
            onRunAction(
              `approve-proof-${row.item.proof_id}`,
              () =>
                approveSellerEvidenceAsset(
                  row.item.proof_id,
                  notes[row.item.proof_id]?.trim() || suggestedAuditNote(row.item.prescreen, "Proof reviewed and approved.")
                ),
              "Seller proof approved.",
              row.item.proof_id
            )
          }
          onReject={() =>
            onRunAction(
              `reject-proof-${row.item.proof_id}`,
              () => rejectSellerEvidenceAsset(row.item.proof_id, notes[row.item.proof_id].trim()),
              "Seller proof rejected with seller note.",
              row.item.proof_id
            )
          }
        />
      )}
    </div>
  );
}

function AuditView({ events }: { events: AdminAuditEvent[] }) {
  return (
    <section className="seller-single-column">
      <ReportSection
        icon={<ClipboardCheck size={17} />}
        title="Audit trail"
        subtitle="Reviewer decisions written after seller, document, draft, and proof actions."
        count={events.length}
      >
        {events.length ? (
          <div className="seller-audit-list">
            {events.map((event) => (
              <AuditRow key={event.event_id} event={event} />
            ))}
          </div>
        ) : (
          <EmptyPanel message="No reviewer decisions have been recorded yet." compact />
        )}
      </ReportSection>
    </section>
  );
}

function SellerApplicationCard({
  application,
  seller,
  note,
  busyAction,
  onNoteChange,
  onUseSuggestedNote,
  onApprove,
  onReject
}: {
  application: SellerApplicationReview;
  seller: AdminSellerDossier;
  note: string;
  busyAction: string | null;
  onNoteChange: (value: string) => void;
  onUseSuggestedNote: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = application.status === "pending_review";
  const missingDocuments = seller.pending_documents.map(labelize);
  const canApprove = pending && missingDocuments.length === 0;
  const canReject = pending && note.trim().length >= MIN_REJECT_NOTE_LENGTH;
  const approveActionKey = `approve-app-${application.application_id}`;
  const rejectActionKey = `reject-app-${application.application_id}`;

  return (
    <article className="seller-review-card">
      <CardHeader
        icon={<ShieldCheck size={16} />}
        eyebrow="Seller application"
        title={application.business_name}
        subtitle={`${application.seller_name} | ${application.application_id}`}
        status={application.status}
        prescreen={application.prescreen}
      />

      {missingDocuments.length > 0 && (
        <BlockerNotice text={`Approve required documents first: ${missingDocuments.join(", ")}.`} />
      )}

      <ReviewFoldout title="Seller details" subtitle={`${application.gst_number} | ${application.pickup_pincode}`} resetKey={application.application_id}>
        <DetailGrid>
          <DetailTile label="GST number" value={application.gst_number} />
          <DetailTile label="Pickup pincode" value={application.pickup_pincode} />
          <DetailTile label="Support contact" value={application.support_contact} />
          <DetailTile label="Verification" value={labelize(application.verification_status ?? "not started")} />
          <DetailTile label="Created" value={formatDate(application.created_at)} />
        </DetailGrid>
      </ReviewFoldout>

      <PrescreenBox prescreen={application.prescreen} />

      <NoteEditor note={note} onNoteChange={onNoteChange} onUseSuggestedNote={onUseSuggestedNote} />

      <ActionRow>
        <button className="seller-primary-action" type="button" disabled={!canApprove || busyAction === approveActionKey} onClick={onApprove}>
          <CheckCircle2 size={14} />
          Approve seller
        </button>
        <button className="seller-danger-action" type="button" disabled={!canReject || busyAction === rejectActionKey} onClick={onReject}>
          <XCircle size={14} />
          Reject seller
        </button>
      </ActionRow>

      {!pending && <ActionHint text={`No seller action is available because status is ${labelize(application.status)}.`} />}
      {pending && !canApprove && <ActionHint text="Seller approval unlocks only after all required documents are approved." />}
      {pending && note.trim().length < MIN_REJECT_NOTE_LENGTH && <ActionHint text="Rejection needs a short seller-facing note." />}
    </article>
  );
}

function DocumentReviewCard({
  document,
  note,
  busyAction,
  onNoteChange,
  onUseSuggestedNote,
  onApprove,
  onReject
}: {
  document: VerificationDocumentReview;
  note: string;
  busyAction: string | null;
  onNoteChange: (value: string) => void;
  onUseSuggestedNote: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const canReview = document.status === "submitted" || document.status === "under_review";
  const canReject = canReview && note.trim().length >= MIN_REJECT_NOTE_LENGTH;
  const approveActionKey = `approve-doc-${document.document_id}`;
  const rejectActionKey = `reject-doc-${document.document_id}`;

  return (
    <article className="seller-review-card">
      <CardHeader
        icon={<FileCheck2 size={16} />}
        eyebrow="Verification document"
        title={labelize(document.document_type)}
        subtitle={`${document.seller_name} | ${document.file_name}`}
        status={document.status}
        prescreen={document.prescreen}
      />

      <ReviewFoldout title="File details" subtitle={document.file_name} resetKey={document.document_id}>
        <DetailGrid>
          <DetailTile label="Reference" value={document.reference} />
          <DetailTile label="File" value={document.file_name} />
          <DetailTile label="Size" value={formatBytes(document.file_size_bytes)} />
          <DetailTile label="Hash" value={document.sha256 ? document.sha256.slice(0, 16) : "Missing"} />
          <DetailTile label="Storage" value={document.storage_uri} />
          <DetailTile label="Submitted" value={formatDate(document.submitted_at)} />
        </DetailGrid>
      </ReviewFoldout>

      <PrescreenBox prescreen={document.prescreen} />

      <NoteEditor note={note} onNoteChange={onNoteChange} onUseSuggestedNote={onUseSuggestedNote} />

      <ActionRow>
        <button className="seller-primary-action" type="button" disabled={!canReview || busyAction === approveActionKey} onClick={onApprove}>
          <CheckCircle2 size={14} />
          Approve document
        </button>
        <button className="seller-danger-action" type="button" disabled={!canReject || busyAction === rejectActionKey} onClick={onReject}>
          <XCircle size={14} />
          Reject document
        </button>
      </ActionRow>

      {!canReview && <ActionHint text={`Document is already ${labelize(document.status)}.`} />}
      {canReview && note.trim().length < MIN_REJECT_NOTE_LENGTH && <ActionHint text="Rejection needs a short seller-facing note." />}
    </article>
  );
}

function ListingDraftCard({
  draft,
  note,
  busyAction,
  onNoteChange,
  onUseSuggestedNote,
  onPublish,
  onRevision,
  hideHeader = false
}: {
  draft: ListingDraftReview;
  note: string;
  busyAction: string | null;
  onNoteChange: (value: string) => void;
  onUseSuggestedNote: () => void;
  onPublish: () => void;
  onRevision: () => void;
  hideHeader?: boolean;
}) {
  const submitted = draft.status === "submitted";
  const sellerVerified = draft.verification_status === "verified";
  const canPublish = submitted && sellerVerified;
  const canRequestRevision = submitted && note.trim().length >= MIN_REJECT_NOTE_LENGTH;
  const publishActionKey = `publish-draft-${draft.draft_id}`;
  const revisionActionKey = `revision-draft-${draft.draft_id}`;

  return (
    <article className="seller-review-card">
      {!hideHeader && (
        <CardHeader
          icon={<Store size={16} />}
          eyebrow="Product draft"
          title={draft.title}
          subtitle={`${draft.seller_name} | ${draft.draft_id}`}
          status={draft.status}
          prescreen={draft.prescreen}
        />
      )}

      {!sellerVerified && <BlockerNotice text={`Seller verification is ${labelize(draft.verification_status ?? "missing")}. Publish is blocked.`} />}
      {!submitted && <BlockerNotice text={`Seller has not submitted this draft for review yet. Current status: ${labelize(draft.status)}.`} />}

      <ReviewFoldout title="Product facts" subtitle={`${draft.garment_type} | ${draft.fabric} | ${formatPrice(draft.base_price)}`} resetKey={draft.draft_id}>
        <div className="seller-media-detail">
          {isRenderableImage(draft.image_url) ? (
            <img src={draft.image_url} alt={draft.title} />
          ) : (
            <div className="seller-file-preview">
              <ImageIcon size={18} />
              <span>No preview</span>
            </div>
          )}
          <DetailGrid>
            <DetailTile label="Category" value={draft.category} />
            <DetailTile label="Garment" value={draft.garment_type} />
            <DetailTile label="Fabric" value={draft.fabric} />
            <DetailTile label="Color" value={draft.color_family} />
            <DetailTile label="Price" value={formatPrice(draft.base_price)} />
            <DetailTile label="Cluster" value={draft.target_cluster_id ?? "New catalog item"} />
            <DetailTile label="Readiness" value={labelize(draft.readiness_status)} />
            <DetailTile label="Submitted" value={formatDate(draft.submitted_at)} />
          </DetailGrid>
        </div>
      </ReviewFoldout>

      <PrescreenBox prescreen={draft.prescreen} />

      <NoteEditor note={note} onNoteChange={onNoteChange} onUseSuggestedNote={onUseSuggestedNote} />

      <ActionRow>
        <button className="seller-primary-action" type="button" disabled={!canPublish || busyAction === publishActionKey} onClick={onPublish}>
          <Send size={14} />
          Publish draft
        </button>
        <button className="seller-secondary-action" type="button" disabled={!canRequestRevision || busyAction === revisionActionKey} onClick={onRevision}>
          <XCircle size={14} />
          Request revision
        </button>
      </ActionRow>

      {submitted && !sellerVerified && <ActionHint text="Publish becomes available after seller verification is approved." />}
      {submitted && note.trim().length < MIN_REJECT_NOTE_LENGTH && <ActionHint text="Revision needs a clear seller-facing note." />}
    </article>
  );
}

function ProofAssetCard({
  proof,
  note,
  busyAction,
  onNoteChange,
  onUseSuggestedNote,
  onApprove,
  onReject
}: {
  proof: ProofAssetReview;
  note: string;
  busyAction: string | null;
  onNoteChange: (value: string) => void;
  onUseSuggestedNote: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const canReview = proof.status === "submitted";
  const canReject = canReview && note.trim().length >= MIN_REJECT_NOTE_LENGTH;
  const approveActionKey = `approve-proof-${proof.proof_id}`;
  const rejectActionKey = `reject-proof-${proof.proof_id}`;

  return (
    <article className="seller-review-card">
      <CardHeader
        icon={<ImageIcon size={16} />}
        eyebrow="Proof upload"
        title={proof.title}
        subtitle={`${proof.seller_name} | ${proof.product_title}`}
        status={proof.status}
        prescreen={proof.prescreen}
      />

      <ReviewFoldout title="Proof details" subtitle={`${labelize(proof.attribute)} | ${labelize(proof.proof_type)}`} defaultOpen={canReview} resetKey={proof.proof_id}>
        <div className="seller-media-detail">
          {isRenderableImage(proof.asset_url) ? (
            <img src={proof.asset_url} alt={proof.title} />
          ) : (
            <div className="seller-file-preview">
              <FileText size={18} />
              <span>{proof.asset_url || "File reference"}</span>
            </div>
          )}
          <div className="seller-proof-copy">
            <p>{proof.description}</p>
            {isRenderableImage(proof.product_image_url) && (
              <div className="seller-product-reference">
                <img src={proof.product_image_url ?? ""} alt={proof.product_title} />
                <span>{proof.product_title}</span>
              </div>
            )}
          </div>
        </div>

        <DetailGrid>
          <DetailTile label="Attribute" value={labelize(proof.attribute)} />
          <DetailTile label="Proof type" value={labelize(proof.proof_type)} />
          <DetailTile label="Buyer asks" value={proof.open_request_count} />
          <DetailTile label="Product id" value={proof.product_id} />
          <DetailTile label="Submitted" value={formatDate(proof.submitted_at ?? proof.created_at)} />
          <DetailTile label="Reviewed" value={formatDate(proof.reviewed_at)} />
        </DetailGrid>
      </ReviewFoldout>

      <PrescreenBox prescreen={proof.prescreen} />

      <NoteEditor note={note} onNoteChange={onNoteChange} onUseSuggestedNote={onUseSuggestedNote} />

      <ActionRow>
        <button className="seller-primary-action" type="button" disabled={!canReview || busyAction === approveActionKey} onClick={onApprove}>
          <CheckCircle2 size={14} />
          Approve proof
        </button>
        <button className="seller-danger-action" type="button" disabled={!canReject || busyAction === rejectActionKey} onClick={onReject}>
          <XCircle size={14} />
          Reject proof
        </button>
      </ActionRow>

      {!canReview && <ActionHint text={`Proof is already ${labelize(proof.status)}.`} />}
      {canReview && note.trim().length < MIN_REJECT_NOTE_LENGTH && <ActionHint text="Rejection needs a clear seller-facing note." />}
    </article>
  );
}

function SellerReportButton({
  seller,
  laneLabel,
  selected,
  onSelect
}: {
  seller: AdminSellerDossier;
  laneLabel: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const hasAction = seller.open_review_items > 0 || seller.pending_documents.length > 0;
  return (
    <button className={`seller-report-button ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <div className="seller-report-button-top">
        <div>
          <strong>{seller.seller_name}</strong>
          <span>{seller.seller_id}</span>
        </div>
        <StatusPill value={seller.verification_status} />
      </div>
      <p>{hasAction ? seller.next_action : "No action needed"}</p>
      <div className="seller-report-button-metrics">
        <span>{laneLabel}</span>
        {seller.open_review_items > 0 && <span>{seller.open_review_items} open</span>}
        {seller.pending_documents.length > 0 && <span>{seller.pending_documents.length} docs</span>}
        {seller.submitted_draft_count > 0 && <span>{seller.submitted_draft_count} drafts</span>}
        {seller.submitted_proof_count > 0 && <span>{seller.submitted_proof_count} proofs</span>}
      </div>
    </button>
  );
}

function ReportSection({
  icon,
  title,
  subtitle,
  count,
  children
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="seller-report-section">
      <SectionHeader icon={icon} title={title} subtitle={subtitle} count={count} />
      <div className="seller-review-stack">{children}</div>
    </section>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  count
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  count: number;
}) {
  return (
    <div className="seller-section-header">
      <div className="seller-section-icon">{icon}</div>
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <span>{count}</span>
    </div>
  );
}

function CardHeader({
  icon,
  eyebrow,
  title,
  subtitle,
  status,
  prescreen
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  subtitle: string;
  status: string;
  prescreen: AdminPrescreenSuggestion;
}) {
  return (
    <div className="seller-card-header">
      <div className="seller-card-icon">{icon}</div>
      <div className="seller-card-title">
        <span>{eyebrow}</span>
        <h4>{title}</h4>
        <p>{subtitle}</p>
      </div>
      <div className="seller-card-badges">
        <StatusPill value={status} />
        <RiskPill level={prescreen.risk_level} score={prescreen.risk_score} />
      </div>
    </div>
  );
}

function ReviewFoldout({
  title,
  subtitle,
  count,
  defaultOpen = false,
  resetKey,
  children
}: {
  title: string;
  subtitle?: string;
  count?: ReactNode;
  defaultOpen?: boolean;
  resetKey?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);
  }, [defaultOpen, resetKey]);

  return (
    <section className={`seller-review-foldout ${open ? "open" : ""}`}>
      <button className="seller-review-foldout-toggle" type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <ChevronDown size={16} className="seller-foldout-chevron" />
        <div>
          <strong>{title}</strong>
          {subtitle && <span>{subtitle}</span>}
        </div>
        {count && <em>{count}</em>}
      </button>
      {open && <div className="seller-review-foldout-body">{children}</div>}
    </section>
  );
}

function PrescreenBox({ prescreen }: { prescreen: AdminPrescreenSuggestion }) {
  const issueCount = prescreen.checks.filter((check) => check.status !== "pass").length;
  const summary = issueCount
    ? `${issueCount} issue${issueCount === 1 ? "" : "s"} found`
    : "Checks passed";

  return (
    <ReviewFoldout
      title="Validation checks"
      subtitle={summary}
      count={<ProviderPill provider={prescreen.agent_provider} />}
      defaultOpen={issueCount > 0 || prescreen.risk_level !== "low"}
      resetKey={prescreen.queue_item_id}
    >
      <div className="seller-prescreen-box">
        <div className="seller-prescreen-head">
          <div>
            <span>Suggested action</span>
            <strong>{prescreen.act}</strong>
          </div>
        </div>
        <p>{prescreen.reason}</p>
        <div className="seller-check-list">
          {prescreen.checks.slice(0, 5).map((check) => (
            <div className={`seller-check-row ${check.status}`} key={`${check.label}-${check.detail}`}>
              {check.status === "pass" ? <CheckCircle2 size={15} /> : check.status === "warn" ? <AlertTriangle size={15} /> : <XCircle size={15} />}
              <div>
                <strong>{check.label}</strong>
                <span>{check.detail}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ReviewFoldout>
  );
}

function DecisionBrief({
  prescreen,
  readyForReview
}: {
  prescreen: AdminPrescreenSuggestion;
  readyForReview: boolean;
}) {
  const failedChecks = prescreen.checks.filter((check) => check.status === "fail");
  const warningChecks = prescreen.checks.filter((check) => check.status === "warn");
  const passedChecks = prescreen.checks.filter((check) => check.status === "pass").length;
  const totalChecks = prescreen.checks.length;
  const issue = failedChecks[0] ?? warningChecks[0] ?? null;
  const tone = decisionBriefTone(prescreen, failedChecks.length, warningChecks.length);
  const providerLabel = providerText(prescreen.agent_provider);

  return (
    <section className={`seller-decision-brief ${tone}`} aria-label="Review decision brief">
      <div className="seller-decision-brief-main">
        <span>{providerLabel}</span>
        <h4>{decisionBriefHeadline(prescreen, readyForReview, failedChecks.length)}</h4>
        <p>{prescreen.act}</p>
      </div>

      <div className="seller-decision-brief-grid">
        <DecisionBriefMetric label="Suggestion" value={decisionActionLabel(prescreen.suggested_action)} />
        <DecisionBriefMetric label="Confidence" value={labelize(prescreen.confidence)} />
        <DecisionBriefMetric label="Checks" value={`${passedChecks}/${totalChecks || 0} passed`} />
        <DecisionBriefMetric label="Route" value={prescreen.route_to === "senior_reviewer" ? "Senior review" : "Standard"} />
      </div>

      <div className="seller-decision-brief-note">
        {issue ? (
          <>
            <AlertTriangle size={15} />
            <span>{issue.label}: {issue.detail}</span>
          </>
        ) : (
          <>
            <CheckCircle2 size={15} />
            <span>No blocking validation issue found. Human approval is still required.</span>
          </>
        )}
      </div>
    </section>
  );
}

function DecisionBriefMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function decisionBriefTone(prescreen: AdminPrescreenSuggestion, failedCount: number, warningCount: number) {
  if (prescreen.route_to === "senior_reviewer" || prescreen.risk_level === "high" || failedCount > 0) return "hold";
  if (warningCount > 0 || prescreen.confidence !== "high") return "review";
  return "fast";
}

function decisionBriefHeadline(prescreen: AdminPrescreenSuggestion, readyForReview: boolean, failedCount: number) {
  if (!readyForReview) return "Already handled";
  if (prescreen.route_to === "senior_reviewer") return "Needs senior reviewer";
  if (failedCount > 0) return "Do not approve yet";
  if (prescreen.confidence === "high" && prescreen.risk_level === "low") return "Fast review candidate";
  return "Human check needed";
}

function decisionActionLabel(action: AdminPrescreenSuggestion["suggested_action"]) {
  const labels: Record<AdminPrescreenSuggestion["suggested_action"], string> = {
    approve: "Approve seller",
    reject: "Reject seller",
    approve_document: "Approve document",
    reject_document: "Reject document",
    publish: "Publish draft",
    request_revision: "Request fixes",
    manual_check: "Manual check"
  };
  return labels[action];
}

function providerText(provider: AdminPrescreenSuggestion["agent_provider"]) {
  if (provider === "gemini") return "Gemini pre-check";
  if (provider === "fallback_after_llm_error") return "Rules fallback";
  return "Rules pre-check";
}

function NoteEditor({
  note,
  onNoteChange,
  onUseSuggestedNote
}: {
  note: string;
  onNoteChange: (value: string) => void;
  onUseSuggestedNote: () => void;
}) {
  return (
    <div className="seller-note-editor">
      <div>
        <span>Audit note</span>
        <button type="button" onClick={onUseSuggestedNote}>
          Use suggested note
        </button>
      </div>
      <textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Write what the seller or audit team needs to know"
        rows={3}
      />
    </div>
  );
}

function ActionRow({ children }: { children: ReactNode }) {
  return <div className="seller-action-row">{children}</div>;
}

function ActionHint({ text }: { text: string }) {
  return <small className="seller-action-hint">{text}</small>;
}

function BlockerNotice({ text }: { text: string }) {
  return (
    <div className="seller-blocker-notice">
      <AlertTriangle size={15} />
      <span>{text}</span>
    </div>
  );
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="seller-detail-grid">{children}</div>;
}

function DetailTile({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="seller-detail-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AuditRow({ event }: { event: AdminAuditEvent }) {
  return (
    <article className="seller-audit-row">
      <div>
        <strong>{labelize(event.action)}</strong>
        <span>
          {event.actor_name} | {labelize(event.target_type)} {event.target_id}
        </span>
      </div>
      <StatusPill value={event.decision} />
      <p>{event.notes || "No note recorded."}</p>
      <small>{formatDate(event.created_at)}</small>
    </article>
  );
}

function StatusPill({ value }: { value: string }) {
  return <span className={`review-status-pill ${statusTone(value)}`}>{labelize(value)}</span>;
}

function RiskPill({
  level,
  score
}: {
  level: AdminPrescreenSuggestion["risk_level"];
  score: number;
}) {
  return <span className={`review-risk-pill ${level}`}>{level} risk | {score}</span>;
}

function SlaPill({ value, ageHours }: { value: string; ageHours: number }) {
  return (
    <span className={`review-sla-pill ${value}`}>
      {labelize(value)} | {Math.round(ageHours)}h
    </span>
  );
}

function ProviderPill({ provider }: { provider: AdminPrescreenSuggestion["agent_provider"] }) {
  const label = provider === "gemini" ? "Gemini checks" : provider === "fallback_after_llm_error" ? "Rules fallback" : "Rule checks";
  return <span className={`review-provider-pill ${provider === "gemini" ? "gemini" : ""}`}>{label}</span>;
}

function adminTabIcon(tab: AdminTab) {
  if (tab === "reports") return <ShieldCheck size={14} />;
  if (tab === "uploads") return <FileCheck2 size={14} />;
  if (tab === "drafts") return <Store size={14} />;
  return <ClipboardCheck size={14} />;
}

function ItemTypeIcon({ itemType }: { itemType: AdminPrescreenSuggestion["item_type"] }) {
  const icons: Record<AdminPrescreenSuggestion["item_type"], ReactNode> = {
    seller_application: <ShieldCheck size={15} />,
    verification_document: <FileCheck2 size={15} />,
    listing_draft: <Store size={15} />,
    proof_asset: <ImageIcon size={15} />
  };
  return <span className={`seller-item-type ${itemType}`}>{icons[itemType]}</span>;
}

function EmptyPanel({ message, compact = false }: { message: string; compact?: boolean }) {
  return <div className={`seller-empty-panel ${compact ? "compact" : ""}`}>{message}</div>;
}

function draftReviewSignal(draft: ListingDraftReview, checkLabel: string) {
  const failed = draft.prescreen.checks.filter((check) => check.status === "fail").length;
  const warnings = draft.prescreen.checks.filter((check) => check.status === "warn").length;
  if (draft.status === "needs_revision") {
    return failed
      ? `Revision requested: ${failed} failed check${failed === 1 ? "" : "s"}`
      : "Waiting for seller revision";
  }
  if (draft.status === "draft") return "Seller has not submitted this draft";
  if (draft.status !== "submitted") return `Current state: ${labelize(draft.status)}`;
  if (draft.verification_status !== "verified") return "Seller verification blocks publish";
  if (failed) return `${failed} failed validation check${failed === 1 ? "" : "s"}`;
  if (warnings) return `${warnings} warning${warnings === 1 ? "" : "s"} before publish`;
  return checkLabel;
}

function adminTabFromPath(pathname: string): AdminTab {
  if (pathname.startsWith("/admin/uploads")) return "uploads";
  if (pathname.startsWith("/admin/drafts")) return "drafts";
  if (pathname.startsWith("/admin/audit")) return "audit";
  return "reports";
}

function adminModeFromPath(pathname: string): AdminMode {
  if (pathname.startsWith("/admin/agent")) return "agent";
  if (pathname.startsWith("/admin/policy")) return "policy";
  if (pathname.startsWith("/admin/impact")) return "impact";
  return "command";
}

function adminPathForTab(tab: AdminTab) {
  if (tab === "uploads") return "/admin/uploads";
  if (tab === "drafts") return "/admin/drafts";
  if (tab === "audit") return "/admin/audit";
  return "/admin";
}

function buildSellerLanes(queue: AdminReviewQueue): SellerLane[] {
  const lanes: Array<{ id: SellerLaneId; label: string }> = [
    { id: "needs_decision", label: "Review now" },
    { id: "docs_blocked", label: "Docs blocker" },
    { id: "products", label: "Products" },
    { id: "proofs", label: "Proofs" }
  ];
  return lanes.map((lane) => ({
    ...lane,
    count: queue.seller_dossiers.filter((seller) => sellerMatchesLane(queue, seller, lane.id)).length
  }));
}

function sellerMatchesLane(queue: AdminReviewQueue, seller: AdminSellerDossier, lane: SellerLaneId) {
  const hasReadyDocuments = queue.documents.some(
    (document) => document.seller_id === seller.seller_id && ["submitted", "under_review"].includes(document.status)
  );
  const hasSubmittedDrafts = queue.listing_drafts.some(
    (draft) => draft.seller_id === seller.seller_id && draft.status === "submitted"
  );
  const hasSubmittedProofs = queue.proof_assets.some(
    (proof) => proof.seller_id === seller.seller_id && proof.status === "submitted"
  );
  if (lane === "needs_decision") return seller.open_review_items > 0 || seller.pending_documents.length > 0;
  if (lane === "docs_blocked") return seller.pending_documents.length > 0 || hasReadyDocuments;
  if (lane === "products") return seller.submitted_draft_count > 0 || hasSubmittedDrafts;
  if (lane === "proofs") return seller.submitted_proof_count > 0 || seller.buyer_requests_waiting > 0 || hasSubmittedProofs;
  return seller.open_review_items === 0 && seller.pending_documents.length === 0;
}

function sellerLaneLabel(queue: AdminReviewQueue, seller: AdminSellerDossier) {
  if (sellerMatchesLane(queue, seller, "docs_blocked")) return "Docs blocker";
  if (sellerMatchesLane(queue, seller, "products")) return "Products";
  if (sellerMatchesLane(queue, seller, "proofs")) return "Proofs";
  if (sellerMatchesLane(queue, seller, "needs_decision")) return "Review now";
  return "Done";
}

function buildSellerPacketItems(report: SellerReport): SellerPacketItem[] {
  const applications: SellerPacketItem[] = report.applications.map((application) => ({
    id: `application-${application.application_id}`,
    kind: "application",
    title: application.business_name,
    subtitle: `${application.gst_number} | ${application.support_contact}`,
    status: application.status,
    group: "Seller identity",
    readyForReview: application.status === "pending_review" && report.seller.pending_documents.length === 0,
    prescreen: application.prescreen,
    item: application
  }));

  const documents: SellerPacketItem[] = report.documents.map((document) => ({
    id: `document-${document.document_id}`,
    kind: "document",
    title: labelize(document.document_type),
    subtitle: `${document.reference} | ${document.file_name}`,
    status: document.status,
    group: "Documents",
    readyForReview: document.status === "submitted" || document.status === "under_review",
    prescreen: document.prescreen,
    item: document
  }));

  const drafts: SellerPacketItem[] = report.drafts.map((draft) => ({
    id: `draft-${draft.draft_id}`,
    kind: "draft",
    title: draft.title,
    subtitle: `${labelize(draft.category)} | ${formatPrice(draft.base_price)}`,
    status: draft.status,
    group: "Product drafts",
    readyForReview: draft.status === "submitted",
    prescreen: draft.prescreen,
    item: draft
  }));

  const proofs: SellerPacketItem[] = report.proofs.map((proof) => ({
    id: `proof-${proof.proof_id}`,
    kind: "proof",
    title: proof.title,
    subtitle: `${proof.product_title} | ${labelize(proof.attribute)}`,
    status: proof.status,
    group: "Proof uploads",
    readyForReview: proof.status === "submitted",
    prescreen: proof.prescreen,
    item: proof
  }));

  return sortByReviewState([...applications, ...documents, ...drafts, ...proofs]);
}

function buildPacketGroups(items: SellerPacketItem[]) {
  return ["Seller identity", "Documents", "Product drafts", "Proof uploads"]
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((group) => group.items.length > 0);
}

function packetKindToItemType(kind: PacketItemKind): AdminPrescreenSuggestion["item_type"] {
  if (kind === "application") return "seller_application";
  if (kind === "document") return "verification_document";
  if (kind === "draft") return "listing_draft";
  return "proof_asset";
}

function buildUploadRows(queue: AdminReviewQueue): UploadQueueRow[] {
  const documentRows: UploadQueueRow[] = queue.documents.map((document) => ({
    id: `document-${document.document_id}`,
    kind: "document",
    title: labelize(document.document_type),
    subtitle: `${document.reference} | ${document.file_name}`,
    sellerName: document.seller_name,
    status: document.status,
    submittedAt: document.submitted_at,
    readyForReview: document.status === "submitted" || document.status === "under_review",
    prescreen: document.prescreen,
    searchText: [
      document.seller_name,
      document.seller_id,
      document.document_type,
      document.reference,
      document.file_name,
      document.status,
      document.prescreen.reason
    ].join(" ").toLowerCase(),
    item: document
  }));

  const proofRows: UploadQueueRow[] = queue.proof_assets.map((proof) => ({
    id: `proof-${proof.proof_id}`,
    kind: "proof",
    title: proof.title,
    subtitle: `${proof.product_title} | ${labelize(proof.attribute)} ${labelize(proof.proof_type)}`,
    sellerName: proof.seller_name,
    status: proof.status,
    submittedAt: proof.submitted_at ?? proof.created_at,
    readyForReview: proof.status === "submitted",
    prescreen: proof.prescreen,
    searchText: [
      proof.seller_name,
      proof.seller_id,
      proof.product_title,
      proof.product_id,
      proof.attribute,
      proof.proof_type,
      proof.title,
      proof.description,
      proof.status,
      proof.prescreen.reason
    ].join(" ").toLowerCase(),
    item: proof
  }));

  return sortByReviewState([...documentRows, ...proofRows]);
}

function uploadCheckSummary(prescreen: AdminPrescreenSuggestion) {
  const failed = prescreen.checks.filter((check) => check.status === "fail").length;
  if (failed) return { tone: "bad", label: `${failed} failed` };
  const warnings = prescreen.checks.filter((check) => check.status === "warn").length;
  if (warnings) return { tone: "warn", label: `${warnings} warning${warnings === 1 ? "" : "s"}` };
  return { tone: "good", label: "Checks passed" };
}

function collectPrescreens(queue: AdminReviewQueue) {
  return [
    ...queue.seller_applications.map((item) => item.prescreen),
    ...queue.documents.map((item) => item.prescreen),
    ...queue.listing_drafts.map((item) => item.prescreen),
    ...queue.proof_assets.map((item) => item.prescreen)
  ];
}

function countPrescreenChecks(prescreens: AdminPrescreenSuggestion[]) {
  return prescreens.reduce(
    (counts, prescreen) => {
      prescreen.checks.forEach((check) => {
        counts[check.status] += 1;
      });
      return counts;
    },
    { pass: 0, warn: 0, fail: 0 }
  );
}

function buildSellerReport(queue: AdminReviewQueue, seller: AdminSellerDossier) {
  return {
    seller,
    applications: sortByReviewState(queue.seller_applications.filter((item) => item.seller_id === seller.seller_id)),
    documents: sortByReviewState(queue.documents.filter((item) => item.seller_id === seller.seller_id)),
    drafts: sortByReviewState(queue.listing_drafts.filter((item) => item.seller_id === seller.seller_id)),
    proofs: sortByReviewState(queue.proof_assets.filter((item) => item.seller_id === seller.seller_id))
  };
}

function sortByReviewState<T extends { status: string; submitted_at?: string | null; submittedAt?: string | null; created_at?: string; updated_at?: string }>(items: T[]) {
  return [...items].sort((a, b) => {
    const stateDelta = reviewStatePriority(a.status) - reviewStatePriority(b.status);
    if (stateDelta !== 0) return stateDelta;
    return dateValue(b.submitted_at ?? b.submittedAt ?? b.updated_at ?? b.created_at) - dateValue(a.submitted_at ?? a.submittedAt ?? a.updated_at ?? a.created_at);
  });
}

function reviewStatePriority(status: string) {
  if (status === "submitted" || status === "under_review" || status === "pending_review") return 0;
  if (status === "needs_revision" || status === "rejected" || status === "restricted") return 1;
  if (status === "draft") return 2;
  return 3;
}

function suggestedAuditNote(prescreen: AdminPrescreenSuggestion, fallback: string) {
  const action = prescreen.act?.trim();
  const reason = prescreen.reason?.trim();
  if (action && reason) return `${action} ${reason}`;
  return action || reason || fallback;
}

function riskLevelFromScore(score: number): AdminPrescreenSuggestion["risk_level"] {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function statusTone(value: string) {
  if (["approved", "verified", "resolved", "published"].includes(value)) return "good";
  if (["rejected", "restricted", "needs_revision", "fail", "breached"].includes(value)) return "bad";
  if (["submitted", "pending_review", "under_review", "pending", "due_today"].includes(value)) return "attention";
  return "neutral";
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  return `${Math.round(value / 1024)} KB`;
}

function formatPrice(value: number) {
  return `Rs ${Math.round(value)}`;
}

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function dateValue(value?: string | null) {
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function isRenderableImage(value?: string | null) {
  if (!value) return false;
  return value.startsWith("data:image/") || /^https?:\/\/.+\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(value) || value.includes("images.unsplash.com");
}
