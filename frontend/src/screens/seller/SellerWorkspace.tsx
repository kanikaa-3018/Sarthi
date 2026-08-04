import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  correctMeasurement,
  createListingDraft,
  getSellerEvidenceCoach,
  getSellerOnboarding,
  getSellerPanel,
  submitSellerDocument,
  submitListingDraft,
  submitSellerEvidenceAsset,
  updateListingDraft
} from "../../api/client";
import { roleText, type LanguageCode } from "../../i18n";
import type {
  ListingDraft,
  SellerEvidenceCoachResponse,
  SellerEvidenceCoachTask,
  SellerOnboardingResponse,
  SellerPanelResponse
} from "../../types/api";
import { SellerListingFlow, type SellerListingDraftInput } from "./SellerListingFlow";
import { SellerMarketPage } from "./SellerMarketPage";
import { SellerMeasurementDialog, type SellerMeasurementSubmission } from "./SellerMeasurementDialog";
import { SellerProductsPage } from "./SellerProductsPage";
import { SellerProofDialog, type SellerProofSubmission } from "./SellerProofDialog";
import { SellerProofsPage } from "./SellerProofsPage";
import { SellerShell } from "./SellerShell";
import { SellerTodayPage } from "./SellerTodayPage";
import type { SellerVerificationSubmission } from "./SellerVerificationPanel";
import { sellerCopy } from "./sellerCopy";
import {
  buildProductRows,
  buildProofLanes,
  buildSellerAutomation,
  buildSellerActions,
  labelize,
  parseSellerRoute,
  routePath,
  type SellerActionItem,
  type SellerProductRow,
  type SellerRoute
} from "./sellerModel";

export function SellerWorkspace({ language = "english" }: { language?: LanguageCode }) {
  const copy = useMemo(() => sellerCopy(language), [language]);
  const tx = useCallback((text: string) => roleText(language, text), [language]);
  const location = useLocation();
  const navigate = useNavigate();
  const activeRoute = parseSellerRoute(location.pathname, location.search);
  const [onboarding, setOnboarding] = useState<SellerOnboardingResponse | null>(null);
  const [panel, setPanel] = useState<SellerPanelResponse | null>(null);
  const [coach, setCoach] = useState<SellerEvidenceCoachResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [activeProofTask, setActiveProofTask] = useState<SellerEvidenceCoachTask | null>(null);
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);
  const [listingSubmitting, setListingSubmitting] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [activeMeasurementRow, setActiveMeasurementRow] = useState<SellerProductRow | null>(null);
  const [measurementSubmitting, setMeasurementSubmitting] = useState(false);
  const [measurementError, setMeasurementError] = useState<string | null>(null);
  const [verificationSubmitting, setVerificationSubmitting] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const loadWorkspace = useCallback(async (announce = false) => {
    setLoading(true);
    setError(null);
    const [onboardingResult, panelResult, coachResult] = await Promise.allSettled([
      getSellerOnboarding(),
      getSellerPanel(),
      getSellerEvidenceCoach()
    ]);

    if (onboardingResult.status === "fulfilled") setOnboarding(onboardingResult.value);
    if (panelResult.status === "fulfilled") setPanel(panelResult.value);
    if (coachResult.status === "fulfilled") setCoach(coachResult.value);

    const failures = [onboardingResult, panelResult, coachResult].filter((result) => result.status === "rejected");
    if (failures.length === 3) {
      const reason = failures[0].status === "rejected" ? failures[0].reason : null;
      setError(reason instanceof Error ? reason.message : tx("Seller workspace unavailable"));
    } else if (failures.length) {
      setError(tx("Some seller information could not be refreshed. Available work is still shown."));
    } else if (announce) {
      setStatusMessage(tx("Seller workspace refreshed."));
    }
    setLoading(false);
  }, [tx]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    if (statusMessage) window.requestAnimationFrame(() => statusRef.current?.focus());
  }, [statusMessage]);

  useEffect(() => {
    const canonicalPath = routePath(activeRoute);
    const legacyPath = location.pathname !== canonicalPath || Boolean(location.search);
    if (legacyPath && (location.pathname.startsWith("/seller/trust-coach") || location.pathname.startsWith("/seller/listing-lab") || location.pathname.startsWith("/seller/rating-forecast") || location.pathname.startsWith("/seller/copilot") || location.pathname.startsWith("/seller/autopilot") || location.search.includes("tab="))) {
      navigate(canonicalPath, { replace: true });
    }
  }, [activeRoute, location.pathname, location.search, navigate]);

  useEffect(() => {
    if (activeRoute !== "new") {
      setEditingDraftId(null);
      return;
    }
    const routeDraftId = new URLSearchParams(location.search).get("draft");
    if (routeDraftId) setEditingDraftId(routeDraftId);
  }, [activeRoute, location.search]);

  const seller = panel?.seller ?? onboarding?.seller ?? null;
  const verification = onboarding?.seller_verification ?? panel?.seller_verification ?? null;
  const listings = panel?.seller_all_listings ?? panel?.seller_listings ?? [];
  const actions = useMemo(() => buildSellerActions({ onboarding, panel, coach }), [coach, onboarding, panel]);
  const productRows = useMemo(() => buildProductRows(listings, coach?.tasks ?? []), [coach?.tasks, listings]);
  const proofLanes = useMemo(() => buildProofLanes(coach), [coach]);
  const automation = useMemo(() => buildSellerAutomation({ actions, productRows, proofLanes, coach }), [actions, coach, productRows, proofLanes]);
  const editingDraft = useMemo(
    () => onboarding?.listing_drafts.find((draft) => draft.draft_id === editingDraftId) ?? null,
    [editingDraftId, onboarding?.listing_drafts]
  );
  const reviewerItems = (coach?.proof_assets.filter((asset) => asset.status === "submitted").length ?? 0)
    + (onboarding?.listing_drafts.filter((draft) => draft.status === "submitted").length ?? 0)
    + (onboarding?.documents.filter((document) => document.status === "submitted" || document.status === "under_review").length ?? 0);

  function navigateSeller(route: SellerRoute) {
    setStatusMessage(null);
    if (route === "new") setEditingDraftId(null);
    navigate(routePath(route));
  }

  function handleAction(action: SellerActionItem) {
    if (action.action.type === "proof" && action.proofTask) {
      setProofError(null);
      setActiveProofTask(action.proofTask);
      return;
    }
    if (action.action.type === "proof") return navigateSeller("proofs");
    if (action.action.type === "draft" && action.action.id) {
      setEditingDraftId(action.action.id);
      navigate(`/seller/new?draft=${encodeURIComponent(action.action.id)}`);
      return;
    }
    if (action.action.type === "new" || action.action.type === "verification") return navigateSeller("new");
    if (action.action.type === "product") return navigateSeller("products");
  }

  function handleProductAction(row: SellerProductRow) {
    if (row.actionKind === "measurement") {
      setMeasurementError(null);
      setActiveMeasurementRow(row);
      return;
    }
    if (row.actionKind === "proof" && row.proofTask) {
      setProofError(null);
      setActiveProofTask(row.proofTask);
      return;
    }
    openMarketComparison(row);
  }

  function openMarketComparison(row: SellerProductRow) {
    setStatusMessage(null);
    navigate(`/seller/market?product=${encodeURIComponent(row.listing.product.product_id)}`);
  }

  async function handleMeasurementSubmit(submission: SellerMeasurementSubmission) {
    if (!activeMeasurementRow) return;
    setMeasurementSubmitting(true);
    setMeasurementError(null);
    try {
      await correctMeasurement(activeMeasurementRow.listing.product.product_id, {
        l_chest: submission.lChest,
        xl_chest: submission.xlChest
      });
      setActiveMeasurementRow(null);
      setStatusMessage("Measurements sent for review.");
      await loadWorkspace();
    } catch (caught) {
      setMeasurementError(caught instanceof Error ? caught.message : "Could not submit measurements.");
    } finally {
      setMeasurementSubmitting(false);
    }
  }

  async function handleProofSubmit(submission: SellerProofSubmission) {
    if (!activeProofTask) return;
    setProofSubmitting(true);
    setProofError(null);
    try {
      await submitSellerEvidenceAsset({
        product_id: activeProofTask.product_id,
        attribute: activeProofTask.attribute,
        proof_type: activeProofTask.recommended_proof_type,
        title: submission.title,
        description: submission.description,
        asset_url: submission.assetUrl
      });
      setActiveProofTask(null);
      setStatusMessage(tx("Proof submitted to reviewer."));
      await loadWorkspace();
      navigate("/seller/proofs");
    } catch (caught) {
      setProofError(caught instanceof Error ? caught.message : "Could not submit proof.");
    } finally {
      setProofSubmitting(false);
    }
  }

  async function handleCreateDraft(input: SellerListingDraftInput): Promise<boolean> {
    setListingSubmitting(true);
    setError(null);
    try {
      await createListingDraft(input);
      setStatusMessage(tx("Listing draft saved."));
      await loadWorkspace();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the listing draft.");
      return false;
    } finally {
      setListingSubmitting(false);
    }
  }

  async function handleUpdateDraft(draftId: string, input: SellerListingDraftInput): Promise<boolean> {
    setListingSubmitting(true);
    setError(null);
    try {
      await updateListingDraft(draftId, input);
      setStatusMessage(tx("Listing changes saved."));
      await loadWorkspace();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the listing changes.");
      return false;
    } finally {
      setListingSubmitting(false);
    }
  }

  async function handleVerificationSubmit(submission: SellerVerificationSubmission): Promise<boolean> {
    setVerificationSubmitting(true);
    setVerificationError(null);
    try {
      const updated = await submitSellerDocument({
        document_type: submission.documentType,
        reference: submission.reference,
        file_name: submission.fileName,
        mime_type: submission.mimeType,
        content_base64: submission.contentBase64
      });
      setOnboarding(updated);
      setStatusMessage(tx("Verification document sent for review."));
      await loadWorkspace();
      return true;
    } catch (caught) {
      setVerificationError(caught instanceof Error ? caught.message : "Could not submit the verification document.");
      return false;
    } finally {
      setVerificationSubmitting(false);
    }
  }

  async function handleSubmitDraft(draft: ListingDraft) {
    setListingSubmitting(true);
    setError(null);
    try {
      await submitListingDraft(draft.draft_id);
      setStatusMessage(`${draft.title} sent for review.`);
      await loadWorkspace();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the draft for review.");
    } finally {
      setListingSubmitting(false);
    }
  }

  if (!seller && loading) {
    return <SellerWorkspaceLoader copy={copy} language={language} />;
  }

  if (!seller) {
    return (
      <main className="seller-app seller-fatal-state">
        <h1>{tx("Seller workspace unavailable")}</h1>
        <p>{error || tx("Seller identity could not be loaded.")}</p>
        <button type="button" className="seller-button seller-button-primary" onClick={() => void loadWorkspace()}>{copy.retry}</button>
      </main>
    );
  }

  const facts = [
    { label: copy.buyerRating, value: typeof seller.current_rating === "number" ? seller.current_rating.toFixed(1) : "New", detail: seller.rating_count ? `${seller.rating_count.toLocaleString("en-IN")} ratings` : "No ratings yet" },
    { label: copy.liveProducts, value: String(seller.product_count), detail: `${listings.length} products tracked` },
    { label: copy.openProofs, value: String(coach?.open_task_count ?? proofLanes.openTasks.length), detail: proofLanes.openTasks.length ? "Buyer evidence is waiting" : "No buyer ask is open" },
    { label: copy.reviewItems, value: String(reviewerItems), detail: reviewerItems ? "A reviewer has these items" : "Nothing is waiting" }
  ];

  return (
    <SellerShell
      seller={seller}
      verificationStatus={verification?.verification_status === "verified" ? "Seller verified" : verification ? labelize(verification.verification_status) : "Verification unavailable"}
      copy={copy}
      language={language}
      loading={loading}
    >
      {error && <div className="seller-inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadWorkspace()}>{copy.retry}</button></div>}
      {statusMessage && <div ref={statusRef} className="seller-inline-status" role="status" tabIndex={-1}>{statusMessage}</div>}

      {activeRoute === "today" && <SellerTodayPage actions={actions} facts={facts} automation={automation} proofAgent={coach?.proof_agent ?? null} copy={copy} language={language} onAction={handleAction} onOpenProofs={() => navigateSeller("proofs")} />}
      {activeRoute === "products" && <SellerProductsPage rows={productRows} automation={automation} copy={copy} language={language} onAction={handleProductAction} onCompare={openMarketComparison} />}
      {activeRoute === "new" && (
        <SellerListingFlow
          onboarding={onboarding}
          editingDraft={editingDraft}
          submitting={listingSubmitting}
          verificationSubmitting={verificationSubmitting}
          verificationError={verificationError}
          language={language}
          onCreateDraft={handleCreateDraft}
          onUpdateDraft={handleUpdateDraft}
          onSubmitDraft={handleSubmitDraft}
          onSubmitVerification={handleVerificationSubmit}
          onEditDraft={(draft) => {
            setEditingDraftId(draft.draft_id);
            navigate(`/seller/new?draft=${encodeURIComponent(draft.draft_id)}`);
          }}
          onCancelEdit={() => {
            setEditingDraftId(null);
            navigate("/seller/new", { replace: true });
          }}
        />
      )}
      {activeRoute === "proofs" && <SellerProofsPage lanes={proofLanes} rows={productRows} automation={automation} agent={coach?.proof_agent ?? null} copy={copy} language={language} onOpenTask={(task) => { setProofError(null); setActiveProofTask(task); }} />}
      {activeRoute === "market" && <SellerMarketPage listings={listings} competitors={panel?.competing_listings ?? []} actions={actions} initialProductId={new URLSearchParams(location.search).get("product")} language={language} onAction={handleAction} />}

      {activeProofTask && <SellerProofDialog task={activeProofTask} proofPacket={automation.proofPacket?.taskKey === `${activeProofTask.product_id}:${activeProofTask.attribute}` ? automation.proofPacket : null} language={language} submitting={proofSubmitting} apiError={proofError} onClose={() => { if (!proofSubmitting) setActiveProofTask(null); }} onSubmit={handleProofSubmit} />}
      {activeMeasurementRow && <SellerMeasurementDialog row={activeMeasurementRow} submitting={measurementSubmitting} apiError={measurementError} language={language} onClose={() => { if (!measurementSubmitting) setActiveMeasurementRow(null); }} onSubmit={handleMeasurementSubmit} />}
    </SellerShell>
  );
}

function SellerWorkspaceLoader({ copy, language }: { copy: ReturnType<typeof sellerCopy>; language: LanguageCode }) {
  const tx = (text: string) => roleText(language, text);
  const steps = ["Proof demand", "Listing risks", "Reviewer queue"];
  return (
    <main className="seller-app seller-loading-shell" role="status" aria-live="polite">
      <section className="seller-loading-hero">
        <div>
          <span>{tx("Seller workspace")}</span>
          <h1>{copy.loading}</h1>
          <p>{tx("Preparing proof work, product actions, and review status from seller data.")}</p>
        </div>
        <div className="seller-loading-meter" aria-hidden="true"><span /></div>
      </section>

      <div className="seller-loading-steps" aria-label="Seller workspace loading steps">
        {steps.map((step, index) => (
          <article key={step}>
            <span>{index + 1}</span>
            <strong>{tx(step)}</strong>
            <i aria-hidden="true" />
          </article>
        ))}
      </div>

      <div className="seller-loading-grid" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
