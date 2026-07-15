import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  RefreshCcw,
  Send,
  ShieldAlert,
  Store,
  XCircle
} from "lucide-react";
import {
  approveListingDraft,
  approveSellerApplication,
  getAdminReviewQueue,
  rejectSellerApplication,
  requestListingRevision
} from "../api/client";
import type {
  AdminAuditEvent,
  AdminListingDraft,
  AdminReviewQueue,
  AdminSellerApplication,
  AdminVerificationDocument
} from "../types/api";

type NotesById = Record<string, string>;

export function AdminReviewPanel() {
  const [queue, setQueue] = useState<AdminReviewQueue | null>(null);
  const [notes, setNotes] = useState<NotesById>({});
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    void refreshQueue();
  }, []);

  const stats = useMemo(() => {
    const applications = queue?.seller_applications ?? [];
    const drafts = queue?.listing_drafts ?? [];
    const documents = queue?.documents ?? [];
    return {
      pendingApplications: applications.filter((item) => item.status === "pending_review").length,
      submittedDrafts: drafts.filter((item) => item.status === "submitted").length,
      documentChecks: documents.filter((item) => item.status === "submitted" || item.status === "under_review").length,
      blockedDrafts: drafts.filter((item) => item.status === "submitted" && item.verification_status !== "verified").length
    };
  }, [queue]);

  async function refreshQueue() {
    setLoading(true);
    setError(null);
    try {
      setQueue(await getAdminReviewQueue());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load review queue");
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
    message: string
  ) {
    setBusyAction(actionKey);
    setError(null);
    setSuccess(null);
    try {
      setQueue(await handler());
      setSuccess(message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Review action failed");
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <main className="admin-review-shell">
      <section className="admin-hero">
        <div>
          <span className="eyebrow">Admin Reviewer</span>
          <h2>Marketplace Trust Review Queue</h2>
          <p>
            Seller access, document checks, and catalog publishing stay separate from buyer and seller workspaces.
            A listing can reach the buyer feed only after seller verification and reviewer approval.
          </p>
        </div>
        <button className="admin-refresh-button" onClick={refreshQueue} disabled={loading}>
          <RefreshCcw size={15} className={loading ? "spin-icon" : ""} />
          Refresh
        </button>
      </section>

      {error && <div className="notice error">{error}</div>}
      {success && <div className="notice success">{success}</div>}

      <section className="admin-stats-grid">
        <AdminStat icon={<ShieldAlert size={18} />} label="Seller applications" value={stats.pendingApplications} detail="pending review" />
        <AdminStat icon={<FileText size={18} />} label="Document checks" value={stats.documentChecks} detail="submitted or under review" />
        <AdminStat icon={<Store size={18} />} label="Listing drafts" value={stats.submittedDrafts} detail="submitted for publishing" />
        <AdminStat icon={<AlertTriangle size={18} />} label="Blocked drafts" value={stats.blockedDrafts} detail="seller verification pending" />
      </section>

      <section className="admin-review-grid">
        <div className="admin-review-column">
          <ReviewSection
            icon={<ShieldAlert size={18} />}
            title="Seller Verification"
            subtitle="Approve only when business identity, pickup pincode, and support contact are coherent."
          >
            {queue ? (
              queue.seller_applications.length ? (
                queue.seller_applications.map((application) => (
                  <SellerApplicationCard
                    key={application.application_id}
                    application={application}
                    note={notes[application.application_id] ?? ""}
                    busyAction={busyAction}
                    onNoteChange={(value) => updateNote(application.application_id, value)}
                    onApprove={() =>
                      runAction(
                        `approve-app-${application.application_id}`,
                        () => approveSellerApplication(application.application_id, notes[application.application_id] ?? "Verified seller onboarding details."),
                        "Seller verification approved."
                      )
                    }
                    onReject={() =>
                      runAction(
                        `reject-app-${application.application_id}`,
                        () => rejectSellerApplication(application.application_id, notes[application.application_id] ?? ""),
                        "Seller application rejected with review notes."
                      )
                    }
                  />
                ))
              ) : (
                <EmptyState message="No seller applications in review." />
              )
            ) : (
              <EmptyState message="Loading seller applications..." />
            )}
          </ReviewSection>

          <ReviewSection
            icon={<Store size={18} />}
            title="Listing Publishing"
            subtitle="Publishing is blocked unless the seller is verified and the seller has submitted the draft."
          >
            {queue ? (
              queue.listing_drafts.length ? (
                queue.listing_drafts.map((draft) => (
                  <ListingDraftCard
                    key={draft.draft_id}
                    draft={draft}
                    note={notes[draft.draft_id] ?? ""}
                    busyAction={busyAction}
                    onNoteChange={(value) => updateNote(draft.draft_id, value)}
                    onApprove={() =>
                      runAction(
                        `approve-draft-${draft.draft_id}`,
                        () => approveListingDraft(draft.draft_id, notes[draft.draft_id] ?? "Catalog details reviewed."),
                        "Listing published to buyer feed."
                      )
                    }
                    onRevision={() =>
                      runAction(
                        `revision-draft-${draft.draft_id}`,
                        () => requestListingRevision(draft.draft_id, notes[draft.draft_id] ?? ""),
                        "Listing sent back for revision."
                      )
                    }
                  />
                ))
              ) : (
                <EmptyState message="No listing drafts submitted for review." />
              )
            ) : (
              <EmptyState message="Loading listing drafts..." />
            )}
          </ReviewSection>
        </div>

        <aside className="admin-review-side">
          <ReviewSection
            icon={<FileText size={18} />}
            title="Document Evidence"
            subtitle="Submitted documents remain visible to explain verification decisions."
          >
            <div className="admin-doc-list">
              {queue ? (
                queue.documents.length ? (
                  queue.documents.map((document) => (
                    <DocumentRow key={document.document_id} document={document} />
                  ))
                ) : (
                  <EmptyState message="No document references submitted." />
                )
              ) : (
                <EmptyState message="Loading document evidence..." />
              )}
            </div>
          </ReviewSection>

          <section className="admin-policy-card">
            <div className="policy-icon">
              <ClipboardCheck size={18} />
            </div>
            <span className="eyebrow">Approval policy</span>
            <h3>What the reviewer controls</h3>
            <div className="policy-list">
              <span>Seller approval requires uploaded GST, address, and bank evidence.</span>
              <span>Seller status controls trust eligibility.</span>
              <span>Draft approval publishes catalog-only product records.</span>
              <span>New listings start with limited evidence until outcomes arrive.</span>
              <span>Buyer private memory is never exposed in admin or seller views.</span>
            </div>
          </section>

          <ReviewSection
            icon={<ClipboardCheck size={18} />}
            title="Reviewer Audit"
            subtitle="Recent reviewer decisions are recorded separately from seller data."
          >
            <div className="admin-doc-list">
              {queue ? (
                queue.audit_events.length ? (
                  queue.audit_events.map((event) => (
                    <AuditEventRow key={event.event_id} event={event} />
                  ))
                ) : (
                  <EmptyState message="No reviewer decisions recorded yet." />
                )
              ) : (
                <EmptyState message="Loading reviewer audit..." />
              )}
            </div>
          </ReviewSection>
        </aside>
      </section>
    </main>
  );
}

function AdminStat({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="admin-stat-card">
      <div className="seller-metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function ReviewSection({
  icon,
  title,
  subtitle,
  children
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="admin-review-section">
      <div className="admin-section-heading">
        <div className="policy-icon">{icon}</div>
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className="admin-card-stack">{children}</div>
    </section>
  );
}

function SellerApplicationCard({
  application,
  note,
  busyAction,
  onNoteChange,
  onApprove,
  onReject
}: {
  application: AdminSellerApplication;
  note: string;
  busyAction: string | null;
  onNoteChange: (value: string) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const pending = application.status === "pending_review";
  return (
    <article className="admin-review-card">
      <div className="admin-card-topline">
        <div>
          <span className="eyebrow">{application.seller_id}</span>
          <h4>{application.business_name}</h4>
          <p>{application.seller_name}</p>
        </div>
        <StatusBadge value={application.status} />
      </div>

      <div className="admin-detail-grid">
        <Detail label="GST" value={application.gst_number} />
        <Detail label="Pickup" value={application.pickup_pincode} />
        <Detail label="Support" value={application.support_contact} />
        <Detail label="Verification" value={application.verification_status ?? "not started"} />
      </div>

      <textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Reviewer notes"
        rows={2}
      />

      <div className="admin-action-row">
        <button
          className="admin-approve"
          onClick={onApprove}
          disabled={!pending || busyAction === `approve-app-${application.application_id}`}
        >
          <CheckCircle2 size={14} />
          Approve seller
        </button>
        <button
          className="admin-reject"
          onClick={onReject}
          disabled={!pending || note.trim().length < 8 || busyAction === `reject-app-${application.application_id}`}
        >
          <XCircle size={14} />
          Reject
        </button>
      </div>
    </article>
  );
}

function ListingDraftCard({
  draft,
  note,
  busyAction,
  onNoteChange,
  onApprove,
  onRevision
}: {
  draft: AdminListingDraft;
  note: string;
  busyAction: string | null;
  onNoteChange: (value: string) => void;
  onApprove: () => void;
  onRevision: () => void;
}) {
  const submitted = draft.status === "submitted";
  const verified = draft.verification_status === "verified";
  const canApprove = submitted && verified;
  const blockReason = !submitted
    ? `Waiting for seller submission (${labelize(draft.status)}).`
    : !verified
      ? `Seller verification is ${labelize(draft.verification_status ?? "missing")}.`
      : draft.target_cluster_id
        ? "Ready to publish into an existing duplicate cluster."
        : "Ready to publish as catalog-only until enough outcome evidence exists.";

  return (
    <article className="admin-review-card">
      <div className="admin-card-topline">
        <div>
          <span className="eyebrow">{draft.seller_name}</span>
          <h4>{draft.title}</h4>
          <p>{blockReason}</p>
        </div>
        <StatusBadge value={draft.status} />
      </div>

      <div className="admin-detail-grid">
        <Detail label="Category" value={draft.category} />
        <Detail label="Fabric" value={draft.fabric} />
        <Detail label="Color" value={draft.color_family} />
        <Detail label="Price" value={`Rs ${draft.base_price}`} />
        <Detail label="Cluster" value={draft.target_cluster_id ?? "new catalog item"} />
        <Detail label="Readiness" value={draft.readiness_status} />
      </div>

      <textarea
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
        placeholder="Reviewer notes"
        rows={2}
      />

      <div className="admin-action-row">
        <button
          className="admin-approve"
          onClick={onApprove}
          disabled={!canApprove || busyAction === `approve-draft-${draft.draft_id}`}
        >
          <Send size={14} />
          Publish
        </button>
        <button
          className="admin-reject"
          onClick={onRevision}
          disabled={!submitted || note.trim().length < 8 || busyAction === `revision-draft-${draft.draft_id}`}
        >
          <XCircle size={14} />
          Revision
        </button>
      </div>
    </article>
  );
}

function DocumentRow({ document }: { document: AdminVerificationDocument }) {
  return (
    <div className="admin-doc-row">
      <div>
        <strong>{labelize(document.document_type)}</strong>
        <span>{document.seller_name}</span>
      </div>
      <StatusBadge value={document.status} />
      <small>{document.reference}</small>
      {document.sha256 ? (
        <small>{document.file_name} · {formatBytes(document.file_size_bytes)} · hash {document.sha256.slice(0, 12)}</small>
      ) : (
        <small>File evidence missing</small>
      )}
    </div>
  );
}

function AuditEventRow({ event }: { event: AdminAuditEvent }) {
  return (
    <div className="admin-doc-row">
      <div>
        <strong>{labelize(event.action)}</strong>
        <span>{event.actor_name} · {labelize(event.target_type)} {event.target_id}</span>
      </div>
      <StatusBadge value={event.decision} />
      <small>{event.notes}</small>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="admin-empty-state">{message}</div>;
}

function Detail({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="admin-detail">
      <span>{label}</span>
      <strong>{labelize(String(value))}</strong>
    </div>
  );
}

function StatusBadge({ value }: { value: string }) {
  return <span className={`admin-status-badge ${statusClass(value)}`}>{labelize(value)}</span>;
}

function statusClass(value: string) {
  if (["approved", "verified"].includes(value)) return "good";
  if (["rejected", "restricted", "needs_revision"].includes(value)) return "bad";
  if (["submitted", "pending_review", "under_review"].includes(value)) return "attention";
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
