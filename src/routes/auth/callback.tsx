import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../lib/supabase";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const navigate = useNavigate();
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
        await navigate({ to: "/dashboard", replace: true });
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not complete Google sign-in. Please try again.",
        );
      }
    };

    void completeSignIn();
  }, [navigate]);

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
