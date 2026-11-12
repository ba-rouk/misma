import type { ReactNode } from "react";

type AuthFlowLayoutProps = {
  title: string;
  children: ReactNode;
};

export function AuthFlowLayout({ title, children }: AuthFlowLayoutProps) {
  return (
    <main className="misma-auth-flow-page">
      <div className="misma-auth-flow-shell">
        <a className="misma-auth-flow-brand" href="/" aria-label="Misma home">
          <img className="misma-auth-flow-logo" src="/misma-logo.svg" alt="" />
          <span>Misma</span>
        </a>

        <section className="misma-auth-flow-card" aria-labelledby="misma-auth-flow-title">
          <header className="misma-auth-flow-header">
            <h1 id="misma-auth-flow-title">{title}</h1>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
