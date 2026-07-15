import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  RefreshCcw,
  Sparkles,
  Info,
  X,
  Plus
} from "lucide-react";
import { getSellerPanel, correctMeasurement, getSellerEvidenceCoach, submitSellerEvidenceAsset, getSellerOnboarding, submitSellerDocument, createListingDraft, submitListingDraft } from "../api/client";
import type { SellerPanelResponse, SellerPanelListing, SellerEvidenceCoachResponse, SellerEvidenceCoachTask, SellerOnboardingResponse, SellerVerificationDocument, ListingDraft } from "../types/api";

export function SellerPanel() {
  const [panel, setPanel] = useState<SellerPanelResponse | null>(null);
  const [evidenceCoach, setEvidenceCoach] = useState<SellerEvidenceCoachResponse | null>(null);
  const [onboarding, setOnboarding] = useState<SellerOnboardingResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedClusterId, setSelectedClusterId] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"performance" | "onboarding">("performance");

  // Modals/Sheets
  const [activeWhyListing, setActiveWhyListing] = useState<SellerPanelListing | null>(null);
  const [activeFixListing, setActiveFixListing] = useState<SellerPanelListing | null>(null);

  // Fix Form inputs
  const [lChest, setLChest] = useState("38");
  const [xlChest, setXlChest] = useState("40");
  const [fixSuccess, setFixSuccess] = useState(false);
  const [fixLoading, setFixLoading] = useState(false);
  const [proofSubmittingId, setProofSubmittingId] = useState<string | null>(null);
  const [activeProofTask, setActiveProofTask] = useState<SellerEvidenceCoachTask | null>(null);
  const [proofTitle, setProofTitle] = useState("");
  const [proofDescription, setProofDescription] = useState("");
  const [proofAssetUrl, setProofAssetUrl] = useState("");

  // Onboarding submissions
  const [docType, setDocType] = useState<"gst_certificate" | "pan_card" | "address_proof" | "bank_proof">("gst_certificate");
  const [docRef, setDocRef] = useState("");
  const [docFileName, setDocFileName] = useState("");
  const [docFileBase64, setDocFileBase64] = useState("");
  const [docSubmitting, setDocSubmitting] = useState(false);
  const [docSuccess, setDocSuccess] = useState<string | null>(null);

  // Listing Draft inputs
  const [draftTitle, setDraftTitle] = useState("");
  const [draftCategory, setDraftCategory] = useState("Ethnic Wear");
  const [draftGarmentType, setDraftGarmentType] = useState("kurti");
  const [draftFabric, setDraftFabric] = useState("cotton");
  const [draftColor, setDraftColor] = useState("Green");
  const [draftPrice, setDraftPrice] = useState("499");
  const [draftImageUrl, setDraftImageUrl] = useState("");
  const [draftCreating, setDraftCreating] = useState(false);
  const [draftSuccess, setDraftSuccess] = useState<string | null>(null);
  const [draftSubmittingId, setDraftSubmittingId] = useState<string | null>(null);

  useEffect(() => {
    void loadPanel();
  }, []);

  async function loadPanel(clusterId?: string) {
    setLoading(true);
    setError(null);
    setDocSuccess(null);
    setDraftSuccess(null);
    try {
      const onboardingPayload = await getSellerOnboarding();
      setOnboarding(onboardingPayload);

      // Auto toggle to onboarding if not approved yet
      if (onboardingPayload?.seller_verification.verification_status !== "verified") {
        setActiveTab("onboarding");
      } else {
        setActiveTab("performance");
      }

      try {
        const [payload, coach] = await Promise.all([
          getSellerPanel(clusterId),
          getSellerEvidenceCoach()
        ]);
        setPanel(payload);
        setEvidenceCoach(coach);
        setSelectedClusterId(payload.cluster.cluster_id);
      } catch (e) {
        console.warn("Seller performance details not available:", e);
        setPanel(null);
        setEvidenceCoach(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load seller panel");
    } finally {
      setLoading(false);
    }
  }

  function openProofTask(task: SellerEvidenceCoachTask) {
    setActiveProofTask(task);
    setProofTitle(task.title);
    setProofDescription(`Evidence submitted to resolve ${task.attribute} questions for ${task.product_title.split("-")[0].trim()}.`);
    setProofAssetUrl("");
  }

  function closeProofTask() {
    setActiveProofTask(null);
    setProofTitle("");
    setProofDescription("");
    setProofAssetUrl("");
  }

  async function handleSubmitProof(event: React.FormEvent) {
    event.preventDefault();
    if (!activeProofTask) return;
    const task = activeProofTask;
    setProofSubmittingId(proofTaskId(task));
    setError(null);
    try {
      await submitSellerEvidenceAsset({
        product_id: task.product_id,
        attribute: task.attribute,
        proof_type: task.recommended_proof_type,
        title: proofTitle.trim(),
        description: proofDescription.trim(),
        asset_url: proofAssetUrl.trim()
      });
      closeProofTask();
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit proof");
    } finally {
      setProofSubmittingId(null);
    }
  }

  async function handleFixSubmit(e: React.FormEvent, productId: string) {
    e.preventDefault();
    setFixLoading(true);
    setFixSuccess(false);
    setError(null);
    try {
      await correctMeasurement(productId, {
        l_chest: Number(lChest),
        xl_chest: Number(xlChest)
      });
      setFixSuccess(true);
      // Reload seller evidence to reflect smoothing in rank and kept rates!
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error saving correction.");
    } finally {
      setFixLoading(false);
    }
  }

  async function handleDocSubmit(e: React.FormEvent) {
    e.preventDefault();
    setDocSubmitting(true);
    setError(null);
    setDocSuccess(null);
    try {
      const ref = docRef.trim();
      const name = docFileName.trim() || `${docType}.pdf`;
      const base64 = docFileBase64 || "JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iag==";
      await submitSellerDocument({
        document_type: docType,
        reference: ref,
        file_name: name,
        mime_type: name.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
        content_base64: base64
      });
      setDocSuccess(`Document "${labelize(docType)}" submitted successfully.`);
      setDocRef("");
      setDocFileName("");
      setDocFileBase64("");
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error submitting document");
    } finally {
      setDocSubmitting(false);
    }
  }

  function handleAutoFillDoc(type: "gst_certificate" | "pan_card" | "address_proof" | "bank_proof") {
    setDocType(type);
    if (type === "gst_certificate") {
      setDocRef("GSTIN27AAAC1234A1Z1");
      setDocFileName("gst_certificate.pdf");
      setDocFileBase64("JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iag==");
    } else if (type === "pan_card") {
      setDocRef("ABCDE1234F");
      setDocFileName("pan_card.jpg");
      setDocFileBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    } else if (type === "address_proof") {
      setDocRef("UID123456789012");
      setDocFileName("aadhaar_card.pdf");
      setDocFileBase64("JVBERi0xLjQKJcOkw7zDtsOfCjEgMCBvYmoKPDwKL1R5cGUgL0NhdGFsb2cKL1BhZ2VzIDIgMCBSCj4+CmVuZG9iag==");
    } else if (type === "bank_proof") {
      setDocRef("IFSCBKID0001234");
      setDocFileName("cancelled_cheque.jpg");
      setDocFileBase64("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==");
    }
  }

  async function handleCreateDraft(e: React.FormEvent) {
    e.preventDefault();
    setDraftCreating(true);
    setError(null);
    setDraftSuccess(null);
    try {
      await createListingDraft({
        title: draftTitle.trim(),
        category: draftCategory,
        garment_type: draftGarmentType,
        fabric: draftFabric,
        color_family: draftColor,
        base_price: Number(draftPrice),
        image_url: draftImageUrl.trim() || "https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500&auto=format&fit=crop"
      });
      setDraftSuccess("Listing draft created successfully.");
      setDraftTitle("");
      setDraftPrice("499");
      setDraftImageUrl("");
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error creating listing draft");
    } finally {
      setDraftCreating(false);
    }
  }

  function handleAutoFillDraft() {
    setDraftTitle("Premium Cotton Printed Anarkali Kurta");
    setDraftCategory("Ethnic Wear");
    setDraftGarmentType("kurti");
    setDraftFabric("cotton");
    setDraftColor("Green");
    setDraftPrice("650");
    setDraftImageUrl("https://images.unsplash.com/photo-1610030469983-98e550d6193c?w=500&auto=format&fit=crop");
  }

  async function handleDraftSubmit(draftId: string) {
    setDraftSubmittingId(draftId);
    setError(null);
    setDraftSuccess(null);
    try {
      await submitListingDraft(draftId);
      setDraftSuccess("Listing draft submitted to admin review queue!");
      await loadPanel(selectedClusterId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error submitting listing draft");
    } finally {
      setDraftSubmittingId(null);
    }
  }

  if (loading && !onboarding && !panel) {
    return <div className="seller-loading-state">Loading seller center...</div>;
  }

  return (
    <main className="seller-console-shell">
      <section className="seller-console-toolbar">
        <div className="seller-title-block">
          <span className="eyebrow">Seller Console</span>
          <h2>{panel?.seller.name ?? onboarding?.seller.name ?? "Seller center"}</h2>
          <p>
            Improve listing trust with aggregate return, fit, dispatch, and proof signals. Buyer personal memory is never shown here.
          </p>
        </div>

        <div className="seller-toolbar-controls">
          {activeTab === "performance" && panel && (
            <label>
              Product cluster
              <select
                value={selectedClusterId}
                onChange={(e) => {
                  setSelectedClusterId(e.target.value);
                  void loadPanel(e.target.value);
                }}
              >
                {panel.seller.cluster_ids.map((clusterId) => (
                  <option key={clusterId} value={clusterId}>
                    {clusterLabel(clusterId)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <span className="seller-scope-chip">
            <CheckCircle2 size={14} />
            {labelize(onboarding?.seller_verification.verification_status ?? panel?.seller_verification.verification_status ?? "pending")}
          </span>
          <button
            type="button"
            className="btn-reset-db seller-refresh-btn"
            onClick={() => loadPanel(selectedClusterId)}
            title="Refresh seller console"
          >
            <RefreshCcw size={16} className={loading ? "spin-icon" : ""} />
          </button>
        </div>
      </section>

      <div className="workspace-nav" style={{ marginBottom: "16px", alignSelf: "flex-start" }}>
        <button
          type="button"
          className={activeTab === "performance" ? "active" : ""}
          onClick={() => setActiveTab("performance")}
          disabled={!panel}
        >
          Active Performance & Doubt Inbox
        </button>
        <button
          type="button"
          className={activeTab === "onboarding" ? "active" : ""}
          onClick={() => setActiveTab("onboarding")}
        >
          Verification & Catalog Drafts {onboarding && onboarding.listing_drafts.length > 0 && `(${onboarding.listing_drafts.length})`}
        </button>
      </div>

      {error && <div className="notice error">{error}</div>}
      {docSuccess && <div className="notice success">{docSuccess}</div>}
      {draftSuccess && <div className="notice success">{draftSuccess}</div>}

      {/* Tab 1: Active Performance & Doubt Inbox */}
      {activeTab === "performance" && panel && (
        <>
          <section className="seller-stats-band">
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><TrendingUp size={16} /></span>
              <span>Cluster</span>
              <strong>{panel.cluster.listing_count}</strong>
              <small>{panel.cluster.seller_count} seller option(s)</small>
            </div>
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><AlertTriangle size={16} /></span>
              <span>Median returns</span>
              <strong>{panel.cluster.stats.median_return_rate === null ? "N/A" : `${Math.round(panel.cluster.stats.median_return_rate * 100)}%`}</strong>
              <small>{panel.cluster.stats.delivered_orders_90d} delivered orders</small>
            </div>
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><CheckCircle2 size={16} /></span>
              <span>Verification</span>
              <strong>{labelize(panel.seller_verification.verification_status)}</strong>
              <small>{labelize(panel.seller_verification.data_access_level)}</small>
            </div>
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><RefreshCcw size={16} /></span>
              <span>Source health</span>
              <strong>{labelize(panel.data_freshness.overall_status)}</strong>
              <small>{panel.fact_ids.length} facts connected</small>
            </div>
            <div className="seller-metric-tile">
              <span className="seller-metric-icon"><Sparkles size={16} /></span>
              <span>Buyer proof asks</span>
              <strong>{evidenceCoach?.open_task_count ?? 0}</strong>
              <small>{evidenceCoach?.resolved_request_count ?? 0} resolved</small>
            </div>
          </section>

          <section className="seller-console-grid">
            <div className="seller-main-column">
              <section className="seller-live-section seller-section">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Your live options</span>
                    <h3>{panel.cluster.label}</h3>
                  </div>
                  <span className="seller-size-pill">Size {panel.cluster.size}</span>
                </div>
                <div className="seller-listing-stack">
                  {panel.seller_listings.map((listing) => {
                    const isActionNeeded = listing.decision_status === "needs_seller_action";
                    const filledSegments = listing.cluster_position
                      ? Math.max(1, 4 - Math.min(listing.cluster_position, 3))
                      : 0;
                    return (
                      <article
                        key={listing.variant.variant_id}
                        className={`seller-listing-card ${isActionNeeded ? "needs-action" : ""}`}
                      >
                        <div className="seller-listing-image">
                          <img src={listing.product.image_url || "/product-blue.svg"} alt={listing.product.title} />
                        </div>

                        <div className="seller-listing-body">
                          <div className="seller-listing-topline">
                            <div>
                              <h4>{listing.product.title.split("-")[0].trim()}</h4>
                              <span>SKU {listing.variant.variant_id}</span>
                            </div>
                            <span className={`ui-badge ${isActionNeeded ? "caution" : "positive"}`}>
                              {isActionNeeded ? "Needs action" : "Eligible"}
                            </span>
                          </div>

                          <div className="seller-rank-line">
                            <div className="rank-dots" aria-hidden="true">
                              {[1, 2, 3].map((dot) => (
                                <span key={dot} className={dot <= filledSegments ? "filled" : ""} />
                              ))}
                            </div>
                            <strong>
                              {listing.cluster_position
                                ? `You're #${listing.cluster_position} of ${panel.cluster.listing_count} comparable listings`
                                : "Rank pending until enough evidence"}
                            </strong>
                          </div>

                          <div className="seller-score-row compact">
                            <div className="seller-data-point">
                              <span>Kept score</span>
                              <strong>{listing.metrics.kept_rate ? `${Math.round(listing.metrics.kept_rate * 100)}%` : "N/A"}</strong>
                            </div>
                            <div className="seller-data-point">
                              <span>Fit accuracy</span>
                              <strong>{listing.metrics.fit_as_expected_rate ? `${Math.round(listing.metrics.fit_as_expected_rate * 100)}%` : "N/A"}</strong>
                            </div>
                            <div className="seller-data-point">
                              <span>Dispatch</span>
                              <strong>{listing.metrics.median_dispatch_hours}h</strong>
                            </div>
                          </div>

                          <div className="seller-card-actions">
                            <button className="seller-secondary-action" onClick={() => setActiveWhyListing(listing)}>
                              Why ranked here
                            </button>

                            <button
                              className="seller-primary-action"
                              onClick={() => {
                                setActiveFixListing(listing);
                                setFixSuccess(false);
                              }}
                            >
                              Fix it
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>

              <section className="seller-section">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Comparable listings</span>
                    <h3>Masked cluster context</h3>
                  </div>
                  <span className="seller-size-pill">Aggregate only</span>
                </div>
                <div className="seller-table-wrap">
                  <table className="seller-table">
                    <thead>
                      <tr>
                        <th>Seller listing</th>
                        <th>Kept rate</th>
                        <th>Top issue</th>
                        <th>Rank</th>
                      </tr>
                    </thead>
                    <tbody>
                      {panel.competing_listings.map((comp, idx) => (
                        <tr key={comp.variant.variant_id}>
                          <td>Competitor listing #{idx + 1}</td>
                          <td>{comp.metrics.kept_rate ? `${Math.round(comp.metrics.kept_rate * 100)}%` : "N/A"}</td>
                          <td>{comp.top_issue ? labelize(comp.top_issue.return_reason) : "None"}</td>
                          <td>#{idx + 2}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <aside className="seller-side-column">
              {evidenceCoach && (
                <section className="seller-evidence-coach">
                  <div className="seller-section-heading">
                    <div>
                      <span className="eyebrow">Buyer doubt inbox</span>
                      <h3>Evidence requests from shoppers</h3>
                    </div>
                    <strong>{evidenceCoach.open_task_count} open</strong>
                  </div>
                  {evidenceCoach.tasks.length === 0 ? (
                    <p className="seller-empty-copy">{evidenceCoach.privacy_guard.summary}</p>
                  ) : (
                    <div className="seller-proof-task-list">
                      {evidenceCoach.tasks.map((task) => {
                        const taskId = proofTaskId(task);
                        return (
                          <article key={taskId} className="seller-proof-task">
                            <div>
                              <span>{task.priority}</span>
                              <strong>{task.title}</strong>
                              <p>{task.rationale}</p>
                              <small>
                                {task.type === "broken_expectation" ? "Expectation gap" : "Buyer proof request"} |{" "}
                                {task.product_title.split("-")[0].trim()} | {task.recommended_proof_type.replace(/_/g, " ")}
                              </small>
                            </div>
                            <button
                              type="button"
                              onClick={() => openProofTask(task)}
                              disabled={proofSubmittingId === taskId}
                            >
                              {proofSubmittingId === taskId
                                ? "Submitting"
                                : task.type === "broken_expectation"
                                  ? "Add fix proof"
                                  : "Add proof"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              <section className="seller-section">
                <div className="seller-section-heading">
                  <div>
                    <span className="eyebrow">Privacy boundary</span>
                    <h3>What sellers can see</h3>
                  </div>
                  <strong>{panel.privacy_guard.safe_for_seller ? "Safe" : "Check"}</strong>
                </div>
                <p className="seller-empty-copy">{panel.privacy_guard.summary}</p>
              </section>
            </aside>
          </section>
        </>
      )}

      {/* Tab 2: Verification & Catalog Drafts (Onboarding) */}
      {activeTab === "onboarding" && onboarding && (
        <section className="seller-onboarding-workspace">
          <div className="seller-console-grid">
            <div className="seller-main-column">
              {/* Document upload card */}
              <div className="seller-section">
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Identity verification</span>
                    <h3>Verification Documents</h3>
                  </div>
                </div>

                <div className="seller-doc-uploader" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", margin: "16px 0" }}>
                  <form onSubmit={handleDocSubmit} className="seller-proof-form-body" style={{ background: "var(--bg-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <strong>Upload New Document</strong>
                    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700" }}>Document Type</span>
                      <select value={docType} onChange={(e) => setDocType(e.target.value as any)}>
                        <option value="gst_certificate">GST Certificate</option>
                        <option value="pan_card">PAN Card</option>
                        <option value="address_proof">Address Proof (Aadhaar / Utility)</option>
                        <option value="bank_proof">Bank Proof (Cancelled Cheque)</option>
                      </select>
                    </label>

                    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700" }}>Reference Number</span>
                      <input value={docRef} onChange={(e) => setDocRef(e.target.value)} placeholder="e.g. GSTIN / Document ID" required />
                    </label>

                    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700" }}>File Name</span>
                      <input value={docFileName} onChange={(e) => setDocFileName(e.target.value)} placeholder="e.g. gst.pdf" />
                    </label>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      <button type="button" className="seller-secondary-action" onClick={() => handleAutoFillDoc(docType)}>
                        Auto-fill Mock Info
                      </button>
                      <button type="submit" className="seller-primary-action" disabled={docSubmitting || !docRef.trim()}>
                        {docSubmitting ? "Submitting..." : "Submit Document"}
                      </button>
                    </div>
                  </form>

                  <div className="submitted-docs-list">
                    <strong>Uploaded Proof References ({onboarding.documents.length})</strong>
                    {onboarding.documents.length === 0 ? (
                      <p style={{ fontStyle: "italic", fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>No documents uploaded yet. Identity verification requires GST & PAN card reference.</p>
                    ) : (
                      <div className="admin-card-stack" style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {onboarding.documents.map((doc) => (
                          <div key={doc.document_id} className="admin-doc-row" style={{ background: "var(--bg-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <strong>{labelize(doc.document_type)}</strong>
                              <span className={`ui-badge ${doc.status === "approved" ? "positive" : doc.status === "rejected" ? "caution" : "neutral"}`}>
                                {doc.status}
                              </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "4px" }}>Ref: {doc.reference}</div>
                            <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px" }}>File: {doc.file_name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Listing Drafts section */}
              <div className="seller-section" style={{ marginTop: "20px" }}>
                <div className="section-heading-row">
                  <div>
                    <span className="eyebrow">Catalog creation</span>
                    <h3>Listing Drafts</h3>
                  </div>
                </div>

                <div className="seller-draft-workspace" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "20px", margin: "16px 0" }}>
                  {/* Create Draft Form */}
                  <form onSubmit={handleCreateDraft} className="seller-proof-form-body" style={{ background: "var(--bg-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "12px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <strong>Create Catalog Listing Draft</strong>
                    <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "11px", fontWeight: "700" }}>Product Title</span>
                      <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} placeholder="e.g. Cotton Ethnic Kurta" required />
                    </label>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Category</span>
                        <input value={draftCategory} onChange={(e) => setDraftCategory(e.target.value)} required />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Garment Type</span>
                        <input value={draftGarmentType} onChange={(e) => setDraftGarmentType(e.target.value)} required />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Fabric</span>
                        <input value={draftFabric} onChange={(e) => setDraftFabric(e.target.value)} required />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Color Family</span>
                        <input value={draftColor} onChange={(e) => setDraftColor(e.target.value)} required />
                      </label>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: "10px" }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Base Price (Rs)</span>
                        <input type="number" value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} required />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700" }}>Image URL (Optional)</span>
                        <input value={draftImageUrl} onChange={(e) => setDraftImageUrl(e.target.value)} placeholder="https://..." />
                      </label>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "6px" }}>
                      <button type="button" className="seller-secondary-action" onClick={handleAutoFillDraft}>
                        Auto-fill Sample Draft
                      </button>
                      <button type="submit" className="seller-primary-action" disabled={draftCreating || !draftTitle.trim()}>
                        {draftCreating ? "Creating..." : "Save Draft"}
                      </button>
                    </div>
                  </form>

                  {/* Drafts List */}
                  <div className="seller-drafts-list">
                    <strong>Current Drafts ({onboarding.listing_drafts.length})</strong>
                    {onboarding.listing_drafts.length === 0 ? (
                      <p style={{ fontStyle: "italic", fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>No drafts saved yet. Create a draft to start publishing catalog products.</p>
                    ) : (
                      <div className="admin-card-stack" style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                        {onboarding.listing_drafts.map((draft) => (
                          <div key={draft.draft_id} className="admin-doc-row" style={{ background: "var(--bg-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "10px", padding: "10px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <strong style={{ fontSize: "13px" }}>{draft.title}</strong>
                                <div style={{ fontSize: "10px", color: "var(--text-secondary)" }}>ID: {draft.draft_id} | Rs {draft.base_price}</div>
                              </div>
                              <span className={`ui-badge ${draft.status === "approved" ? "positive" : draft.status === "submitted" ? "neutral" : "caution"}`}>
                                {draft.status}
                              </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "6px" }}>
                              Readiness: <strong>{labelize(draft.readiness_status)}</strong>
                            </div>
                            {draft.status === "draft" && (
                              <button
                                type="button"
                                style={{ marginTop: "8px", padding: "5px 10px", fontSize: "11px", borderRadius: "6px", width: "100%" }}
                                className="seller-primary-action"
                                onClick={() => void handleDraftSubmit(draft.draft_id)}
                                disabled={draftSubmittingId === draft.draft_id}
                              >
                                {draftSubmittingId === draft.draft_id ? "Submitting..." : "Submit to Admin"}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <aside className="seller-side-column">
              <div className="seller-section">
                <span className="eyebrow">Onboarding Steps</span>
                <h3>Next Actions</h3>
                <div className="policy-list" style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {onboarding.next_actions.map((act, idx) => (
                    <div key={idx} style={{ padding: "10px", background: "var(--bg-canvas)", borderLeft: `3px solid var(--${act.priority === "high" ? "error" : act.priority === "medium" ? "warning" : "success"})`, borderRadius: "4px" }}>
                      <strong style={{ fontSize: "12px", display: "block" }}>{act.title}</strong>
                      <span style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{act.detail}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="seller-section" style={{ marginTop: "16px" }}>
                <span className="eyebrow">Trust Constraints</span>
                <h3>Verification Policy</h3>
                <ul className="policy-list" style={{ paddingLeft: "16px", marginTop: "8px", fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "6px" }}>
                  {onboarding.policy.buyer_feed_blocked_until.map((item, i) => (
                    <li key={i}>{labelize(item)}</li>
                  ))}
                </ul>
              </div>
            </aside>
          </div>
        </section>
      )}

      {/* Screen 2: Why Ranked Here Bottom Sheet */}
      {activeWhyListing && (
        <div className="bottom-sheet-overlay" onClick={() => setActiveWhyListing(null)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-primary">Why You're Ranked Here</span>
                <h3 className="sheet-title">Factual Indicators</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setActiveWhyListing(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="seller-why-body">
              <p>
                This is a second view into Sarthi's ranking graph. These factors reflect comparable listing performance.
              </p>

              <div className="seller-why-metrics">
                <div className="kv-row">
                  <span>Size accuracy</span>
                  <strong>
                    {Math.round((activeWhyListing.metrics.fit_as_expected_rate ?? 1.0) * 100)}%
                  </strong>
                </div>

                <div className="kv-row">
                  <span>Color match</span>
                  <strong>
                    {activeWhyListing.metrics.delivered_orders_90d
                      ? Math.round((1 - activeWhyListing.metrics.color_mismatch_returns / activeWhyListing.metrics.delivered_orders_90d) * 100)
                      : 100}%
                  </strong>
                </div>

                <div className="kv-row">
                  <span>Dispatch median</span>
                  <strong>
                    {activeWhyListing.metrics.median_dispatch_hours} hours
                  </strong>
                </div>
              </div>

              {/* Bullet factors list */}
              <div className="seller-why-reasons">
                <strong>Deciding factors analyzed</strong>
                {activeWhyListing.action_items.map((action, idx) => (
                  <div key={idx} className="reason-row">
                    <Info size={15} />
                    <span>{action.rationale}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => setActiveWhyListing(null)} className="seller-primary-action">
                Close details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Screen 3: Fix It Bottom Sheet */}
      {activeFixListing && (
        <div className="bottom-sheet-overlay" onClick={() => setActiveFixListing(null)}>
          <div className="bottom-sheet-content" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-danger">Fix Listing Metrics</span>
                <h3 className="sheet-title">Update Size Chest Specs</h3>
              </div>
              <button className="bottom-sheet-close" onClick={() => setActiveFixListing(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="seller-fix-body">
              <div className="seller-fix-warning">
                <strong>
                  Size-related returns are elevated for {activeFixListing.product.title.split("-")[0].trim()}.
                </strong>
                <span>
                  Recommended action: correct chest measurement specifications for sizes L and XL.
                </span>
              </div>

              {fixSuccess ? (
                <div className="seller-fix-success">
                  <div>
                    <CheckCircle2 size={36} />
                  </div>
                  <strong>Measurements corrected!</strong>
                  <p>
                    Sarthi saved this as a pending correction. Buyer trust will improve only after future kept outcomes validate the change.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveFixListing(null)}
                    className="seller-primary-action"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <form onSubmit={(e) => handleFixSubmit(e, activeFixListing.product.product_id)} className="seller-fix-form">
                  <div className="seller-fix-grid">
                    <label>
                      <span>Size L Chest (inches)</span>
                      <div className="measurement-input-wrapper">
                        <input
                          type="number"
                          step="0.5"
                          value={lChest}
                          onChange={(e) => setLChest(e.target.value)}
                          required
                        />
                        <strong>in</strong>
                      </div>
                    </label>

                    <label>
                      <span>Size XL Chest (inches)</span>
                      <div className="measurement-input-wrapper">
                        <input
                          type="number"
                          step="0.5"
                          value={xlChest}
                          onChange={(e) => setXlChest(e.target.value)}
                          required
                        />
                        <strong>in</strong>
                      </div>
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={fixLoading || !(Number(lChest) > 0 && Number(xlChest) > Number(lChest))}
                    className="seller-primary-action"
                  >
                    {fixLoading ? "Updating..." : "Update measurement"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {activeProofTask && (
        <div className="bottom-sheet-overlay" onClick={closeProofTask}>
          <div className="bottom-sheet-content" onClick={(event) => event.stopPropagation()}>
            <div className="bottom-sheet-header">
              <div>
                <span className="eyebrow sheet-eyebrow-primary">Seller Proof</span>
                <h3 className="sheet-title">Attach Evidence Reference</h3>
              </div>
              <button className="bottom-sheet-close" onClick={closeProofTask}>
                <X size={16} />
              </button>
            </div>

            <form className="seller-proof-form-body" onSubmit={handleSubmitProof}>
              <div className="seller-proof-context">
                <strong>{activeProofTask.title}</strong>
                <span>
                  {activeProofTask.product_title.split("-")[0].trim()} needs {activeProofTask.recommended_proof_type.replace(/_/g, " ")} for {activeProofTask.attribute}.
                </span>
              </div>

              <label>
                <span>Proof title</span>
                <input
                  value={proofTitle}
                  onChange={(event) => setProofTitle(event.target.value)}
                  required
                />
              </label>

              <label>
                <span>Proof URL or storage reference</span>
                <input
                  type="url"
                  value={proofAssetUrl}
                  onChange={(event) => setProofAssetUrl(event.target.value)}
                  placeholder="https://.../daylight-photo.jpg"
                  required
                />
              </label>

              <label>
                <span>What this proof shows</span>
                <textarea
                  value={proofDescription}
                  onChange={(event) => setProofDescription(event.target.value)}
                  required
                />
              </label>

              <button
                type="submit"
                className="seller-primary-action"
                disabled={
                  proofSubmittingId === proofTaskId(activeProofTask) ||
                  !proofTitle.trim() ||
                  !proofDescription.trim() ||
                  !proofAssetUrl.trim()
                }
              >
                <Plus size={14} />
                {proofSubmittingId ? "Submitting proof" : "Submit proof reference"}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}

function labelize(value: string) {
  return value.replace(/_/g, " ");
}

function proofTaskId(task: SellerEvidenceCoachTask) {
  return `${task.type}:${task.product_id}:${task.attribute}`;
}

function clusterLabel(clusterId: string) {
  if (clusterId === "cluster_floral_blue") return "Blue floral daily kurtis";
  if (clusterId === "cluster_pink_printed") return "Pink printed straight kurtis";
  return labelize(clusterId);
}
