import { ArrowLeft, ArrowRight, Check, Upload } from "lucide-react";
import { useRef, useState } from "react";
import type { ListingDraft, SellerOnboardingResponse } from "../../types/api";
import { SellerVerificationPanel, type SellerVerificationSubmission } from "./SellerVerificationPanel";

export type SellerListingDraftInput = {
  title: string;
  category: string;
  garment_type: string;
  fabric: string;
  color_family: string;
  base_price: number;
  image_url: string;
};

type SellerListingFlowProps = {
  onboarding: SellerOnboardingResponse | null;
  submitting: boolean;
  verificationSubmitting: boolean;
  verificationError: string | null;
  onCreateDraft: (draft: SellerListingDraftInput) => Promise<boolean>;
  onSubmitDraft: (draft: ListingDraft) => Promise<void>;
  onSubmitVerification: (submission: SellerVerificationSubmission) => Promise<boolean>;
};

type DraftState = Omit<SellerListingDraftInput, "base_price"> & { base_price: string };
type DraftErrors = Partial<Record<keyof DraftState, string>>;

const EMPTY_DRAFT: DraftState = {
  title: "",
  category: "women_kurtis",
  garment_type: "",
  fabric: "",
  color_family: "",
  base_price: "",
  image_url: ""
};

export function SellerListingFlow({ onboarding, submitting, verificationSubmitting, verificationError, onCreateDraft, onSubmitDraft, onSubmitVerification }: SellerListingFlowProps) {
  const [stage, setStage] = useState(1);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<DraftErrors>({});
  const formRef = useRef<HTMLDivElement>(null);
  const verification = onboarding?.seller_verification.verification_status ?? "pending";

  function update<Key extends keyof DraftState>(key: Key, value: DraftState[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  function continueFromBasics() {
    const nextErrors = validateBasics(draft);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      focusFirstError(nextErrors, formRef.current);
      return;
    }
    setStage(2);
  }

  function continueFromImage() {
    if (!isAllowedImageReference(draft.image_url)) {
      const nextErrors = { image_url: "Add a current product image or secure image link." };
      setErrors(nextErrors);
      focusFirstError(nextErrors, formRef.current);
      return;
    }
    setStage(3);
  }

  async function handleSave() {
    const success = await onCreateDraft({
      ...draft,
      base_price: Number(draft.base_price)
    });
    if (success) {
      setDraft(EMPTY_DRAFT);
      setErrors({});
      setStage(1);
    }
  }

  async function handleImageFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 1_500_000) {
      setErrors((current) => ({ ...current, image_url: "Use a JPG, PNG, or WebP image under 1.5 MB." }));
      event.currentTarget.value = "";
      return;
    }
    update("image_url", await readFile(file));
  }

  return (
    <div className="seller-page seller-listing-page" ref={formRef}>
      <header className="seller-page-header seller-listing-header">
        <div>
          <p className="seller-kicker">New product</p>
          <h2>Create a listing</h2>
          <p>Add facts in a clear order, check the product image, then review exactly what goes to the reviewer.</p>
        </div>
        <span className={`seller-verification-note seller-verification-${verification}`}>{verificationLabel(verification)}</span>
      </header>

      {onboarding && verification !== "verified" && (
        <SellerVerificationPanel onboarding={onboarding} submitting={verificationSubmitting} apiError={verificationError} onSubmit={onSubmitVerification} />
      )}

      <ol className="seller-stepper" aria-label="Listing progress">
        {["Product basics", "Image and evidence", "Review"].map((label, index) => {
          const number = index + 1;
          return (
            <li key={label} className={number === stage ? "active" : number < stage ? "complete" : ""} aria-current={number === stage ? "step" : undefined}>
              <span>{number < stage ? <Check size={15} aria-hidden="true" /> : number}</span>
              <div><strong>{label}</strong><small>Step {number} of 3</small></div>
            </li>
          );
        })}
      </ol>

      <section className="seller-listing-stage" aria-labelledby={`seller-listing-stage-${stage}`}>
        <p className="seller-step-count">Step {stage} of 3</p>
        {stage === 1 && (
          <div className="seller-form-grid">
            <div className="seller-field seller-field-wide">
              <label htmlFor="seller-title">Product title</label>
              <input id="seller-title" name="title" value={draft.title} onChange={(event) => update("title", event.target.value)} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "seller-title-error" : undefined} />
              {errors.title && <span id="seller-title-error" className="seller-field-error">{errors.title}</span>}
            </div>
            <SellerTextField label="Category" name="category" value={draft.category} error={errors.category} onChange={(value) => update("category", value)} />
            <SellerTextField label="Garment type" name="garment_type" value={draft.garment_type} error={errors.garment_type} onChange={(value) => update("garment_type", value)} />
            <SellerTextField label="Fabric" name="fabric" value={draft.fabric} error={errors.fabric} onChange={(value) => update("fabric", value)} />
            <SellerTextField label="Colour family" name="color_family" value={draft.color_family} error={errors.color_family} onChange={(value) => update("color_family", value)} />
            <div className="seller-field seller-field-wide">
              <label htmlFor="seller-base-price">Base price</label>
              <div className="seller-money-input"><span>₹</span><input id="seller-base-price" name="base_price" type="number" min="1" value={draft.base_price} onChange={(event) => update("base_price", event.target.value)} aria-invalid={Boolean(errors.base_price)} aria-describedby={errors.base_price ? "seller-base-price-error" : undefined} /></div>
              {errors.base_price && <span id="seller-base-price-error" className="seller-field-error">{errors.base_price}</span>}
            </div>
          </div>
        )}

        {stage === 2 && (
          <div className="seller-image-stage">
            <div className="seller-image-preview">
              {draft.image_url ? <img src={draft.image_url} alt="Selected listing preview" /> : <div><Upload size={24} aria-hidden="true" /><strong>Add the actual product image</strong><p>Use a clear front view. Avoid promotional banners or unrelated catalog art.</p></div>}
            </div>
            <div className="seller-image-controls">
              <label className="seller-upload-control">
                <Upload size={17} aria-hidden="true" />
                <span>{draft.image_url ? "Replace image" : "Choose image"}</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleImageFile(event)} />
              </label>
              <div className="seller-field">
                <label htmlFor="seller-image-url">Or use a secure image link</label>
                <input id="seller-image-url" name="image_url" value={draft.image_url.startsWith("data:") ? "" : draft.image_url} onChange={(event) => update("image_url", event.target.value)} placeholder="https://..." aria-invalid={Boolean(errors.image_url)} aria-describedby={errors.image_url ? "seller-image-url-error" : undefined} />
                {errors.image_url && <span id="seller-image-url-error" className="seller-field-error">{errors.image_url}</span>}
              </div>
              <p className="seller-field-help">The current listing API stores one primary image. Additional-image support needs a separate catalog change.</p>
            </div>
          </div>
        )}

        {stage === 3 && (
          <div className="seller-review-layout">
            <img src={draft.image_url} alt="" />
            <dl>
              <div><dt>Title</dt><dd>{draft.title}</dd></div>
              <div><dt>Category</dt><dd>{draft.category}</dd></div>
              <div><dt>Product facts</dt><dd>{draft.color_family} · {draft.fabric} · {draft.garment_type}</dd></div>
              <div><dt>Base price</dt><dd>₹{Number(draft.base_price).toLocaleString("en-IN")}</dd></div>
              <div><dt>Review path</dt><dd>{verification === "verified" ? "Save the draft, then send it to reviewer." : "You can save the draft, but seller verification blocks buyer visibility."}</dd></div>
            </dl>
          </div>
        )}

        <footer className="seller-stage-actions">
          {stage > 1 ? <button type="button" className="seller-button seller-button-secondary" onClick={() => setStage((current) => current - 1)}><ArrowLeft size={16} aria-hidden="true" />Back</button> : <span />}
          {stage === 1 && <button type="button" className="seller-button seller-button-primary" onClick={continueFromBasics}>Continue to image<ArrowRight size={16} aria-hidden="true" /></button>}
          {stage === 2 && <button type="button" className="seller-button seller-button-primary" onClick={continueFromImage}>Review listing<ArrowRight size={16} aria-hidden="true" /></button>}
          {stage === 3 && <button type="button" className="seller-button seller-button-primary" disabled={submitting} onClick={() => void handleSave()}>{submitting ? "Saving draft" : "Save draft"}</button>}
        </footer>
      </section>

      <section className="seller-drafts" aria-labelledby="seller-drafts-heading">
        <div className="seller-section-heading"><div><p className="seller-kicker">Saved work</p><h3 id="seller-drafts-heading">Listing drafts</h3></div><span>{onboarding?.listing_drafts.length ?? 0}</span></div>
        {onboarding?.listing_drafts.length ? (
          <ul>
            {onboarding.listing_drafts.map((item) => (
              <li key={item.draft_id}>
                <div><strong>{item.title}</strong><span>₹{item.base_price.toLocaleString("en-IN")} · {item.status.replace(/_/g, " ")}</span></div>
                <button type="button" className="seller-button seller-button-secondary" disabled={submitting || item.status !== "draft"} onClick={() => void onSubmitDraft(item)}>{item.status === "draft" ? "Send for review" : item.status.replace(/_/g, " ")}</button>
              </li>
            ))}
          </ul>
        ) : <p className="seller-empty-line">No saved drafts yet.</p>}
      </section>
    </div>
  );
}

function SellerTextField({ label, name, value, error, onChange }: { label: string; name: keyof DraftState; value: string; error?: string; onChange: (value: string) => void }) {
  const id = `seller-${name.replace(/_/g, "-")}`;
  return (
    <div className="seller-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      {error && <span id={`${id}-error`} className="seller-field-error">{error}</span>}
    </div>
  );
}

function validateBasics(draft: DraftState): DraftErrors {
  const errors: DraftErrors = {};
  if (draft.title.trim().length < 5) errors.title = "Use a specific product title.";
  if (!draft.category.trim()) errors.category = "Enter a category.";
  if (!draft.garment_type.trim()) errors.garment_type = "Enter the garment type.";
  if (!draft.fabric.trim()) errors.fabric = "Enter the fabric.";
  if (!draft.color_family.trim()) errors.color_family = "Enter the colour family.";
  if (!(Number(draft.base_price) > 0)) errors.base_price = "Enter a valid base price.";
  return errors;
}

function focusFirstError(errors: DraftErrors, container: HTMLElement | null) {
  const first = Object.keys(errors)[0];
  if (!first) return;
  window.requestAnimationFrame(() => container?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
}

function isAllowedImageReference(value: string): boolean {
  return /^data:image\/(jpeg|png|webp);base64,/i.test(value) || value.startsWith("https://") || value.startsWith("seeded://") || value.startsWith("seller-asset://");
}

function verificationLabel(status: string): string {
  return status === "verified" ? "Seller verified" : status === "restricted" ? "Seller restricted" : "Verification pending";
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image"));
    reader.readAsDataURL(file);
  });
}
