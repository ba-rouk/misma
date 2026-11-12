import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AuthFlowLayout } from "../../components/auth-flow-layout";
import {
  authRedirectErrorMessage,
  clearAuthRedirectUrl,
  readInitialAuthRedirectParams,
  setSessionStorageFlag,
} from "../../lib/auth-redirect";
import { getSupabaseClient, getSupabaseConfig } from "../../lib/supabase";

export const Route = createFileRoute("/auth/confirm")({
  component: ConfirmEmailToken,
});

function ConfirmEmailToken() {
  const started = useRef(false);
  const [message, setMessage] = useState("Please wait…");

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const params = readInitialAuthRedirectParams();
    const fail = (nextMessage: string) => setMessage(nextMessage);

    const verify = async () => {
      if (!getSupabaseConfig()) {
        fail("Misma could not connect to its account service. Return to login and try again.");
        return;
      }

      if (params.error || params.errorCode) {
        const destination = params.type === "recovery" ? "/reset-password" : "/auth/confirmed";
        window.location.replace(
          destination +
            "?error=" + encodeURIComponent(params.error || "access_denied") +
            "&error_code=" + encodeURIComponent(params.errorCode || "otp_expired"),
        );
        return;
      }

      if (!params.tokenHash || (params.type !== "signup" && params.type !== "recovery" && params.type !== "email")) {
        fail("This email link is incomplete or not supported. Request a new email from Misma.");
        return;
      }

      try {
        const { data, error } = await getSupabaseClient().auth.verifyOtp({
          token_hash: params.tokenHash,
          type: params.type,
        });
        if (error) throw error;
        if (!data.session) throw new Error("Supabase did not return a verified session.");

        if (params.type === "recovery") {
          setSessionStorageFlag("misma_password_recovery");
          clearAuthRedirectUrl();
          window.location.replace("/reset-password");
          return;
        }

        setSessionStorageFlag("misma_email_confirmed");
        clearAuthRedirectUrl();
        window.location.replace("/auth/confirmed");
      } catch (cause) {
        const text = cause instanceof Error ? cause.message : "";
        const errorCode = /already used|consumed/i.test(text)
          ? "otp_already_used"
          : "otp_expired";
        const destination = params.type === "recovery" ? "/reset-password" : "/auth/confirmed";
        window.location.replace(
          destination + "?error=access_denied&error_code=" + encodeURIComponent(errorCode),
        );
      }
    };

    void verify();
  }, []);

  return (
    <AuthFlowLayout title="Verifying link">
      <p className="misma-auth-flow-status" role="status" aria-live="polite">
        {message}
      </p>
      <a className="misma-auth-flow-secondary" href="/login">Back to login</a>
    </AuthFlowLayout>
  );
}
