import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  EyeOff,
  FileCheck2,
  FileUp,
  Gauge,
  PackageCheck,
  Plus,
  RefreshCcw,
  Send,
  ShieldCheck,
  Store
} from "lucide-react";
import {
  createListingDraft,
  getSellerOnboarding,
  getSellerPanel,
  submitListingDraft,
  submitSellerDocument
} from "../api/client";
import type { ListingDraft, SellerOnboardingResponse, SellerPanelListing, SellerPanelResponse } from "../types/api";

type DraftForm = {
  title: string;
  category: string;
  garment_type: string;
  fabric: string;
  color_family: string;
  base_price: string;
  image_url: string;
};

export function SellerPanel() {
  const [selectedClusterId, setSelectedClusterId] = useState<string | undefined>();
  const [panel, setPanel] = useState<SellerPanelResponse | null>(null);
  const [onboarding, setOnboarding] = useState<SellerOnboardingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docType, setDocType] = useState<"gst_certificate" | "pan_card" | "address_proof" | "bank_proof">("gst_certificate");
  const [docReference, setDocReference] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [draftForm, setDraftForm] = useState<DraftForm>({
    title: "Blue Floral Cotton Kurti New Seller Listing",
    category: "women_kurtis",
    garment_type: "kurti",
    fabric: "cotton blend",
    color_family: "blue",
    base_price: "459",
    image_url: "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab"
  });

  useEffect(() => {
    getSellerOnboarding()
      .then(setOnboarding)
      .catch((err: Error) => setError(err.message));
    void loadPanel();
  }, []);

  async function loadPanel(clusterId?: string) {
    setLoading(true);
    setError(null);
    try {
      const payload = await getSellerPanel(clusterId);
      setPanel(payload);
      setSelectedClusterId(payload.cluster.cluster_id);
    } catch (err) {
      setPanel(null);
      const message = err instanceof Error ? err.message : "Could not load seller evidence";
      if (!message.includes("No listings found")) {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }

  async function refreshOnboarding() {
    setOnboardingBusy(true);
    setError(null);
    try {
      setOnboarding(await getSellerOnboarding());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh onboarding");
    } finally {
      setOnboardingBusy(false);
    }
  }

  async function handleDocumentSubmit() {
    if (!docFile) {
      setError("Upload a PDF or image before submitting verification evidence.");
      return;
    }
    setOnboardingBusy(true);
    setError(null);
    try {
      const contentBase64 = await readFileAsBase64(docFile);
      setOnboarding(await submitSellerDocument({
        document_type: docType,
        reference: docReference,
        file_name: docFile.name,
        mime_type: docFile.type || "application/pdf",
        content_base64: contentBase64
      }));
      setDocReference("");
      setDocFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit document");
    } finally {
      setOnboardingBusy(false);
    }
  }

  async function handleDraftCreate() {
    setOnboardingBusy(true);
    setError(null);
    try {
      setOnboarding(await createListingDraft({
        ...draftForm,
        base_price: Number(draftForm.base_price)
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create listing draft");
    } finally {
      setOnboardingBusy(false);
    }
  }

  async function handleDraftSubmit(draftId: string) {
    setOnboardingBusy(true);
    setError(null);
    try {
      setOnboarding(await submitListingDraft(draftId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit listing draft");
    } finally {
      setOnboardingBusy(false);
    }
  }

  return (
    <main className="seller-console-shell">
      {error && <div className="notice error">{error}</div>}

      <section className="seller-console-toolbar">
        <div className="seller-title-block">
          <span className="eyebrow">Seller Console</span>
          <h2>Duplicate Listing Decision Center</h2>
          <p>
            Aggregate marketplace evidence explains why similar seller listings rank differently without exposing buyer memory.
          </p>
        </div>

        <div className="seller-toolbar-controls">
          {panel && (
            <div className="seller-scope-chip">
              <ShieldCheck size={14} />
              <span>{panel.seller.name}</span>
            </div>
          )}

          <label>
            <span>Duplicate cluster</span>
            <select
              value={selectedClusterId ?? ""}
              onChange={(event) => {
                const nextClusterId = event.target.value;
                setSelectedClusterId(nextClusterId);
                void loadPanel(nextClusterId);
              }}
              disabled={!panel?.seller.cluster_ids.length}
            >
              {(panel?.seller.cluster_ids ?? []).map((clusterId) => (
                <option key={clusterId} value={clusterId}>
                  {clusterId}
                </option>
              ))}
            </select>
          </label>

          <button
            className="btn-reset-db seller-refresh-btn"
            onClick={() => loadPanel(selectedClusterId)}
            title="Refresh seller evidence"
            disabled={loading || !selectedClusterId}
          >
            <RefreshCcw size={15} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
      </section>

      {onboarding && (
        <SellerOnboardingSection
          onboarding={onboarding}
          busy={onboardingBusy}
          docType={docType}
          docReference={docReference}
          docFile={docFile}
          draftForm={draftForm}
          onDocTypeChange={setDocType}
          onDocReferenceChange={setDocReference}
          onDocFileChange={setDocFile}
          onDraftFormChange={setDraftForm}
          onDocumentSubmit={handleDocumentSubmit}
          onDraftCreate={handleDraftCreate}
          onDraftSubmit={handleDraftSubmit}
          onRefresh={refreshOnboarding}
        />
      )}

      {panel ? (
        <>
          <section className="seller-stats-band">
            <MetricTile
              icon={<ShieldCheck size={18} />}
              label="Verification"
              value={panel.seller_verification.verification_status}
              detail={`GST ${panel.seller_verification.gst_status}`}
            />
            <MetricTile
              icon={<Store size={18} />}
              label="Seller listings"
              value={String(panel.seller_listings.length)}
              detail={`${panel.cluster.listing_count} listings in cluster`}
            />
            <MetricTile
              icon={<PackageCheck size={18} />}
              label="Delivered evidence"
              value={String(panel.cluster.stats.delivered_orders_90d)}
              detail={`${panel.cluster.stats.returns_90d} returns tracked`}
            />
            <MetricTile
              icon={<Gauge size={18} />}
              label="Cluster return median"
              value={formatPercent(panel.cluster.stats.median_return_rate)}
              detail={`${panel.cluster.stats.minimum_orders_for_strong_decision}+ orders for strong evidence`}
            />
            <MetricTile
              icon={<RefreshCcw size={18} />}
              label="Data freshness"
              value={panel.data_freshness.overall_status}
              detail={`${panel.data_freshness.sources.length} source contracts`}
            />
          </section>

          <section className="seller-console-grid">
            <div className="seller-main-column">
              <section className="seller-section">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Your listings</span>
                    <h3>{panel.cluster.label}</h3>
                  </div>
                  <span className="seller-size-pill">Size {panel.cluster.size}</span>
                </div>

                <div className="seller-listing-stack">
                  {panel.seller_listings.map((listing) => (
                    <SellerListingCard key={listing.variant.variant_id} listing={listing} />
                  ))}
                </div>
              </section>

              <section className="seller-section">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Competing duplicate listings</span>
                    <h3>How the decision differs across sellers</h3>
                  </div>
                </div>
                <CompetitorTable listings={panel.competing_listings} />
              </section>
            </div>

            <aside className="seller-side-column">
              <section className="seller-section policy-section">
                <div className="policy-icon">
                  <BarChart3 size={18} />
                </div>
                <span className="eyebrow">Decision policy</span>
                <h3>{panel.decision_policy.name}</h3>
                <div className="weight-list">
                  {Object.entries(panel.decision_policy.weights).map(([key, value]) => (
                    <div key={key} className="weight-row">
                      <span>{labelize(key)}</span>
                      <strong>{Math.round(value * 100)}%</strong>
                    </div>
                  ))}
                </div>
              </section>

              <section className="seller-section privacy-section">
                <div className="privacy-title">
                  <EyeOff size={18} />
                  <h3>Privacy guard</h3>
                </div>
                <p>{panel.privacy_guard.summary}</p>
                <div className="policy-list">
                  {panel.decision_policy.inputs_not_used.map((input) => (
                    <span key={input}>{input}</span>
                  ))}
                </div>
              </section>

              <section className="seller-section privacy-section">
                <div className="privacy-title">
                  <ShieldCheck size={18} />
                  <h3>Seller verification</h3>
                </div>
                <p>
                  Status is <strong>{panel.seller_verification.verification_status}</strong>. Data access is <strong>{panel.seller_verification.data_access_level}</strong>.
                </p>
                <div className="policy-list">
                  <span>Pickup pincode: {panel.seller_verification.pickup_pincode ?? "Not available"}</span>
                  <span>KYC: {panel.seller_verification.kyc_status}</span>
                  <span>GST: {panel.seller_verification.gst_status}</span>
                  {panel.seller_verification.restricted_reason && (
                    <span>{panel.seller_verification.restricted_reason}</span>
                  )}
                </div>
              </section>

              <section className="seller-section facts-section">
                <span className="eyebrow">Audit facts</span>
                <h3>Evidence IDs</h3>
                <div className="fact-chip-cloud">
                  {panel.fact_ids.slice(0, 12).map((factId) => (
                    <span key={factId}>{factId}</span>
                  ))}
                </div>
              </section>
            </aside>
          </section>
        </>
      ) : (
        <section className="seller-section seller-empty-state">
          {loading
            ? "Loading seller evidence..."
            : onboarding?.seller.product_count === 0
              ? "Seller application is saved and pending verification. Listing evidence will appear after products are onboarded."
              : "No duplicate-listing evidence is available for this seller yet."}
        </section>
      )}
    </main>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="seller-metric-tile">
      <div className="seller-metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function SellerOnboardingSection({
  onboarding,
  busy,
  docType,
  docReference,
  docFile,
  draftForm,
  onDocTypeChange,
  onDocReferenceChange,
  onDocFileChange,
  onDraftFormChange,
  onDocumentSubmit,
  onDraftCreate,
  onDraftSubmit,
  onRefresh
}: {
  onboarding: SellerOnboardingResponse;
  busy: boolean;
  docType: "gst_certificate" | "pan_card" | "address_proof" | "bank_proof";
  docReference: string;
  docFile: File | null;
  draftForm: DraftForm;
  onDocTypeChange: (value: "gst_certificate" | "pan_card" | "address_proof" | "bank_proof") => void;
  onDocReferenceChange: (value: string) => void;
  onDocFileChange: (value: File | null) => void;
  onDraftFormChange: (value: DraftForm) => void;
  onDocumentSubmit: () => void;
  onDraftCreate: () => void;
  onDraftSubmit: (draftId: string) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="seller-onboarding-grid">
      <div className="seller-section onboarding-status-card">
        <div className="section-heading-row">
          <div>
            <span className="eyebrow">Seller onboarding</span>
            <h3>{onboarding.seller.name}</h3>
          </div>
          <button className="btn-reset-db" onClick={onRefresh} disabled={busy} title="Refresh onboarding">
            <RefreshCcw size={14} style={{ animation: busy ? "spin 1s linear infinite" : "none" }} />
          </button>
        </div>
        <div className="onboarding-state-row">
          <StatusPill label="Verification" value={onboarding.seller_verification.verification_status} />
          <StatusPill label="Application" value={onboarding.application?.status ?? "missing"} />
          <StatusPill label="Data access" value={onboarding.seller_verification.data_access_level} />
        </div>
        <div className="onboarding-action-list">
          {onboarding.next_actions.map((action) => (
            <div key={action.title} className={`onboarding-action ${action.priority}`}>
              <strong>{action.title}</strong>
              <span>{action.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="seller-section onboarding-form-card">
        <div className="privacy-title">
          <FileUp size={18} />
          <h3>Verification documents</h3>
        </div>
        <div className="onboarding-form-row">
          <select value={docType} onChange={(event) => onDocTypeChange(event.target.value as typeof docType)}>
            <option value="gst_certificate">GST certificate</option>
            <option value="pan_card">PAN card</option>
            <option value="address_proof">Address proof</option>
            <option value="bank_proof">Bank proof</option>
          </select>
          <input
            value={docReference}
            onChange={(event) => onDocReferenceChange(event.target.value)}
            placeholder="Document ID / last 4 digits"
          />
          <label className="document-file-picker">
            <FileUp size={14} />
            <span>{docFile ? docFile.name : "Upload PDF/image"}</span>
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={(event) => onDocFileChange(event.target.files?.[0] ?? null)}
            />
          </label>
          <button onClick={onDocumentSubmit} disabled={busy || docReference.trim().length < 6 || !docFile}>
            <FileCheck2 size={14} />
            Submit
          </button>
        </div>
        <div className="onboarding-upload-hint">
          Files are stored as local evidence with SHA-256 hashes for reviewer verification.
        </div>
        <div className="document-list">
          {onboarding.documents.map((document) => (
            <div key={document.document_id} className="document-row">
              <strong>{labelize(document.document_type)}</strong>
              <span>{document.status}</span>
              <small>{document.reference}</small>
              {document.sha256 ? (
                <small>{document.file_name} · {formatBytes(document.file_size_bytes)} · hash {document.sha256.slice(0, 10)}</small>
              ) : (
                <small>File evidence missing</small>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="seller-section listing-draft-card">
        <div className="privacy-title">
          <ClipboardList size={18} />
          <h3>Listing draft</h3>
        </div>
        <div className="listing-draft-form">
          <input value={draftForm.title} onChange={(event) => onDraftFormChange({ ...draftForm, title: event.target.value })} placeholder="Listing title" />
          <div className="draft-form-split">
            <input value={draftForm.category} onChange={(event) => onDraftFormChange({ ...draftForm, category: event.target.value })} placeholder="Category" />
            <input value={draftForm.garment_type} onChange={(event) => onDraftFormChange({ ...draftForm, garment_type: event.target.value })} placeholder="Garment type" />
          </div>
          <div className="draft-form-split">
            <input value={draftForm.fabric} onChange={(event) => onDraftFormChange({ ...draftForm, fabric: event.target.value })} placeholder="Fabric" />
            <input value={draftForm.color_family} onChange={(event) => onDraftFormChange({ ...draftForm, color_family: event.target.value })} placeholder="Color" />
          </div>
          <div className="draft-form-split">
            <input value={draftForm.base_price} onChange={(event) => onDraftFormChange({ ...draftForm, base_price: event.target.value })} placeholder="Price" inputMode="numeric" />
            <input value={draftForm.image_url} onChange={(event) => onDraftFormChange({ ...draftForm, image_url: event.target.value })} placeholder="HTTPS image URL" />
          </div>
          <button className="seller-primary-action" onClick={onDraftCreate} disabled={busy || !draftForm.title.trim()}>
            <Plus size={14} />
            Create review draft
          </button>
        </div>
      </div>

      <div className="seller-section listing-drafts-list">
        <div className="privacy-title">
          <Store size={18} />
          <h3>Draft review queue</h3>
        </div>
        {onboarding.listing_drafts.length ? (
          onboarding.listing_drafts.map((draft) => (
            <ListingDraftRow key={draft.draft_id} draft={draft} busy={busy} onSubmit={onDraftSubmit} />
          ))
        ) : (
          <div className="seller-empty-state">No listing drafts yet.</div>
        )}
      </div>
    </section>
  );
}

function StatusPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="onboarding-pill">
      <span>{label}</span>
      <strong>{labelize(value)}</strong>
    </div>
  );
}

function ListingDraftRow({
  draft,
  busy,
  onSubmit
}: {
  draft: ListingDraft;
  busy: boolean;
  onSubmit: (draftId: string) => void;
}) {
  return (
    <div className="listing-draft-row">
      <div>
        <strong>{draft.title}</strong>
        <span>{draft.target_cluster_id ? `Mapped to ${draft.target_cluster_id}` : "No duplicate cluster mapped"}</span>
        <small>{labelize(draft.readiness_status)}</small>
      </div>
      <div className="draft-row-actions">
        <span>{draft.status}</span>
        <button onClick={() => onSubmit(draft.draft_id)} disabled={busy || draft.status !== "draft"}>
          <Send size={13} />
          Submit
        </button>
      </div>
    </div>
  );
}

function SellerListingCard({ listing }: { listing: SellerPanelListing }) {
  const status = statusCopy(listing.decision_status);
  return (
    <article className="seller-listing-card">
      <div className="seller-listing-image">
        <img
          src={listing.product.image_url || productImage(listing.product.color_family)}
          alt={listing.product.title}
          onError={(event) => {
            event.currentTarget.src = productImage(listing.product.color_family);
          }}
        />
      </div>

      <div className="seller-listing-body">
        <div className="seller-listing-topline">
          <div>
            <span className="eyebrow">{listing.product.seller_name}</span>
            <h4>{listing.product.title}</h4>
          </div>
          <div className={`status-badge ${status.className}`}>
            {status.icon}
            <span>{status.label}</span>
          </div>
        </div>

        <div className="seller-score-row">
          <div className="seller-score-box">
            <span>Quality score</span>
            <strong>{listing.quality_score ?? "Insufficient"}</strong>
          </div>
          <DataPoint label="Cluster rank" value={listing.cluster_position ? `#${listing.cluster_position}` : "Pending"} />
          <DataPoint label="Kept rate" value={formatPercent(listing.metrics.kept_rate)} />
          <DataPoint label="Evidence" value={listing.metrics.evidence_strength} />
        </div>

        <div className="seller-action-stack">
          {listing.action_items.map((action) => (
            <div key={`${listing.variant.variant_id}-${action.title}`} className={`seller-action-item ${action.priority}`}>
              <div>
                <strong>{action.title}</strong>
                <p>{action.rationale}</p>
              </div>
              <span>{action.metric}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function CompetitorTable({ listings }: { listings: SellerPanelListing[] }) {
  return (
    <div className="seller-table-wrap">
      <table className="seller-table">
        <thead>
          <tr>
            <th>Seller</th>
            <th>Score</th>
            <th>Kept rate</th>
            <th>Top issue</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {listings.map((listing) => (
            <tr key={listing.variant.variant_id}>
              <td>
                <strong>{listing.seller.name}</strong>
                <span>{listing.product.product_id}</span>
              </td>
              <td>{listing.quality_score ?? "Insufficient"}</td>
              <td>{formatPercent(listing.metrics.kept_rate)}</td>
              <td>{listing.top_issue ? labelize(listing.top_issue.return_reason) : "No dominant issue"}</td>
              <td>{labelize(listing.decision_status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DataPoint({ label, value }: { label: string; value: string }) {
  return (
    <div className="seller-data-point">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function statusCopy(status: SellerPanelListing["decision_status"]) {
  if (status === "eligible_for_recommendation") {
    return {
      label: "Recommendation eligible",
      className: "eligible",
      icon: <CheckCircle2 size={14} />
    };
  }
  if (status === "needs_seller_action") {
    return {
      label: "Needs action",
      className: "attention",
      icon: <AlertTriangle size={14} />
    };
  }
  return {
    label: "Insufficient evidence",
    className: "pending",
    icon: <AlertTriangle size={14} />
  };
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) return "Unknown";
  return `${Math.round(value * 100)}%`;
}

function formatBytes(value: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  return `${Math.round(value / 1024)} KB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",", 2)[1] : result);
    };
    reader.onerror = () => reject(new Error("Could not read selected file"));
    reader.readAsDataURL(file);
  });
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function productImage(color: string) {
  if (color === "pink") return "/product-pink.svg";
  if (color === "maroon") return "/product-maroon.svg";
  return "/product-blue.svg";
}
