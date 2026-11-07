import { useEffect, useRef } from "react";
import {
  MISMA_ORIGIN_LABEL,
  type MicPermissionDialogView,
} from "../lib/use-mic-permission";
import "./mic-permission-dialog.css";

type MicPermissionDialogProps = {
  open: boolean;
  view: MicPermissionDialogView;
  requesting?: boolean;
  onAllow: () => void;
  onNeverAllow: () => void;
  onClose: () => void;
};

function getBrowserInstructions(): string {
  if (typeof navigator === "undefined") return "Open your browser's site permissions and allow microphone access, then reload.";
  const ua = navigator.userAgent || "";

  if (/Android/i.test(ua) && /Chrome/i.test(ua)) {
    return "Chrome on Android: tap the site controls icon beside the address bar, open Permissions or Site settings, set Microphone to Allow, then reload this page.";
  }
  if (/iPhone|iPad|iPod/i.test(ua)) {
    return "Safari on iPhone or iPad: open Settings > Apps > Safari > Microphone and allow access. You can also open the Safari page menu > Website Settings and allow Microphone. Return to Misma and reload.";
  }
  if (/Firefox/i.test(ua)) {
    return "Firefox: select the lock icon beside the address bar, open Connection secure or Permissions, find Use the Microphone, choose Allow, then reload.";
  }
  if (/Chrome|Chromium|Edg/i.test(ua)) {
    return "Desktop Chrome: select the tune or lock icon beside the address bar, open Site settings, set Microphone to Allow, then reload.";
  }
  return "Open this website's permissions in your browser settings, set Microphone to Allow, then reload Misma.";
}

function getDialogCopy(view: MicPermissionDialogView) {
  switch (view) {
    case "blocked":
      return {
        message: "Microphone is blocked. Tap the lock icon next to the address bar, open Permissions, set Microphone to Allow, then reload.",
        detail: getBrowserInstructions(),
      };
    case "no-device":
      return {
        message: "No microphone was found on this device. Connect or enable a microphone, then try again.",
        detail: "Check that your device has an available microphone and that it is not disabled by the operating system.",
      };
    case "insecure":
      return {
        message: "Microphone access requires a secure HTTPS connection.",
        detail: "Open Misma using its HTTPS address. Browsers block microphone access on ordinary insecure pages.",
      };
    case "unsupported":
      return {
        message: "This browser cannot provide microphone access.",
        detail: "Open Misma in a current browser that supports microphone access, using HTTPS.",
      };
    default:
      return {
        message: "",
        detail: "",
      };
  }
}

export function MicPermissionDialog({
  open,
  view,
  requesting = false,
  onAllow,
  onNeverAllow,
  onClose,
}: MicPermissionDialogProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const firstButtonRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      previouslyFocusedRef.current?.focus?.();
      return;
    }

    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const frame = window.requestAnimationFrame(() => firstButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])",
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, view, requesting]);

  if (!open) return null;

  const copy = getDialogCopy(view);
  const showingPermissionChoices = view === "permission";

  return (
    <div className="misma-mic-permission-scrim">
      <div
        ref={dialogRef}
        className="misma-mic-permission-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="misma-mic-permission-title"
        aria-describedby={showingPermissionChoices ? undefined : "misma-mic-permission-copy"}
        tabIndex={-1}
      >
        <div className="misma-mic-permission-header">
          <span className="misma-mic-permission-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <rect x="9" y="2.5" width="6" height="12" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6" />
            </svg>
          </span>
          <p id="misma-mic-permission-title">
            <strong>{MISMA_ORIGIN_LABEL}</strong> wants to use your microphone
          </p>
        </div>

        {showingPermissionChoices ? (
          <div className="misma-mic-permission-actions">
            <button ref={firstButtonRef} type="button" disabled={requesting} onClick={onAllow}>
              Allow while visiting the site
            </button>
            <button type="button" disabled={requesting} onClick={onAllow}>
              Allow this time
            </button>
            <button type="button" className="is-secondary" disabled={requesting} onClick={onNeverAllow}>
              Never allow
            </button>
          </div>
        ) : (
          <div className="misma-mic-permission-help">
            <p id="misma-mic-permission-copy">{copy.message}</p>
            <p className="misma-mic-permission-detail">{copy.detail}</p>
            <div className="misma-mic-permission-actions">
              <button ref={firstButtonRef} type="button" onClick={onClose}>Got it</button>
            </div>
          </div>
        )}
        {requesting && <span className="misma-mic-permission-status" role="status">Requesting microphone access…</span>}
      </div>
    </div>
  );
}
