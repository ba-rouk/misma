import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthFlowLayout } from "../../components/auth-flow-layout";
import {
  authRedirectErrorMessage,
  clearAuthRedirectUrl,
  clearSessionStorageFlag,
  hasAuthRedirectMaterial,
  hasSessionStorageFlag,
  readInitialAuthRedirectParams,
  setSessionStorageFlag,
} from "../../lib/auth-redirect";
import { getSupabaseClient, getSupabaseConfig } from "../../lib/supabase";

const EMAIL_CONFIRMED_KEY = "misma_email_confirmed";

type PageState = "checking" | "confirmed" | "invalid" | "neutral";

export const Route = createFileRoute("/auth/confirmed")({
  component: EmailConfirmed,
});

function EmailConfirmed() {
  const started = useRef(false);
  const [pageState, setPageState] = useState<PageState>("checking");
  const [pageMessage, setPageMessage] = useState("");
  const [email, setEmail] = useState("");
  const [resendBusy, setResendBusy] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [resendError, setResendError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!getSupabaseConfig()) {
      setPageMessage("Misma could not connect to its account service. Please try again later.");
      setPageState("invalid");
      return;
    }

    const supabase = getSupabaseClient();
    let active = true;
    const params = readInitialAuthRedirectParams();

    const initialize = async () => {
      try {
        if (params.error || params.errorCode) {
          clearSessionStorageFlag(EMAIL_CONFIRMED_KEY);
          if (active) {
            setPageMessage(authRedirectErrorMessage(params));
            setPageState("invalid");
          }
          return;
        }

        if (!hasAuthRedirectMaterial(params)) {
          if (hasSessionStorageFlag(EMAIL_CONFIRMED_KEY)) {
            clearSessionStorageFlag(EMAIL_CONFIRMED_KEY);
            if (active) setPageState("confirmed");
          } else if (active) {
            setPageState("neutral");
          }
          return;
        }

        let session: Session | null = null;
        if (params.tokenHash) {
          if (params.type !== "signup" && params.type !== "email") {
            throw new Error("This is not an email-confirmation link.");
          }
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: params.tokenHash,
            type: params.type,
          });
          if (error) throw error;
          session = data.session;
        } else if (params.code) {
          if (params.type && params.type !== "signup" && params.type !== "email") {
            throw new Error("This is not an email-confirmation link.");
          }
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
          session = data.session;
        } else if (params.accessToken && params.refreshToken) {
          if (params.type !== "signup" && params.type !== "email") {
            throw new Error("This is not an email-confirmation link.");
          }
          const { data, error } = await supabase.auth.setSession({
            access_token: params.accessToken,
            refresh_token: params.refreshToken,
          });
          if (error) throw error;
          session = data.session;
        }

        if (!session) {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;
          session = data.session;
        }
        if (!session) {
          throw new Error("Supabase did not return a verified email session.");
        }

        setSessionStorageFlag(EMAIL_CONFIRMED_KEY);
        clearAuthRedirectUrl();
        if (active) {
          setPageState("confirmed");
          // This was a one-time handoff from /auth/confirm, not a permanent
          // "confirmed" cache for future visits to this public route.
          clearSessionStorageFlag(EMAIL_CONFIRMED_KEY);
        }
      } catch (cause) {
        clearSessionStorageFlag(EMAIL_CONFIRMED_KEY);
        const message = cause instanceof Error ? cause.message : "";
        if (active) {
          setPageMessage(
            /expired|otp|invalid|verifier|session|token|not an email-confirmation/i.test(message)
              ? authRedirectErrorMessage({ ...params, error: params.error || message })
              : "This confirmation link could not be verified. Request a new confirmation email and open the newest link.",
          );
          setPageState("invalid");
        }
      }
    };

    void initialize();

    return () => {
      active = false;
    };
  }, []);

  const resendConfirmation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResendBusy(true);
    setResendError("");
    setResendMessage("");

    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) throw new Error("Enter the email address you used to create your Misma account.");

      const { error } = await getSupabaseClient().auth.resend({
        type: "signup",
        email: normalizedEmail,
        options: {
          emailRedirectTo: window.location.origin + "/auth/confirmed",
        },
      });
      if (error) {
        const message = error.message.toLowerCase();
        if (message.includes("already confirmed") || message.includes("already been confirmed")) {
          throw new Error("This email address is already confirmed. Try logging in to Misma.");
        }
        throw error;
      }

      setResendMessage("If this address has an unconfirmed Misma account, a new confirmation email has been sent. Check your inbox and spam folder.");
      setEmail(normalizedEmail);
    } catch (cause) {
      setResendError(
        cause instanceof Error
          ? cause.message
          : "Could not resend the confirmation email. Please try again.",
      );
    } finally {
      setResendBusy(false);
    }
  };

  const goToLogin = async () => {
    setActionBusy(true);
    try {
      await getSupabaseClient().auth.signOut({ scope: "local" });
    } catch (cause) {
      console.warn("Could not clear the email-confirmation session:", cause);
    } finally {
      clearSessionStorageFlag(EMAIL_CONFIRMED_KEY);
      clearSessionStorageFlag("misma_password_recovery");
      try {
        sessionStorage.removeItem("misma_id_token");
        sessionStorage.removeItem("misma_email");
      } catch {
        // Ignore storage restrictions.
      }
      window.location.replace("/login");
    }
  };

  if (pageState === "checking") {
    return (
      <AuthFlowLayout title="Verifying email">
        <p className="misma-auth-flow-status" role="status" aria-live="polite">Please wait…</p>
      </AuthFlowLayout>
    );
  }

  if (pageState === "confirmed") {
    return (
      <AuthFlowLayout title="Email confirmed">
        <button className="misma-auth-flow-button" type="button" onClick={() => void goToLogin()} disabled={actionBusy}>
          {actionBusy ? "Signing out…" : "Continue to login"}
        </button>
      </AuthFlowLayout>
    );
  }

  if (pageState === "neutral") {
    return (
      <AuthFlowLayout title="Check your inbox">
        <a className="misma-auth-flow-button" href="/login">Go to login</a>
      </AuthFlowLayout>
    );
  }

  return (
    <AuthFlowLayout title="Confirmation failed">
      <p className="misma-auth-flow-error" role="alert">
        {pageMessage || "Request a new confirmation email and open the newest link."}
      </p>
      <form className="misma-auth-flow-form" onSubmit={(event) => void resendConfirmation(event)}>
        <label className="misma-auth-flow-field" htmlFor="misma-confirm-email">
          Email address
          <input
            id="misma-confirm-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setResendError("");
              setResendMessage("");
            }}
            placeholder="you@example.com"
            required
          />
        </label>

        {resendError && <p className="misma-auth-flow-error" role="alert">{resendError}</p>}
        {resendMessage && <p className="misma-auth-flow-success" role="status" aria-live="polite">{resendMessage}</p>}

        <button className="misma-auth-flow-button" type="submit" disabled={resendBusy || !email.trim()}>
          {resendBusy ? "Sending email…" : "Send new confirmation email"}
        </button>
      </form>

      <a className="misma-auth-flow-secondary" href="/login">Back to login</a>
    </AuthFlowLayout>
  );
}
