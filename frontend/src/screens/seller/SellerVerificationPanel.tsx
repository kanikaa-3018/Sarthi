import { FileCheck2, Upload } from "lucide-react";
import { useState } from "react";
import type { SellerOnboardingResponse, SellerVerificationDocument } from "../../types/api";
import { labelize } from "./sellerModel";

export type SellerVerificationSubmission = {
  documentType: SellerVerificationDocument["document_type"];
  reference: string;
  fileName: string;
  mimeType: string;
  contentBase64: string;
};

type SellerVerificationPanelProps = {
  onboarding: SellerOnboardingResponse;
  submitting: boolean;
  apiError: string | null;
  onSubmit: (submission: SellerVerificationSubmission) => Promise<boolean>;
};

export function SellerVerificationPanel({ onboarding, submitting, apiError, onSubmit }: SellerVerificationPanelProps) {
  const [documentType, setDocumentType] = useState<SellerVerificationDocument["document_type"]>("gst_certificate");
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<{ name: string; mimeType: string; contentBase64: string } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.currentTarget.files?.[0];
    if (!selected) return;
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(selected.type) || selected.size > 2_500_000) {
      setFile(null);
      setFileError("Use a PDF, JPG, PNG, or WebP file under 2.5 MB.");
      event.currentTarget.value = "";
      return;
    }
    setFile({
      name: selected.name,
      mimeType: selected.type || (selected.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg"),
      contentBase64: dataUrlToBase64(await readFile(selected))
    });
    setFileError(null);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setFileError("Attach the document you want the reviewer to check.");
      return;
    }
    const submitted = await onSubmit({
      documentType,
      reference: reference.trim(),
      fileName: file.name,
      mimeType: file.mimeType,
      contentBase64: file.contentBase64
    });
    if (submitted) {
      setReference("");
      setFile(null);
    }
  }

  const reviewedDocuments = onboarding.documents.filter((document) => document.status === "approved").length;

  return (
    <section className="seller-verification-panel" role="region" aria-labelledby="seller-verification-heading">
      <div className="seller-verification-intro">
        <FileCheck2 size={21} aria-hidden="true" />
        <div>
          <p className="seller-kicker">Visibility blocker</p>
          <h3 id="seller-verification-heading">Complete seller verification</h3>
          <p>{onboarding.seller_verification.restricted_reason || "Listings can be saved, but they cannot become buyer-visible until the required business documents are approved."}</p>
          <span>{reviewedDocuments} approved · {onboarding.documents.length} documents on file</span>
        </div>
      </div>

      <form className="seller-verification-form" onSubmit={handleSubmit}>
        {apiError && <div className="seller-form-error-summary" role="alert">{apiError}</div>}
        <div className="seller-field">
          <label htmlFor="seller-document-type">Document type</label>
          <select id="seller-document-type" value={documentType} onChange={(event) => setDocumentType(event.target.value as SellerVerificationDocument["document_type"])}>
            <option value="gst_certificate">GST certificate</option>
            <option value="pan_card">PAN card</option>
            <option value="address_proof">Address proof</option>
            <option value="bank_proof">Bank proof</option>
          </select>
        </div>
        <div className="seller-field">
          <label htmlFor="seller-document-reference">Reference number</label>
          <input id="seller-document-reference" value={reference} onChange={(event) => setReference(event.target.value)} required />
        </div>
        <div className="seller-field seller-field-wide">
          <label className="seller-upload-control seller-document-upload">
            <Upload size={17} aria-hidden="true" />
            <span>{file?.name || `Choose ${labelize(documentType).toLowerCase()} file`}</span>
            <input aria-label="Document file" type="file" accept=".pdf,image/png,image/jpeg,image/webp" onChange={(event) => void handleFile(event)} />
          </label>
          {fileError && <span className="seller-field-error" role="alert">{fileError}</span>}
        </div>
        <button type="submit" className="seller-button seller-button-primary" disabled={submitting || !reference.trim() || !file}>{submitting ? "Submitting document" : "Submit document"}</button>
      </form>
    </section>
  );
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read verification document"));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBase64(value: string): string {
  return value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
}
