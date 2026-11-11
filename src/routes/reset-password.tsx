import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import { AuthFlowLayout } from "../components/auth-flow-layout";
import {
  authRedirectErrorMessage,
  clearAuthRedirectUrl,
  clearSessionStorageFlag,
  hasAuthRedirectMaterial,
  hasSessionStorageFlag,
  readInitialAuthRedirectParams,
  setSessionStorageFlag,
} from "../lib/auth-redirect";
import { getSupabaseClient, getSupabaseConfig } from "../lib/supabase";

const RECOVERY_SESSION_KEY = "misma_password_recovery";

type PageState = "checking" | "ready" | "invalid" | "updated";

function passwordUpdateErrorMessage(message: string): string {
  const value = message.toLowerCase();

  if (
    value.includes("same password") ||
    value.includes("same as") ||
    value.includes("different from") ||
    value.includes("should be different")
  ) {
    return "Choose a password you have not used before.";
  }
  if (
    value.includes("weak password") ||
    value.includes("password should") ||
    value.includes("password is too") ||
    value.includes("at least 8")
  ) {
    return "Choose a stronger password. Use at least 8 characters and avoid common passwords.";
  }
  if (
    value.includes("session") ||
    value.includes("jwt") ||
    value.includes("token") ||
    value.includes("not authenticated")
  ) {
    return "Your password-reset session has expired. Request a new reset email from the login page.";
  }
  return "Your password could not be updated. Check your connection and try again.";
}

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
});

function ResetPassword() {
  const started = useRef(false);
  const recoveryEventSeen = useRef(false);
  const [pageState, setPageState] = useState<PageState>("checking");
  const [pageMessage, setPageMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" && session) {
        recoveryEventSeen.current = true;
        setSessionStorageFlag(RECOVERY_SESSION_KEY);
        setPageState("ready");
        setPageMessage("");
      } else if (event === "SIGNED_OUT" && recoveryEventSeen.current) {
        clearSessionStorageFlag(RECOVERY_SESSION_KEY);
        setPageMessage("Your password-reset session has ended. Request a new reset email.");
        setPageState("invalid");
      }
    });

    const initialize = async () => {
      try {
        if (params.error || params.errorCode) {
          clearSessionStorageFlag(RECOVERY_SESSION_KEY);
          if (active) {
            setPageMessage(authRedirectErrorMessage(params));
            setPageState("invalid");
          }
          return;
        }

        const { data: currentData, error: currentError } = await supabase.auth.getSession();
        if (currentError) throw currentError;

        // This marker is set only after a recovery link was verified. It lets
        // a refresh work after Supabase has consumed the URL's code or token.
        if (
          currentData.session &&
          hasSessionStorageFlag(RECOVERY_SESSION_KEY)
        ) {
          if (active) {
            clearAuthRedirectUrl();
            setPageState("ready");
            setPageMessage("");
          }
          return;
        }

        if (!hasAuthRedirectMaterial(params)) {
          if (recoveryEventSeen.current) {
            if (active) setPageState("ready");
            return;
          }
          clearSessionStorageFlag(RECOVERY_SESSION_KEY);
          if (active) {
            setPageMessage("Open the password-reset link from your email to choose a new password. When a link expires, request another from the login page.");
            setPageState("invalid");
          }
          return;
        }

        let session: Session | null = null;

        if (params.tokenHash) {
          if (params.type !== "recovery") {
            throw new Error("This is not a password-reset link. Use the reset link from your email.");
          }
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: params.tokenHash,
            type: "recovery",
          });
          if (error) throw error;
          session = data.session;
        } else if (params.code) {
          if (params.type && params.type !== "recovery") {
            throw new Error("This is not a password-reset link. Use the reset link from your email.");
          }
          const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
          if (error) throw error;
          session = data.session;
        } else if (params.accessToken && params.refreshToken) {
          if (params.type !== "recovery") {
            throw new Error("This is not a password-reset link. Use the reset link from your email.");
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
          throw new Error("The reset link did not create an active recovery session.");
        }

        setSessionStorageFlag(RECOVERY_SESSION_KEY);
        clearAuthRedirectUrl();
        if (active) {
          setPageState("ready");
          setPageMessage("");
        }
      } catch (cause) {
        clearSessionStorageFlag(RECOVERY_SESSION_KEY);
        const message =
          cause instanceof Error
            ? cause.message
            : "This reset link could not be verified. Request a new reset email.";
        if (active) {
          const friendly = /session|jwt|not authenticated/i.test(message)
            ? "Your password-reset session is missing or has expired. Request a new reset email from the login page."
            : /expired|otp|invalid|verifier|session|token|not a password-reset/i.test(message)
              ? authRedirectErrorMessage({ ...params, error: params.error || message })
              : message;
          setPageMessage(friendly);
          setPageState("invalid");
        }
      }
    };

    void initialize();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // The route deliberately initializes once from the URL captured before
    // the Supabase client is first created.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");

    if (password.length < 8) {
      setFormError("Your password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("The passwords do not match. Check both fields and try again.");
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session || pageState !== "ready") {
        setPageMessage("Your password-reset session has expired. Request a new reset email from the login page.");
        clearSessionStorageFlag(RECOVERY_SESSION_KEY);
        setPageState("invalid");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setPassword("");
      setConfirmPassword("");
      setFormError("");
      setPageState("updated");
      clearAuthRedirectUrl();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      const friendly = passwordUpdateErrorMessage(message);
      setFormError(friendly);
      if (/session|jwt|token|not authenticated/i.test(message)) {
        clearSessionStorageFlag(RECOVERY_SESSION_KEY);
        setPageMessage(friendly);
        setPageState("invalid");
      }
    } finally {
      setBusy(false);
    }
  };

  const goToLogin = async () => {
    setBusy(true);
    try {
      await getSupabaseClient().auth.signOut({ scope: "local" });
    } catch (cause) {
      console.warn("Could not clear the password recovery session:", cause);
    } finally {
      clearSessionStorageFlag(RECOVERY_SESSION_KEY);
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
      <AuthFlowLayout
        eyebrow="SECURE ACCOUNT ACCESS"
        title="Checking your reset link."
        description="Misma is verifying your password-reset session before showing the form."
      >
        <p className="misma-auth-flow-status" role="status" aria-live="polite">
          Please wait…
        </p>
      </AuthFlowLayout>
    );
  }

  if (pageState === "invalid") {
    return (
      <AuthFlowLayout
        eyebrow="PASSWORD RESET"
        title="This reset link can't be used."
        description="The link may have expired, already been used, or could not be verified."
      >
        <p className="misma-auth-flow-error" role="alert">
          {pageMessage || "Request a new reset email and open the newest link."}
        </p>
        <p className="misma-auth-flow-hint">
          Request a new password-reset email from the Misma login page, then open the newest link.
        </p>
        <a className="misma-auth-flow-button" href="/login">
          Back to login
        </a>
      </AuthFlowLayout>
    );
  }

  if (pageState === "updated") {
    return (
      <AuthFlowLayout
        eyebrow="PASSWORD RESET"
        title="Password updated."
        description="Your Misma password has been changed successfully. You can now log in with your new password."
      >
        <button
          className="misma-auth-flow-button"
          type="button"
          onClick={() => void goToLogin()}
          disabled={busy}
        >
          {busy ? "Signing out…" : "Go to login"}
        </button>
      </AuthFlowLayout>
    );
  }

  return (
    <AuthFlowLayout
      eyebrow="PASSWORD RESET"
      title="Choose a new password."
      description="Create a new password for your Misma account. Use at least 8 characters."
    >
      <form className="misma-auth-flow-form" onSubmit={(event) => void submit(event)} noValidate>
        <label className="misma-auth-flow-field">
          New password
          <span className="misma-auth-flow-password">
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={password}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 8 characters"
              aria-describedby={formError ? "misma-reset-error" : undefined}
              required
            />
            <button type="button" className="misma-auth-flow-toggle" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide new password" : "Show new password"}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>

        <label className="misma-auth-flow-field">
          Confirm new password
          <span className="misma-auth-flow-password">
            <input
              type={showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              minLength={8}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Enter the new password again"
              aria-describedby={formError ? "misma-reset-error" : undefined}
              required
            />
            <button type="button" className="misma-auth-flow-toggle" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"}>
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </span>
        </label>

        {formError && (
          <p id="misma-reset-error" className="misma-auth-flow-error" role="alert">
            {formError}
          </p>
        )}

        <button className="misma-auth-flow-button" type="submit" disabled={busy || password.length < 8 || !confirmPassword}>
          {busy ? "Updating password…" : "Update password"}
        </button>
      </form>
    </AuthFlowLayout>
  );
}
