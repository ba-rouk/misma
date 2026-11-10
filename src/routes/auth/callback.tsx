import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase";

function safeDashboardDestination(value: string | null): string {
  if (!value || typeof window === "undefined") return "/dashboard";
  try {
    const target = new URL(value, window.location.origin);
    if (target.origin !== window.location.origin || !(target.pathname === "/dashboard" || target.pathname.startsWith("/dashboard/"))) return "/dashboard";
    return target.pathname + target.search + target.hash;
  } catch {
    return "/dashboard";
  }
}

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const started = useRef(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const completeSignIn = async () => {
      const params = new URLSearchParams(window.location.search);
      const providerError =
        params.get("error_description") || params.get("error");
      if (providerError) {
        setError(providerError);
        return;
      }

      const code = params.get("code");
      if (!code) {
        setError("Google sign-in did not return an authorization code. Please try again.");
        return;
      }

      try {
        const { data, error: exchangeError } =
          await getSupabaseClient().auth.exchangeCodeForSession(code);
        if (exchangeError) throw exchangeError;
        if (!data.session) throw new Error("Supabase did not return a sign-in session.");

        sessionStorage.setItem("misma_id_token", data.session.access_token);
        if (data.session.user.email) {
          sessionStorage.setItem("misma_email", data.session.user.email);
        }
        const destination = safeDashboardDestination(sessionStorage.getItem("misma_post_login_redirect"));
        sessionStorage.removeItem("misma_post_login_redirect");
        window.location.replace(destination);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not complete Google sign-in. Please try again.",
        );
      }
    };

    void completeSignIn();
  }, []);

  return (
    <main className="auth-page">
      <section className="login-panel">
        <div className="login-form-wrap" role={error ? "alert" : "status"}>
          <div className="login-eyebrow">MISMA ACCOUNT</div>
          <h2>{error ? "Sign-in could not be completed." : "Securing your session..."}</h2>
          {error && (
            <>
              <p className="login-subtitle">{error}</p>
              <a className="login-submit" href="/login">
                Return to login
              </a>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
