import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])"
].join(",");

export function useDialogLock(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  closeDisabled = false
) {
  const triggerRef = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  const closeDisabledRef = useRef(closeDisabled);
  closeRef.current = onClose;
  closeDisabledRef.current = closeDisabled;

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.documentElement.classList.add("seller-scroll-lock");
    document.body.classList.add("seller-scroll-lock");

    function focusableElements() {
      return Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((element) => !element.hidden);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !closeDisabledRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusableElements();
      if (!elements.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    window.requestAnimationFrame(() => focusableElements()[0]?.focus());
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.documentElement.classList.remove("seller-scroll-lock");
      document.body.classList.remove("seller-scroll-lock");
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
  }, [dialogRef, open]);
}
