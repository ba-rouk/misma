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
  const [message, setMessage] = useState("Verifying your secure email link. Please wait.");

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
        fail(authRedirectErrorMessage(params));
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
        fail(
          /expired|otp|invalid|token|verifier/i.test(text)
            ? authRedirectErrorMessage({ ...params, error: params.error || text })
            : "This email link could not be verified. It may have expired or already been used. Request a new email and open the newest link.",
        );
      }
    };

    void verify();
  }, []);

  return (
    <AuthFlowLayout
      eyebrow="SECURE MISMA LINK"
      title="Verifying your email."
      description={message}
    >
      <p className="misma-auth-flow-status" role="status" aria-live="polite">
        You can close this page after Misma finishes verifying your link.
      </p>
      <a className="misma-auth-flow-secondary" href="/login">Back to login</a>
    </AuthFlowLayout>
  );
}
