import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
type SurfaceProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode };
export function GlassCard({ children, className = "", ...props }: SurfaceProps) {
  return <section className={"misma-glass-card " + className} {...props}>{children}</section>;
}
export function GlassRow({ children, className = "", ...props }: SurfaceProps) {
  return <div className={"misma-glass-row " + className} {...props}>{children}</div>;
}
export function GlassModal({ children, className = "", ...props }: SurfaceProps) {
  return <div className={"misma-glass-scrim"}><section className={"misma-glass-modal " + className} role="dialog" aria-modal="true" {...props}>{children}</section></div>;
}
export function BottomSheet({ children, className = "", ...props }: SurfaceProps) {
  return <div className="misma-glass-scrim misma-glass-scrim-bottom"><section className={"misma-glass-modal misma-glass-bottom-sheet " + className} role="dialog" aria-modal="true" {...props}>{children}</section></div>;
}
export function StickyActionBar({ children, className = "", ...props }: SurfaceProps) {
  return <div className={"misma-glass-sticky-action " + className} {...props}>{children}</div>;
}
export function Toggle({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: (checked: boolean) => void; label: string; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} className={"misma-glass-toggle" + (checked ? " is-on" : "")} onClick={() => onChange(!checked)}><span /></button>;
}
export function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <header className="misma-section-header"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</header>;
}
export function Button({ variant = "primary", className = "", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "destructive" }) {
  return <button className={"misma-button is-" + variant + " " + className} {...props}>{children}</button>;
}
export function Badge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={"misma-glass-badge " + className}>{children}</span>;
}
export function Chip({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={"misma-glass-chip " + className}>{children}</span>;
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={"misma-glass-input " + (props.className || "")} />;
}
