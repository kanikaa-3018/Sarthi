import { Ruler, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SellerProductRow } from "./sellerModel";
import { useDialogLock } from "./useDialogLock";

export type SellerMeasurementSubmission = {
  lChest: number;
  xlChest: number;
};

type SellerMeasurementDialogProps = {
  row: SellerProductRow;
  submitting: boolean;
  apiError: string | null;
  onClose: () => void;
  onSubmit: (submission: SellerMeasurementSubmission) => Promise<void>;
};

export function SellerMeasurementDialog({ row, submitting, apiError, onClose, onSubmit }: SellerMeasurementDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const [lChest, setLChest] = useState("38");
  const [xlChest, setXlChest] = useState("40");
  const [errors, setErrors] = useState<{ lChest?: string; xlChest?: string }>({});
  useDialogLock(true, dialogRef, onClose, submitting);

  useEffect(() => {
    setLChest("38");
    setXlChest("40");
    setErrors({});
  }, [row.listing.product.product_id]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const lValue = Number(lChest);
    const xlValue = Number(xlChest);
    const nextErrors = {
      lChest: lValue > 0 ? undefined : "Enter the measured chest for size L.",
      xlChest: xlValue > lValue ? undefined : "Size XL must be larger than size L."
    };
    setErrors(nextErrors);
    const firstError = Object.entries(nextErrors).find(([, value]) => value)?.[0];
    if (firstError) {
      window.requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`[name="${firstError}"]`)?.focus());
      return;
    }
    await onSubmit({ lChest: lValue, xlChest: xlValue });
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
        aria-labelledby="seller-measurement-dialog-title"
        aria-describedby="seller-measurement-dialog-description"
        className="seller-dialog seller-measurement-dialog"
      >
        <header className="seller-dialog-header">
          <div>
            <p className="seller-kicker">Size evidence</p>
            <h2 id="seller-measurement-dialog-title">Update measurements</h2>
            <p id="seller-measurement-dialog-description">Submit measured values for reviewer approval before they affect buyer trust.</p>
          </div>
          <button type="button" className="seller-icon-button" aria-label="Close measurement dialog" onClick={onClose} disabled={submitting}><X size={18} /></button>
        </header>

        <form id="seller-measurement-form" className="seller-dialog-body" onSubmit={handleSubmit}>
          <section className="seller-measurement-context">
            <Ruler size={20} aria-hidden="true" />
            <div><span>{row.listing.product.title}</span><strong>{row.concern}</strong><p>Measure the garment flat across the chest. Enter the full chest measurement in inches.</p></div>
          </section>

          {apiError && <div className="seller-form-error-summary" role="alert" tabIndex={-1}>{apiError}</div>}

          <div className="seller-measurement-fields">
            <div className="seller-field">
              <label htmlFor="seller-l-chest">Size L chest</label>
              <div className="seller-unit-input"><input id="seller-l-chest" name="lChest" type="number" min="1" step="0.5" value={lChest} onChange={(event) => { setLChest(event.target.value); setErrors((current) => ({ ...current, lChest: undefined })); }} aria-invalid={Boolean(errors.lChest)} aria-describedby={errors.lChest ? "seller-l-chest-error" : undefined} /><span>in</span></div>
              {errors.lChest && <span id="seller-l-chest-error" className="seller-field-error">{errors.lChest}</span>}
            </div>
            <div className="seller-field">
              <label htmlFor="seller-xl-chest">Size XL chest</label>
              <div className="seller-unit-input"><input id="seller-xl-chest" name="xlChest" type="number" min="1" step="0.5" value={xlChest} onChange={(event) => { setXlChest(event.target.value); setErrors((current) => ({ ...current, xlChest: undefined })); }} aria-invalid={Boolean(errors.xlChest)} aria-describedby={errors.xlChest ? "seller-xl-chest-error" : undefined} /><span>in</span></div>
              {errors.xlChest && <span id="seller-xl-chest-error" className="seller-field-error">{errors.xlChest}</span>}
            </div>
          </div>

          <p className="seller-review-note">A reviewer checks these values against the listing before the correction becomes buyer-visible.</p>
        </form>

        <footer className="seller-dialog-footer">
          <button type="button" className="seller-button seller-button-secondary" onClick={onClose} disabled={submitting}>Cancel</button>
          <button type="submit" form="seller-measurement-form" className="seller-button seller-button-primary" disabled={submitting}>{submitting ? "Submitting measurements" : "Submit measurements"}</button>
        </footer>
      </section>
    </div>
  );
}
