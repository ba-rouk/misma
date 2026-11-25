import type { ReactNode } from "react";

export function BackButton({
  onClick,
  ariaLabel = "Go back",
  className = "",
}: {
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={["misma-page-back-button", className].filter(Boolean).join(" ")}
      onClick={onClick}
      aria-label={ariaLabel}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 18 9 12l6-6M9 12h12" />
      </svg>
    </button>
  );
}

export function PageHeader({
  title,
  onBack,
  backLabel = "Go back",
  right,
  className = "",
}: {
  title: string;
  onBack: () => void;
  backLabel?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={["misma-page-header", className].filter(Boolean).join(" ")}>
      <BackButton onClick={onBack} ariaLabel={backLabel} />
      <h1>{title}</h1>
      <span className="misma-page-header-right">{right || null}</span>
    </header>
  );
}
