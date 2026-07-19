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
  submitSellerEvidenceAsset
} from "../../api/client";
import type { LanguageCode } from "../../i18n";
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
      setError(reason instanceof Error ? reason.message : "Could not load the seller workspace.");
    } else if (failures.length) {
      setError("Some seller information could not be refreshed. Available work is still shown.");
    } else if (announce) {
      setStatusMessage("Seller workspace refreshed.");
    }
    setLoading(false);
  }, []);

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

  const seller = panel?.seller ?? onboarding?.seller ?? null;
  const verification = onboarding?.seller_verification ?? panel?.seller_verification ?? null;
  const listings = panel?.seller_all_listings ?? panel?.seller_listings ?? [];
  const actions = useMemo(() => buildSellerActions({ onboarding, panel, coach }), [coach, onboarding, panel]);
  const productRows = useMemo(() => buildProductRows(listings, coach?.tasks ?? []), [coach?.tasks, listings]);
  const proofLanes = useMemo(() => buildProofLanes(coach), [coach]);
  const reviewerItems = (coach?.proof_assets.filter((asset) => asset.status === "submitted").length ?? 0)
    + (onboarding?.listing_drafts.filter((draft) => draft.status === "submitted").length ?? 0)
    + (onboarding?.documents.filter((document) => document.status === "submitted" || document.status === "under_review").length ?? 0);

  function navigateSeller(route: SellerRoute) {
    setStatusMessage(null);
    navigate(routePath(route));
  }

  function handleAction(action: SellerActionItem) {
    if (action.action.type === "proof" && action.proofTask) {
      setProofError(null);
      setActiveProofTask(action.proofTask);
      return;
    }
    if (action.action.type === "proof") return navigateSeller("proofs");
    if (action.action.type === "new" || action.action.type === "draft" || action.action.type === "verification") return navigateSeller("new");
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
      setStatusMessage("Proof submitted to reviewer.");
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
      setStatusMessage("Listing draft saved.");
      await loadWorkspace();
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the listing draft.");
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
      setStatusMessage("Verification document sent for review.");
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
    return <div className="seller-workspace-loading" role="status"><span />{copy.loading}</div>;
  }

  if (!seller) {
    return (
      <main className="seller-app seller-fatal-state">
        <h1>Seller workspace unavailable</h1>
        <p>{error || "Seller identity could not be loaded."}</p>
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
      activeRoute={activeRoute}
      copy={copy}
      loading={loading}
      onNavigate={navigateSeller}
    >
      {error && <div className="seller-inline-error" role="alert"><span>{error}</span><button type="button" onClick={() => void loadWorkspace()}>{copy.retry}</button></div>}
      {statusMessage && <div ref={statusRef} className="seller-inline-status" role="status" tabIndex={-1}>{statusMessage}</div>}

      {activeRoute === "today" && <SellerTodayPage actions={actions} facts={facts} copy={copy} onAction={handleAction} />}
      {activeRoute === "products" && <SellerProductsPage rows={productRows} copy={copy} onAction={handleProductAction} onNewListing={() => navigateSeller("new")} />}
      {activeRoute === "new" && <SellerListingFlow onboarding={onboarding} submitting={listingSubmitting} verificationSubmitting={verificationSubmitting} verificationError={verificationError} onCreateDraft={handleCreateDraft} onSubmitDraft={handleSubmitDraft} onSubmitVerification={handleVerificationSubmit} />}
      {activeRoute === "proofs" && <SellerProofsPage lanes={proofLanes} copy={copy} onOpenTask={(task) => { setProofError(null); setActiveProofTask(task); }} />}
      {activeRoute === "market" && <SellerMarketPage listings={listings} competitors={panel?.competing_listings ?? []} actions={actions} initialProductId={new URLSearchParams(location.search).get("product")} onAction={handleAction} />}

      {activeProofTask && <SellerProofDialog task={activeProofTask} submitting={proofSubmitting} apiError={proofError} onClose={() => { if (!proofSubmitting) setActiveProofTask(null); }} onSubmit={handleProofSubmit} />}
      {activeMeasurementRow && <SellerMeasurementDialog row={activeMeasurementRow} submitting={measurementSubmitting} apiError={measurementError} onClose={() => { if (!measurementSubmitting) setActiveMeasurementRow(null); }} onSubmit={handleMeasurementSubmit} />}
    </SellerShell>
  );
}
