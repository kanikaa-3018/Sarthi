import { AlertCircle, Bot, CheckCircle2, FileText, ShieldCheck, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { roleText, type LanguageCode } from "../../i18n";
import type { SellerEvidenceCoachTask } from "../../types/api";
import { proofPacketForTask, proofTaskContext, proofTaskReason, proofTypeLabel, type SellerProofPacket } from "./sellerModel";
import { useDialogLock } from "./useDialogLock";

export type SellerProofSubmission = {
  title: string;
  description: string;
  assetUrl: string;
};

type SellerProofDialogProps = {
  task: SellerEvidenceCoachTask;
  proofPacket?: SellerProofPacket | null;
  language: LanguageCode;
  submitting: boolean;
  apiError: string | null;
  onClose: () => void;
  onSubmit: (submission: SellerProofSubmission) => Promise<void>;
};

type ProofPrecheckItem = {
  key: string;
  label: string;
  detail: string;
  status: "pass" | "warn" | "blocked";
};

export function SellerProofDialog({ task, proofPacket, language, submitting, apiError, onClose, onSubmit }: SellerProofDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const tx = (text: string) => roleText(language, text);
  const packet = useMemo(() => proofPacket ?? proofPacketForTask(task), [proofPacket, task]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assetUrl, setAssetUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<{ title?: string; description?: string; assetUrl?: string }>({});
  const context = proofTaskContext(task);
  const isReturnEvidence = context === "return-signal";
  const isRejectedEvidence = context === "rejected-proof";
  const proofPrecheck = useMemo(
    () => buildProofPrecheck({ title, description, assetUrl, packet }),
    [assetUrl, description, packet, title]
  );
  const precheckReady = proofPrecheck.filter((item) => item.status === "pass").length;
  const precheckBlocked = proofPrecheck.some((item) => item.status === "blocked");
  useDialogLock(true, dialogRef, onClose, submitting);

  useEffect(() => {
    setTitle(packet.prefillTitle);
    setDescription(packet.prefillDescription);
    setAssetUrl("");
    setFileName("");
    setErrors({});
  }, [packet]);

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
            <p className="seller-kicker">{tx(isRejectedEvidence ? "Reviewer feedback" : isReturnEvidence ? "Listing evidence gap" : "Proof request")}</p>
            <h2 id="seller-proof-dialog-title">{tx("Upload proof")}</h2>
            <p id="seller-proof-dialog-description">{tx(isRejectedEvidence ? "Replace the rejected proof with clearer evidence for the reviewer." : isReturnEvidence ? "Address the repeated return issue with evidence a reviewer can verify." : "Answer the buyer concern with evidence a reviewer can verify.")}</p>
          </div>
          <button type="button" className="seller-icon-button" aria-label={tx("Close proof dialog")} onClick={onClose} disabled={submitting}><X size={18} /></button>
        </header>

        <form id="seller-proof-form" className="seller-dialog-body" onSubmit={handleSubmit}>
          <section className="seller-proof-request-context" aria-label={isRejectedEvidence ? "Reviewer feedback" : isReturnEvidence ? "Return issue" : "Buyer concern"}>
            <span>{task.product_title}</span>
            <h3>{task.title}</h3>
            <p>{proofTaskReason(task)}</p>
            <dl>
              <div><dt>{tx("Required proof")}</dt><dd>{proofTypeLabel(task.recommended_proof_type)}</dd></div>
              <div>
                <dt>{tx(isRejectedEvidence ? "Review status" : isReturnEvidence ? "Recent returns" : "Buyer demand")}</dt>
                <dd>{isRejectedEvidence ? tx("Replacement needed") : `${task.buyer_demand} ${isReturnEvidence ? (task.buyer_demand === 1 ? tx("return") : tx("returns")) : (task.buyer_demand === 1 ? tx("request") : tx("requests"))}`}</dd>
              </div>
            </dl>
          </section>

          <section className="seller-proof-packet" aria-label="Prepared proof packet">
            <div className="seller-proof-packet-head">
              <span><Bot size={15} aria-hidden="true" /> {tx("Prepared packet")}</span>
              <strong>{packet.title}</strong>
              <p>{packet.buyerDemand} buyer asks, +{packet.trustLift} trust after approval, target {packet.target.toLowerCase()}.</p>
            </div>
            <ul>
              {packet.checklist.map((item) => (
                <li key={item}><CheckCircle2 size={14} aria-hidden="true" />{item}</li>
              ))}
            </ul>
            <small><ShieldCheck size={14} aria-hidden="true" />{packet.reviewerGate}</small>
          </section>

          <section className="seller-proof-precheck" aria-label="Proof quality precheck">
            <header>
              <span><ShieldCheck size={15} aria-hidden="true" /> {tx("Proof precheck")}</span>
              <strong>{precheckReady}/{proofPrecheck.length} ready</strong>
            </header>
            <ul>
              {proofPrecheck.map((item) => (
                <li key={item.key} className={`precheck-${item.status}`}>
                  {item.status === "pass" ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertCircle size={15} aria-hidden="true" />}
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {apiError && <div className="seller-form-error-summary" role="alert" tabIndex={-1}>{apiError}</div>}

          <div className="seller-field">
            <label className="seller-proof-dropzone">
              <Upload size={20} aria-hidden="true" />
              <strong>{fileName || tx("Choose proof file")}</strong>
              <span>{tx("JPG, PNG, WebP, or PDF / maximum 2 MB")}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => void handleFile(event)} />
            </label>
            {assetUrl && (
              <div className="seller-proof-preview">
                {assetUrl.startsWith("data:image/") ? <img src={assetUrl} alt="Selected proof preview" /> : <FileText size={20} aria-hidden="true" />}
                <span>{fileName || tx("Proof reference added")}</span>
              </div>
            )}
          </div>

          <div className="seller-field">
            <label htmlFor="seller-proof-link">{tx("Proof file or secure link")}</label>
            <input id="seller-proof-link" name="assetUrl" value={assetUrl.startsWith("data:") ? fileName : assetUrl} onChange={(event) => { setAssetUrl(event.target.value); setFileName(""); setErrors((current) => ({ ...current, assetUrl: undefined })); }} placeholder="https://... or seeded://..." aria-invalid={Boolean(errors.assetUrl)} aria-describedby={errors.assetUrl ? "seller-proof-link-error" : undefined} />
            {errors.assetUrl && <span id="seller-proof-link-error" className="seller-field-error">{errors.assetUrl}</span>}
          </div>

          <div className="seller-field">
            <label htmlFor="seller-proof-title">{tx("Proof title")}</label>
            <input id="seller-proof-title" name="title" value={title} onChange={(event) => { setTitle(event.target.value); setErrors((current) => ({ ...current, title: undefined })); }} aria-invalid={Boolean(errors.title)} aria-describedby={errors.title ? "seller-proof-title-error" : undefined} />
            {errors.title && <span id="seller-proof-title-error" className="seller-field-error">{errors.title}</span>}
          </div>

          <div className="seller-field">
            <label htmlFor="seller-proof-description">{tx("What this proves")}</label>
            <textarea id="seller-proof-description" name="description" value={description} onChange={(event) => { setDescription(event.target.value); setErrors((current) => ({ ...current, description: undefined })); }} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "seller-proof-description-error" : undefined} />
            {errors.description && <span id="seller-proof-description-error" className="seller-field-error">{errors.description}</span>}
          </div>

          <p className="seller-review-note">{tx("A reviewer checks whether this evidence matches the product before buyers can see it.")}</p>
        </form>

        <footer className="seller-dialog-footer">
          <button type="button" className="seller-button seller-button-secondary" onClick={onClose} disabled={submitting}>{tx("Cancel")}</button>
          <button type="submit" form="seller-proof-form" className="seller-button seller-button-primary" disabled={submitting}>{submitting ? tx("Submitting for review") : precheckBlocked ? tx("Submit for review") : tx("Submit checked proof")}</button>
        </footer>
      </section>
    </div>
  );
}

function buildProofPrecheck({
  title,
  description,
  assetUrl,
  packet
}: {
  title: string;
  description: string;
  assetUrl: string;
  packet: SellerProofPacket;
}): ProofPrecheckItem[] {
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  const hasAllowedReference = isAllowedProofReference(assetUrl);
  const text = `${cleanTitle} ${cleanDescription}`.toLowerCase();
  const hasPrivacyRisk = /\b(phone|mobile|address|whatsapp|upi|buyer id|buyer name|customer name|customer phone)\b/i.test(text);
  const productToken = packet.productTitle.split(/\s+/).find((part) => part.length >= 4)?.toLowerCase();
  const mentionsProduct = Boolean(productToken && text.includes(productToken));

  return [
    {
      key: "reference",
      label: "Evidence attached",
      detail: hasAllowedReference ? "File or secure proof link is ready for reviewer upload." : "Attach a JPG, PNG, WebP, PDF, or secure proof link.",
      status: hasAllowedReference ? "pass" : "blocked"
    },
    {
      key: "copy",
      label: "Reviewer copy",
      detail: cleanDescription.length >= 12 ? "Description explains what the reviewer should verify." : "Add one clear sentence about what this proof shows.",
      status: cleanDescription.length >= 12 ? "pass" : "blocked"
    },
    {
      key: "product",
      label: "Product match",
      detail: cleanTitle.length >= 5 && mentionsProduct ? "Title and copy point to this product packet." : cleanTitle.length >= 5 ? "Title is usable; mention the exact product if the proof covers multiple variants." : "Use a specific proof title.",
      status: cleanTitle.length < 5 ? "blocked" : mentionsProduct ? "pass" : "warn"
    },
    {
      key: "privacy",
      label: "Privacy safe",
      detail: hasPrivacyRisk ? "Remove buyer identifiers or contact details before review." : "No obvious buyer identity or contact detail is included.",
      status: hasPrivacyRisk ? "warn" : "pass"
    }
  ];
}

function isAllowedProofReference(value: string): boolean {
  return /^data:(image\/(jpeg|png|webp)|application\/pdf);base64,/i.test(value) || value.startsWith("https://") || value.startsWith("seeded://") || value.startsWith("seller-asset://");
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read proof file"));
    reader.readAsDataURL(file);
  });
}
