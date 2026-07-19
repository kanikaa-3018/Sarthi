import { FileText, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SellerEvidenceCoachTask } from "../../types/api";
import { proofTaskReason, proofTypeLabel } from "./sellerModel";
import { useDialogLock } from "./useDialogLock";

export type SellerProofSubmission = {
  title: string;
  description: string;
  assetUrl: string;
};

type SellerProofDialogProps = {
  task: SellerEvidenceCoachTask;
  submitting: boolean;
  apiError: string | null;
  onClose: () => void;
  onSubmit: (submission: SellerProofSubmission) => Promise<void>;
};

export function SellerProofDialog({ task, submitting, apiError, onClose, onSubmit }: SellerProofDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<{ title?: string; description?: string; assetUrl?: string }>({});
  useDialogLock(true, dialogRef, onClose, submitting);

  useEffect(() => {
    setTitle(`${proofTypeLabel(task.recommended_proof_type)} proof`);
    setDescription(`${task.product_title}: evidence for ${task.attribute} review.`);
    setAssetUrl("");
    setFileName("");
    setErrors({});
  }, [task]);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!allowed.includes(file.type) || file.size > 2_000_000) {
      setErrors((current) => ({ ...current, assetUrl: "Use a JPG, PNG, WebP, or PDF file under 2 MB." }));
      event.currentTarget.value = "";
      return;
    }
    setFileName(file.name);
    setAssetUrl(await readFile(file));
    setErrors((current) => ({ ...current, assetUrl: undefined }));
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const nextErrors = {
      title: title.trim().length < 5 ? "Use a specific proof title." : undefined,
      description: description.trim().length < 12 ? "Explain what the reviewer can verify." : undefined,
      assetUrl: isAllowedProofReference(assetUrl) ? undefined : "Choose a proof file or enter a secure proof link."
    };
    setErrors(nextErrors);
    const firstError = Object.entries(nextErrors).find(([, value]) => value)?.[0];
    if (firstError) {
      window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`[name="${firstError}"]`)?.focus());
      return;
    }
    await onSubmit({ title: title.trim(), description: description.trim(), assetUrl: assetUrl.trim() });
  }

  function handleBackdrop(event: React.MouseEvent<HTMLDivElement>) {
    if (!submitting && event.target === event.currentTarget) onClose();
  }

  return (
    <div className="seller-dialog-backdrop" onMouseDown={handleBackdrop}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="seller-proof-dialog-title"
        aria-describedby="seller-proof-dialog-description"
        className="seller-dialog"
      >
        <header className="seller-dialog-header">
          <div>
            <p className="seller-kicker">Proof request</p>
            <h2 id="seller-proof-dialog-title">Upload proof</h2>
            <p id="seller-proof-dialog-description">Answer the buyer concern with evidence a reviewer can verify.</p>
          </div>
          <button type="button" className="seller-icon-button" aria-label="Close proof dialog" onClick={onClose} disabled={submitting}><X size={18} /></button>
        </header>

        <form id="seller-proof-form" className="seller-dialog-body" onSubmit={handleSubmit}>
          <section className="seller-proof-request-context" aria-label="Buyer concern">
            <span>{task.product_title}</span>
            <h3>{task.title}</h3>
            <p>{proofTaskReason(task)}</p>
            <dl>
              <div><dt>Required proof</dt><dd>{proofTypeLabel(task.recommended_proof_type)}</dd></div>
              <div><dt>Buyer demand</dt><dd>{task.buyer_demand} {task.buyer_demand === 1 ? "request" : "requests"}</dd></div>
            </dl>
          </section>

          {apiError && <div className="seller-form-error-summary" role="alert" tabIndex={-1}>{apiError}</div>}

          <div className="seller-field">
            <label className="seller-proof-dropzone">
              <Upload size={20} aria-hidden="true" />
              <strong>{fileName || "Choose proof file"}</strong>
              <span>JPG, PNG, WebP, or PDF · maximum 2 MB</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => void handleFile(event)} />
            </label>
            {assetUrl && (
              <div className="seller-proof-preview">
                {assetUrl.startsWith("data:image/") ? <img src={assetUrl} alt="Selected proof preview" /> : <FileText size={20} aria-hidden="true" />}
                <span>{fileName || "Proof reference added"}</span>
              </div>
            )}
          </div>

          <div className="seller-field">
            <label htmlFor="seller-proof-link">Proof file or secure link</label>
            <input id="seller-proof-link" name="assetUrl" value={assetUrl.startsWith("data:") ? fileName : assetUrl} onChange={(event) => { setAssetUrl(event.target.value); setFileName(""); setErrors((current) => ({ ...current, assetUrl: undefined })); }} placeholder="https://... or seeded://..." aria-invalid={Boolean(errors.assetUrl)} aria-describedby={errors.assetUrl ? "seller-proof-link-error" : undefined} />
            {errors.assetUrl && <span id="seller-proof-link-error" className="seller-field-error">{errors.assetUrl}</span>}
          </div>

          <div className="seller-field">
            <label htmlFor="seller-proof-title">Proof title</label>
            <input id="seller-proof-title" name="title" value={title} onChange={(event) => { setTitle(event.target.value); setErrors((current) => ({ ...current, title: undefined })); }} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "seller-proof-title-error" : undefined} />
            {errors.title && <span id="seller-proof-title-error" className="seller-field-error">{errors.title}</span>}
          </div>

          <div className="seller-field">
            <label htmlFor="seller-proof-description">What this proves</label>
            <textarea id="seller-proof-description" name="description" value={description} onChange={(event) => { setDescription(event.target.value); setErrors((current) => ({ ...current, description: undefined })); }} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "seller-proof-description-error" : undefined} />
            {errors.description && <span id="seller-proof-description-error" className="seller-field-error">{errors.description}</span>}
          </div>

          <p className="seller-review-note">A reviewer checks whether this evidence matches the product before buyers can see it.</p>
        </form>

        <footer className="seller-dialog-footer">
          <button type="button" className="seller-button seller-button-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" form="seller-proof-form" className="seller-button seller-button-primary" disabled={submitting}>{submitting ? "Submitting for review" : "Submit for review"}</button>
        </footer>
      </section>
    </div>
  );
}

function isAllowedProofReference(value: string): boolean {
  return value.startsWith("data:") || value.startsWith("https://") || value.startsWith("seeded://") || value.startsWith("seller-asset://");
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read proof file"));
    reader.readAsDataURL(file);
  });
}
