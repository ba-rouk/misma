import { useEffect, useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";

type SurfaceProps = HTMLAttributes<HTMLDivElement> & { className?: string };
export function GlassCard({ className = "", ...props }: SurfaceProps) {
  return <div className={["misma-glass-card", className].filter(Boolean).join(" ")} {...props} />;
}
export function GlassRow({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={["misma-glass-row", className].filter(Boolean).join(" ")} {...props} />;
}
export function Button({ variant = "primary", className = "", type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "destructive" }) {
  return <button type={type} className={["misma-ui-button", "is-" + variant, className].filter(Boolean).join(" ")} {...props} />;
}
export function Badge({ tone = "neutral", children, className = "" }: { tone?: "neutral" | "success" | "warning" | "danger"; children: ReactNode; className?: string }) {
  return <span className={["misma-ui-badge", "is-" + tone, className].filter(Boolean).join(" ")}>{children}</span>;
}
export function Chip({ children, onRemove, className = "" }: { children: ReactNode; onRemove?: () => void; className?: string }) {
  return <span className={["misma-ui-chip", className].filter(Boolean).join(" ")}>{children}{onRemove && <button type="button" onClick={onRemove} aria-label="Remove">×</button>}</span>;
}
export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={["misma-ui-input", className].filter(Boolean).join(" ")} {...props} />;
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} className={"misma-ui-toggle" + (checked ? " is-on" : "")} onClick={() => onChange(!checked)}><span /></button>;
}
export function SectionHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="misma-ui-section-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>;
}
export function StickyActionBar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={["misma-ui-sticky-action", className].filter(Boolean).join(" ")}>{children}</div>;
}
export function GlassModal({ open, title, description, children, onClose, size = "md", position = "center" }: {
  open: boolean; title: string; description?: string; children: ReactNode; onClose: () => void; size?: "sm" | "md" | "lg"; position?: "center" | "bottom";
}) {
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={"misma-glass-scrim is-" + position} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={"misma-glass-modal is-" + size + (position === "bottom" ? " is-bottom-sheet" : "")} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}>
        <div className="misma-glass-modal-grabber" aria-hidden="true" />
        <header className="misma-glass-modal-header"><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><button type="button" className="misma-glass-close" onClick={onClose} aria-label="Close dialog">×</button></header>
        {children}
      </section>
    </div>
  );
}
