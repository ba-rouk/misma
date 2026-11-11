import type { ReactNode } from "react";

type AuthFlowLayoutProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

export function AuthFlowLayout({
  eyebrow,
  title,
  description,
  children,
}: AuthFlowLayoutProps) {
  return (
    <main className="misma-auth-flow-page">
      <div className="misma-auth-flow-shell">
        <a className="misma-auth-flow-brand" href="/" aria-label="Misma home">
          <span className="misma-auth-flow-mark" aria-hidden="true">
            <svg viewBox="0 0 100 100" fill="none">
              <circle cx="50" cy="50" r="50" fill="currentColor" fillOpacity=".12" />
              <path
                d="m20 51 12 12 18-22M37 51l12 12 31-37"
                stroke="currentColor"
                strokeWidth="9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>Misma</span>
        </a>

        <section className="misma-auth-flow-card" aria-labelledby="misma-auth-flow-title">
          <header className="misma-auth-flow-header">
            <p className="misma-auth-flow-eyebrow">{eyebrow}</p>
            <h1 id="misma-auth-flow-title">{title}</h1>
            <p className="misma-auth-flow-description">{description}</p>
          </header>
          {children}
        </section>

        <p className="misma-auth-flow-footer">
          Secure account access <span aria-hidden="true">·</span> Misma
        </p>
      </div>
    </main>
  );
}
