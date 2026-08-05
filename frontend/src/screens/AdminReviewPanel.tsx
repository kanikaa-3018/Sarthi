import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  FileCheck2,
  ClipboardCheck,
  Image as ImageIcon,
  FileText,
  Search,
  RefreshCcw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Sparkles,
  Store,
  XCircle
} from "lucide-react";
import {
  approveListingDraft,
  approveSellerDocument,
  approveSellerEvidenceAsset,
  approveSellerApplication,
  getAdminAiHealth,
  getAdminReviewQueue,
  rejectSellerDocument,
  rejectSellerEvidenceAsset,
  rejectSellerApplication,
  runAdminAiHealthTest,
  requestListingRevision
} from "../api/client";
import { roleText, type LanguageCode } from "../i18n";
import { SarthiMark } from "../components/SarthiMark";
import type {
  AdminAiHealth,
  AdminAiHealthTest,
  AdminAuditEvent,
  AdminPrescreenSuggestion,
  AdminReviewQueue,
  AdminSellerDossier,
  AdminStoredEvidenceItem,
  AdminTriageBucket,
  AdminTriageView
} from "../types/api";
type AdminTab = "reports" | "uploads" | "drafts" | "audit";
type AdminMode = "command" | "agent" | "policy" | "impact";

type SellerApplicationReview = AdminReviewQueue["seller_applications"][number];
type VerificationDocumentReview = AdminReviewQueue["documents"][number];
type ListingDraftReview = AdminReviewQueue["listing_drafts"][number];
type ProofAssetReview = AdminReviewQueue["proof_assets"][number];
type AdminQueueSnapshot = AdminReviewQueue["active_queue"][number];
type SellerLaneId = "needs_decision" | "docs_blocked" | "products" | "proofs" | "clear";
type SellerLane = {
  id: SellerLaneId;
  label: string;
  count: number;
};
type SellerReport = ReturnType<typeof buildSellerReport>;
type PacketItemKind = "application" | "document" | "draft" | "proof";
type AdminReviewerCopy = ReturnType<typeof adminReviewerCopy>;
type SellerPacketItem =
  | {
      id: string;
      kind: "application";
      title: string;
      subtitle: string;
      status: string;
      group: string;
      readyForReview: boolean;
      queueItem?: AdminQueueSnapshot;
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
      queueItem?: AdminQueueSnapshot;
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
      queueItem?: AdminQueueSnapshot;
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
      queueItem?: AdminQueueSnapshot;
      prescreen: AdminPrescreenSuggestion;
      item: ProofAssetReview;
    };
type ProofPacketItem = Extract<SellerPacketItem, { kind: "proof" }>;
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
      queueItem?: AdminQueueSnapshot;
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
      queueItem?: AdminQueueSnapshot;
      prescreen: AdminPrescreenSuggestion;
      searchText: string;
      item: ProofAssetReview;
    };
type ExceptionQueueTab = "needs_review" | "auto_reviewed" | "escalated";
type ReviewItemTypeFilter = "all" | AdminPrescreenSuggestion["item_type"];
type ReviewDeskRow = {
  id: string;
  targetId: string;
  source: "live" | "stored";
  lane: ExceptionQueueTab;
  kind: PacketItemKind | "stored";
  itemType: AdminPrescreenSuggestion["item_type"];
  title: string;
  subtitle: string;
  sellerId: string;
  sellerName: string;
  status: string;
  submittedAt: string | null;
  readyForReview: boolean;
  riskLevel: AdminPrescreenSuggestion["risk_level"];
  riskScore: number;
  triageBucket: AdminTriageBucket;
  triageLabel: string;
  triageReason: string;
  provider: AdminPrescreenSuggestion["agent_provider"];
  queueItem?: AdminQueueSnapshot;
  prescreen?: AdminPrescreenSuggestion;
  packetItem?: SellerPacketItem;
  storedItem?: AdminStoredEvidenceItem;
  assetUrl?: string | null;
  productImageUrl?: string | null;
  reference?: string | null;
  sellerPendingDocuments?: string[];
  searchText: string;
};

const REVIEW_ITEM_TYPE_FILTERS: Array<Exclude<ReviewItemTypeFilter, "all">> = [
  "verification_document",
  "proof_asset",
  "listing_draft",
  "seller_application"
];
const REVIEW_ITEM_TYPE_FILTER_LABELS: Record<ReviewItemTypeFilter, string> = {
  all: "All",
  verification_document: "Docs",
  proof_asset: "Proofs",
  listing_draft: "Listings",
  seller_application: "Sellers"
};

const MIN_REJECT_NOTE_LENGTH = 8;
const REVIEWER_VISIBLE_TRIAGE_BUCKETS: AdminTriageBucket[] = ["fast_review", "manual_review", "senior_review"];
const ADMIN_TRIAGE_LABELS: Record<AdminTriageBucket, string> = {
  fast_review: "Fast review",
  manual_review: "Needs human",
  senior_review: "Senior review",
  seller_fix: "Returned to seller",
  reuse_standard: "Reusable proof",
  stored_only: "Stored"
};

const REVIEW_TAB_META: Record<AdminTab, { navLabel: string; title: string; description: string }> = {
  reports: {
    navLabel: "Sellers",
    title: "Seller blockers",
    description: "See which sellers are blocked and open the right queue."
  },
  uploads: {
    navLabel: "Queue",
    title: "Review queue",
    description: "Documents, proofs, listings, and seller approvals needing a decision."
  },
  drafts: {
    navLabel: "Listings",
    title: "Listings",
    description: "Publish clean listings or request one fix."
  },
  audit: {
    navLabel: "History",
    title: "History",
    description: "Recent reviewer decisions and notes."
  }
};

const ADMIN_MODE_META: Record<Exclude<AdminMode, "command">, { kicker: string; title: string; description: string }> = {
  agent: {
    kicker: "AI pre-check",
    title: "AI queue",
    description: "Sarthi clears clean uploads and shows only the cases that need judgment."
  },
  policy: {
    kicker: "Safety checks",
    title: "Risk",
    description: "The blockers that stop unsafe seller approvals."
  },
  impact: {
    kicker: "Handled records",
    title: "Saved work",
    description: "Proof and document work Sarthi handled before it became reviewer load."
  },
};

function adminReviewerCopy(language: LanguageCode) {
  const english = {
    refresh: "Refresh",
    reviewDesk: "Review desk",
    reviewSectionsAria: "Admin review sections",
    loadingSellerReports: "Loading seller reports",
    loadingQueueSubtext: "Loading queue, evidence, and assistant status.",
    sellerQueueTitle: "Sellers",
    sellerQueueBody: "Pick a blocked seller. Open the queue item that needs a decision.",
    sellerSearchPlaceholder: "Search seller, GST, status",
    noSellerMatches: "No seller report matches this search.",
    selectSellerReport: "Select a seller report to review submissions.",
    activeSeller: "Active seller",
    sellerApprovalBlocked: "Seller approval is blocked until required documents are reviewed.",
    noActionNeeded: "No action needed",
    nextCaseTitle: "Next decision",
    nothingNeedsReviewerAction: "Nothing needs reviewer action.",
    completedKeptInHistory: "Completed uploads and documents are kept in history.",
    history: "History",
    selectedCase: "Selected case",
    reviewEvidenceAndDecide: "Check evidence, add a note, decide.",
    noActionNeededNow: "No action needed right now.",
    moreBlockersLabel: (count: number) => `${count} more blocker${count === 1 ? "" : "s"}`,
    reviewLater: "Review later",
    fullAuditTrail: "Full audit trail",
    auditTrailHint: "agent checks, evidence, guidance",
    decisionMapObserve: "AI pre-read",
    decisionMapCheck: "Check proof",
    decisionMapAct: "Human decision",
    decisionMapGuardrail: "Sarthi suggests. Reviewer decides.",
    tabs: {
      reports: "Sellers",
      uploads: "Queue",
      drafts: "Listings",
      audit: "History"
    } satisfies Record<AdminTab, string>,
    commandHeaders: {
      reports: { title: "Seller blockers", description: "Each seller card shows the next blocker, not every detail." },
      uploads: { title: "Review queue", description: "One list for proofs, documents, listings, and seller approvals." },
      drafts: { title: "Listings", description: "Publish clean drafts or send one clear fix." },
      audit: { title: "History", description: "Recent decisions, notes, and stored evidence." }
    } satisfies Record<AdminTab, { title: string; description: string }>,
    modeHeaders: ADMIN_MODE_META,
      laneLabels: {
        needs_decision: "All blockers",
        docs_blocked: "Documents",
        products: "Listings",
        proofs: "Proofs",
        clear: "Clear"
      } satisfies Record<SellerLaneId, string>,
    clearedSellerNote: (count: number) => `${count} cleared seller${count === 1 ? "" : "s"} moved to history.`,
    openBlockersForSeller: (count: number) => `${count} open blocker${count === 1 ? "" : "s"} for this seller.`
  };

  if (language === "hindi") {
    return {
      ...english,
      refresh: "रिफ्रेश",
      reviewDesk: "रिव्यू डेस्क",
      reviewSectionsAria: "एडमिन रिव्यू सेक्शन",
      loadingSellerReports: "Seller reports लोड हो रही हैं",
      loadingQueueSubtext: "Queue, evidence और assistant status लोड हो रहे हैं।",
      sellerQueueTitle: "Sellers",
      sellerQueueBody: "एक seller चुनें। पहला blocker clear करें, फिर आगे बढ़ें।",
      sellerSearchPlaceholder: "Seller, GST, status खोजें",
      noSellerMatches: "इस search से कोई seller report नहीं मिली।",
      selectSellerReport: "Submission review करने के लिए seller report चुनें।",
      activeSeller: "Active seller",
      sellerApprovalBlocked: "Required documents review होने तक seller approval blocked रहेगा।",
      noActionNeeded: "Action needed नहीं",
      nextCaseTitle: "अगला decision",
      nothingNeedsReviewerAction: "अभी reviewer action needed नहीं है।",
      completedKeptInHistory: "Complete uploads और documents history में रखे गए हैं।",
      history: "History",
      selectedCase: "Selected case",
      reviewEvidenceAndDecide: "Evidence check करें, note add करें, फिर approve या revision मांगें।",
      noActionNeededNow: "अभी action needed नहीं है।",
      moreBlockersLabel: (count: number) => `${count} और blocker${count === 1 ? "" : "s"}`,
      reviewLater: "बाद में review",
      fullAuditTrail: "Full audit trail",
      auditTrailHint: "agent checks, evidence, guidance",
      decisionMapObserve: "AI pre-read",
      decisionMapCheck: "Proof check",
      decisionMapAct: "Human decision",
      decisionMapGuardrail: "Sarthi suggest करता है। Reviewer final decision लेता है।",
      tabs: {
        reports: "Sellers",
        uploads: "Queue",
        drafts: "Listings",
        audit: "History"
      },
      commandHeaders: {
        reports: { title: "Seller queue", description: "Buyer trust block करने वाले seller से शुरू करें।" },
        uploads: { title: "Evidence uploads", description: "Documents और seller proof check करें।" },
        drafts: { title: "Listing drafts", description: "Publish करें या fixes भेजें।" },
        audit: { title: "Decision history", description: "क्या बदला, किसने decide किया, और क्यों।" }
      },
      modeHeaders: {
        agent: { kicker: "AI pre-check", title: "AI queue", description: "Sarthi clean uploads clear करता है और सिर्फ judgement वाले cases दिखाता है।" },
        policy: { kicker: "Safety checks", title: "Risk", description: "Unsafe seller approvals रोकने वाले blockers।" },
        impact: { kicker: "Handled records", title: "Saved work", description: "Reviewer load बनने से पहले handled proof और document work।" }
      },
      laneLabels: {
        needs_decision: "All blockers",
        docs_blocked: "Documents",
        products: "Listings",
        proofs: "Proofs",
        clear: "Clear"
      },
      clearedSellerNote: (count: number) => `${count} cleared seller history में move हुआ।`,
      openBlockersForSeller: (count: number) => `इस seller के लिए ${count} open blocker${count === 1 ? "" : "s"}।`
    };
  }

  if (language === "hinglish") {
    return {
      ...english,
      sellerQueueBody: "Blocked seller choose karo. Queue item open karke decision lo.",
      loadingQueueSubtext: "Sarthi queue, evidence aur reviewer AI status load kar raha hai.",
      sellerSearchPlaceholder: "Seller, GST, status search karo",
      noSellerMatches: "Is search se seller report nahi mili.",
      selectSellerReport: "Submission review karne ke liye seller report choose karo.",
      sellerApprovalBlocked: "Required documents review hone tak seller approval blocked hai.",
      nextCaseTitle: "Next decision",
      nothingNeedsReviewerAction: "Abhi reviewer action needed nahi hai.",
      completedKeptInHistory: "Completed uploads aur documents history me rahenge.",
      reviewEvidenceAndDecide: "Evidence check karo, note add karo, phir approve ya revision maango.",
      noActionNeededNow: "Abhi action needed nahi hai.",
      moreBlockersLabel: (count: number) => `${count} aur blocker${count === 1 ? "" : "s"}`,
      reviewLater: "Baad me review",
      decisionMapGuardrail: "Sarthi suggest karta hai. Reviewer decide karta hai.",
      commandHeaders: {
        reports: { title: "Seller blockers", description: "Har seller card next blocker dikhata hai." },
        uploads: { title: "Review queue", description: "Proofs, documents, listings aur sellers ek queue me." },
        drafts: { title: "Listings", description: "Clean drafts publish karo ya ek clear fix bhejo." },
        audit: { title: "History", description: "Recent decisions, notes aur stored evidence." }
      },
      modeHeaders: {
        agent: { kicker: "AI pre-check", title: "AI queue", description: "Sarthi clean uploads clear karta hai aur sirf judgement wale cases dikhata hai." },
        policy: { kicker: "Safety checks", title: "Risk", description: "Unsafe seller approvals rokne wale blockers." },
        impact: { kicker: "Handled records", title: "Saved work", description: "Reviewer load banne se pehle handled proof aur document work." }
      },
      clearedSellerNote: (count: number) => `${count} cleared seller history me move hua.`,
      openBlockersForSeller: (count: number) => `${count} open blocker${count === 1 ? "" : "s"} is seller ke liye.`
    };
  }

  return english;
}
type NotesById = Record<string, string>;

export function AdminReviewPanel({ language }: { language: LanguageCode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const copy = adminReviewerCopy(language);
  const [activeTab, setActiveTab] = useState<AdminTab>(() => adminTabFromPath(location.pathname));
  const [selectedSellerId, setSelectedSellerId] = useState<string | null>(null);
  const [selectedReviewTargetId, setSelectedReviewTargetId] = useState<string | null>(null);
  const [sellerSearch, setSellerSearch] = useState("");
  const [queue, setQueue] = useState<AdminReviewQueue | null>(null);
  const [notes, setNotes] = useState<NotesById>({});
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeMode = adminModeFromPath(location.pathname);
  const [success, setSuccess] = useState<string | null>(null);
  const [aiHealth, setAiHealth] = useState<AdminAiHealth | null>(null);
  const [aiTest, setAiTest] = useState<AdminAiHealthTest | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiTestLoading, setAiTestLoading] = useState(false);

  useEffect(() => {
    void refreshQueue();
    void refreshAiHealth();
  }, []);

  useEffect(() => {
    setActiveTab(adminTabFromPath(location.pathname));
  }, [location.pathname]);

  useEffect(() => {
    if (!success) return;
    const timer = window.setTimeout(() => setSuccess(null), 5000);
    return () => window.clearTimeout(timer);
  }, [success]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

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
  const liveReviewCount = useMemo(() => {
    if (!queue) return 0;
    return buildExceptionReviewRows(queue).filter((row) => row.source === "live" && row.readyForReview).length;
  }, [queue]);

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

  async function refreshAiHealth() {
    setAiLoading(true);
    try {
      setAiHealth(await getAdminAiHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Gemini reviewer status.");
    } finally {
      setAiLoading(false);
    }
  }

  async function runAiHealthCheck() {
    setAiTestLoading(true);
    setError(null);
    try {
      const result = await runAdminAiHealthTest("Check reviewer automation health and summarize the next safe admin action.");
      setAiTest(result);
      setSuccess(`Gemini reviewer check completed with ${providerText(result.provider)}.`);
      await refreshAiHealth();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gemini reviewer check failed.");
    } finally {
      setAiTestLoading(false);
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
      label: copy.tabs.reports,
      count: queue?.seller_dossiers.filter((seller) => seller.open_review_items > 0 || seller.pending_documents.length > 0).length ?? 0
    },
    {
      id: "uploads" as const,
      label: copy.tabs.uploads,
      count: liveReviewCount
    },
    {
      id: "drafts" as const,
      label: copy.tabs.drafts,
      count: queue?.listing_drafts.length ?? 0
    },
    {
      id: "audit" as const,
      label: copy.tabs.audit,
      count: queue?.audit_events.length ?? 0
    }
  ];
  const activeTabMeta = REVIEW_TAB_META[activeTab];
  const headerMeta = activeMode === "command"
    ? {
        kicker: copy.reviewDesk,
        title: copy.commandHeaders[activeTab]?.title ?? activeTabMeta.title,
        description: copy.commandHeaders[activeTab]?.description ?? activeTabMeta.description
      }
    : copy.modeHeaders[activeMode] ?? ADMIN_MODE_META[activeMode];

  function openAdminTab(tab: AdminTab) {
    if (tab !== "uploads") {
      setSelectedReviewTargetId(null);
    }
    setActiveTab(tab);
    navigate(adminPathForTab(tab));
  }

  function openReviewQueue(targetId?: string | null) {
    setSelectedReviewTargetId(targetId ?? null);
    openAdminTab("uploads");
  }

  function openSellerInCommand(sellerId: string) {
    setSelectedSellerId(sellerId);
    openAdminTab("reports");
  }


  return (
    <main className="seller-report-shell reviewer-workbench" data-testid="reviewer-workbench">
      <section className="seller-report-header">
        <div>
          <span className="seller-report-kicker">{headerMeta.kicker}</span>
          <h2>{headerMeta.title}</h2>
          <p>{headerMeta.description}</p>
        </div>
        <button className="seller-report-refresh" type="button" onClick={refreshQueue} disabled={loading}>
          <RefreshCcw size={15} className={loading ? "spin-icon" : ""} />
          {copy.refresh}
        </button>
      </section>

      <div className="reviewer-toast-container" aria-live="polite">
        {success && (
          <div className="reviewer-toast reviewer-toast-success">
            <CheckCircle2 size={16} />
            <span>{success}</span>
            <button type="button" onClick={() => setSuccess(null)} aria-label="Close notification">
              <XCircle size={14} />
            </button>
          </div>
        )}
        {error && (
          <div className="reviewer-toast reviewer-toast-error">
            <AlertTriangle size={16} />
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Close notification">
              <XCircle size={14} />
            </button>
          </div>
        )}
      </div>

      {queue ? (
        <>
          {activeMode === "command" && (
            <>
              <nav className="seller-report-tabs" aria-label={copy.reviewSectionsAria}>
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
                  onOpenQueue={openReviewQueue}
                  copy={copy}
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
                  selectedTargetId={selectedReviewTargetId}
                  onNoteChange={updateNote}
                  onRunAction={runAction}
                  onSelectedTargetConsumed={() => setSelectedReviewTargetId(null)}
                />
              )}

              {activeTab === "audit" && <AuditView events={queue.audit_events} />}
            </>
          )}

          {activeMode === "agent" && (
            <AgentRoomView
              queue={queue}
              language={language}
              aiHealth={aiHealth}
              aiTest={aiTest}
              aiLoading={aiLoading}
              aiTestLoading={aiTestLoading}
              onRefreshAiHealth={refreshAiHealth}
              onRunAiHealthCheck={runAiHealthCheck}
              onOpenSeller={openSellerInCommand}
            />
          )}
          {activeMode === "policy" && <PolicyBrainView queue={queue} />}
          {activeMode === "impact" && <ImpactView queue={queue} />}
        </>
      ) : (
        <ReviewerLoadingState message={copy.loadingSellerReports} subtext={copy.loadingQueueSubtext} />
      )}
    </main>
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

function AgentRoomView({
  queue,
  language,
  aiHealth,
  aiTest,
  aiLoading,
  aiTestLoading,
  onRefreshAiHealth,
  onRunAiHealthCheck,
  onOpenSeller
}: {
  queue: AdminReviewQueue;
  language: LanguageCode;
  aiHealth: AdminAiHealth | null;
  aiTest: AdminAiHealthTest | null;
  aiLoading: boolean;
  aiTestLoading: boolean;
  onRefreshAiHealth: () => void;
  onRunAiHealthCheck: () => void;
  onOpenSeller: (sellerId: string) => void;
}) {
  const tx = (text: string) => roleText(language, text);
  const providerKicker = queue.automation_plan.agent_provider === "bedrock"
    ? "Bedrock assisted triage"
    : queue.automation_plan.agent_provider === "gemini"
      ? "Gemini assisted triage"
      : queue.automation_plan.agent_provider === "fallback_after_llm_error"
        ? "LLM fallback triage"
        : "Rules fallback triage";
  const triage = adminTriageView(queue);
  const storedRows = storedEvidenceRows(queue);
  const autoRows = storedRows.filter((item) => item.review_visibility === "auto_reviewed").length;
  const heldRows = storedRows.filter((item) => item.review_visibility === "ai_bypassed").length;

  return (
    <section className="admin-agent-room-view admin-clean-mode">
      <div className="admin-mode-hero admin-clean-hero">
        <div className="admin-mode-hero-icon">
          <Bot size={18} />
        </div>
        <div className="admin-agent-hero-copy">
          <span>{providerKicker}</span>
          <h3>{triage.reviewer_queue_count} {tx("uploads need review")}</h3>
          <p>{tx("Sarthi checked uploads and kept clean or incomplete work out of this queue.").replace("{count}", String(storedRows.length))}</p>
          <div className="admin-provider-badge-wrapper">
            <ProviderPill provider={queue.automation_plan.agent_provider} />
          </div>
        </div>
        <div className="admin-agent-hero-metrics" aria-label="AI queue summary">
          <div className="hero-metric-item">
            <strong>{autoRows}</strong>
            <span>{tx("Auto cleared")}</span>
          </div>
          <div className="hero-metric-item">
            <strong>{heldRows}</strong>
            <span>{tx("Seller fixes")}</span>
          </div>
        </div>
      </div>

      <AgentRoutingBoard queue={queue} language={language} onOpenSeller={onOpenSeller} />

      <div className="reviewer-simple-footer">
        {queue.automation_plan.caution && (
          <div className="admin-mode-alert">
            <AlertTriangle size={15} />
            <span>{queue.automation_plan.caution}</span>
          </div>
        )}
        <aside>
          <AiAssistStatusPanel
            health={aiHealth}
            test={aiTest}
            loading={aiLoading}
            testLoading={aiTestLoading}
            onRefresh={onRefreshAiHealth}
            onRunTest={onRunAiHealthCheck}
            language={language}
          />
        </aside>
      </div>
    </section>
  );
}

function AiAssistStatusPanel({
  health,
  test,
  loading,
  testLoading,
  onRefresh,
  onRunTest,
  language
}: {
  health: AdminAiHealth | null;
  test: AdminAiHealthTest | null;
  loading: boolean;
  testLoading: boolean;
  onRefresh: () => void;
  onRunTest: () => void;
  language: LanguageCode;
}) {
  const tx = (text: string) => roleText(language, text);
  const primaryProvider = health?.ai.primary_provider;
  const providerStatus = primaryProvider === "bedrock"
    ? health?.bedrock.status
    : primaryProvider === "gemini"
      ? health?.gemini.status
      : undefined;
  const status = providerStatus ?? (loading ? "checking" : "unavailable");
  const fallbackText = health?.fallback.active ? tx("Safety fallback is active") : tx("Auto-suggestions are active");

  return (
    <section className="admin-ai-assist-panel" aria-label={tx("Reviewer assistant status")}>
      <div className="admin-ai-assist-head">
        <Cpu size={16} />
        <div>
          <span>{tx("Reviewer assistant")}</span>
          <strong>{labelize(status)}</strong>
        </div>
      </div>
      <p>{health ? fallbackText : tx("Checking assistant status.")}</p>
      {health && (
        <div className="admin-ai-assist-inline" aria-label="Assistant checks">
          <span>{tx("Sources")} {health.source_health.checked_sources}</span>
          <span>{tx("Contracts")} {health.contracts.length}</span>
        </div>
      )}
      {test && (
        <div className="admin-ai-assist-result">
          <StatusPill value="operational" />
          <strong>{test.answer.title}</strong>
        </div>
      )}
      <div className="admin-ai-assist-actions">
        <button type="button" onClick={onRunTest} disabled={testLoading}>
          <Sparkles size={13} />
          {testLoading ? tx("Verifying...") : tx("Verify Assistant")}
        </button>
        <button type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCcw size={13} className={loading ? "spin-icon" : ""} />
          {tx("Refresh")}
        </button>
      </div>
    </section>
  );
}

function AdminCleanMetric({
  label,
  value,
  hint,
  tone = "neutral"
}: {
  label: string;
  value: ReactNode;
  hint: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  return (
    <article className={`admin-clean-metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{hint}</em>
    </article>
  );
}

function AdminQueueLine({
  item,
  onOpenSeller
}: {
  item: AdminReviewQueue["active_queue"][number];
  onOpenSeller: (sellerId: string) => void;
}) {
  return (
    <article className={`admin-clean-queue-line ${item.sla_state}`}>
      <ItemTypeIcon itemType={item.item_type} />
      <div className="admin-clean-queue-copy">
        <strong>{readableQueueTitle(item)}</strong>
        <span>{item.triage_label || item.primary_action}</span>
      </div>
      <div className="admin-clean-line-signals">
        <RiskPill level={item.risk_level} score={item.risk_score} />
        <SlaPill value={item.sla_state} ageHours={item.age_hours} />
      </div>
      <button className="seller-upload-review-button" type="button" onClick={() => onOpenSeller(item.seller_id)}>
        Open
      </button>
    </article>
  );
}

function AgentRoutingBoard({
  queue,
  language,
  onOpenSeller
}: {
  queue: AdminReviewQueue;
  language: LanguageCode;
  onOpenSeller: (sellerId: string) => void;
}) {
  const tx = (text: string) => roleText(language, text);
  const storedRows = storedEvidenceRows(queue);
  const reviewRows = queue.active_queue.slice(0, 2);
  const autoRowsAll = storedRows.filter((item) => item.review_visibility === "auto_reviewed");
  const heldRowsAll = storedRows.filter((item) => item.review_visibility === "ai_bypassed");
  const handledExamples = [...autoRowsAll.slice(0, 1), ...heldRowsAll.slice(0, 1)];

  return (
    <section className="reviewer-agent-explainer" aria-label={tx("AI routed reviewer work")}>
      <section className="reviewer-focus-panel">
        <div className="reviewer-plain-head">
          <div>
            <span>{tx("Needs your decision")}</span>
            <h3>{queue.active_queue.length} {tx(queue.active_queue.length === 1 ? "seller request is waiting" : "seller requests are waiting")}</h3>
            <p>{tx("Open these first. Each one has a clear blocker, weak proof, or required human decision.")}</p>
          </div>
          <b>{queue.active_queue.length}</b>
        </div>

        <div className="reviewer-plain-card-list">
          {reviewRows.length ? reviewRows.map((item) => (
            <ReviewerDecisionCard key={item.queue_item_id} item={item} language={language} onOpenSeller={onOpenSeller} />
          )) : <EmptyPanel message={tx("No manual decisions are waiting.")} compact />}
        </div>

        {queue.active_queue.length > reviewRows.length && (
          <div className="admin-section-more">{queue.active_queue.length - reviewRows.length} {tx("more cases are in the reviewer desk.")}</div>
        )}
      </section>

      <aside className="reviewer-ai-done-panel">
        <div className="reviewer-plain-head compact">
          <div>
            <span>{tx("Already handled by Sarthi")}</span>
            <h3>{autoRowsAll.length + heldRowsAll.length} {tx("requests stayed out of the manual queue")}</h3>
            <p>{tx("Clean evidence stays saved. Weak uploads go back to the seller with a correction.")}</p>
          </div>
        </div>

        <div className="reviewer-ai-outcome-grid">
          <ReviewerOutcomeStat label={tx("Clean records")} value={autoRowsAll.length} detail={tx("saved with evidence")} />
          <ReviewerOutcomeStat label={tx("Seller fixes")} value={heldRowsAll.length} detail={tx("needs better upload")} />
        </div>

        <div className="reviewer-handled-examples">
          {handledExamples.map((item) => (
            <AgentEvidenceRouteRow key={`${item.item_type}-${item.id}`} item={item} />
          ))}
        </div>
      </aside>
    </section>
  );
}

function ReviewerDecisionCard({
  item,
  language,
  onOpenSeller
}: {
  item: AdminReviewQueue["active_queue"][number];
  language: LanguageCode;
  onOpenSeller: (sellerId: string) => void;
}) {
  const tx = (text: string) => roleText(language, text);
  return (
    <article className={`reviewer-decision-card ${item.risk_level}`}>
      <div className="reviewer-decision-card-main">
        <span>{tx(plainQueueType(item.item_type))} | {item.seller_name}</span>
        <strong>{readableQueueTitle(item)}</strong>
        <p>{plainQueueReason(item)}</p>
      </div>
      <div className="reviewer-decision-card-side">
        <b>{decisionActionLabel(item.suggested_action)}</b>
        <small>{labelize(item.risk_level)} {tx("risk")}</small>
        <button className="admin-ai-row-action" type="button" onClick={() => onOpenSeller(item.seller_id)}>
          {tx("Open")}
        </button>
      </div>
    </article>
  );
}

function ReviewerOutcomeStat({
  label,
  value,
  detail
}: {
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article>
      <strong>{value}</strong>
      <span>{label}</span>
      <p>{detail}</p>
    </article>
  );
}

function plainQueueType(itemType: AdminPrescreenSuggestion["item_type"]) {
  if (itemType === "verification_document") return "Document";
  if (itemType === "listing_draft") return "Product listing";
  if (itemType === "proof_asset") return "Product proof";
  return "Seller approval";
}

function plainQueueReason(item: AdminReviewQueue["active_queue"][number]) {
  if (item.blocker) return item.blocker;
  if (item.risk_level === "high") return "Sarthi found a high-risk signal, so this cannot be cleared automatically.";
  if (item.item_type === "proof_asset") return "Check whether the seller proof really answers the buyer's doubt.";
  if (item.item_type === "verification_document") return "Match the uploaded document with the seller record before approval.";
  if (item.item_type === "listing_draft") return "Make sure the product listing is safe to publish.";
  return "Seller onboarding still needs a final human decision.";
}

function AgentEvidenceRouteRow({ item }: { item: AdminStoredEvidenceItem }) {
  const actionSource = item.asset_url ?? item.product_image_url;
  return (
    <article className={`admin-ai-route-row stored ${item.review_visibility}`}>
      <StoredEvidenceThumb item={item} />
      <div className="admin-ai-route-copy">
        <span>{item.seller_name} | {labelize(item.item_type)}</span>
        <strong>{item.title}</strong>
        <p>{item.triage_label || triageLabel(item.triage_bucket)}</p>
      </div>
      <StatusPill value={storedVisibilityLabel(item.review_visibility)} />
      <EvidenceViewLink value={actionSource} label={item.title} />
    </article>
  );
}

function EvidenceViewLink({ value, label }: { value?: string | null; label: string }) {
  const href = evidenceAssetUrl(value);
  if (!href) {
    return <span className="admin-evidence-view-link muted">No file</span>;
  }
  return (
    <a className="admin-evidence-view-link" href={href} target="_blank" rel="noreferrer" aria-label={`View ${label}`}>
      <ExternalLink size={13} />
      View
    </a>
  );
}

function ReviewerQueueIntelligence({
  queue,
  compact = false
}: {
  queue: AdminReviewQueue;
  compact?: boolean;
}) {
  const triage = adminTriageView(queue);
  const storedRows = storedEvidenceRows(queue);
  const reviewPercent = triage.stored_count
    ? Math.round((triage.reviewer_queue_count / triage.stored_count) * 100)
    : 0;
  const heldCount = storedRows.filter((item) => item.review_visibility === "ai_bypassed").length;
  const autoReviewedCount = storedRows.filter((item) => item.review_visibility === "auto_reviewed").length
    || queue.summary.auto_reviewed_count
    || 0;

  return (
    <section className={`reviewer-routing-strip ${compact ? "compact" : ""}`} aria-label="AI routing summary">
      <div className="reviewer-routing-main">
        <Bot size={compact ? 13 : 15} />
        <div>
          <strong>{triage.reviewer_queue_count} human decision{triage.reviewer_queue_count === 1 ? "" : "s"}</strong>
          <span>{autoReviewedCount} clean records | {heldCount} seller fixes | {storedRows.length} stored</span>
        </div>
      </div>
      <div className="reviewer-routing-meter" aria-label={`${reviewPercent}% of stored items need reviewer work`}>
        <span style={{ width: `${Math.max(4, Math.min(100, reviewPercent))}%` }} />
      </div>
      <div className="reviewer-routing-facts" aria-label="Queue mix">
        <span>{heldCount} seller fixes</span>
        <span>{queue.summary.fast_review_count ?? 0} fast review</span>
      </div>
    </section>
  );
}

function StoredEvidenceDrawer({ queue }: { queue: AdminReviewQueue }) {
  const rows = storedEvidenceRows(queue);
  const aiHeldCount = rows.filter((item) => item.review_visibility === "ai_bypassed").length;
  const autoReviewedCount = rows.filter((item) => item.review_visibility === "auto_reviewed").length
    || queue.summary.auto_reviewed_count
    || 0;
  const visibleRows = rows.slice(0, 10);

  return (
    <details className="reviewer-evidence-drawer">
      <summary>
        <span>Stored evidence</span>
        <strong>{rows.length} docs, proofs, drafts</strong>
        <em>{autoReviewedCount} auto-cleared | {aiHeldCount} sent back | click to inspect</em>
      </summary>
      <div className="reviewer-evidence-lines">
        {visibleRows.map((item) => (
          <StoredEvidenceLine key={`${item.item_type}-${item.id}`} item={item} />
        ))}
      </div>
    </details>
  );
}

function AutomaticReviewedPanel({ queue, compact = false }: { queue: AdminReviewQueue; compact?: boolean }) {
  const rows = storedEvidenceRows(queue);
  const automaticRows = rows.filter((item) => item.review_visibility !== "reviewer_queue");
  const visibleRows = automaticRows.slice(0, compact ? 3 : 6);
  const provider = visibleRows.find((item) => item.agent_provider === "bedrock" || item.agent_provider === "gemini")?.agent_provider
    ?? queue.automation_plan.agent_provider;

  if (!automaticRows.length) return null;

  return (
    <section className={`reviewer-auto-reviewed-panel ${compact ? "compact" : ""}`} aria-label="Automatically reviewed evidence">
      <div className="reviewer-auto-reviewed-head">
        <div>
          <span>Automatic review</span>
          <strong>{automaticRows.length} stored outside manual queue</strong>
          <p>AI pre-checks documents, proof images, listing drafts, and seller records first. Only risky or unclear cases stay in the reviewer queue.</p>
        </div>
        <ProviderPill provider={provider} />
      </div>

      <div className="reviewer-auto-reviewed-grid">
        {visibleRows.map((item) => (
          <AutomaticReviewedRow key={`${item.item_type}-${item.id}`} item={item} />
        ))}
      </div>
    </section>
  );
}

function AutomaticReviewedRow({ item }: { item: AdminStoredEvidenceItem }) {
  const fileUrl = evidenceAssetUrl(item.asset_url) ?? evidenceAssetUrl(item.product_image_url);
  return (
    <article className={`reviewer-auto-reviewed-row ${item.triage_bucket}`}>
      <StoredEvidenceThumb item={item} />
      <div className="reviewer-auto-reviewed-copy">
        <span>{storedVisibilityLabel(item.review_visibility)} | {labelize(item.item_type)}</span>
        <strong>{item.title}</strong>
        <p>{item.seller_name} | {item.triage_reason}</p>
      </div>
      <div className="reviewer-auto-reviewed-meta">
        <b>{item.triage_label || triageLabel(item.triage_bucket)}</b>
        {fileUrl ? (
          <EvidenceActions value={fileUrl} label="Evidence file" compact />
        ) : (
          <em>No file</em>
        )}
      </div>
    </article>
  );
}

function StoredEvidenceLine({ item }: { item: AdminStoredEvidenceItem }) {
  return (
    <details className="reviewer-evidence-line">
      <summary>
        <StoredEvidenceThumb item={item} />
        <div>
          <span>{labelize(item.item_type)} | {storedVisibilityLabel(item.review_visibility)}</span>
          <strong>{item.title}</strong>
          <p>{item.seller_name} | {item.subtitle}</p>
        </div>
        <b>{item.triage_label || triageLabel(item.triage_bucket)}</b>
      </summary>
      <div className="reviewer-evidence-line-body">
        <p>{item.triage_reason}</p>
        <dl>
          <div>
            <dt>Submitted</dt>
            <dd>{formatDate(item.submitted_at)}</dd>
          </div>
          <div>
            <dt>Risk</dt>
            <dd>{labelize(item.risk_level)} {item.risk_score}</dd>
          </div>
          <div>
            <dt>Action</dt>
            <dd>{decisionActionLabel(item.suggested_action)}</dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{item.reference || "Not recorded"}</dd>
          </div>
        </dl>
        {(item.asset_url || item.product_image_url) && (
          <div className="reviewer-evidence-links">
            {item.asset_url && (
              <EvidenceActions value={item.asset_url} label="Stored file" compact />
            )}
            {item.product_image_url && (
              <EvidenceActions value={item.product_image_url} label="Product image" compact />
            )}
          </div>
        )}
      </div>
    </details>
  );
}

function TriagePipelinePanel({
  queue,
  compact = false
}: {
  queue: AdminReviewQueue;
  compact?: boolean;
}) {
  const triage = adminTriageView(queue);
  const storedRows = storedEvidenceRows(queue);
  const visibleRows = storedRows.slice(0, compact ? 4 : 7);
  const activeItems = queue.active_queue.slice(0, compact ? 3 : 5);
  const aiHeldCount = storedRows.filter((item) => item.review_visibility === "ai_bypassed").length;
  const autoReviewedCount = storedRows.filter((item) => item.review_visibility === "auto_reviewed").length
    || queue.summary.auto_reviewed_count
    || 0;

  return (
    <section className={`admin-triage-command ${compact ? "compact" : ""}`} aria-label="AI triage pipeline">
      <div className="admin-triage-head">
        <div className="admin-triage-title">
          <span className="admin-triage-icon">
            <Bot size={17} />
          </span>
          <div>
            <span>Agentic proof pre-check</span>
            <h3>{triage.headline}</h3>
            <p>{triage.summary}</p>
          </div>
        </div>
        <div className="admin-triage-score">
          <strong>{autoReviewedCount}</strong>
          <span>auto-reviewed proofs</span>
        </div>
      </div>

      <div className="admin-triage-pipeline" aria-label="Review pipeline">
        {triage.pipeline.map((step, index) => (
          <article key={step.key}>
            <span>{index + 1}</span>
            <div>
              <strong>{step.count}</strong>
              <p>{step.label}</p>
              <small>{step.detail}</small>
            </div>
          </article>
        ))}
      </div>

      {!compact && (
        <div className="admin-triage-buckets" aria-label="AI bucket counts">
          {triage.buckets.map((bucket) => (
            <article className={triageBucketTone(bucket.key)} key={bucket.key}>
              <span>{bucket.label}</span>
              <strong>{bucket.count}</strong>
              <p>{bucket.detail}</p>
            </article>
          ))}
        </div>
      )}

      <div className="admin-triage-grid">
        <section className="admin-triage-exceptions" aria-label="Reviewer exceptions">
          <div className="admin-triage-section-head">
            <div>
              <span>Human queue</span>
              <strong>{triage.reviewer_queue_count} exceptions</strong>
            </div>
            <em>{REVIEWER_VISIBLE_TRIAGE_BUCKETS.map((bucket) => ADMIN_TRIAGE_LABELS[bucket]).join(" / ")}</em>
          </div>
          {activeItems.length ? (
            <div className="admin-triage-exception-list">
              {activeItems.map((item) => (
                <article key={item.queue_item_id}>
                  <ItemTypeIcon itemType={item.item_type} />
                  <div>
                    <strong>{readableQueueTitle(item)}</strong>
                    <span>{item.triage_reason || item.primary_action}</span>
                  </div>
                  <b>{item.triage_label || triageLabel(item.triage_bucket)}</b>
                </article>
              ))}
            </div>
          ) : (
            <EmptyPanel message="No reviewer exceptions right now." compact />
          )}
        </section>

        <StoredEvidenceVault rows={visibleRows} total={storedRows.length} aiHeldCount={aiHeldCount} />
      </div>
    </section>
  );
}

function StoredEvidenceVault({
  rows,
  total,
  aiHeldCount
}: {
  rows: AdminStoredEvidenceItem[];
  total: number;
  aiHeldCount: number;
}) {
  return (
    <section className="admin-stored-vault" aria-label="Stored evidence vault">
      <div className="admin-triage-section-head">
        <div>
          <span>Stored evidence vault</span>
          <strong>{total} files and submissions</strong>
        </div>
        <em>{aiHeldCount} AI-held</em>
      </div>
      {rows.length ? (
        <div className="admin-stored-list">
          {rows.map((item) => (
            <StoredEvidenceRow key={`${item.item_type}-${item.id}`} item={item} />
          ))}
        </div>
      ) : (
        <EmptyPanel message="No stored evidence found." compact />
      )}
    </section>
  );
}

function StoredEvidenceRow({ item }: { item: AdminStoredEvidenceItem }) {
  return (
    <details className={`admin-stored-row ${item.triage_bucket}`}>
      <summary>
        <StoredEvidenceThumb item={item} />
        <div className="admin-stored-copy">
          <span>{labelize(item.item_type)}</span>
          <strong>{item.title}</strong>
          <p>{item.seller_name} | {item.subtitle}</p>
        </div>
        <div className="admin-stored-meta">
          <b>{item.triage_label || triageLabel(item.triage_bucket)}</b>
          <em>{storedVisibilityLabel(item.review_visibility)}</em>
        </div>
      </summary>
      <div className="admin-stored-body">
        <p>{item.triage_reason}</p>
        <div className="admin-stored-facts">
          <DetailTile label="Submitted" value={formatDate(item.submitted_at)} />
          <DetailTile label="Risk" value={`${labelize(item.risk_level)} ${item.risk_score}`} />
          <DetailTile label="Suggested action" value={decisionActionLabel(item.suggested_action)} />
          <DetailTile label="Reference" value={item.reference || "Not recorded"} />
        </div>
        {(item.asset_url || item.product_image_url) && (
          <div className="admin-stored-files">
            {item.asset_url && (
              <span>
                <FileText size={13} />
                <EvidenceActions value={item.asset_url} label="Stored file" compact />
              </span>
            )}
            {item.product_image_url && (
              <span>
                <ImageIcon size={13} />
                <EvidenceActions value={item.product_image_url} label="Product image" compact />
              </span>
            )}
          </div>
        )}
      </div>
    </details>
  );
}

function StoredEvidenceThumb({ item }: { item: AdminStoredEvidenceItem }) {
  const imageUrl = isRenderableImage(item.product_image_url)
    ? evidenceAssetUrl(item.product_image_url)
    : isRenderableImage(item.asset_url)
      ? evidenceAssetUrl(item.asset_url)
      : null;
  if (imageUrl) {
    return (
      <span className="admin-stored-thumb">
        <img src={imageUrl} alt="" />
      </span>
    );
  }
  return (
    <span className="admin-stored-thumb empty">
      <ItemTypeIcon itemType={item.item_type} />
    </span>
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
  const caseFile = item.case_file ?? null;
  return (
    <article className={`admin-priority-card ${item.sla_state}`}>
      <ItemTypeIcon itemType={item.item_type} />
      <div className="admin-priority-copy">
        <strong>{title}</strong>
        <span>{subtitle}</span>
        <small>{item.primary_action}</small>
        {caseFile && (
          <div className="admin-case-mini-row" aria-label="Case file summary">
            <em>{caseFile.evidence_conflicts.length} conflict{caseFile.evidence_conflicts.length === 1 ? "" : "s"}</em>
            <em>{caseFile.evidence_missing.length} gap{caseFile.evidence_missing.length === 1 ? "" : "s"}</em>
            <em>{caseFile.seller_tasks.length} task{caseFile.seller_tasks.length === 1 ? "" : "s"}</em>
          </div>
        )}
        <div className="admin-priority-impact">
          <span>{item.buyer_impact}</span>
          <strong>{queueTrustLiftLabel(item)}</strong>
        </div>
      </div>
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

function TrustOpsSummaryPanel({ queue }: { queue: AdminReviewQueue }) {
  return (
    <section className="admin-trustops-panel" aria-label="TrustOps copilot summary">
      <div className="admin-trustops-head">
        <div>
          <span>Closed-loop TrustOps</span>
          <strong>{queue.trust_ops.headline}</strong>
          <p>{queue.trust_ops.summary}</p>
        </div>
        <b>{queue.trust_ops.impact_points_waiting} trust pts</b>
      </div>

      <div className="admin-trustops-lanes">
        {queue.trust_ops.lanes.map((lane) => (
          <article key={lane.key}>
            <span>{lane.label}</span>
            <strong>{lane.count}</strong>
            <p>{lane.detail}</p>
          </article>
        ))}
      </div>

      <div className="admin-trustops-guard">
        <ShieldCheck size={15} />
        <span>{queue.trust_ops.guardrails[0]}</span>
      </div>

      {queue.trust_ops.top_cases.length > 0 && (
        <div className="admin-trustops-topcases" aria-label="Top TrustOps cases">
          {queue.trust_ops.top_cases.slice(0, 3).map((item) => (
            <div key={item.queue_item_id}>
              <strong>{item.seller_name}</strong>
              <span>{item.trigger}</span>
              <em>{item.conflicts} conflict{item.conflicts === 1 ? "" : "s"} | +{item.trust_impact_points} trust</em>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function PolicyBrainView({ queue }: { queue: AdminReviewQueue }) {
  const prescreens = collectPrescreens(queue);
  const checkCounts = countPrescreenChecks(prescreens);
  const staleSources = queue.source_health.sources.filter((source) => source.effective_status !== "operational" || !source.fresh);
  const aiChecks = prescreens.filter((prescreen) => ["bedrock", "gemini"].includes(prescreen.agent_provider)).length;
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
    <section className="admin-policy-view admin-clean-mode">
      <div className="admin-policy-metrics">
        <PolicyMetric label="Source health" value={labelize(queue.source_health.overall_status)} tone={queue.source_health.blocking ? "bad" : staleSources.length ? "warn" : "good"} />
        <PolicyMetric label="Needs attention" value={String(checkCounts.warn + checkCounts.fail)} tone={checkCounts.fail ? "bad" : checkCounts.warn ? "warn" : "good"} />
        <PolicyMetric label="AI prescreens" value={String(aiChecks)} tone={aiChecks ? "good" : "warn"} />
      </div>

      <RiskOperationsBoard queue={queue} gates={policyGates} />
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

function RiskOperationsBoard({
  queue,
  gates
}: {
  queue: AdminReviewQueue;
  gates: ReadonlyArray<{ label: string; status: "pass" | "warn" | "fail"; detail: string }>;
}) {
  const priorityItems = [...queue.active_queue]
    .sort((a, b) => {
      const routeDelta = Number(b.route_to === "senior_reviewer") - Number(a.route_to === "senior_reviewer");
      if (routeDelta !== 0) return routeDelta;
      const slaDelta = Number(b.sla_state === "breached") - Number(a.sla_state === "breached");
      if (slaDelta !== 0) return slaDelta;
      return b.risk_score - a.risk_score;
    })
    .slice(0, 3);
  const allCheckRows = buildRiskCheckRows(queue);
  const checkRows = allCheckRows.slice(0, 2);
  const gateIssues = gates.filter((gate) => gate.status !== "pass").length;
  const visibleGates = gateIssues
    ? gates.filter((gate) => gate.status !== "pass").slice(0, 3)
    : gates.slice(0, 2);
  const sourceIssues = queue.source_health.sources.filter((source) => source.effective_status !== "operational" || !source.fresh).length;
  const topRisk = priorityItems[0] ?? null;
  const proofIssues = allCheckRows.filter((row) => row.itemType === "proof_asset").length;
  const sellerIssues = allCheckRows.filter((row) => row.itemType !== "proof_asset").length;
  const seniorCount = queue.active_queue.filter((item) => item.route_to === "senior_reviewer" || item.risk_level === "high").length;

  return (
    <div className="reviewer-risk-explainer">
      <section className="reviewer-risk-overview" aria-label="Risk overview">
        <RiskSummaryCard label="Proof to inspect" value={proofIssues} detail="photo, proof, or catalog mismatch" tone={proofIssues ? "bad" : "good"} />
        <RiskSummaryCard label="Seller records" value={sellerIssues} detail="documents, KYC, or listing checks" tone={sellerIssues ? "warn" : "good"} />
        <RiskSummaryCard label="Needs human" value={seniorCount} detail="high-risk or escalated cases" tone={seniorCount ? "bad" : "good"} />
        <RiskSummaryCard label="Source checks" value={sourceIssues ? sourceIssues : queue.source_health.sources.length} detail={sourceIssues ? "needs attention" : "fresh enough"} tone={sourceIssues ? "warn" : "good"} />
      </section>

      <section className="reviewer-risk-main">
        <div className="reviewer-risk-primary">
          <div className="reviewer-plain-head">
            <div>
              <span>Open first</span>
              <h3>{topRisk ? readableQueueTitle(topRisk) : "No risky case is waiting"}</h3>
            <p>{topRisk ? plainQueueReason(topRisk) : "Sarthi did not find a priority blocker in the current queue."}</p>
          </div>
          {topRisk && <b>{topRisk.risk_score}</b>}
        </div>
        {topRisk && (
          <div className="reviewer-risk-primary-meta">
            <span>{plainQueueType(topRisk.item_type)}</span>
            <span>{topRisk.seller_name}</span>
            <span>{labelize(topRisk.sla_state)}</span>
          </div>
        )}
      </div>

        <div className="reviewer-risk-reasons">
          <div className="reviewer-plain-head compact">
            <div>
              <span>Why automatic approval stopped</span>
              <h3>{allCheckRows.length} check{allCheckRows.length === 1 ? "" : "s"} need attention</h3>
              <p>Only the clearest blockers are shown here. The full evidence stays in the Review tab.</p>
            </div>
          </div>
          <div className="reviewer-risk-reason-list">
            {checkRows.length ? checkRows.map((row) => (
              <RiskPlainCheckRow key={row.id} row={row} />
            )) : <EmptyPanel message="No failed or warning checks found." compact />}
          </div>
        </div>
      </section>

      <section className="reviewer-risk-gates">
        <div className="reviewer-plain-head compact">
          <div>
            <span>Safety rules</span>
            <h3>What Sarthi is not allowed to auto-clear</h3>
          </div>
        </div>
        <div className="reviewer-risk-gate-list">
          {visibleGates.map((gate) => (
            <RiskPlainGate key={gate.label} gate={gate} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RiskSummaryCard({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: number;
  detail: string;
  tone: "good" | "warn" | "bad";
}) {
  return (
    <article className={`reviewer-risk-summary-card ${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
      <p>{detail}</p>
    </article>
  );
}

type AdminRiskCheckRow = {
  id: string;
  itemType: AdminPrescreenSuggestion["item_type"];
  sellerName: string;
  title: string;
  label: string;
  detail: string;
  status: "warn" | "fail";
  provider: AdminPrescreenSuggestion["agent_provider"];
};

function RiskPlainCheckRow({ row }: { row: AdminRiskCheckRow }) {
  return (
    <article className={`reviewer-risk-reason ${row.status}`}>
      <span>{plainQueueType(row.itemType)}</span>
      <div>
        <strong>{row.label}</strong>
          <p>{row.sellerName} | {row.label}: {row.detail}</p>
      </div>
    </article>
  );
}

function RiskPlainGate({
  gate
}: {
  gate: { label: string; status: "pass" | "warn" | "fail"; detail: string };
}) {
  return (
    <article className={`reviewer-risk-gate ${gate.status}`}>
      {gate.status === "pass" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      <div>
        <strong>{gate.label}</strong>
        <p>{gate.detail}</p>
      </div>
    </article>
  );
}

function buildRiskCheckRows(queue: AdminReviewQueue): AdminRiskCheckRow[] {
  const rows: AdminRiskCheckRow[] = [];
  const addChecks = ({
    id,
    itemType,
    sellerName,
    title,
    prescreen
  }: {
    id: string;
    itemType: AdminPrescreenSuggestion["item_type"];
    sellerName: string;
    title: string;
    prescreen: AdminPrescreenSuggestion;
  }) => {
    prescreen.checks
      .filter((check) => check.status === "fail" || check.status === "warn")
      .forEach((check, index) => {
        const status = check.status === "fail" ? "fail" : "warn";
        rows.push({
          id: `${id}-${check.status}-${index}`,
          itemType,
          sellerName,
          title,
          label: check.label,
          detail: check.detail,
          status,
          provider: prescreen.agent_provider
        });
      });
  };

  queue.seller_applications.forEach((item) => addChecks({
    id: item.application_id,
    itemType: "seller_application",
    sellerName: item.seller_name,
    title: item.business_name || item.seller_name,
    prescreen: item.prescreen
  }));
  queue.documents.forEach((item) => addChecks({
    id: item.document_id,
    itemType: "verification_document",
    sellerName: item.seller_name,
    title: labelize(item.document_type),
    prescreen: item.prescreen
  }));
  queue.listing_drafts.forEach((item) => addChecks({
    id: item.draft_id,
    itemType: "listing_draft",
    sellerName: item.seller_name,
    title: item.title,
    prescreen: item.prescreen
  }));
  queue.proof_assets.forEach((item) => addChecks({
    id: item.proof_id,
    itemType: "proof_asset",
    sellerName: item.seller_name,
    title: item.product_title || item.title,
    prescreen: item.prescreen
  }));

  return rows.sort((a, b) => {
    const statusDelta = Number(b.status === "fail") - Number(a.status === "fail");
    if (statusDelta !== 0) return statusDelta;
    return a.sellerName.localeCompare(b.sellerName);
  });
}

function ImpactView({ queue }: { queue: AdminReviewQueue }) {
  const prescreens = collectPrescreens(queue);
  const checkCounts = countPrescreenChecks(prescreens);
  const totalChecks = checkCounts.pass + checkCounts.warn + checkCounts.fail;
  const storedRows = storedEvidenceRows(queue);
  const autoRows = storedRows.filter((item) => item.review_visibility === "auto_reviewed");
  const heldRows = storedRows.filter((item) => item.review_visibility === "ai_bypassed");

  return (
    <section className="admin-impact-view admin-clean-mode">
      <div className="admin-impact-grid">
        <ImpactMetric label="Checked by Sarthi" value={totalChecks} detail="signals" />
        <ImpactMetric label="Clean records" value={autoRows.length || queue.summary.auto_reviewed_count || 0} detail="stored" />
        <ImpactMetric label="Seller fixes" value={heldRows.length} detail="returned" />
        <ImpactMetric label="Trust change" value={queue.summary.trust_lift_pending} detail="points pending" />
      </div>

      <SavedWorkLedger queue={queue} />

      <div className="admin-saved-bottom-grid">
        <SavedHumanWorkList queue={queue} />
        <SavedGuardrailList queue={queue} />
      </div>
    </section>
  );
}

type SavedLedgerEntry = {
  key: string;
  label: string;
  count: number;
  detail: string;
  items: Array<{
    id: string;
    title: string;
    meta: string;
    file?: string | null;
  }>;
};

function SavedWorkLedger({ queue }: { queue: AdminReviewQueue }) {
  const storedRows = storedEvidenceRows(queue);
  const autoRows = storedRows.filter((item) => item.review_visibility === "auto_reviewed");
  const heldRows = storedRows.filter((item) => item.review_visibility === "ai_bypassed");
  const reusableRows = storedRows.filter((item) => item.triage_bucket === "reuse_standard");
  const fastRows = queue.active_queue.filter((item) => item.confidence === "high" && item.route_to === "standard_review").slice(0, 3);
  const ledger: SavedLedgerEntry[] = [
    {
      key: "auto",
      label: "Clean evidence stored",
      count: autoRows.length || queue.summary.auto_reviewed_count || 0,
      detail: "Proof and document uploads that passed checks stay openable for audit.",
      items: autoRows.slice(0, 2).map((item) => savedEvidenceLedgerItem(item))
    },
    {
      key: "held",
      label: "Returned to seller",
      count: heldRows.length,
      detail: "Weak or incomplete uploads do not reach reviewers until the seller fixes them.",
      items: heldRows.slice(0, 2).map((item) => savedEvidenceLedgerItem(item))
    },
    {
      key: "reuse",
      label: "Reusable proof records",
      count: queue.summary.reusable_standard_count || reusableRows.length,
      detail: "Accepted proof can answer repeated buyer doubts without another review.",
      items: reusableRows.slice(0, 2).map((item) => savedEvidenceLedgerItem(item))
    },
    {
      key: "fast",
      label: "Ready for quick review",
      count: queue.summary.fast_review_count || fastRows.length,
      detail: "Low-risk items are pre-read so the reviewer only checks the final decision.",
      items: fastRows.slice(0, 2).map((item) => ({
        id: item.queue_item_id,
        title: readableQueueTitle(item),
        meta: `${item.seller_name} | ${item.triage_label || item.primary_action}`
      }))
    }
  ].filter((entry) => entry.count > 0 || entry.items.length > 0);

  return (
    <section className="admin-saved-ledger">
      <div className="admin-clean-panel-head">
        <div>
          <h3>What Sarthi already handled</h3>
          <p>Every stored proof or document remains visible. Nothing disappears from the audit trail.</p>
        </div>
        <span>{queue.summary.stored_evidence_count || storedRows.length}</span>
      </div>
      <div className="admin-saved-ledger-list">
        {ledger.map((entry) => (
          <SavedLedgerRow key={entry.key} entry={entry} />
        ))}
      </div>
    </section>
  );
}

function SavedHumanWorkList({ queue }: { queue: AdminReviewQueue }) {
  const visible = queue.active_queue.slice(0, 3);
  return (
    <section className="admin-clean-list-panel reviewer-saved-human-panel">
      <div className="admin-clean-panel-head">
        <div>
          <h3>Still needs a person</h3>
          <p>Only unclear or risky requests stay in the reviewer queue.</p>
        </div>
        <span>{queue.active_queue.length}</span>
      </div>
      <div className="reviewer-saved-human-list">
        {visible.length ? visible.map((item) => (
          <article key={item.queue_item_id} className={`reviewer-saved-human-row ${item.risk_level}`}>
            <div>
              <span>{plainQueueType(item.item_type)} | {item.seller_name}</span>
              <strong>{readableQueueTitle(item)}</strong>
              <p>{plainQueueReason(item)}</p>
            </div>
            <b>{item.risk_score}</b>
          </article>
        )) : <EmptyPanel message="No manual decisions are waiting." compact />}
      </div>
    </section>
  );
}

function SavedGuardrailList({ queue }: { queue: AdminReviewQueue }) {
  const rows = [
    {
      label: "Senior review",
      value: queue.summary.senior_routed,
      detail: "High-risk cases cannot auto-clear.",
      icon: <ShieldAlert size={18} />,
      tone: "red"
    },
    {
      label: "Blocked items",
      value: queue.summary.blocked_items,
      detail: "Missing or conflicting evidence stays visible.",
      icon: <AlertTriangle size={18} />,
      tone: "amber"
    },
    {
      label: "Buyer proof waits",
      value: queue.summary.buyer_requests_waiting,
      detail: "Open buyer doubts stay attached to the product.",
      icon: <FileText size={18} />,
      tone: "indigo"
    },
    {
      label: "SLA misses",
      value: queue.summary.breached_sla_count,
      detail: "Overdue cases remain easy to spot.",
      icon: <Clock size={18} />,
      tone: "rose"
    }
  ];

  return (
    <section className="admin-clean-list-panel reviewer-saved-guardrail-panel">
      <div className="admin-clean-panel-head">
        <div>
          <h3>Safety rules kept</h3>
          <p>Sarthi can assist, but these cases remain accountable.</p>
        </div>
      </div>
      <div className="reviewer-saved-guardrail-grid">
        {rows.map((row) => (
          <article key={row.label} className={`reviewer-saved-guardrail-card ${row.tone} ${row.value > 0 ? "has-count" : "zero-count"}`}>
            <div className="guardrail-card-icon">{row.icon}</div>
            <div className="guardrail-card-body">
              <strong>{row.label}</strong>
              <p>{row.detail}</p>
            </div>
            <span className="guardrail-card-badge">{row.value}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

function savedEvidenceLedgerItem(item: AdminStoredEvidenceItem) {
  return {
    id: `${item.item_type}-${item.id}`,
    title: item.title,
    meta: `${item.seller_name} | ${item.triage_label || storedVisibilityLabel(item.review_visibility)}`,
    file: item.asset_url ?? item.product_image_url
  };
}

function SavedLedgerRow({ entry }: { entry: SavedLedgerEntry }) {
  return (
    <article className="admin-saved-ledger-row">
      <div className="admin-saved-ledger-count">
        <strong>{entry.count}</strong>
      </div>
      <div className="admin-saved-ledger-copy">
        <span>{entry.label}</span>
        <p>{entry.detail}</p>
        {entry.items.length > 0 && (
          <div className="admin-saved-ledger-samples">
            {entry.items.map((item) => (
              <div key={item.id} className="admin-saved-ledger-sample">
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.meta}</span>
                </div>
                {item.file && <EvidenceViewLink value={item.file} label={item.title} />}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
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
  onRunAction,
  onOpenQueue,
  copy
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
  onOpenQueue: (targetId?: string | null) => void;
  copy: AdminReviewerCopy;
}) {
  const [lane, setLane] = useState<SellerLaneId>("needs_decision");
  const lanes = useMemo(() => buildSellerLanes(queue), [queue]);
  const recommendedSellerId = queue.automation_plan.first_queue_item_id
    ? queue.active_queue.find((item) => item.queue_item_id === queue.automation_plan.first_queue_item_id)?.seller_id ?? null
    : null;
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
    <>
      <section className="seller-report-layout">
      <aside className="seller-report-list-panel">
        <div className="seller-report-panel-head">
          <div>
            <h3>{copy.sellerQueueTitle}</h3>
            <p>{copy.sellerQueueBody}</p>
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
              <span>{copy.laneLabels[item.id] ?? item.label}</span>
              <em>{item.count}</em>
            </button>
          ))}
        </div>

        <label className="seller-report-search" aria-label="Search seller reports">
          <Search size={15} />
          <input
            value={sellerSearch}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={copy.sellerSearchPlaceholder}
          />
        </label>

        {clearedSellerCount > 0 && (
          <p className="seller-cleared-note">
            {copy.clearedSellerNote(clearedSellerCount)}
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
                recommended={seller.seller_id === recommendedSellerId}
                onSelect={() => onSelectSeller(seller.seller_id)}
              />
            ))
          ) : (
            <EmptyPanel message={copy.noSellerMatches} compact />
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
            onOpenQueue={onOpenQueue}
            copy={copy}
          />
        ) : (
          <EmptyPanel message={copy.selectSellerReport} />
        )}
      </section>
      </section>
    </>
  );
}

function SellerReportDetail({
  report,
  notes,
  busyAction,
  onNoteChange,
  onRunAction,
  onOpenQueue,
  copy
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
  onOpenQueue: (targetId?: string | null) => void;
  copy: AdminReviewerCopy;
}) {
  const seller = report.seller;
  const firstActionTargetId = useMemo(() => {
    const firstAction = buildSellerPacketItems(report).find((item) => item.readyForReview);
    return firstAction ? sellerPacketTargetId(firstAction) : null;
  }, [report]);
  const primaryBlockerLabel = seller.pending_documents.length
    ? "Review documents"
    : seller.submitted_proof_count > 0
      ? "Review proofs"
      : seller.submitted_draft_count > 0
        ? "Review listings"
        : seller.open_review_items > 0
          ? "Open queue"
          : null;

  return (
    <div className="seller-report-detail-stack">
      <section className="seller-selected-summary-card reviewer-seller-context">
        <div>
          <span>{copy.activeSeller}</span>
          <h3>{seller.seller_name}</h3>
          <p>
            {seller.pending_documents.length
              ? copy.sellerApprovalBlocked
              : seller.open_review_items > 0
                ? seller.next_action
                : copy.noActionNeeded}
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
          {primaryBlockerLabel && (
            <button className="reviewer-open-queue-button" type="button" onClick={() => onOpenQueue(firstActionTargetId)}>
              {primaryBlockerLabel}
            </button>
          )}
        </div>
      </section>

      <SellerBlockerOverview report={report} onOpenQueue={onOpenQueue} copy={copy} />

    </div>
  );
}

function SellerBlockerOverview({
  report,
  onOpenQueue,
  copy
}: {
  report: SellerReport;
  onOpenQueue: (targetId?: string | null) => void;
  copy: AdminReviewerCopy;
}) {
  const packetItems = useMemo(() => buildSellerPacketItems(report), [report]);
  const actionItems = useMemo(() => packetItems.filter((item) => item.readyForReview), [packetItems]);
  const counts = useMemo(
    () => ({
      documents: actionItems.filter((item) => item.kind === "document").length,
      proofs: actionItems.filter((item) => item.kind === "proof").length,
      listings: actionItems.filter((item) => item.kind === "draft").length,
      seller: actionItems.filter((item) => item.kind === "application").length
    }),
    [actionItems]
  );
  const visibleItems = actionItems.slice(0, 5);
  const firstTargetId = visibleItems[0] ? sellerPacketTargetId(visibleItems[0]) : null;

  return (
    <section className="seller-blocker-overview" aria-label="Seller blocker summary">
      <div className="seller-blocker-overview-head">
        <div>
          <h3>{actionItems.length ? "What needs review" : copy.noActionNeeded}</h3>
          <p>{actionItems.length ? "Use Queue for evidence, open/download, approve, and reject." : copy.completedKeptInHistory}</p>
        </div>
        <button className="reviewer-open-queue-button" type="button" onClick={() => onOpenQueue(firstTargetId)}>
          Open review queue
        </button>
      </div>

      <div className="seller-blocker-stat-grid" aria-label="Seller blockers by type">
        <SellerBlockerStat label="Documents" value={counts.documents} tone={counts.documents ? "warn" : "ok"} />
        <SellerBlockerStat label="Proofs" value={counts.proofs} tone={counts.proofs ? "warn" : "ok"} />
        <SellerBlockerStat label="Listings" value={counts.listings} tone={counts.listings ? "warn" : "ok"} />
        <SellerBlockerStat label="Seller" value={counts.seller} tone={counts.seller ? "warn" : "ok"} />
      </div>

      {visibleItems.length ? (
        <div className="seller-blocker-row-list">
          {visibleItems.map((item) => {
            const checks = uploadCheckSummary(item.prescreen);
            return (
              <button className="seller-blocker-row" key={item.id} type="button" onClick={() => onOpenQueue(sellerPacketTargetId(item))}>
                <span className="seller-blocker-row-icon">
                  <ItemTypeIcon itemType={packetKindToItemType(item.kind)} />
                </span>
                <span className="seller-blocker-row-copy">
                  <span>{packetActionLabel(item.kind)}</span>
                  <strong>{item.title}</strong>
                  <em>{item.subtitle}</em>
                </span>
                <span className="seller-blocker-row-meta">
                  <StatusPill value={item.status} />
                  <span className={`seller-upload-check ${checks.tone}`}>{checks.label}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="seller-packet-clear-state">
          <CheckCircle2 size={18} />
          <div>
            <strong>{copy.noActionNeeded}</strong>
            <span>{copy.completedKeptInHistory}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function SellerBlockerStat({ label, value, tone }: { label: string; value: number; tone: "ok" | "warn" }) {
  return (
    <article className={`seller-blocker-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function packetActionLabel(kind: SellerPacketItem["kind"]) {
  if (kind === "document") return "Check document";
  if (kind === "proof") return "Check proof";
  if (kind === "draft") return "Check listing";
  return "Check seller";
}

function sellerPacketTargetId(item: SellerPacketItem) {
  if (item.kind === "application") return item.item.application_id;
  if (item.kind === "document") return item.item.document_id;
  if (item.kind === "draft") return item.item.draft_id;
  return item.item.proof_id;
}

function SellerPacketReview({
  report,
  notes,
  busyAction,
  onNoteChange,
  onRunAction,
  copy
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
  copy: AdminReviewerCopy;
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
  const historyGroups = buildPacketGroups(historyItems);

  return (
    <section className="seller-packet-layout">
      <div className="seller-packet-list-panel">
        <div className="seller-packet-head">
          <div>
            <h3>{copy.nextCaseTitle}</h3>
            <p>{actionItems.length ? copy.openBlockersForSeller(actionItems.length) : copy.nothingNeedsReviewerAction}</p>
          </div>
          <span>{actionItems.length}</span>
        </div>

        {actionItems.length ? (
          <SellerPacketFocusQueue
            items={actionItems}
            selectedPacketId={selectedPacketId}
            onSelect={setSelectedPacketId}
            copy={copy}
          />
        ) : (
          <div className="seller-packet-clear-state">
            <CheckCircle2 size={18} />
            <div>
              <strong>{copy.noActionNeeded}</strong>
              <span>{copy.completedKeptInHistory}</span>
            </div>
          </div>
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
            copy={copy}
          />
        </aside>
      )}

      {historyItems.length > 0 && (
        <details className="seller-packet-history seller-packet-history-secondary">
          <summary>
            <span>{copy.history}</span>
            <em>{historyItems.length}</em>
          </summary>
          <SellerPacketGroups groups={historyGroups} selectedPacketId={selectedPacketId} onSelect={setSelectedPacketId} />
        </details>
      )}
    </section>
  );
}

function SellerPacketFocusQueue({
  items,
  selectedPacketId,
  onSelect,
  copy
}: {
  items: SellerPacketItem[];
  selectedPacketId: string | null;
  onSelect: (id: string) => void;
  copy: AdminReviewerCopy;
}) {
  const activeItem = items.find((item) => item.id === selectedPacketId) ?? items[0];
  const otherItems = items.filter((item) => item.id !== activeItem?.id);

  if (!activeItem) return null;

  return (
    <div className="seller-next-decision-focus">
      <SellerPacketFocusCard item={activeItem} selected onSelect={() => onSelect(activeItem.id)} />

      {otherItems.length > 0 && (
        <details className="seller-next-more">
          <summary>
            <span>{copy.moreBlockersLabel(otherItems.length)}</span>
            <em>{copy.reviewLater}</em>
          </summary>
          <div className="seller-next-more-list">
            {otherItems.map((item) => (
              <SellerPacketFocusCard key={item.id} item={item} onSelect={() => onSelect(item.id)} />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SellerPacketFocusCard({
  item,
  selected = false,
  onSelect
}: {
  item: SellerPacketItem;
  selected?: boolean;
  onSelect: () => void;
}) {
  const checks = uploadCheckSummary(item.prescreen);
  const primaryCta = item.kind === "document"
    ? "Check document"
    : item.kind === "draft"
      ? "Check listing"
      : item.kind === "proof"
        ? "Check proof"
        : "Check seller";

  return (
    <button className={`seller-next-focus-card ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <span className="seller-next-focus-icon">
        <ItemTypeIcon itemType={packetKindToItemType(item.kind)} />
      </span>
      <span className="seller-next-focus-copy">
        <span>{primaryCta}</span>
        <strong>{item.title}</strong>
        <em>{item.subtitle}</em>
      </span>
      <span className="seller-next-focus-status">
        <StatusPill value={item.status} />
        <span className={`seller-upload-check ${checks.tone}`}>{checks.label}</span>
      </span>
    </button>
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
        {item.queueItem && <span className="seller-upload-check impact">{queueTrustLiftLabel(item.queueItem)}</span>}
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
  onRunAction,
  copy
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
  copy: AdminReviewerCopy;
}) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => keepReviewerEvidenceBelowHeader());
    const shortDelay = window.setTimeout(() => keepReviewerEvidenceBelowHeader(), 80);
    const settledDelay = window.setTimeout(() => keepReviewerEvidenceBelowHeader(), 240);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(shortDelay);
      window.clearTimeout(settledDelay);
    };
  }, [item.id]);

  return (
    <div className="seller-packet-selected-stack">
      <div className="seller-packet-selected-head">
        <div>
          <span>{copy.selectedCase} | {item.group}</span>
          <h3>{item.title}</h3>
          <p>{item.readyForReview ? copy.reviewEvidenceAndDecide : copy.noActionNeededNow}</p>
        </div>
        <StatusPill value={item.status} />
      </div>

      <ReviewerCaseBrief item={item} />

      <AdminEvidenceReview item={item} seller={report.seller} />

      {item.kind === "application" && (
        <SellerApplicationCard
          application={item.item}
          seller={report.seller}
          hideHeader
          showPrescreen={false}
          showDetails={false}
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
          hideHeader
          showPrescreen={false}
          showDetails={false}
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
          hideHeader
          showPrescreen={false}
          showDetails={false}
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
          hideHeader
          showPrescreen={false}
          showDetails={false}
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

      <details className="reviewer-secondary-proof">
        <summary>
          <span>{copy.fullAuditTrail}</span>
          <em>{copy.auditTrailHint}</em>
        </summary>
        <DecisionBrief prescreen={item.prescreen} readyForReview={item.readyForReview} queueItem={item.queueItem} />
        <ReviewerCopilotBrief prescreen={item.prescreen} readyForReview={item.readyForReview} queueItem={item.queueItem} />
        <AdminCaseFilePanel caseFile={item.queueItem?.case_file} />
        <ReviewActionChecklist item={item} />
      </details>
    </div>
  );
}

function ReviewerCaseBrief({ item }: { item: SellerPacketItem }) {
  const concern = primaryReviewConcern(item);
  const support = primaryReviewSupport(item);
  const failedChecks = item.prescreen.checks.filter((check) => check.status === "fail").length;
  const warningChecks = item.prescreen.checks.filter((check) => check.status === "warn").length;
  const checkText = failedChecks
    ? `${failedChecks} failed`
    : warningChecks
      ? `${warningChecks} warning${warningChecks === 1 ? "" : "s"}`
      : "Checks passed";
  const routeText = item.prescreen.route_to === "senior_reviewer" ? "Senior review" : "Standard review";
  const buyerImpact = item.queueItem?.buyer_impact ?? item.prescreen.learn;

  return (
    <section className="reviewer-case-brief" aria-label="AI pre-check summary">
      <div className="reviewer-case-brief-head">
        <div className="reviewer-case-brief-title">
          <span className="reviewer-case-brief-icon">
            <Bot size={15} />
          </span>
          <div>
            <span>{providerText(item.prescreen.agent_provider)}</span>
            <strong>{item.readyForReview ? reviewItemActionLabel(item) : "Stored for audit"}</strong>
          </div>
        </div>
        <ProviderPill provider={item.prescreen.agent_provider} />
      </div>

      <div className="reviewer-case-brief-grid">
        <article>
          <span>Why this is here</span>
          <strong>{concern.label}</strong>
          <p>{concern.detail}</p>
        </article>
        <article>
          <span>Evidence signal</span>
          <strong>{support.label}</strong>
          <p>{support.detail}</p>
        </article>
        <article>
          <span>Reviewer action</span>
          <strong>{routeText}</strong>
          <p>{buyerImpact}</p>
        </article>
      </div>

      <div className="reviewer-case-brief-foot">
        <span className={failedChecks ? "bad" : warningChecks ? "warn" : "good"}>{checkText}</span>
        <span>{labelize(item.prescreen.confidence)} confidence</span>
        <span>{item.queueItem ? queueSlaLabel(item.queueItem) : item.readyForReview ? "Review now" : "No action"}</span>
      </div>
    </section>
  );
}

function ReviewerDecisionMap({ item, copy }: { item: SellerPacketItem; copy: AdminReviewerCopy }) {
  const evidence = evidenceReviewHeading(item);
  const finalAction = item.readyForReview ? reviewItemActionLabel(item) : copy.noActionNeeded;

  return (
    <section className="reviewer-decision-map" aria-label="Reviewer decision path">
      <div>
        <Bot size={16} />
        <span>{copy.decisionMapObserve}</span>
        <strong>{finalAction}</strong>
      </div>
      <div>
        <FileCheck2 size={16} />
        <span>{copy.decisionMapCheck}</span>
        <strong>{evidence.title}</strong>
      </div>
      <div>
        <ShieldCheck size={16} />
        <span>{copy.decisionMapAct}</span>
        <strong>{copy.decisionMapGuardrail}</strong>
      </div>
    </section>
  );
}

function keepReviewerEvidenceBelowHeader() {
  const header = document.querySelector(".web-header");
  const evidence = document.querySelector(".admin-evidence-review-panel");
  if (!header || !evidence) return;

  const headerBottom = header.getBoundingClientRect().bottom;
  const evidenceTop = evidence.getBoundingClientRect().top;
  const targetTop = headerBottom + 16;
  if (evidenceTop >= targetTop) return;

  window.scrollBy({
    top: evidenceTop - targetTop,
    left: 0,
    behavior: "auto"
  });
}

function AdminWorkOrder({ item }: { item: SellerPacketItem }) {
  const caseFile = item.queueItem?.case_file ?? null;
  const failedChecks = item.prescreen.checks.filter((check) => check.status === "fail");
  const warningChecks = item.prescreen.checks.filter((check) => check.status === "warn");
  const passedChecks = item.prescreen.checks.filter((check) => check.status === "pass").length;
  const totalChecks = item.prescreen.checks.length || 0;
  const tone = decisionBriefTone(item.prescreen, failedChecks.length, warningChecks.length);
  const queueItem = item.queueItem;
  const nextScore = caseFile?.score_simulation.next_if_approved ?? null;
  const currentScore = caseFile?.score_simulation.current_score ?? null;
  const trustChange = currentScore != null && nextScore != null
    ? `${currentScore} -> ${nextScore}`
    : queueItem
      ? queueTrustLiftLabel(queueItem)
      : "No active lift";
  const concern = primaryReviewConcern(item);
  const support = primaryReviewSupport(item);
  const confidenceText = `${labelize(item.prescreen.confidence)} confidence`;
  const routeText = item.prescreen.route_to === "senior_reviewer" ? "Senior reviewer" : "Standard reviewer";
  const scoreText = caseFile?.score_simulation.buyer_label_after_approval ?? queueItem?.buyer_impact ?? item.prescreen.learn;

  return (
    <section className={`admin-work-order admin-decision-brief-v2 ${tone}`} aria-label="AI reviewer brief">
      <div className="admin-work-order-head">
        <div>
          <span>Sarthi pre-read</span>
          <strong>{reviewItemActionLabel(item)}</strong>
          <p>{caseFile?.recommendation.why ?? item.prescreen.reason}</p>
        </div>
        <ProviderPill provider={item.prescreen.agent_provider} />
      </div>

      <div className="admin-ai-summary-grid" aria-label="Decision summary">
        <article className="admin-ai-summary-card primary">
          <span>Reviewer should check</span>
          <strong>{concern.label}</strong>
          <p>{concern.detail}</p>
        </article>
        <article className="admin-ai-summary-card">
          <span>Evidence support</span>
          <strong>{support.label}</strong>
          <p>{support.detail}</p>
        </article>
        <article className="admin-ai-summary-card">
          <span>Buyer trust change</span>
          <strong>{trustChange}</strong>
          <p>{scoreText}</p>
        </article>
      </div>

      <div className="admin-ai-status-row" aria-label="AI routing and checks">
        <span className={tone}>{confidenceText}</span>
        <span>{routeText}</span>
        <span>{passedChecks}/{totalChecks || 0} checks passed</span>
        <span>{queueItem ? queueSlaLabel(queueItem) : item.readyForReview ? "Review now" : "Closed"}</span>
      </div>

      <div className="admin-work-order-guardrail">
        <ShieldCheck size={15} />
        <span>AI only summarizes the evidence and suggests the action. Approval, rejection, publishing, and trust-score changes need this human decision.</span>
      </div>
    </section>
  );
}

function AdminEvidenceReview({
  item,
  seller
}: {
  item: SellerPacketItem;
  seller?: AdminSellerDossier;
}) {
  const heading = evidenceReviewHeading(item);
  const facts = evidenceReviewFacts(item, seller);

  return (
    <section className="admin-evidence-review-panel" aria-label="Uploaded evidence">
      <div className="admin-evidence-review-head">
        <div>
          <span>Evidence to inspect</span>
          <strong>{heading.title}</strong>
          <p>{heading.subtitle}</p>
        </div>
        {item.prescreen.proof_quality && <b>{proofScoreLabel(item.prescreen.proof_quality)}</b>}
      </div>

      {item.kind === "application" && (
        <div className="admin-evidence-object identity">
          <div className="admin-file-token">
            <ShieldCheck size={20} />
            <div>
              <strong>{item.item.business_name}</strong>
              <span>{item.item.gst_number}</span>
            </div>
          </div>
          <p>Confirm seller identity and required documents before allowing this seller to earn buyer-facing trust.</p>
        </div>
      )}

      {item.kind === "document" && (
        <div className="admin-evidence-object document">
          <div className="admin-file-token">
            <FileText size={20} />
            <div>
              <strong>{item.item.file_name}</strong>
              <span>{formatBytes(item.item.file_size_bytes)} | {item.item.mime_type}</span>
            </div>
          </div>
          <EvidenceActions value={item.item.storage_uri} label="Uploaded document" />
        </div>
      )}

      {item.kind === "draft" && (
        <div className="admin-evidence-object media">
          {isRenderableImage(item.item.image_url) ? (
            <img src={evidenceAssetUrl(item.item.image_url) ?? item.item.image_url} alt={item.item.title} />
          ) : (
            <div className="admin-media-empty">
              <FileText size={20} />
              <strong>{item.item.image_url ? uploadedFileLabel(item.item.image_url) : "No image attached"}</strong>
              <span>{item.item.image_url || "No product image reference found"}</span>
            </div>
          )}
          <div>
            <strong>{item.item.title}</strong>
            <p>{item.item.garment_type} | {item.item.fabric} | {formatPrice(item.item.base_price)}</p>
            <EvidenceActions value={item.item.image_url} label="Listing image" />
          </div>
        </div>
      )}

      {item.kind === "proof" && (
        <ProofComparisonReview item={item} />
      )}

      <div className="admin-evidence-fact-list">
        {facts.map((fact) => (
          <EvidenceFact key={fact.label} label={fact.label} value={fact.value} />
        ))}
      </div>
    </section>
  );
}

function ProofComparisonReview({ item }: { item: ProofPacketItem }) {
  const signal = proofVisualSignal(item);
  const checklist = proofComparisonChecklist(item);
  const referenceUrl = item.item.product_image_url || signal.reference_image_url;
  const statusLabel = proofVisualStatusLabel(signal.tone);
  const score = proofVisualScore(signal.score);

  return (
    <div className={`admin-evidence-object proof admin-proof-comparison ${signal.tone}`}>
      <div className="admin-proof-verdict">
        <div className="admin-proof-verdict-main">
          <span className="admin-proof-verdict-icon">{proofVisualIcon(signal.tone)}</span>
          <div>
            <span>AI visual pre-check</span>
            <strong>{signal.label}</strong>
            <p>{signal.summary}</p>
          </div>
        </div>
        <div className={`admin-proof-score ${signal.tone}`}>
          <strong>{statusLabel}</strong>
          <span>{score}/100 AI gate</span>
        </div>
      </div>

      <div className="admin-proof-compare-grid" aria-label="Seller proof compared with catalog reference">
        <AdminDynamicImage
          src={item.item.asset_url}
          alt={item.item.title}
          label="Seller upload"
          detail={item.item.title}
        />
        <div className="admin-proof-compare-rail" aria-hidden="true">
          <span />
          <b>compare</b>
          <span />
        </div>
        <AdminDynamicImage
          src={referenceUrl}
          alt={item.item.product_title}
          label="Catalog reference"
          detail={item.item.product_title}
        />
      </div>

      <div className="admin-proof-review-strip">
        <div>
          <span>Buyer doubt</span>
          <strong>{item.prescreen.proof_quality?.buyer_doubt ?? `${item.item.open_request_count} buyer request${item.item.open_request_count === 1 ? "" : "s"}`}</strong>
        </div>
        <div>
          <span>Uploaded as</span>
          <strong>{labelize(item.item.proof_type)}</strong>
        </div>
        <div>
          <span>Decision rule</span>
          <strong>{signal.tone === "pass" ? "Approve only after visual match" : "Hold trust lift until fixed"}</strong>
        </div>
      </div>

      <div className="admin-proof-checklist" aria-label="Reviewer visual checklist">
        {checklist.map((check) => (
          <span key={check}>{check}</span>
        ))}
      </div>

      <p className="admin-proof-description">{item.item.description}</p>
      <div className="admin-evidence-action-row">
        <EvidenceActions value={item.item.asset_url} label="Seller proof" />
        <EvidenceActions value={referenceUrl} label="Product image" />
      </div>
    </div>
  );
}

function proofVisualSignal(item: ProofPacketItem) {
  const signal = item.prescreen.proof_quality?.visual_match;
  if (isProofVisualMatch(signal)) {
    return {
      ...signal,
      score: proofVisualScore(signal.score)
    };
  }
  return {
    score: 52,
    label: "Visual match not proven",
    tone: "warn" as const,
    summary: "AI did not receive reliable visual-match metadata for this upload. Reviewer must compare the seller image and catalog reference before any approval.",
    reference_image_url: item.item.product_image_url ?? null,
    requires_human_check: true
  };
}

function isProofVisualMatch(value: unknown): value is NonNullable<AdminPrescreenSuggestion["proof_quality"]>["visual_match"] {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { score?: unknown; tone?: unknown; label?: unknown; summary?: unknown };
  return (
    typeof candidate.score === "number" &&
    ["pass", "warn", "fail"].includes(String(candidate.tone)) &&
    typeof candidate.label === "string" &&
    typeof candidate.summary === "string"
  );
}

function proofVisualScore(value: number) {
  if (!Number.isFinite(value)) return 52;
  return Math.max(0, Math.min(94, Math.round(value)));
}

function proofVisualStatusLabel(tone: "pass" | "warn" | "fail") {
  if (tone === "pass") return "Ready";
  if (tone === "fail") return "Hold";
  return "Check";
}

function proofVisualIcon(tone: "pass" | "warn" | "fail") {
  if (tone === "pass") return <CheckCircle2 size={16} />;
  if (tone === "fail") return <XCircle size={16} />;
  return <AlertTriangle size={16} />;
}

function proofComparisonChecklist(item: ProofPacketItem) {
  if (item.item.attribute === "color" || item.item.proof_type === "daylight_photo") {
    return ["Same garment and print", "Shade checked in daylight", "No filter or catalog reuse"];
  }
  if (item.item.attribute === "size" || item.item.proof_type === "measurement_chart") {
    return ["Readable tape or chart", "L/XL values visible", "Same garment family"];
  }
  if (item.item.attribute === "fabric" || item.item.proof_type === "fabric_closeup") {
    return ["Close fabric texture", "Same material claim", "No blurry crop"];
  }
  return ["Same product family", "Claim visible in upload", "No suspicious mismatch"];
}

function proofScoreLabel(quality: NonNullable<AdminPrescreenSuggestion["proof_quality"]>) {
  const visual = isProofVisualMatch(quality.visual_match) ? quality.visual_match : null;
  if (visual) return `${proofVisualScore(visual.score)}/100 visual gate`;
  return "Visual gate pending";
}

function AdminDynamicImage({
  src,
  alt,
  label,
  detail
}: {
  src?: string | null;
  alt: string;
  label: string;
  detail?: string;
}) {
  const resolvedSrc = evidenceAssetUrl(src);
  return (
    <figure className="admin-dynamic-image">
      {isRenderableImage(src) ? (
        <img src={resolvedSrc ?? ""} alt={alt} />
      ) : (
        <div className="admin-media-empty">
          <FileText size={20} />
          <strong>{src ? uploadedFileLabel(src) : "No file attached"}</strong>
          <span>{src || "No upload reference found"}</span>
        </div>
      )}
      <figcaption>
        <strong>{label}</strong>
        {detail && <span>{detail}</span>}
      </figcaption>
    </figure>
  );
}

function EvidenceActions({
  value,
  label,
  compact = false
}: {
  value?: string | null;
  label: string;
  compact?: boolean;
}) {
  if (!value) return null;
  const href = evidenceAssetUrl(value);
  const fileName = evidenceFileName(value);

  if (!href) {
    return (
      <span className={`admin-evidence-actions ${compact ? "compact" : ""}`}>
        {!compact && (
          <span className="admin-evidence-action-meta">
            <strong>{label}</strong>
            <small>{fileName}</small>
          </span>
        )}
        <code>{fileName}</code>
      </span>
    );
  }

  return (
    <span className={`admin-evidence-actions ${compact ? "compact" : ""}`} aria-label={`${label} actions`}>
      {!compact && (
        <span className="admin-evidence-action-meta">
          <strong>{label}</strong>
          <small>{fileName}</small>
        </span>
      )}
      <span className="admin-evidence-action-buttons">
        <a href={href} target="_blank" rel="noreferrer" aria-label={`Open ${label}`}>
          <ExternalLink size={compact ? 12 : 14} />
          <span>View</span>
        </a>
        <a href={href} download={fileName} aria-label={`Download ${label}`}>
          <Download size={compact ? 12 : 14} />
          <span>Download</span>
        </a>
      </span>
    </span>
  );
}

function uploadedFileLabel(value: string) {
  const clean = value.split("?")[0].replace(/\\/g, "/");
  return clean.split("/").filter(Boolean).pop() ?? value;
}

function EvidenceFact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="admin-evidence-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function primaryReviewConcern(item: SellerPacketItem) {
  const caseFile = item.queueItem?.case_file ?? null;
  const blocker = item.queueItem?.blocker;
  const conflict = caseFile?.evidence_conflicts[0];
  const missing = caseFile?.evidence_missing[0];
  const failed = item.prescreen.checks.find((check) => check.status === "fail");
  const warning = item.prescreen.checks.find((check) => check.status === "warn");
  const concern = blocker
    ? { label: "Blocked", detail: blocker }
    : conflict
      ? { label: conflict.label, detail: conflict.detail }
      : missing
        ? { label: missing.label, detail: missing.detail }
        : failed
          ? { label: failed.label, detail: failed.detail }
          : warning
            ? { label: warning.label, detail: warning.detail }
            : { label: "No blocker found", detail: "Visible evidence still needs one human check before action." };
  return concern;
}

function primaryReviewSupport(item: SellerPacketItem) {
  const caseFile = item.queueItem?.case_file ?? null;
  const support = caseFile?.evidence_agrees[0];
  const passed = item.prescreen.checks.find((check) => check.status === "pass");
  if (support) return { label: support.label, detail: support.detail };
  if (passed) return { label: passed.label, detail: passed.detail };
  return { label: "Evidence pending", detail: "No strong supporting signal is connected to this item yet." };
}

function evidenceReviewHeading(item: SellerPacketItem) {
  if (item.kind === "application") {
    return {
      title: "Seller identity",
      subtitle: "Use this only to verify the business identity and onboarding readiness."
    };
  }
  if (item.kind === "document") {
    return {
      title: labelize(item.item.document_type),
      subtitle: "Match the uploaded document reference with the seller record."
    };
  }
  if (item.kind === "draft") {
    return {
      title: "Product draft",
      subtitle: "Check whether this listing is safe to publish to the buyer feed."
    };
  }
  return {
    title: "Seller proof upload",
    subtitle: "Check whether the uploaded proof answers the buyer doubt."
  };
}

function evidenceReviewFacts(item: SellerPacketItem, seller?: AdminSellerDossier): Array<{ label: string; value: ReactNode }> {
  if (item.kind === "application") {
    return [
      { label: "GST", value: item.item.gst_number },
      { label: "Pickup", value: item.item.pickup_pincode },
      { label: "Support", value: item.item.support_contact },
      { label: "Docs pending", value: seller?.pending_documents.length ? seller.pending_documents.map(labelize).join(", ") : "None" }
    ];
  }
  if (item.kind === "document") {
    return [
      { label: "Reference", value: item.item.reference },
      { label: "Hash", value: item.item.sha256 ? item.item.sha256.slice(0, 16) : "Missing" },
      { label: "Submitted", value: formatDate(item.item.submitted_at) },
      { label: "Status", value: labelize(item.item.status) }
    ];
  }
  if (item.kind === "draft") {
    return [
      { label: "Category", value: labelize(item.item.category) },
      { label: "Color", value: item.item.color_family },
      { label: "Seller status", value: labelize(item.item.verification_status ?? "pending") },
      { label: "Readiness", value: labelize(item.item.readiness_status) }
    ];
  }
  const visual = isProofVisualMatch(item.prescreen.proof_quality?.visual_match)
    ? item.prescreen.proof_quality.visual_match
    : null;
  return [
    { label: "AI visual gate", value: visual ? `${visual.label} (${proofVisualScore(visual.score)}/100)` : "Manual compare needed" },
    { label: "Proof type", value: labelize(item.item.proof_type) },
    { label: "Buyer asks", value: item.item.open_request_count },
    { label: "Claim checked", value: item.prescreen.proof_quality?.claim_checked ?? labelize(item.item.attribute) }
  ];
}

function AdminEvidenceBrief({ caseFile }: { caseFile: NonNullable<AdminQueueSnapshot["case_file"]> }) {
  const visiblePath = compactEvidencePath(caseFile.evidence_path).slice(0, 4);
  const agree = caseFile.evidence_agrees[0] ?? null;
  const conflict = caseFile.evidence_conflicts[0] ?? null;
  const missing = caseFile.evidence_missing[0] ?? null;
  const blockerCount = caseFile.score_simulation.remaining_blockers.length;

  return (
    <section className="admin-evidence-brief" aria-label="Evidence summary">
      <div className="admin-evidence-brief-head">
        <div>
          <span>Evidence path</span>
          <strong>Verify the chain before deciding</strong>
        </div>
        <StatusPill value={caseFile.recommendation.confidence} />
      </div>

      <div className="admin-evidence-path">
        {visiblePath.map((step, index) => (
          <article className={`admin-evidence-step ${step.status}`} key={`${caseFile.case_id}-${step.label}`}>
            <div>
              {step.status === "pass" ? <CheckCircle2 size={14} /> : step.status === "warn" ? <AlertTriangle size={14} /> : <XCircle size={14} />}
              <span>{index + 1}</span>
            </div>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
          </article>
        ))}
      </div>

      <div className="admin-evidence-signal-row">
        <AdminSignalMini
          label="Verified"
          value={String(caseFile.evidence_agrees.length)}
          tone="good"
          detail={agree ? `${agree.label}: ${agree.detail}` : "No supporting signal yet."}
        />
        <AdminSignalMini
          label="Conflict"
          value={String(caseFile.evidence_conflicts.length)}
          tone={conflict ? "bad" : "good"}
          detail={conflict ? `${conflict.label}: ${conflict.detail}` : "No contradiction found."}
        />
        <AdminSignalMini
          label="Missing"
          value={String(caseFile.evidence_missing.length)}
          tone={missing ? "warn" : "good"}
          detail={missing ? `${missing.label}: ${missing.detail}` : "No critical gap found."}
        />
        <AdminSignalMini
          label="Blockers"
          value={String(blockerCount)}
          tone={blockerCount ? "warn" : "good"}
          detail={blockerCount ? caseFile.score_simulation.remaining_blockers.slice(0, 2).join(", ") : "No blocker remains after approval."}
        />
      </div>
    </section>
  );
}

function AdminSignalMini({
  label,
  value,
  tone,
  detail
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad";
  detail: string;
}) {
  return (
    <article className={`admin-signal-mini ${tone}`} title={detail}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function AdminCaseFilePanel({
  caseFile,
  compact = false
}: {
  caseFile: AdminQueueSnapshot["case_file"] | null | undefined;
  compact?: boolean;
}) {
  if (!caseFile) return null;
  const conflictCount = caseFile.evidence_conflicts.length;
  const gapCount = caseFile.evidence_missing.length;
  const agreeCount = caseFile.evidence_agrees.length;
  const visiblePath = compact ? compactEvidencePath(caseFile.evidence_path) : caseFile.evidence_path;
  const visibleAgrees = caseFile.evidence_agrees.slice(0, compact ? 2 : 3);
  const visibleConflicts = caseFile.evidence_conflicts.slice(0, compact ? 2 : 3);
  const visibleMissing = caseFile.evidence_missing.slice(0, compact ? 2 : 3);

  return (
    <section className={`admin-case-file-panel ${compact ? "compact" : ""}`} aria-label="Admin case file">
      <div className="admin-case-file-head">
        <div>
          <span>{compact ? "Evidence path" : "TrustOps case file"}</span>
          <strong>{caseFile.primary_question}</strong>
          <p>{caseFile.trigger}</p>
        </div>
        <StatusPill value={caseFile.recommendation.confidence} />
      </div>

      <div className="admin-case-review-question">
        <Bot size={15} />
        <div>
          <span>Recommendation</span>
          <strong>{caseFile.recommendation.action}</strong>
          <p>{caseFile.recommendation.why}</p>
        </div>
      </div>

      <div className="admin-case-path" aria-label="Evidence path">
        {visiblePath.map((step) => (
          <article className={`admin-case-path-step ${step.status}`} key={`${caseFile.case_id}-${step.label}`}>
            {step.status === "pass" ? <CheckCircle2 size={14} /> : step.status === "warn" ? <AlertTriangle size={14} /> : <XCircle size={14} />}
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
              <small>{labelize(step.source_type)}</small>
            </div>
          </article>
        ))}
      </div>

      {compact ? (
        <div className="admin-case-signal-strip">
          <AdminSignalPill title="Agrees" count={agreeCount} tone="good" signals={visibleAgrees} empty="No supporting signal yet." />
          <AdminSignalPill title="Conflicts" count={conflictCount} tone={conflictCount ? "bad" : "good"} signals={visibleConflicts} empty="No contradiction found." />
          <AdminSignalPill title="Missing" count={gapCount} tone={gapCount ? "warn" : "good"} signals={visibleMissing} empty="No critical gap found." />
        </div>
      ) : (
        <div className="admin-case-signal-grid">
          <AdminSignalColumn title="Evidence agrees" count={agreeCount} tone="good" signals={caseFile.evidence_agrees} />
          <AdminSignalColumn title="Conflicts" count={conflictCount} tone={conflictCount ? "bad" : "good"} signals={caseFile.evidence_conflicts} empty="No contradiction found." />
          <AdminSignalColumn title="Missing" count={gapCount} tone={gapCount ? "warn" : "good"} signals={caseFile.evidence_missing} empty="No critical gap found." />
        </div>
      )}

      <div className="admin-case-bottom-grid">
        <section className="admin-case-impact" aria-label="Trust impact simulator">
          <div>
            <span>Trust impact simulator</span>
            <strong>{caseFile.score_simulation.current_score}/100 now</strong>
            <p>{caseFile.score_simulation.buyer_label_after_approval}</p>
          </div>
          <div className="admin-case-impact-bars">
            <AdminScoreBar label="Approve" value={caseFile.score_simulation.next_if_approved} tone="good" />
            <AdminScoreBar label="Reject" value={caseFile.score_simulation.next_if_rejected} tone="bad" />
          </div>
          {caseFile.score_simulation.remaining_blockers.length > 0 && (
            <div className="admin-case-blockers">
              {caseFile.score_simulation.remaining_blockers.map((blocker) => (
                <span key={blocker}>{blocker}</span>
              ))}
            </div>
          )}
        </section>

        <section className="admin-case-task-panel" aria-label="Seller root cause tasks">
          <div>
            <span>Seller tasks</span>
            <strong>{caseFile.seller_tasks.length ? "Generated from blockers" : "No seller task needed"}</strong>
          </div>
          {caseFile.seller_tasks.length ? (
            <div className="admin-case-task-list">
              {caseFile.seller_tasks.slice(0, 3).map((task) => (
                <article key={task.task_id}>
                  <span>{labelize(task.priority)}</span>
                  <strong>{task.title}</strong>
                  <p>{task.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-case-empty-copy">Reviewer can decide without creating a seller correction task.</p>
          )}
        </section>
      </div>

      <details className="admin-case-technical">
        <summary>
          <span>Agent tools and guardrails</span>
          <em>{caseFile.tool_chain.length} tools</em>
        </summary>
        <div className="admin-case-tools">
          {caseFile.tool_chain.map((toolItem) => (
            <article className={toolItem.status} key={toolItem.key}>
              <strong>{toolItem.label}</strong>
              <span>{toolItem.detail}</span>
            </article>
          ))}
        </div>
        <div className="admin-case-guardrails">
          {caseFile.human_guardrails.map((guardrail) => (
            <p key={guardrail}>
              <ShieldCheck size={13} />
              <span>{guardrail}</span>
            </p>
          ))}
        </div>
        <div className="admin-case-timeline">
          {caseFile.audit_timeline.map((event) => (
            <article className={event.status} key={`${event.label}-${event.detail}`}>
              <strong>{event.label}</strong>
              <span>{event.detail}</span>
              {event.timestamp && <small>{formatDate(event.timestamp)}</small>}
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

function AdminSignalPill({
  title,
  count,
  tone,
  signals,
  empty
}: {
  title: string;
  count: number;
  tone: "good" | "warn" | "bad";
  signals: NonNullable<AdminQueueSnapshot["case_file"]>["evidence_agrees"];
  empty: string;
}) {
  const primary = signals[0] ?? null;
  return (
    <article className={`admin-case-signal-pill ${tone}`}>
      <span>{title}</span>
      <strong>{count}</strong>
      <p>{primary ? `${primary.label}: ${primary.detail}` : empty}</p>
    </article>
  );
}

function AdminSignalColumn({
  title,
  count,
  tone,
  signals,
  empty = "No signal yet."
}: {
  title: string;
  count: number;
  tone: "good" | "warn" | "bad";
  signals: NonNullable<AdminQueueSnapshot["case_file"]>["evidence_agrees"];
  empty?: string;
}) {
  return (
    <section className={`admin-case-signal-column ${tone}`}>
      <div>
        <span>{title}</span>
        <strong>{count}</strong>
      </div>
      {signals.length ? (
        signals.slice(0, 3).map((signal) => (
          <article className={signal.severity} key={`${title}-${signal.label}`}>
            <strong>{signal.label}</strong>
            <p>{signal.detail}</p>
          </article>
        ))
      ) : (
        <p className="admin-case-empty-copy">{empty}</p>
      )}
    </section>
  );
}

function AdminScoreBar({
  label,
  value,
  tone
}: {
  label: string;
  value: number;
  tone: "good" | "bad";
}) {
  return (
    <div className={`admin-case-score-row ${tone}`}>
      <div>
        <span>{label}</span>
        <strong>{value}/100</strong>
      </div>
      <em style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
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
            <img src={evidenceAssetUrl(draft.image_url) ?? draft.image_url} alt="" />
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
  selectedTargetId,
  onNoteChange,
  onRunAction,
  onSelectedTargetConsumed
}: {
  queue: AdminReviewQueue;
  notes: NotesById;
  busyAction: string | null;
  selectedTargetId: string | null;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
  onSelectedTargetConsumed: () => void;
}) {
  return (
    <ExceptionReviewDesk
      queue={queue}
      notes={notes}
      busyAction={busyAction}
      selectedTargetId={selectedTargetId}
      onNoteChange={onNoteChange}
      onRunAction={onRunAction}
      onSelectedTargetConsumed={onSelectedTargetConsumed}
    />
  );

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
    if (!filteredRows.length) {
      setSelectedUploadId(null);
      return;
    }
    if (!selectedUploadId || !filteredRows.some((row) => row.id === selectedUploadId)) {
      setSelectedUploadId(filteredRows[0].id);
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
    <section className={`seller-uploads-layout reviewer-upload-desk ${selectedRow ? "has-selection" : ""}`}>
      <section className="seller-uploads-table-panel reviewer-upload-worklist-panel">
        <div className="seller-uploads-head">
          <div>
            <h3>Review worklist</h3>
            <p>Pick a seller proof or document. Evidence opens beside the queue.</p>
          </div>
          <span>{filteredRows.length}</span>
        </div>

        <div className="seller-uploads-controls reviewer-upload-toolbar">
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
          <div className="reviewer-upload-card-list reviewer-upload-worklist" data-testid="reviewer-upload-cards">
            {filteredRows.map((row) => (
              <UploadQueueCard
                key={row.id}
                row={row}
                selected={selectedUploadId === row.id}
                onSelect={() => setSelectedUploadId(row.id)}
              />
            ))}
          </div>
        ) : (
          <EmptyPanel message="No uploads match this view." compact />
        )}
      </section>

      {selectedRow && (
        <aside className="seller-upload-review-panel reviewer-upload-decision-panel">
          <UploadReviewPanel
            row={selectedRow as UploadQueueRow}
            notes={notes}
            busyAction={busyAction}
            onNoteChange={onNoteChange}
            onRunAction={onRunAction}
            onClose={() => setSelectedUploadId(null)}
          />
        </aside>
      )}
    </section>
  );
}

function UploadQueueCard({
  row,
  selected,
  onSelect
}: {
  row: UploadQueueRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const checks = uploadCheckSummary(row.prescreen);

  return (
    <button className={`reviewer-upload-card ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <UploadThumb row={row} />
      <div className="reviewer-upload-card-head">
        <div>
          <span>{row.kind === "document" ? "Verification document" : "Seller proof"}</span>
          <strong>{row.title}</strong>
          <p>{row.sellerName}</p>
        </div>
        <StatusPill value={row.status} />
      </div>
      <p className="reviewer-upload-card-subtitle">{row.subtitle}</p>
      <dl className="reviewer-upload-card-facts">
        <div>
          <dt>AI lane</dt>
          <dd>{row.queueItem?.triage_label ?? triageLabel(prescreenTriageBucket(row.prescreen))}</dd>
        </div>
        <div>
          <dt>Checks</dt>
          <dd className={checks.tone}>{checks.label}</dd>
        </div>
        {row.queueItem && (
          <div>
            <dt>Impact</dt>
            <dd>{queueTrustLiftLabel(row.queueItem)}</dd>
          </div>
        )}
        <div>
          <dt>Submitted</dt>
          <dd>{formatDate(row.submittedAt)}</dd>
        </div>
      </dl>
    </button>
  );
}

function UploadThumb({ row }: { row: UploadQueueRow }) {
  if (row.kind === "proof") {
    return (
      <span className="reviewer-upload-thumb proof">
        {isRenderableImage(row.item.product_image_url) ? (
          <img src={evidenceAssetUrl(row.item.product_image_url) ?? ""} alt="" />
        ) : (
          <ImageIcon size={18} />
        )}
      </span>
    );
  }
  return (
    <span className="reviewer-upload-thumb document">
      <FileText size={18} />
    </span>
  );
}

function UploadReviewPanel({
  row,
  notes,
  busyAction,
  onNoteChange,
  onRunAction,
  onClose
}: {
  row: UploadQueueRow;
  notes: NotesById;
  busyAction: string | null;
  onNoteChange: (id: string, value: string) => void;
  onClose: () => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
}) {
  const selectedItem = uploadRowToPacketItem(row);
  return (
    <div className="seller-upload-review-stack reviewer-upload-review-stack">
      <button className="reviewer-upload-back" type="button" onClick={onClose}>
        Back to uploads
      </button>
      <div className="seller-upload-review-head reviewer-upload-selected-bar">
        <div>
          <span>Selected upload</span>
          <h3>{row.title}</h3>
          <p>{row.subtitle}</p>
        </div>
        <StatusPill value={row.status} />
      </div>

      <div className="reviewer-upload-main-grid">
        <div className="reviewer-upload-evidence-column">
          <AdminWorkOrder item={selectedItem} />
          <AdminEvidenceReview item={selectedItem} />
        </div>

        <aside className="reviewer-upload-action-column" aria-label="Final reviewer action">
          {row.kind === "document" ? (
            <DocumentReviewCard
              document={row.item}
              hideHeader
              showPrescreen={false}
              showDetails={false}
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
              hideHeader
              showPrescreen={false}
              showDetails={false}
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

          <details className="reviewer-secondary-proof reviewer-upload-technical">
            <summary>
              <span>Audit trail and agent details</span>
              <em>checks, reasoning, guidance</em>
            </summary>
            <ReviewerCopilotBrief prescreen={row.prescreen} readyForReview={row.readyForReview} queueItem={row.queueItem} />
            <DecisionBrief prescreen={row.prescreen} readyForReview={row.readyForReview} queueItem={row.queueItem} />
            <AdminCaseFilePanel caseFile={row.queueItem?.case_file} compact />
            <ReviewActionChecklist item={selectedItem} />
          </details>
        </aside>
      </div>
    </div>
  );
}

function ExceptionReviewDesk({
  queue,
  notes,
  busyAction,
  selectedTargetId,
  onNoteChange,
  onRunAction,
  onSelectedTargetConsumed
}: {
  queue: AdminReviewQueue;
  notes: NotesById;
  busyAction: string | null;
  selectedTargetId: string | null;
  onNoteChange: (id: string, value: string) => void;
  onRunAction: (
    actionKey: string,
    handler: () => Promise<AdminReviewQueue>,
    message: string,
    noteId?: string
  ) => Promise<void>;
  onSelectedTargetConsumed: () => void;
}) {
  const [query, setQuery] = useState("");
  const [queueTab, setQueueTab] = useState<ExceptionQueueTab>("needs_review");
  const [sellerFilterId, setSellerFilterId] = useState("all");
  const [itemTypeFilter, setItemTypeFilter] = useState<ReviewItemTypeFilter>("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const QUEUE_PAGE_SIZE = 5;
  const deskRows = useMemo(() => buildExceptionReviewRows(queue), [queue]);
  const counts = useMemo(() => exceptionQueueCounts(deskRows), [deskRows]);
  const activeHumanCount = useMemo(
    () => deskRows.filter((row) => row.source === "live" && row.readyForReview).length,
    [deskRows]
  );
  const queueScopedRows = useMemo(
    () => deskRows.filter((row) => rowMatchesExceptionQueue(row, queueTab)),
    [deskRows, queueTab]
  );
  const sellerFilterOptions = useMemo(() => {
    const sellers = new Map<string, { id: string; name: string; count: number; risky: number }>();
    queueScopedRows.forEach((row) => {
      const existing = sellers.get(row.sellerId) ?? {
        id: row.sellerId,
        name: row.sellerName || row.sellerId,
        count: 0,
        risky: 0
      };
      existing.count += 1;
      if (row.lane === "escalated" || row.riskLevel === "high") existing.risky += 1;
      sellers.set(row.sellerId, existing);
    });
    return Array.from(sellers.values()).sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.name.localeCompare(right.name);
    });
  }, [queueScopedRows]);
  const itemTypeFilterOptions = useMemo(() => {
    const countsByType = new Map<ReviewItemTypeFilter, number>([["all", queueScopedRows.length]]);
    queueScopedRows.forEach((row) => countsByType.set(row.itemType, (countsByType.get(row.itemType) ?? 0) + 1));
    return [
      { id: "all" as ReviewItemTypeFilter, label: REVIEW_ITEM_TYPE_FILTER_LABELS.all, count: queueScopedRows.length },
      ...REVIEW_ITEM_TYPE_FILTERS
        .map((id) => ({
          id,
          label: REVIEW_ITEM_TYPE_FILTER_LABELS[id],
          count: countsByType.get(id) ?? 0
        }))
        .filter((item) => item.count > 0)
    ];
  }, [queueScopedRows]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return queueScopedRows.filter((row) => {
      if (sellerFilterId !== "all" && row.sellerId !== sellerFilterId) return false;
      if (itemTypeFilter !== "all" && row.itemType !== itemTypeFilter) return false;
      return !normalizedQuery || row.searchText.includes(normalizedQuery);
    });
  }, [itemTypeFilter, query, queueScopedRows, sellerFilterId]);

  useEffect(() => {
    setPage(1);
  }, [query, queueTab, sellerFilterId, itemTypeFilter]);

  const totalPages = Math.ceil(filteredRows.length / QUEUE_PAGE_SIZE) || 1;
  const paginatedRows = useMemo(() => {
    const start = (page - 1) * QUEUE_PAGE_SIZE;
    return filteredRows.slice(start, start + QUEUE_PAGE_SIZE);
  }, [filteredRows, page]);

  useEffect(() => {
    if (sellerFilterId === "all") return;
    if (!sellerFilterOptions.some((seller) => seller.id === sellerFilterId)) {
      setSellerFilterId("all");
    }
  }, [sellerFilterId, sellerFilterOptions]);

  useEffect(() => {
    if (itemTypeFilter === "all") return;
    if (!itemTypeFilterOptions.some((item) => item.id === itemTypeFilter)) {
      setItemTypeFilter("all");
    }
  }, [itemTypeFilter, itemTypeFilterOptions]);

  useEffect(() => {
    if (!paginatedRows.length) {
      setSelectedRowId(null);
      return;
    }
    if (!selectedRowId || !paginatedRows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(paginatedRows[0].id);
    }
  }, [paginatedRows, selectedRowId]);

  useEffect(() => {
    setBatchSelectedIds((current) => current.filter((id) => filteredRows.some((row) => row.id === id)));
  }, [filteredRows]);

  const selectedRow = filteredRows.find((row) => row.id === selectedRowId) ?? null;
  const batchableRows = filteredRows.filter(isBatchApprovable);
  const batchRows = filteredRows.filter((row) => batchSelectedIds.includes(row.id) && isBatchApprovable(row));
  const allBatchSelected = batchableRows.length > 0 && batchableRows.every((row) => batchSelectedIds.includes(row.id));
  const humanDecisionCount = activeHumanCount || counts.needs_review + counts.escalated;
  const filters: Array<{ id: ExceptionQueueTab; label: string; detail: string; count: number }> = [
    { id: "needs_review", label: "Needs review", detail: "live work", count: humanDecisionCount },
    { id: "auto_reviewed", label: "Auto-reviewed", detail: "AI cleared", count: counts.auto_reviewed },
    { id: "escalated", label: "Escalated", detail: "risk", count: counts.escalated }
  ];
  const activeSellerFilter = sellerFilterOptions.find((seller) => seller.id === sellerFilterId);
  const activeQueueLabel = filters.find((item) => item.id === queueTab)?.label ?? "Queue";

  useEffect(() => {
    if (!selectedTargetId) return;
    const targetRow = deskRows.find((row) => row.targetId === selectedTargetId || row.id === selectedTargetId);
    if (!targetRow) {
      onSelectedTargetConsumed();
      return;
    }
    setQuery("");
    setQueueTab(targetRow.source === "live" && targetRow.readyForReview ? "needs_review" : targetRow.lane);
    setSellerFilterId(targetRow.sellerId);
    setItemTypeFilter("all");
    setSelectedRowId(targetRow.id);
    setBatchSelectedIds([]);
    onSelectedTargetConsumed();
  }, [deskRows, onSelectedTargetConsumed, selectedTargetId]);

  useEffect(() => {
    if (!selectedRowId) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-review-row-id="${selectedRowId}"]`)?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedRowId]);

  function toggleBatchRow(rowId: string) {
    setBatchSelectedIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]
    );
  }

  function toggleAllBatchRows() {
    setBatchSelectedIds((current) => {
      const visibleIds = new Set(batchableRows.map((row) => row.id));
      if (allBatchSelected) {
        return current.filter((id) => !visibleIds.has(id));
      }
      return Array.from(new Set([...current, ...batchableRows.map((row) => row.id)]));
    });
  }

  async function approveSelectedSafeRows() {
    if (!batchRows.length) return;
    await onRunAction(
      `batch-approve-${queueTab}`,
      async () => {
        let nextQueue = queue;
        for (const row of batchRows) {
          if (!row.packetItem) continue;
          const note = notes[reviewRowNoteId(row)]?.trim() || suggestedAuditNote(row.packetItem.prescreen, "Reviewed by Sarthi reviewer.");
          if (row.packetItem.kind === "document") {
            nextQueue = await approveSellerDocument(row.packetItem.item.document_id, note);
          }
          if (row.packetItem.kind === "proof") {
            nextQueue = await approveSellerEvidenceAsset(row.packetItem.item.proof_id, note);
          }
        }
        return nextQueue;
      },
      `${batchRows.length} low-risk ${batchRows.length === 1 ? "item" : "items"} approved.`
    );
    setBatchSelectedIds([]);
  }

  return (
    <section className="reviewer-exception-desk" aria-label="Reviewer exception desk">
      <div className="reviewer-exception-command">
        <div className="reviewer-exception-command-main">
          <span>Exception desk</span>
          <h3>{humanDecisionCount} decisions. {counts.auto_reviewed} AI-cleared.</h3>
        </div>
        <label className="reviewer-exception-search" aria-label="Search by seller, product, document, or status">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search queue"
          />
        </label>
      </div>

      <div className="reviewer-exception-tabs" aria-label="Exception queues">
        {filters.map((item) => (
          <button
            key={item.id}
            type="button"
            className={queueTab === item.id ? "active" : ""}
            onClick={() => {
              setQueueTab(item.id);
              setBatchSelectedIds([]);
            }}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
            <em>{item.detail}</em>
          </button>
        ))}
      </div>

      <div className="reviewer-exception-filter-bar" aria-label="Queue filters">
        <label className="reviewer-filter-control select-dropdown-control">
          <span>Seller</span>
          <div className="reviewer-select-wrapper">
            <select
              value={sellerFilterId}
              onChange={(event) => {
                setSellerFilterId(event.target.value);
                setBatchSelectedIds([]);
              }}
            >
              <option value="all">All sellers ({queueScopedRows.length})</option>
              {sellerFilterOptions.map((seller) => (
                <option key={seller.id} value={seller.id}>
                  {seller.name} ({seller.count})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="reviewer-select-caret" />
          </div>
        </label>

        <div className="reviewer-type-filter" aria-label="Evidence type">
          {itemTypeFilterOptions.map((item) => (
            <button
              key={item.id}
              type="button"
              className={itemTypeFilter === item.id ? "active" : ""}
              onClick={() => {
                setItemTypeFilter(item.id);
                setBatchSelectedIds([]);
              }}
            >
              <span>{item.label}</span>
              <em>{item.count}</em>
            </button>
          ))}
        </div>

        <span className="reviewer-filter-result">
          {filteredRows.length} shown{activeSellerFilter ? ` for ${activeSellerFilter.name}` : ""}
        </span>
      </div>

      <div className="reviewer-exception-layout">
        <section className="reviewer-exception-list-panel">
          <div className="reviewer-exception-list-head">
            <div>
              <strong>{activeQueueLabel}</strong>
              <span>{sellerFilterOptions.length} sellers</span>
            </div>
            {batchableRows.length > 0 ? (
              <div className="reviewer-batch-actions">
                <button type="button" onClick={toggleAllBatchRows}>
                  {allBatchSelected ? "Clear" : "Select safe"}
                </button>
                <button type="button" className="primary" onClick={approveSelectedSafeRows} disabled={!batchRows.length || Boolean(busyAction)}>
                  Approve {batchRows.length}
                </button>
              </div>
            ) : (
              <span className="reviewer-batch-note">Manual only</span>
            )}
          </div>

          {filteredRows.length ? (
            <>
              <div className="reviewer-exception-row-list">
                {paginatedRows.map((row) => (
                  <ExceptionQueueRow
                    key={row.id}
                    row={row}
                    selected={selectedRowId === row.id}
                    batchSelected={batchSelectedIds.includes(row.id)}
                    onSelect={() => setSelectedRowId(row.id)}
                    onToggleBatch={() => toggleBatchRow(row.id)}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="reviewer-queue-pagination" aria-label="Queue navigation">
                  <span className="reviewer-page-info">
                    {(page - 1) * QUEUE_PAGE_SIZE + 1}–{Math.min(page * QUEUE_PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                  </span>
                  <div className="reviewer-page-buttons">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ‹
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={page === p ? "active" : ""}
                        onClick={() => setPage(p)}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      ›
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyPanel message="No cases match this queue." compact />
          )}
        </section>

        <ExceptionEvidencePanel
          row={selectedRow}
          events={queue.audit_events}
          notes={notes}
          busyAction={busyAction}
          onNoteChange={onNoteChange}
          onRunAction={onRunAction}
        />
      </div>
    </section>
  );
}

function ExceptionQueueRow({
  row,
  selected,
  batchSelected,
  onSelect,
  onToggleBatch
}: {
  row: ReviewDeskRow;
  selected: boolean;
  batchSelected: boolean;
  onSelect: () => void;
  onToggleBatch: () => void;
}) {
  const batchable = isBatchApprovable(row);
  return (
    <article className={`reviewer-exception-row ${selected ? "selected" : ""} ${row.lane}`} data-review-row-id={row.id}>
      {batchable ? (
        <label className="reviewer-exception-check" aria-label={`Select ${row.title} for batch action`}>
          <input
            type="checkbox"
            checked={batchSelected}
            onChange={onToggleBatch}
          />
        </label>
      ) : (
        <div className="reviewer-exception-check manual" aria-label="Manual decision required" title="Manual decision">
          <AlertTriangle size={14} />
        </div>
      )}
      <button className="reviewer-exception-row-main" type="button" onClick={onSelect}>
        <ExceptionRowThumb row={row} />
        <div className="reviewer-exception-row-copy">
          <span>{reviewRowKindLabel(row)}</span>
          <strong>{row.title}</strong>
          <p>{row.sellerName} · {row.subtitle}</p>
        </div>
        <div className="reviewer-exception-row-status">
          <StatusPill value={row.status} />
          <small>{formatDate(row.submittedAt)}</small>
        </div>
        <RiskReasonChips row={row} compact />
      </button>
    </article>
  );
}

function ExceptionEvidencePanel({
  row,
  events,
  notes,
  busyAction,
  onNoteChange,
  onRunAction
}: {
  row: ReviewDeskRow | null;
  events: AdminAuditEvent[];
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
  if (!row) {
    return (
      <aside className="reviewer-exception-evidence empty">
        <EmptyPanel message="Select a queue item to inspect evidence." compact />
      </aside>
    );
  }

  return (
    <aside className="reviewer-exception-evidence" aria-label="Evidence viewer">
      <div className="reviewer-evidence-heading">
        <div>
          <span>{row.source === "stored" ? storedVisibilityLabel(row.storedItem?.review_visibility ?? "completed") : "Human decision"}</span>
          <h3>{row.title}</h3>
          <p>{row.subtitle}</p>
        </div>
        <StatusPill value={row.status} />
      </div>

      <RiskReasonChips row={row} />
      <ExceptionEvidenceObject row={row} />
      <ExceptionDecisionPanel
        row={row}
        notes={notes}
        busyAction={busyAction}
        onNoteChange={onNoteChange}
        onRunAction={onRunAction}
      />
      <ExceptionTimeline row={row} events={events} />
    </aside>
  );
}

function ExceptionRowThumb({ row }: { row: ReviewDeskRow }) {
  const preview = row.productImageUrl || row.assetUrl;
  if (isRenderableImage(preview)) {
    return (
      <span className="reviewer-exception-thumb image">
        <img src={evidenceAssetUrl(preview) ?? ""} alt="" />
      </span>
    );
  }
  const icon = row.itemType === "proof_asset"
    ? <ImageIcon size={18} />
    : row.itemType === "listing_draft"
      ? <Store size={18} />
      : row.itemType === "seller_application"
        ? <ShieldCheck size={18} />
        : <FileText size={18} />;
  return (
    <span className={`reviewer-exception-thumb ${row.itemType}`}>
      {icon}
    </span>
  );
}

function RiskReasonChips({ row, compact = false }: { row: ReviewDeskRow; compact?: boolean }) {
  const chips = [
    { label: `${labelize(row.riskLevel)} ${row.riskScore}`, tone: row.riskLevel },
    { label: row.triageLabel, tone: triageBucketTone(row.triageBucket) },
    row.queueItem ? { label: queueSlaLabel(row.queueItem), tone: row.queueItem.sla_state } : null,
    row.queueItem?.blocker ? { label: row.queueItem.blocker, tone: "blocked" } : null,
    { label: providerText(row.provider), tone: "provider" }
  ].filter((chip): chip is { label: string; tone: string } => Boolean(chip));
  const visible = compact ? chips.slice(0, 3) : chips;

  return (
    <div className={`reviewer-risk-chip-row ${compact ? "compact" : ""}`} aria-label="Risk reasons">
      {visible.map((chip) => (
        <span className={`reviewer-risk-chip ${chip.tone}`} key={`${row.id}-${chip.label}`}>
          {chip.label}
        </span>
      ))}
    </div>
  );
}

function ExceptionEvidenceObject({ row }: { row: ReviewDeskRow }) {
  if (row.source === "stored") {
    return (
      <section className="reviewer-evidence-object stored">
        <div className="reviewer-evidence-object-head">
          <div>
            <span>Stored evidence</span>
            <strong>{row.storedItem?.triage_label ?? row.triageLabel}</strong>
            <p>{row.triageReason}</p>
          </div>
          <ProviderPill provider={row.provider} />
        </div>
        <div className="reviewer-evidence-file-row">
          <ExceptionEvidencePreview assetUrl={row.assetUrl} productImageUrl={row.productImageUrl} title={row.title} />
          <div className="reviewer-evidence-file-copy">
            <DetailGrid>
              <DetailTile label="Seller" value={row.sellerName} />
              <DetailTile label="Reference" value={row.reference || "Stored record"} />
              <DetailTile label="Status" value={labelize(row.status)} />
              <DetailTile label="Submitted" value={formatDate(row.submittedAt)} />
            </DetailGrid>
            <div className="reviewer-evidence-action-row">
              <EvidenceActions value={row.assetUrl} label="Stored evidence" />
              <EvidenceActions value={row.productImageUrl} label="Product reference" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  const item = row.packetItem;
  if (!item) return null;

  if (item.kind === "proof") {
    const signal = proofVisualSignal(item);
    const referenceUrl = item.item.product_image_url || signal.reference_image_url;
    return (
      <section className={`reviewer-evidence-object proof ${signal.tone}`}>
        <div className="reviewer-proof-verdict">
          <div>
            <span>AI visual pre-check</span>
            <strong>{signal.label}</strong>
            <p>{signal.summary}</p>
          </div>
          <b>{proofVisualScore(signal.score)}/100</b>
        </div>
        <div className="reviewer-proof-compare">
          <AdminDynamicImage src={item.item.asset_url} alt={item.item.title} label="Seller upload" detail={item.item.title} />
          <AdminDynamicImage src={referenceUrl} alt={item.item.product_title} label="Product reference" detail={item.item.product_title} />
        </div>
        <div className="reviewer-proof-facts">
          <DetailTile label="Buyer asks" value={item.item.open_request_count} />
          <DetailTile label="Claim checked" value={item.prescreen.proof_quality?.claim_checked ?? labelize(item.item.attribute)} />
          <DetailTile label="Proof type" value={labelize(item.item.proof_type)} />
        </div>
        <div className="reviewer-evidence-action-row">
          <EvidenceActions value={item.item.asset_url} label="Seller proof" />
          <EvidenceActions value={referenceUrl} label="Product image" />
        </div>
      </section>
    );
  }

  if (item.kind === "document") {
    return (
      <section className="reviewer-evidence-object document">
        <div className="reviewer-file-token">
          <FileText size={22} />
          <div>
            <strong>{item.item.file_name}</strong>
            <span>{formatBytes(item.item.file_size_bytes)} · {item.item.mime_type}</span>
          </div>
        </div>
        <DetailGrid>
          <DetailTile label="Reference" value={item.item.reference} />
          <DetailTile label="Document" value={labelize(item.item.document_type)} />
          <DetailTile label="Hash" value={item.item.sha256 ? item.item.sha256.slice(0, 16) : "Missing"} />
          <DetailTile label="Submitted" value={formatDate(item.item.submitted_at)} />
        </DetailGrid>
        <EvidenceActions value={item.item.storage_uri} label="Uploaded document" />
      </section>
    );
  }

  if (item.kind === "draft") {
    return (
      <section className="reviewer-evidence-object draft">
        <div className="reviewer-evidence-file-row">
          <ExceptionEvidencePreview assetUrl={item.item.image_url} productImageUrl={null} title={item.item.title} />
          <div>
            <DetailGrid>
              <DetailTile label="Category" value={item.item.category} />
              <DetailTile label="Price" value={formatPrice(item.item.base_price)} />
              <DetailTile label="Fabric" value={item.item.fabric} />
              <DetailTile label="Readiness" value={labelize(item.item.readiness_status)} />
            </DetailGrid>
            <EvidenceActions value={item.item.image_url} label="Listing image" />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="reviewer-evidence-object application">
      <div className="reviewer-file-token">
        <ShieldCheck size={22} />
        <div>
          <strong>{item.item.business_name}</strong>
          <span>{item.item.gst_number} · {item.item.pickup_pincode}</span>
        </div>
      </div>
      <DetailGrid>
        <DetailTile label="Seller" value={item.item.seller_name} />
        <DetailTile label="Support" value={item.item.support_contact} />
        <DetailTile label="Documents pending" value={row.sellerPendingDocuments?.length ?? 0} />
        <DetailTile label="Created" value={formatDate(item.item.created_at)} />
      </DetailGrid>
    </section>
  );
}

function ExceptionEvidencePreview({
  assetUrl,
  productImageUrl,
  title
}: {
  assetUrl?: string | null;
  productImageUrl?: string | null;
  title: string;
}) {
  const src = isRenderableImage(assetUrl) ? assetUrl : isRenderableImage(productImageUrl) ? productImageUrl : null;
  if (src) {
    return (
      <figure className="reviewer-evidence-preview">
        <img src={evidenceAssetUrl(src) ?? ""} alt={title} />
        <figcaption>{title}</figcaption>
      </figure>
    );
  }
  return (
    <div className="reviewer-evidence-preview empty">
      <FileText size={20} />
      <span>{assetUrl ? uploadedFileLabel(assetUrl) : "No preview"}</span>
    </div>
  );
}

function ExceptionDecisionPanel({
  row,
  notes,
  busyAction,
  onNoteChange,
  onRunAction
}: {
  row: ReviewDeskRow;
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
  const navigate = useNavigate();

  if (row.source === "stored" || !row.packetItem) {
    return (
      <section className="reviewer-exception-action read-only">
        <div>
          <span>No manual action</span>
          <strong>{row.source === "stored" ? "Stored for audit" : "Decision unavailable"}</strong>
          <p>Open or download the evidence if this record needs a later audit.</p>
        </div>
      </section>
    );
  }

  const item = row.packetItem;
  const noteId = reviewRowNoteId(row);
  const note = notes[noteId] ?? "";
  const suggestedNote = suggestedAuditNote(item.prescreen, "Reviewed by Sarthi reviewer.");
  const useSuggested = () => onNoteChange(noteId, suggestedNote);
  const canReject = note.trim().length >= MIN_REJECT_NOTE_LENGTH;

  if (item.kind === "document") {
    const canReview = item.item.status === "submitted" || item.item.status === "under_review";
    return (
      <section className="reviewer-exception-action">
        <DecisionPanelHead title="Decision" detail="Approve only if the document matches the seller record." />
        <NoteEditor note={note} onNoteChange={(value) => onNoteChange(noteId, value)} onUseSuggestedNote={useSuggested} />
        <ActionRow>
          <button className="seller-primary-action" type="button" disabled={!canReview || busyAction === `approve-doc-${item.item.document_id}`} onClick={() =>
            onRunAction(
              `approve-doc-${item.item.document_id}`,
              () => approveSellerDocument(item.item.document_id, note.trim() || suggestedNote),
              "Verification document approved.",
              noteId
            )
          }>
            <CheckCircle2 size={14} />
            Approve document
          </button>
          <button className="seller-danger-action" type="button" disabled={!canReview || !canReject || busyAction === `reject-doc-${item.item.document_id}`} onClick={() =>
            onRunAction(
              `reject-doc-${item.item.document_id}`,
              () => rejectSellerDocument(item.item.document_id, note.trim()),
              "Verification document rejected with seller note.",
              noteId
            )
          }>
            <XCircle size={14} />
            Reject
          </button>
        </ActionRow>
      </section>
    );
  }

  if (item.kind === "proof") {
    const canReview = item.item.status === "submitted";
    const proofDecision = item.prescreen.proof_quality?.decision;
    const proofDecisionDetail = proofDecision === "reject"
      ? "Reject or request a replacement when AI flags mismatch, catalog reuse, or unclear proof."
      : proofDecision === "ask_revision"
        ? "Approve only if the proof clearly answers the buyer doubt; otherwise ask for a cleaner upload."
        : "Approve only when the seller proof answers the buyer doubt.";
    return (
      <section className="reviewer-exception-action">
        <DecisionPanelHead title="Decision" detail={proofDecisionDetail} />
        <NoteEditor note={note} onNoteChange={(value) => onNoteChange(noteId, value)} onUseSuggestedNote={useSuggested} />
        <ActionRow>
          <button className="seller-primary-action" type="button" disabled={!canReview || busyAction === `approve-proof-${item.item.proof_id}`} onClick={() =>
            onRunAction(
              `approve-proof-${item.item.proof_id}`,
              () => approveSellerEvidenceAsset(item.item.proof_id, note.trim() || suggestedNote),
              "Seller proof approved.",
              noteId
            )
          }>
            <CheckCircle2 size={14} />
            Approve proof
          </button>
          <button className="seller-danger-action" type="button" disabled={!canReview || !canReject || busyAction === `reject-proof-${item.item.proof_id}`} onClick={() =>
            onRunAction(
              `reject-proof-${item.item.proof_id}`,
              () => rejectSellerEvidenceAsset(item.item.proof_id, note.trim()),
              "Seller proof rejected with seller note.",
              noteId
            )
          }>
            <XCircle size={14} />
            Reject
          </button>
        </ActionRow>
      </section>
    );
  }

  if (item.kind === "draft") {
    const canPublish = item.item.status === "submitted" && item.item.verification_status === "verified";
    return (
      <section className="reviewer-exception-action">
        <DecisionPanelHead title="Decision" detail="Publish verified seller drafts or return them with one clear fix." />
        <NoteEditor note={note} onNoteChange={(value) => onNoteChange(noteId, value)} onUseSuggestedNote={useSuggested} />
        <ActionRow>
          <button className="seller-primary-action" type="button" disabled={!canPublish || busyAction === `publish-draft-${item.item.draft_id}`} onClick={() =>
            onRunAction(
              `publish-draft-${item.item.draft_id}`,
              () => approveListingDraft(item.item.draft_id, note.trim() || suggestedNote),
              "Listing draft published.",
              noteId
            )
          }>
            <Send size={14} />
            Publish
          </button>
          <button className="seller-secondary-action" type="button" disabled={item.item.status !== "submitted" || !canReject || busyAction === `revision-draft-${item.item.draft_id}`} onClick={() =>
            onRunAction(
              `revision-draft-${item.item.draft_id}`,
              () => requestListingRevision(item.item.draft_id, note.trim()),
              "Listing revision requested.",
              noteId
            )
          }>
            <XCircle size={14} />
            Request fix
          </button>
        </ActionRow>
      </section>
    );
  }

  const canApproveSeller = item.item.status === "pending_review" && !(row.sellerPendingDocuments?.length);
  return (
    <section className="reviewer-exception-action">
      <DecisionPanelHead title="Decision" detail="Approve the seller only after required documents have cleared." />
      {row.sellerPendingDocuments?.length ? (
        <BlockerNotice
          text={`Clear documents first: ${row.sellerPendingDocuments.map(labelize).join(", ")}.`}
          actionLabel="Review documents"
          onAction={() => navigate("/admin/uploads")}
        />
      ) : null}
      <NoteEditor note={note} onNoteChange={(value) => onNoteChange(noteId, value)} onUseSuggestedNote={useSuggested} />
      <ActionRow>
        <button className="seller-primary-action" type="button" disabled={!canApproveSeller || busyAction === `approve-app-${item.item.application_id}`} onClick={() =>
          onRunAction(
            `approve-app-${item.item.application_id}`,
            () => approveSellerApplication(item.item.application_id, note.trim() || suggestedNote),
            "Seller application approved.",
            noteId
          )
        }>
          <CheckCircle2 size={14} />
          {row.sellerPendingDocuments?.length ? "Docs pending" : "Approve seller"}
        </button>
        <button className="seller-danger-action" type="button" disabled={item.item.status !== "pending_review" || !canReject || busyAction === `reject-app-${item.item.application_id}`} onClick={() =>
          onRunAction(
            `reject-app-${item.item.application_id}`,
            () => rejectSellerApplication(item.item.application_id, note.trim()),
            "Seller application rejected.",
            noteId
          )
        }>
          <XCircle size={14} />
          Reject
        </button>
      </ActionRow>
    </section>
  );
}

function DecisionPanelHead({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="reviewer-decision-head">
      <span>{title}</span>
      <strong>{detail}</strong>
    </div>
  );
}

function ExceptionTimeline({ row, events }: { row: ReviewDeskRow; events: AdminAuditEvent[] }) {
  const caseTimeline = row.queueItem?.case_file?.audit_timeline ?? [];
  const auditRows = events
    .filter((event) => event.target_id === row.targetId || event.seller_id === row.sellerId)
    .slice(0, 4);

  return (
    <section className="reviewer-exception-timeline" aria-label="Audit timeline">
      <div className="reviewer-timeline-head">
        <span>Timeline</span>
        <strong>{caseTimeline.length || auditRows.length || 1} steps</strong>
      </div>
      <ol>
        {caseTimeline.length ? (
          caseTimeline.map((event) => (
            <li key={`${row.id}-${event.label}-${event.status}`} className={event.status}>
              <span />
              <div>
                <strong>{event.label}</strong>
                <p>{event.detail}</p>
                <small>{formatDate(event.timestamp)}</small>
              </div>
            </li>
          ))
        ) : auditRows.length ? (
          auditRows.map((event) => (
            <li key={event.event_id} className="done">
              <span />
              <div>
                <strong>{labelize(event.action)}</strong>
                <p>{event.notes || labelize(event.decision)}</p>
                <small>{formatDate(event.created_at)}</small>
              </div>
            </li>
          ))
        ) : (
          <li className={row.source === "stored" ? "done" : "current"}>
            <span />
            <div>
              <strong>{row.source === "stored" ? "Stored by pre-check" : "Waiting for reviewer"}</strong>
              <p>{row.triageReason}</p>
              <small>{formatDate(row.submittedAt)}</small>
            </div>
          </li>
        )}
      </ol>
    </section>
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

function FinalActionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="reviewer-final-action-head">
      <span>{title}</span>
      <strong>{subtitle}</strong>
    </div>
  );
}

function SellerApplicationCard({
  application,
  seller,
  hideHeader = false,
  showPrescreen = true,
  showDetails = true,
  note,
  busyAction,
  onNoteChange,
  onUseSuggestedNote,
  onApprove,
  onReject
}: {
  application: SellerApplicationReview;
  seller: AdminSellerDossier;
  hideHeader?: boolean;
  showPrescreen?: boolean;
  showDetails?: boolean;
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
      {!hideHeader && (
        <CardHeader
          icon={<ShieldCheck size={16} />}
          eyebrow="Seller application"
          title={application.business_name}
          subtitle={`${application.seller_name} | ${application.application_id}`}
          status={application.status}
          prescreen={application.prescreen}
        />
      )}
      {hideHeader && <FinalActionHeader title="Final action" subtitle="Approve seller only after the required documents are clear." />}

      {missingDocuments.length > 0 && (
        <BlockerNotice text={`Approve required documents first: ${missingDocuments.join(", ")}.`} />
      )}

      {showDetails && (
        <ReviewFoldout title="Seller details" subtitle={`${application.gst_number} | ${application.pickup_pincode}`} resetKey={application.application_id}>
          <DetailGrid>
            <DetailTile label="GST number" value={application.gst_number} />
            <DetailTile label="Pickup pincode" value={application.pickup_pincode} />
            <DetailTile label="Support contact" value={application.support_contact} />
            <DetailTile label="Verification" value={labelize(application.verification_status ?? "not started")} />
            <DetailTile label="Created" value={formatDate(application.created_at)} />
          </DetailGrid>
        </ReviewFoldout>
      )}

      {showPrescreen && <PrescreenBox prescreen={application.prescreen} />}

      <NoteEditor note={note} onNoteChange={onNoteChange} onUseSuggestedNote={onUseSuggestedNote} />

      <ActionRow>
        <button className="seller-primary-action" type="button" disabled={!canApprove || busyAction === approveActionKey} onClick={onApprove}>
          <CheckCircle2 size={14} />
          {missingDocuments.length ? "Docs pending" : "Approve seller"}
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
  hideHeader = false,
  showPrescreen = true,
  showDetails = true,
  note,
  busyAction,
  onNoteChange,
  onUseSuggestedNote,
  onApprove,
  onReject
}: {
  document: VerificationDocumentReview;
  hideHeader?: boolean;
  showPrescreen?: boolean;
  showDetails?: boolean;
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
      {!hideHeader && (
        <CardHeader
          icon={<FileCheck2 size={16} />}
          eyebrow="Verification document"
          title={labelize(document.document_type)}
          subtitle={`${document.seller_name} | ${document.file_name}`}
          status={document.status}
          prescreen={document.prescreen}
        />
      )}
      {hideHeader && <FinalActionHeader title="Final action" subtitle="Approve if the uploaded document matches the seller record." />}

      {showDetails && (
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
      )}

      {showPrescreen && <PrescreenBox prescreen={document.prescreen} />}

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
  hideHeader = false,
  showPrescreen = true,
  showDetails = true
}: {
  draft: ListingDraftReview;
  note: string;
  busyAction: string | null;
  onNoteChange: (value: string) => void;
  onUseSuggestedNote: () => void;
  onPublish: () => void;
  onRevision: () => void;
  hideHeader?: boolean;
  showPrescreen?: boolean;
  showDetails?: boolean;
}) {
  const submitted = draft.status === "submitted";
  const sellerVerified = draft.verification_status === "verified";
  const canPublish = submitted && sellerVerified;
  const canRequestRevision = submitted && note.trim().length >= MIN_REJECT_NOTE_LENGTH;
  const publishActionKey = `publish-draft-${draft.draft_id}`;
  const revisionActionKey = `revision-draft-${draft.draft_id}`;
  const passedChecks = draft.prescreen.checks.filter((check) => check.status === "pass").length;
  const totalChecks = draft.prescreen.checks.length;

  return (
    <article className={`seller-review-card ${hideHeader ? "seller-draft-final-card" : ""}`}>
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
      {hideHeader && (
        <FinalActionHeader
          title="Decision"
          subtitle={canPublish ? "Ready to publish after the reviewer note is correct." : "Clear the blocked checks before this listing goes live."}
        />
      )}

      {!sellerVerified && <BlockerNotice text={`Seller verification is ${labelize(draft.verification_status ?? "missing")}. Publish is blocked.`} />}
      {!submitted && <BlockerNotice text={`Seller has not submitted this draft for review yet. Current status: ${labelize(draft.status)}.`} />}

      {hideHeader && (
        <div className="seller-draft-decision-strip" aria-label="Draft decision summary">
          <div className="strip-item">
            <span className="strip-label">Seller status</span>
            <strong className={`strip-pill ${sellerVerified ? "pill-pass" : "pill-fail"}`}>
              {sellerVerified ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
              {sellerVerified ? "Verified" : "Blocked"}
            </strong>
          </div>
          <div className="strip-item">
            <span className="strip-label">AI checks</span>
            <strong className={`strip-pill ${passedChecks === totalChecks ? "pill-pass" : "pill-warn"}`}>
              <Sparkles size={13} />
              {passedChecks}/{totalChecks || 0} passed
            </strong>
          </div>
          <div className="strip-item">
            <span className="strip-label">Reviewer action</span>
            <strong className={`strip-pill ${canPublish ? "pill-action" : "pill-warn"}`}>
              {canPublish ? "Publish or revise" : "Resolve blocker"}
            </strong>
          </div>
        </div>
      )}

      {showDetails && (
        <ReviewFoldout title="Listing facts" subtitle={`${draft.garment_type} | ${draft.fabric} | ${formatPrice(draft.base_price)}`} resetKey={draft.draft_id}>
          <div className="seller-media-detail">
            {isRenderableImage(draft.image_url) ? (
              <img src={evidenceAssetUrl(draft.image_url) ?? draft.image_url} alt={draft.title} />
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
      )}

      {showPrescreen && <PrescreenBox prescreen={draft.prescreen} />}

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
  hideHeader = false,
  showPrescreen = true,
  showDetails = true,
  note,
  busyAction,
  onNoteChange,
  onUseSuggestedNote,
  onApprove,
  onReject
}: {
  proof: ProofAssetReview;
  hideHeader?: boolean;
  showPrescreen?: boolean;
  showDetails?: boolean;
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
      {!hideHeader && (
        <CardHeader
          icon={<ImageIcon size={16} />}
          eyebrow="Proof upload"
          title={proof.title}
          subtitle={`${proof.seller_name} | ${proof.product_title}`}
          status={proof.status}
          prescreen={proof.prescreen}
        />
      )}
      {hideHeader && <FinalActionHeader title="Final action" subtitle="Approve only if the proof directly answers the buyer doubt." />}

      {showDetails && (
        <ReviewFoldout title="Proof details" subtitle={`${labelize(proof.attribute)} | ${labelize(proof.proof_type)}`} defaultOpen={canReview} resetKey={proof.proof_id}>
          <div className="seller-media-detail">
            {isRenderableImage(proof.asset_url) ? (
              <img src={evidenceAssetUrl(proof.asset_url) ?? proof.asset_url} alt={proof.title} />
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
                  <img src={evidenceAssetUrl(proof.product_image_url) ?? ""} alt={proof.product_title} />
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

          {proof.buyer_doubt_examples?.length ? (
            <div className="seller-proof-doubt-list" aria-label="Buyer doubts linked to this proof">
              <span>Buyer doubts linked</span>
              {proof.buyer_doubt_examples.slice(0, 3).map((doubt) => (
                <p key={doubt}>{doubt}</p>
              ))}
            </div>
          ) : null}
        </ReviewFoldout>
      )}

      {showPrescreen && <PrescreenBox prescreen={proof.prescreen} />}

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
  recommended,
  onSelect
}: {
  seller: AdminSellerDossier;
  laneLabel: string;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const hasAction = seller.open_review_items > 0 || seller.pending_documents.length > 0;
  const blockerSummary = seller.pending_documents.length
    ? `${seller.pending_documents.length} document${seller.pending_documents.length === 1 ? "" : "s"} block approval`
    : seller.submitted_proof_count > 0
      ? `${seller.submitted_proof_count} proof${seller.submitted_proof_count === 1 ? "" : "s"} awaiting decision`
      : seller.submitted_draft_count > 0
        ? `${seller.submitted_draft_count} listing${seller.submitted_draft_count === 1 ? "" : "s"} awaiting decision`
        : hasAction
          ? seller.next_action
          : "No action needed";
  return (
    <button className={`seller-report-button ${selected ? "selected" : ""}`} type="button" onClick={onSelect}>
      <div className="seller-report-button-top">
        <div>
          {recommended && <span className="reviewer-recommended-label">Recommended</span>}
          <strong>{seller.seller_name}</strong>
          <span>{seller.seller_id}</span>
        </div>
        <StatusPill value={seller.verification_status} />
      </div>
      <p>{blockerSummary}</p>
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
  readyForReview,
  queueItem
}: {
  prescreen: AdminPrescreenSuggestion;
  readyForReview: boolean;
  queueItem?: AdminQueueSnapshot;
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
        {queueItem && <DecisionBriefMetric label="SLA" value={queueSlaLabel(queueItem)} />}
        {queueItem && <DecisionBriefMetric label="Trust lift" value={queueTrustLiftLabel(queueItem)} />}
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

function ReviewerCopilotBrief({
  prescreen,
  readyForReview,
  queueItem
}: {
  prescreen: AdminPrescreenSuggestion;
  readyForReview: boolean;
  queueItem?: AdminQueueSnapshot;
}) {
  const evidence = (queueItem?.evidence?.length ? queueItem.evidence : prescreen.evidence).slice(0, 3);
  const blocker = queueItem?.blocker ?? null;
  const guardrail = blocker
    ? blocker
    : prescreen.route_to === "senior_reviewer"
      ? "Senior reviewer must confirm before any approval."
      : "Human reviewer remains final owner; the agent only pre-reads evidence.";

  return (
    <section className="reviewer-copilot-brief" aria-label="Reviewer copilot impact">
      <div className="reviewer-copilot-head">
        <Bot size={16} />
        <div>
          <span>Reviewer copilot</span>
          <strong>{prescreen.route_to === "senior_reviewer" ? "Senior review route" : "Standard review route"}</strong>
          <p><span className="reviewer-copilot-inline-label">Buyer impact</span>{queueItem?.buyer_impact ?? prescreen.learn}</p>
        </div>
      </div>

      <div className="reviewer-copilot-metrics">
        <CopilotMetric label="Waiting" value={queueItem ? queueAgeLabel(queueItem) : "History"} />
        <CopilotMetric label="SLA" value={queueItem ? queueSlaLabel(queueItem) : readyForReview ? "Review now" : "Closed"} />
        <CopilotMetric label="Risk" value={`${labelize(prescreen.risk_level)} ${prescreen.risk_score}`} />
        <CopilotMetric label="Trust lift" value={queueItem ? queueTrustLiftLabel(queueItem) : "No active lift"} />
      </div>

      {prescreen.proof_quality && <ProofQualityCopilot quality={prescreen.proof_quality} />}

      <div className="reviewer-copilot-trail" aria-label="Agent pre-check trail">
        <div>
          <span>Observed</span>
          <p>{prescreen.observe}</p>
        </div>
        <div>
          <span>Reason</span>
          <p>{prescreen.reason}</p>
        </div>
        <div>
          <span>Safe action</span>
          <p>{prescreen.act}</p>
        </div>
      </div>

      <div className={`reviewer-copilot-guardrail ${blocker ? "blocked" : "safe"}`}>
        {blocker ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}
        <span>{guardrail}</span>
      </div>

      {evidence.length > 0 && (
        <div className="reviewer-copilot-evidence">
          <span>Evidence used</span>
          <ul>
            {evidence.map((item) => (
              <li key={`${item.source_id}-${item.label}`}>
                <strong>{item.label}</strong>
                <em>{item.value}</em>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ProofQualityCopilot({ quality }: { quality: NonNullable<AdminPrescreenSuggestion["proof_quality"]> }) {
  const visual = isProofVisualMatch(quality.visual_match) ? quality.visual_match : null;
  const tone = visual?.tone ?? (quality.decision === "approve" ? "pass" : quality.decision === "reject" ? "fail" : "warn");
  const displayScore = visual ? proofVisualScore(visual.score) : 52;
  const headline = visual?.label ?? "Visual match not proven";
  const summary = visual?.summary ?? "AI has not confirmed that the seller upload and catalog reference belong to the same product. Keep this in human review.";

  return (
    <section className={`proof-quality-copilot ${tone}`} aria-label="Proof quality reviewer">
      <div className="proof-quality-head">
        <div>
          <span>AI proof gate</span>
          <strong>{headline}</strong>
          <p>{summary}</p>
        </div>
        <b>{displayScore}/100</b>
      </div>

      <div className="proof-quality-route">
        <div>
          <span>Buyer doubt</span>
          <strong>{quality.buyer_doubt}</strong>
        </div>
        <div>
          <span>Claim checked</span>
          <strong>{quality.claim_checked}</strong>
        </div>
        <div>
          <span>Copilot says</span>
          <strong>{proofQualityDecisionLabel(quality.decision)}</strong>
        </div>
        <div>
          <span>Reviewer action</span>
          <strong>{tone === "pass" ? "Open once, then approve" : "Keep trust lift blocked"}</strong>
        </div>
      </div>

      <div className="proof-quality-checks" aria-label="Proof quality checks">
        {quality.checks.map((check) => (
          <div className={`proof-quality-check ${check.status}`} key={`${check.key}-${check.label}`}>
            {check.status === "pass" ? <CheckCircle2 size={14} /> : check.status === "warn" ? <AlertTriangle size={14} /> : <XCircle size={14} />}
            <div>
              <strong>{check.label}</strong>
              <span>{check.detail}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="proof-quality-guardrail">
        <ShieldCheck size={14} />
        <span>{quality.reviewer_instruction} Final decision stays with the human reviewer.</span>
      </div>
    </section>
  );
}

function proofQualityDecisionLabel(decision: NonNullable<AdminPrescreenSuggestion["proof_quality"]>["decision"]) {
  if (decision === "approve") return "Approve after visual check";
  if (decision === "reject") return "Reject with clear note";
  return "Ask seller for revision";
}

function CopilotMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ReviewActionChecklist({ item }: { item: SellerPacketItem }) {
  const issue = item.prescreen.checks.find((check) => check.status === "fail") ??
    item.prescreen.checks.find((check) => check.status === "warn") ??
    null;
  const suggestedAction = decisionActionLabel(item.prescreen.suggested_action);
  const itemAction = reviewItemActionLabel(item);
  const source = providerText(item.prescreen.agent_provider);
  const steps = item.readyForReview
    ? [
        {
          label: "1. Check",
          detail: issue ? `${issue.label}: ${issue.detail}` : "Core validation checks passed. Verify the visible file or proof once."
        },
        {
          label: "2. Note",
          detail: `Use the suggested audit note from ${source}; edit only if the opened evidence differs.`
        },
        {
          label: "3. Decide",
          detail: `${itemAction || suggestedAction}. ${item.queueItem ? item.queueItem.buyer_impact : "The final approval, rejection, or revision stays human-controlled."}`
        }
      ]
    : [
        {
          label: "Done",
          detail: "This item is in history. Use it only for context before deciding another blocker."
        }
      ];

  return (
    <details className="reviewer-guidance">
      <summary>
        <span>Review guidance</span>
        <small>{steps.length} step{steps.length === 1 ? "" : "s"}</small>
      </summary>
      <section className="seller-review-checklist" aria-label="Reviewer next steps">
        {steps.map((step) => (
          <div key={step.label}>
            <span>{step.label}</span>
            <p>{step.detail}</p>
          </div>
        ))}
      </section>
    </details>
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

function reviewItemActionLabel(item: SellerPacketItem) {
  const action = item.prescreen.suggested_action;
  if (item.kind === "document") {
    if (action === "approve" || action === "approve_document") return "Approve document";
    if (action === "reject" || action === "reject_document") return "Reject document";
  }
  if (item.kind === "draft") {
    if (action === "approve" || action === "publish") return "Publish draft";
    if (action === "reject" || action === "request_revision") return "Request fixes";
  }
  if (item.kind === "proof") {
    if (action === "approve" || action === "approve_document") return "Approve proof";
    if (action === "reject" || action === "reject_document") return "Reject proof";
  }
  return decisionActionLabel(action);
}

function providerText(provider: AdminPrescreenSuggestion["agent_provider"]) {
  if (provider === "bedrock") return "Bedrock pre-check";
  if (provider === "gemini") return "Gemini pre-check";
  if (provider === "fallback_after_llm_error") return "Rules fallback";
  return "Rules pre-check";
}

function queueTrustLiftLabel(item: Pick<AdminQueueSnapshot, "trust_impact_points">) {
  const points = Number(item.trust_impact_points ?? 0);
  return points > 0 ? `+${points} trust` : "No direct lift";
}

function queueAgeLabel(item: Pick<AdminQueueSnapshot, "age_hours">) {
  const hours = Math.max(0, Math.round(Number(item.age_hours ?? 0)));
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

function queueSlaLabel(item: Pick<AdminQueueSnapshot, "sla_state" | "age_hours" | "sla_hours">) {
  const state = item.sla_state === "breached" ? "Breached" : item.sla_state === "due_today" ? "Due today" : "On track";
  const age = queueAgeLabel(item);
  const slaHours = Math.max(1, Math.round(Number(item.sla_hours ?? 0)));
  const target = slaHours < 24 ? `${slaHours}h` : `${Math.round(slaHours / 24)}d`;
  return `${state} (${age}/${target})`;
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

function BlockerNotice({
  text,
  actionLabel,
  onAction
}: {
  text: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="seller-blocker-notice">
      <div className="seller-blocker-notice-content">
        <AlertTriangle size={15} />
        <span>{text}</span>
      </div>
      {actionLabel && onAction && (
        <button className="seller-blocker-notice-btn" type="button" onClick={onAction}>
          {actionLabel}
        </button>
      )}
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
  return <span className={`review-status-pill ${statusTone(value)} ${statusClassName(value)}`}>{labelize(value)}</span>;
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
  const generated = provider === "bedrock" || provider === "gemini";
  const label = providerText(provider);
  return <span className={`review-provider-pill ${generated ? "gemini" : ""}`}>{label}</span>;
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

function ReviewerLoadingState({ message, subtext }: { message: string; subtext: string }) {
  return (
    <section className="reviewer-loading-state" role="status" aria-live="polite" aria-busy="true">
      <div className="reviewer-loading-banner">
        <div className="reviewer-loading-icon">
          <ShieldCheck size={20} />
        </div>
        <div className="reviewer-loading-copy">
          <div className="reviewer-loading-title-row">
            <h3>{message}</h3>
            <div className="reviewer-loading-spinner" />
          </div>
          <p>{subtext}</p>
        </div>
      </div>
    </section>
  );
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
  if (pathname.startsWith("/admin/sellers")) return "reports";
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
  return "/admin/sellers";
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
  const queueItemById = new Map(report.queueItems.map((item) => [item.queue_item_id, item]));
  const applications: SellerPacketItem[] = report.applications.map((application) => ({
    id: `application-${application.application_id}`,
    kind: "application",
    title: application.business_name,
    subtitle: `${application.gst_number} | ${application.support_contact}`,
    status: application.status,
    group: "Seller identity",
    readyForReview: application.status === "pending_review" && report.seller.pending_documents.length === 0 && itemNeedsReviewer(queueItemById.get(application.application_id), application.prescreen, application.status),
    queueItem: queueItemById.get(application.application_id),
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
    readyForReview: (document.status === "submitted" || document.status === "under_review") && itemNeedsReviewer(queueItemById.get(document.document_id), document.prescreen, document.status),
    queueItem: queueItemById.get(document.document_id),
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
    readyForReview: draft.status === "submitted" && itemNeedsReviewer(queueItemById.get(draft.draft_id), draft.prescreen, draft.status),
    queueItem: queueItemById.get(draft.draft_id),
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
    readyForReview: proof.status === "submitted" && itemNeedsReviewer(queueItemById.get(proof.proof_id), proof.prescreen, proof.status),
    queueItem: queueItemById.get(proof.proof_id),
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

function adminTriageView(queue: AdminReviewQueue): AdminTriageView {
  const provided = (queue as AdminReviewQueue & { triage?: AdminTriageView }).triage;
  if (provided?.pipeline?.length) return provided;

  const storedRows = storedEvidenceRows(queue);
  const activeCount = queue.active_queue.length;
  const filteredCount = Math.max(0, storedRows.length - activeCount);
  const bucketCount = (bucket: AdminTriageBucket) =>
    storedRows.filter((item) => normalizeTriageBucket(item.triage_bucket) === bucket).length;

  return {
    headline: activeCount ? "AI-filtered reviewer queue" : "AI cleared the reviewer queue",
    summary: activeCount
      ? `${activeCount} of ${storedRows.length} stored item${storedRows.length === 1 ? "" : "s"} need a human decision.`
      : `${storedRows.length} stored item${storedRows.length === 1 ? "" : "s"} are kept for audit or seller follow-up.`,
    stored_count: storedRows.length,
    reviewer_queue_count: activeCount,
    filtered_count: filteredCount,
    pipeline: [
      {
        key: "stored",
        label: "Stored uploads",
        count: storedRows.length,
        detail: "Documents, proofs, drafts, and seller applications stay viewable."
      },
      {
        key: "checked",
        label: "AI pre-checked",
        count: storedRows.length,
        detail: "Evidence, risk, policy, buyer demand, and SLA signals are read first."
      },
      {
        key: "filtered",
        label: "Filtered out",
        count: filteredCount,
        detail: "Seller fixes, reusable standards, and completed items avoid manual queue load."
      },
      {
        key: "reviewer",
        label: "Reviewer queue",
        count: activeCount,
        detail: "Only human decision exceptions remain."
      }
    ],
    buckets: [
      {
        key: "fast_review",
        label: ADMIN_TRIAGE_LABELS.fast_review,
        count: bucketCount("fast_review"),
        detail: "Low-risk suggestions that still need one human confirmation."
      },
      {
        key: "manual_review",
        label: ADMIN_TRIAGE_LABELS.manual_review,
        count: bucketCount("manual_review"),
        detail: "Enough evidence exists, but not enough confidence for fast review."
      },
      {
        key: "senior_review",
        label: ADMIN_TRIAGE_LABELS.senior_review,
        count: bucketCount("senior_review"),
        detail: "High-risk items that need senior review."
      },
      {
        key: "seller_fix",
        label: ADMIN_TRIAGE_LABELS.seller_fix,
        count: bucketCount("seller_fix"),
        detail: "Stored submissions that should return to the seller with a clear fix."
      },
      {
        key: "reuse_standard",
        label: ADMIN_TRIAGE_LABELS.reuse_standard,
        count: bucketCount("reuse_standard"),
        detail: "Duplicate proof work covered by an existing verified standard."
      }
    ]
  };
}

function storedEvidenceRows(queue: AdminReviewQueue): AdminStoredEvidenceItem[] {
  const provided = (queue as AdminReviewQueue & { stored_evidence?: AdminStoredEvidenceItem[] }).stored_evidence;
  if (provided?.length) return provided;

  const activeById = new Map(queue.active_queue.map((item) => [item.queue_item_id, item]));
  const rows: AdminStoredEvidenceItem[] = [
    ...queue.seller_applications.map((application) =>
      fallbackStoredEvidenceRow({
        id: application.application_id,
        itemType: "seller_application",
        sellerId: application.seller_id,
        sellerName: application.seller_name || application.business_name,
        title: application.business_name,
        subtitle: `${application.gst_number} | ${application.support_contact}`,
        status: application.status,
        submittedAt: application.created_at,
        assetUrl: null,
        productImageUrl: null,
        reference: application.gst_number,
        prescreen: application.prescreen,
        queueItem: activeById.get(application.application_id)
      })
    ),
    ...queue.documents.map((document) =>
      fallbackStoredEvidenceRow({
        id: document.document_id,
        itemType: "verification_document",
        sellerId: document.seller_id,
        sellerName: document.seller_name,
        title: labelize(document.document_type),
        subtitle: document.file_name,
        status: document.status,
        submittedAt: document.submitted_at,
        assetUrl: document.storage_uri,
        productImageUrl: null,
        reference: document.reference,
        prescreen: document.prescreen,
        queueItem: activeById.get(document.document_id)
      })
    ),
    ...queue.listing_drafts.map((draft) =>
      fallbackStoredEvidenceRow({
        id: draft.draft_id,
        itemType: "listing_draft",
        sellerId: draft.seller_id,
        sellerName: draft.seller_name,
        title: draft.title,
        subtitle: `${labelize(draft.category)} | ${labelize(draft.readiness_status)}`,
        status: draft.status,
        submittedAt: draft.submitted_at ?? draft.updated_at,
        assetUrl: draft.image_url,
        productImageUrl: draft.image_url,
        reference: draft.target_cluster_id ?? draft.category,
        prescreen: draft.prescreen,
        queueItem: activeById.get(draft.draft_id)
      })
    ),
    ...queue.proof_assets.map((proof) =>
      fallbackStoredEvidenceRow({
        id: proof.proof_id,
        itemType: "proof_asset",
        sellerId: proof.seller_id,
        sellerName: proof.seller_name,
        title: proof.title || proof.product_title,
        subtitle: `${labelize(proof.attribute)} | ${labelize(proof.proof_type)}`,
        status: proof.status,
        submittedAt: proof.submitted_at ?? proof.created_at,
        assetUrl: proof.asset_url,
        productImageUrl: proof.product_image_url,
        reference: proof.product_title,
        prescreen: proof.prescreen,
        queueItem: activeById.get(proof.proof_id),
        openRequestCount: proof.open_request_count
      })
    )
  ];

  return rows.sort((left, right) => dateValue(right.submitted_at) - dateValue(left.submitted_at)).slice(0, 80);
}

function fallbackStoredEvidenceRow(input: {
  id: string;
  itemType: AdminPrescreenSuggestion["item_type"];
  sellerId: string;
  sellerName: string;
  title: string;
  subtitle: string;
  status: string;
  submittedAt: string | null;
  assetUrl: string | null;
  productImageUrl: string | null;
  reference: string | null;
  prescreen: AdminPrescreenSuggestion;
  queueItem?: AdminQueueSnapshot;
  openRequestCount?: number;
}): AdminStoredEvidenceItem {
  const bucket = input.queueItem?.triage_bucket ?? prescreenTriageBucket(input.prescreen, input.status);
  const active = Boolean(input.queueItem?.reviewer_visible ?? REVIEWER_VISIBLE_TRIAGE_BUCKETS.includes(bucket));
  return {
    id: input.id,
    item_type: input.itemType,
    seller_id: input.sellerId,
    seller_name: input.sellerName,
    title: input.title,
    subtitle: input.subtitle,
    status: input.status,
    submitted_at: input.submittedAt,
    triage_bucket: bucket,
    triage_label: input.queueItem?.triage_label ?? triageLabel(bucket),
    triage_reason: input.queueItem?.triage_reason ?? triageReason(input.prescreen, bucket),
    review_visibility: active
      ? "reviewer_queue"
      : input.status === "auto_verified"
        ? "auto_reviewed"
        : completedStatus(input.status) ? "completed" : "ai_bypassed",
    suggested_action: input.prescreen.suggested_action,
    risk_score: input.prescreen.risk_score,
    risk_level: input.prescreen.risk_level,
    confidence: input.prescreen.confidence,
    agent_provider: input.prescreen.agent_provider,
    asset_url: input.assetUrl,
    product_image_url: input.productImageUrl,
    reference: input.reference,
    open_request_count: input.openRequestCount ?? 0
  };
}

function itemNeedsReviewer(queueItem: AdminQueueSnapshot | undefined, prescreen: AdminPrescreenSuggestion, status: string) {
  if (!["submitted", "under_review", "pending_review"].includes(status)) return false;
  const bucket = queueItem?.triage_bucket ?? prescreenTriageBucket(prescreen, status);
  return Boolean(queueItem?.reviewer_visible ?? REVIEWER_VISIBLE_TRIAGE_BUCKETS.includes(bucket));
}

function prescreenTriageBucket(prescreen: AdminPrescreenSuggestion, status?: string): AdminTriageBucket {
  const direct = (prescreen as AdminPrescreenSuggestion & { triage_bucket?: string }).triage_bucket;
  if (direct) return normalizeTriageBucket(direct);
  if (completedStatus(status ?? "")) return "stored_only";
  const failedChecks = prescreen.checks.filter((check) => check.status === "fail").length;
  if (prescreen.route_to === "senior_reviewer" || prescreen.risk_level === "high") return "senior_review";
  if (failedChecks > 0) return "seller_fix";
  if (prescreen.confidence === "high" && prescreen.risk_level === "low" && prescreen.suggested_action !== "manual_check") return "fast_review";
  return "manual_review";
}

function normalizeTriageBucket(value: unknown): AdminTriageBucket {
  if (
    value === "fast_review" ||
    value === "manual_review" ||
    value === "senior_review" ||
    value === "seller_fix" ||
    value === "reuse_standard" ||
    value === "stored_only"
  ) {
    return value;
  }
  return "stored_only";
}

function triageLabel(bucket: AdminTriageBucket) {
  return ADMIN_TRIAGE_LABELS[bucket] ?? "Stored";
}

function triageReason(prescreen: AdminPrescreenSuggestion, bucket: AdminTriageBucket) {
  const direct = (prescreen as AdminPrescreenSuggestion & { triage_reason?: string }).triage_reason;
  if (direct) return direct;
  if (bucket === "seller_fix") return "AI pre-check found a missing or weak requirement. Keep the evidence stored and send a specific correction.";
  if (bucket === "reuse_standard") return "AI found a reusable verified proof standard, so this upload can stay stored outside the manual queue.";
  if (bucket === "senior_review") return "Risk or policy signals require a senior human review.";
  if (bucket === "fast_review") return "AI pre-check found low risk and enough evidence for a quick human confirmation.";
  return prescreen.reason || "Stored for reviewer audit and future inspection.";
}

function triageBucketTone(bucket: AdminTriageBucket) {
  if (bucket === "fast_review" || bucket === "reuse_standard" || bucket === "stored_only") return "good";
  if (bucket === "manual_review") return "warn";
  return "bad";
}

function storedVisibilityLabel(value: AdminStoredEvidenceItem["review_visibility"]) {
  if (value === "reviewer_queue") return "Needs human";
  if (value === "auto_reviewed") return "Auto cleared";
  if (value === "ai_bypassed") return "Returned to seller";
  return "Closed";
}

function completedStatus(value: string) {
  return ["approved", "verified", "auto_verified", "published", "rejected"].includes(value);
}

function evidenceAssetUrl(value?: string | null) {
  if (!value) return null;
  const clean = value.trim().replace(/\\/g, "/");
  if (!clean) return null;
  if (clean.startsWith("seeded://proofs/")) {
    return seededProofAssetUrl(clean);
  }
  if (clean.startsWith("seeded/seller_documents/")) {
    return `/${clean}`;
  }
  if (/^https?:\/\//i.test(clean) || clean.startsWith("/") || clean.startsWith("data:")) {
    return clean;
  }
  return null;
}

function seededProofAssetUrl(value: string) {
  const hint = value.toLowerCase();
  if (/(measurement|size[_-]?chart|size|chest|length)/.test(hint)) {
    return "/catalog/pink-kurti-measurement.png";
  }
  if (/(fabric|close[_-]?up|material|transparent|transparency)/.test(hint)) {
    return "/catalog/pink-kurti-fabric.png";
  }
  if (/(color|colour|daylight|shade)/.test(hint)) {
    return "/catalog/pink-print-3.jpg";
  }
  return null;
}

function evidenceFileName(value: string) {
  const resolved = evidenceAssetUrl(value);
  return uploadedFileLabel(resolved ?? value);
}

function openableEvidenceUrl(value: string) {
  return Boolean(evidenceAssetUrl(value));
}

function compactEvidencePath(path: NonNullable<AdminQueueSnapshot["case_file"]>["evidence_path"]) {
  const priority = ["Trigger", "Seller", "Proof", "SKU outcomes", "Score impact"];
  const selected = priority
    .map((label) => path.find((step) => step.label === label))
    .filter((step): step is NonNullable<typeof step> => Boolean(step));
  return (selected.length ? selected : path).slice(0, 5);
}

function buildFourLivesImpact(item: SellerPacketItem): Array<{
  key: string;
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
}> {
  const queueItem = item.queueItem;
  const caseFile = queueItem?.case_file ?? null;
  const iconForActor = (actor: string) => {
    if (actor === "buyer") return <ShieldCheck size={15} />;
    if (actor === "seller") return <Store size={15} />;
    if (actor === "creator") return <Sparkles size={15} />;
    if (actor === "delivery") return <Send size={15} />;
    return <CheckCircle2 size={15} />;
  };
  if (caseFile?.marketplace_impact?.length) {
    return caseFile.marketplace_impact.map((impact) => ({
      key: impact.actor,
      label: impact.label,
      value: impact.value,
      detail: impact.detail,
      icon: iconForActor(impact.actor)
    }));
  }
  const waitingBuyers = item.kind === "proof"
    ? Math.max(0, Number(item.item.open_request_count ?? 0))
    : 0;
  const trustLift = queueItem ? queueTrustLiftLabel(queueItem) : "No active lift";
  const scoreAfter = caseFile?.score_simulation.next_if_approved;
  const sellerTask = caseFile?.seller_tasks[0];
  const buyerDetail = waitingBuyers > 0
    ? `${waitingBuyers} buyer proof request${waitingBuyers === 1 ? "" : "s"} can move from doubt to verified evidence.`
    : queueItem?.buyer_impact ?? item.prescreen.learn;
  const sellerDetail = sellerTask
    ? sellerTask.detail
    : item.kind === "application"
      ? "Verification decision decides whether this seller can earn buyer-facing trust."
      : item.kind === "draft"
        ? "A clean draft can enter the catalog with limited-evidence status."
        : "Seller receives a clear audit note instead of vague rejection.";
  const creatorDetail = item.kind === "proof" || item.kind === "draft"
    ? "Creator-facing recommendations can prefer listings with verified proof instead of only price or popularity."
    : "Only verified seller signals should reach recommendation surfaces.";
  const deliveryDetail = caseFile?.evidence_missing.some((signal) => signal.label.toLowerCase().includes("outcome"))
    ? "Limited outcome evidence keeps fulfilment confidence cautious."
    : "Clear product proof and fit evidence reduce avoidable returns and failed delivery attempts.";

  return [
    {
      key: "buyer",
      label: "Buyer",
      value: scoreAfter != null ? `${scoreAfter}/100 after approval` : trustLift,
      detail: buyerDetail,
      icon: <ShieldCheck size={15} />
    },
    {
      key: "seller",
      label: "Seller",
      value: sellerTask ? labelize(sellerTask.priority) : decisionActionLabel(item.prescreen.suggested_action),
      detail: sellerDetail,
      icon: <Store size={15} />
    },
    {
      key: "creator",
      label: "Creator",
      value: "Safer picks",
      detail: creatorDetail,
      icon: <Sparkles size={15} />
    },
    {
      key: "delivery",
      label: "Delivery",
      value: caseFile?.score_simulation.remaining_blockers.length ? "Cautious" : "Less friction",
      detail: deliveryDetail,
      icon: <Send size={15} />
    }
  ];
}

function buildExceptionReviewRows(queue: AdminReviewQueue): ReviewDeskRow[] {
  const queueItemById = new Map(queue.active_queue.map((item) => [item.queue_item_id, item]));
  const sellerById = new Map(queue.seller_dossiers.map((seller) => [seller.seller_id, seller]));
  const storedRows = (queue.stored_evidence?.length ? queue.stored_evidence : storedEvidenceRows(queue))
    .filter((item) => item.review_visibility !== "reviewer_queue");
  const liveRows: ReviewDeskRow[] = [
    ...queue.seller_applications.map((application) => {
      const queueItem = queueItemById.get(application.application_id);
      const seller = sellerById.get(application.seller_id);
      const packet: SellerPacketItem = {
        id: application.application_id,
        kind: "application",
        title: application.business_name,
        subtitle: `${application.seller_name} · ${application.gst_number}`,
        status: application.status,
        group: "Seller applications",
        readyForReview: application.status === "pending_review" && itemNeedsReviewer(queueItem, application.prescreen, application.status),
        queueItem,
        prescreen: application.prescreen,
        item: application
      };
      return reviewDeskRowFromPacket(packet, application.seller_id, application.seller_name, seller?.pending_documents ?? []);
    }),
    ...queue.documents.map((document) => {
      const queueItem = queueItemById.get(document.document_id);
      const packet: SellerPacketItem = {
        id: document.document_id,
        kind: "document",
        title: labelize(document.document_type),
        subtitle: `${document.reference} · ${document.file_name}`,
        status: document.status,
        group: "Documents",
        readyForReview: (document.status === "submitted" || document.status === "under_review") && itemNeedsReviewer(queueItem, document.prescreen, document.status),
        queueItem,
        prescreen: document.prescreen,
        item: document
      };
      return reviewDeskRowFromPacket(packet, document.seller_id, document.seller_name, sellerById.get(document.seller_id)?.pending_documents ?? []);
    }),
    ...queue.listing_drafts.map((draft) => {
      const queueItem = queueItemById.get(draft.draft_id);
      const packet: SellerPacketItem = {
        id: draft.draft_id,
        kind: "draft",
        title: draft.title,
        subtitle: `${draft.seller_name} · ${draft.category} · ${formatPrice(draft.base_price)}`,
        status: draft.status,
        group: "Product drafts",
        readyForReview: draft.status === "submitted" && itemNeedsReviewer(queueItem, draft.prescreen, draft.status),
        queueItem,
        prescreen: draft.prescreen,
        item: draft
      };
      return reviewDeskRowFromPacket(packet, draft.seller_id, draft.seller_name, sellerById.get(draft.seller_id)?.pending_documents ?? []);
    }),
    ...queue.proof_assets.map((proof) => {
      const queueItem = queueItemById.get(proof.proof_id);
      const packet: SellerPacketItem = {
        id: proof.proof_id,
        kind: "proof",
        title: proof.title,
        subtitle: `${proof.product_title} · ${labelize(proof.attribute)} proof`,
        status: proof.status,
        group: "Proof uploads",
        readyForReview: proof.status === "submitted" && itemNeedsReviewer(queueItem, proof.prescreen, proof.status),
        queueItem,
        prescreen: proof.prescreen,
        item: proof
      };
      return reviewDeskRowFromPacket(packet, proof.seller_id, proof.seller_name, sellerById.get(proof.seller_id)?.pending_documents ?? []);
    })
  ];
  const activeTargetIds = new Set(queue.active_queue.map((item) => item.queue_item_id));
  const storedOnlyRows = storedRows
    .filter((item) => !activeTargetIds.has(item.id))
    .map(reviewDeskRowFromStored);

  return sortReviewDeskRows([...liveRows.filter((row) => row.readyForReview || row.lane === "escalated"), ...storedOnlyRows]);
}

function reviewDeskRowFromPacket(
  item: SellerPacketItem,
  sellerId: string,
  sellerName: string,
  sellerPendingDocuments: string[]
): ReviewDeskRow {
  const queueItem = item.queueItem;
  const bucket = queueItem?.triage_bucket ?? prescreenTriageBucket(item.prescreen, item.status);
  const riskScore = queueItem?.risk_score ?? item.prescreen.risk_score;
  const riskLevel = queueItem?.risk_level ?? item.prescreen.risk_level;
  const assetUrl = packetAssetUrl(item);
  const productImageUrl = packetProductImageUrl(item);
  const title = item.title;
  const lane = liveExceptionLane(queueItem, item.prescreen, item.status);
  return {
    id: `live-${item.kind}-${item.id}`,
    targetId: item.id,
    source: "live",
    lane,
    kind: item.kind,
    itemType: packetKindToItemType(item.kind),
    title,
    subtitle: item.subtitle,
    sellerId,
    sellerName,
    status: item.status,
    submittedAt: packetSubmittedAt(item),
    readyForReview: item.readyForReview,
    riskLevel,
    riskScore,
    triageBucket: bucket,
    triageLabel: queueItem?.triage_label ?? triageLabel(bucket),
    triageReason: queueItem?.triage_reason ?? triageReason(item.prescreen, bucket),
    provider: queueItem?.agent_provider ?? item.prescreen.agent_provider,
    queueItem,
    prescreen: item.prescreen,
    packetItem: item,
    assetUrl,
    productImageUrl,
    reference: packetReference(item),
    sellerPendingDocuments,
    searchText: [
      sellerName,
      sellerId,
      title,
      item.subtitle,
      item.status,
      packetKindToItemType(item.kind),
      queueItem?.triage_label,
      queueItem?.triage_reason,
      item.prescreen.reason,
      packetReference(item),
      item.kind === "proof" ? item.item.product_title : null
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  };
}

function reviewDeskRowFromStored(item: AdminStoredEvidenceItem): ReviewDeskRow {
  const lane = storedExceptionLane(item);
  return {
    id: `stored-${item.id}`,
    targetId: item.id,
    source: "stored",
    lane,
    kind: "stored",
    itemType: item.item_type,
    title: item.title,
    subtitle: item.subtitle,
    sellerId: item.seller_id,
    sellerName: item.seller_name,
    status: item.status,
    submittedAt: item.submitted_at,
    readyForReview: false,
    riskLevel: item.risk_level,
    riskScore: item.risk_score,
    triageBucket: item.triage_bucket,
    triageLabel: item.triage_label,
    triageReason: item.triage_reason,
    provider: item.agent_provider,
    storedItem: item,
    assetUrl: item.asset_url,
    productImageUrl: item.product_image_url,
    reference: item.reference,
    searchText: [
      item.seller_name,
      item.seller_id,
      item.title,
      item.subtitle,
      item.status,
      item.item_type,
      item.triage_label,
      item.triage_reason,
      item.review_visibility,
      item.reference
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
  };
}

function liveExceptionLane(
  queueItem: AdminQueueSnapshot | undefined,
  prescreen: AdminPrescreenSuggestion,
  status: string
): ExceptionQueueTab {
  if (
    queueItem?.route_to === "senior_reviewer" ||
    queueItem?.risk_level === "high" ||
    queueItem?.sla_state === "breached" ||
    Boolean(queueItem?.blocker) ||
    prescreen.triage_bucket === "senior_review" ||
    prescreen.risk_level === "high"
  ) {
    return "escalated";
  }
  if (completedStatus(status)) return "auto_reviewed";
  return "needs_review";
}

function storedExceptionLane(item: AdminStoredEvidenceItem): ExceptionQueueTab {
  if (
    item.review_visibility === "auto_reviewed" ||
    item.review_visibility === "completed" ||
    item.triage_bucket === "reuse_standard" ||
    item.triage_bucket === "stored_only"
  ) {
    return "auto_reviewed";
  }
  if (item.triage_bucket === "senior_review" || item.risk_level === "high" || item.status === "rejected") {
    return "escalated";
  }
  return "auto_reviewed";
}

function exceptionQueueCounts(rows: ReviewDeskRow[]) {
  return rows.reduce(
    (counts, row) => {
      counts[row.lane] += 1;
      return counts;
    },
    { needs_review: 0, auto_reviewed: 0, escalated: 0 } satisfies Record<ExceptionQueueTab, number>
  );
}

function sortReviewDeskRows(rows: ReviewDeskRow[]) {
  const lanePriority: Record<ExceptionQueueTab, number> = {
    escalated: 0,
    needs_review: 1,
    auto_reviewed: 2
  };
  return [...rows].sort((a, b) => {
    const laneDelta = lanePriority[a.lane] - lanePriority[b.lane];
    if (laneDelta !== 0) return laneDelta;
    const riskDelta = b.riskScore - a.riskScore;
    if (riskDelta !== 0) return riskDelta;
    return dateValue(b.submittedAt) - dateValue(a.submittedAt);
  });
}

function packetSubmittedAt(item: SellerPacketItem) {
  if (item.kind === "application") return item.item.created_at;
  if (item.kind === "document") return item.item.submitted_at;
  if (item.kind === "draft") return item.item.submitted_at ?? item.item.updated_at ?? item.item.created_at;
  return item.item.submitted_at ?? item.item.created_at;
}

function packetAssetUrl(item: SellerPacketItem): string | null {
  if (item.kind === "document") return item.item.storage_uri;
  if (item.kind === "draft") return item.item.image_url;
  if (item.kind === "proof") return item.item.asset_url;
  return null;
}

function packetProductImageUrl(item: SellerPacketItem): string | null {
  if (item.kind === "proof") return item.item.product_image_url;
  if (item.kind === "draft") return item.item.image_url;
  return null;
}

function packetReference(item: SellerPacketItem): string | null {
  if (item.kind === "application") return item.item.gst_number;
  if (item.kind === "document") return item.item.reference;
  if (item.kind === "draft") return item.item.target_cluster_id ?? item.item.category;
  return item.item.product_id;
}

function reviewRowKindLabel(row: ReviewDeskRow) {
  if (row.source === "stored") return `${storedVisibilityLabel(row.storedItem?.review_visibility ?? "completed")} · ${labelize(row.itemType)}`;
  if (row.kind === "application") return "Seller";
  if (row.kind === "document") return "Document";
  if (row.kind === "draft") return "Listing";
  return "Proof";
}

function rowMatchesExceptionQueue(row: ReviewDeskRow, queueTab: ExceptionQueueTab) {
  if (queueTab === "needs_review") return row.source === "live" && row.readyForReview;
  return row.lane === queueTab;
}

function reviewRowNoteId(row: ReviewDeskRow) {
  const item = row.packetItem;
  if (!item) return row.id;
  if (item.kind === "application") return item.item.application_id;
  if (item.kind === "document") return item.item.document_id;
  if (item.kind === "draft") return item.item.draft_id;
  return item.item.proof_id;
}

function isBatchApprovable(row: ReviewDeskRow) {
  if (row.source !== "live" || !row.packetItem || row.lane === "escalated") return false;
  if (row.riskLevel === "high" || row.queueItem?.route_to === "senior_reviewer") return false;
  if (row.packetItem.kind === "document") {
    return row.readyForReview && ["approve", "approve_document", "manual_check"].includes(row.packetItem.prescreen.suggested_action);
  }
  if (row.packetItem.kind === "proof") {
    return row.readyForReview && ["approve", "manual_check"].includes(row.packetItem.prescreen.suggested_action);
  }
  return false;
}

function buildUploadRows(queue: AdminReviewQueue): UploadQueueRow[] {
  const queueItemById = new Map(queue.active_queue.map((item) => [item.queue_item_id, item]));
  const documentRows: UploadQueueRow[] = queue.documents.map((document) => ({
    id: `document-${document.document_id}`,
    kind: "document",
    title: labelize(document.document_type),
    subtitle: `${document.reference} | ${document.file_name}`,
    sellerName: document.seller_name,
    status: document.status,
    submittedAt: document.submitted_at,
    readyForReview: (document.status === "submitted" || document.status === "under_review") && itemNeedsReviewer(queueItemById.get(document.document_id), document.prescreen, document.status),
    queueItem: queueItemById.get(document.document_id),
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
    readyForReview: proof.status === "submitted" && itemNeedsReviewer(queueItemById.get(proof.proof_id), proof.prescreen, proof.status),
    queueItem: queueItemById.get(proof.proof_id),
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

function uploadRowToPacketItem(row: UploadQueueRow): SellerPacketItem {
  if (row.kind === "document") {
    return {
      id: row.id,
      kind: "document",
      title: row.title,
      subtitle: row.subtitle,
      status: row.status,
      group: "Documents",
      readyForReview: row.readyForReview,
      queueItem: row.queueItem,
      prescreen: row.prescreen,
      item: row.item
    };
  }

  return {
    id: row.id,
    kind: "proof",
    title: row.title,
    subtitle: row.subtitle,
    status: row.status,
    group: "Proof uploads",
    readyForReview: row.readyForReview,
    queueItem: row.queueItem,
    prescreen: row.prescreen,
    item: row.item
  };
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
    queueItems: queue.active_queue.filter((item) => item.seller_id === seller.seller_id),
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
  if (prescreen.proof_quality) {
    const quality = prescreen.proof_quality;
    if (quality.decision === "approve") {
      return `Proof quality ${quality.score}/100: ${quality.headline}. Reviewer verified ${quality.claim_checked} before approval.`;
    }
    return `Proof quality ${quality.score}/100: ${quality.reviewer_instruction}`;
  }
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
  const normalized = value.toLowerCase().replace(/_/g, " ").trim();
  if (["approved", "verified", "resolved", "published", "auto cleared", "closed"].includes(normalized)) return "good";
  if (["rejected", "restricted", "needs revision", "fail", "breached", "returned to seller"].includes(normalized)) return "bad";
  if (["submitted", "pending review", "under review", "pending", "due today", "needs human"].includes(normalized)) return "attention";
  return "neutral";
}

function statusClassName(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return normalized ? `status-${normalized}` : "status-unknown";
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
  const resolved = evidenceAssetUrl(value);
  if (!resolved) return false;
  return (
    resolved.startsWith("data:image/") ||
    /^https?:\/\/.+\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(resolved) ||
    /^\/.+\.(png|jpe?g|webp|gif|avif)(\?|$)/i.test(resolved) ||
    resolved.includes("images.unsplash.com")
  );
}
