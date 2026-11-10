import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSupabaseClient, getSupabaseConfig } from "../lib/supabase";

const POST_LOGIN_REDIRECT_KEY = "misma_post_login_redirect";

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

function getPostLoginDestination(): string {
  const requested = new URLSearchParams(window.location.search).get("redirect");
  if (requested) {
    const safe = safeDashboardDestination(requested);
    sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, safe);
    return safe;
  }
  return safeDashboardDestination(sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY));
}

function consumePostLoginDestination(): string {
  const destination = getPostLoginDestination();
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  return destination;
}

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const [signup, setSignup] = useState(false);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("mode") === "signup") {
      setSignup(true);
    }
    // Capture this before any auth redirect so notification clicks survive re-login.
    getPostLoginDestination();
  }, []);

  useEffect(() => {
    if (!getSupabaseConfig()) return;

    const destination = getPostLoginDestination();
    let active = true;
    getSupabaseClient()
      .auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) {
          setError(sessionError.message);
          return;
        }
        if (!data.session) return;

        sessionStorage.setItem("misma_id_token", data.session.access_token);
        if (data.session.user.email) {
          sessionStorage.setItem("misma_email", data.session.user.email);
        }
        sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
        window.location.replace(destination);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not verify your sign-in session.",
        );
      });

    return () => {
      active = false;
    };
  }, []);

  const resetPassword = async () => {
    setBusy(true);
    setError("");
    try {
      if (!email) throw new Error("Enter your email address first.");
      const { error: resetError } =
        await getSupabaseClient().auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/login`,
        });
      if (resetError) throw resetError;
      setError("Password reset instructions have been sent to your email.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not send password reset instructions.",
      );
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    getPostLoginDestination();
    setBusy(true);
    setError("");
    try {
      if (!getSupabaseConfig()) {
        throw new Error(
          "Supabase is not configured. Copy .env.example to .env and add your Supabase publishable key.",
        );
      }
      const { error: signinError } =
        await getSupabaseClient().auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });
      if (signinError) throw signinError;
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Google sign-in failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      if (!getSupabaseConfig()) {
        throw new Error(
          "Supabase is not configured. Copy .env.example to .env and add your Supabase publishable key.",
        );
      }
      const supabase = getSupabaseClient();
      const normalizedEmail = email.trim().toLowerCase();
      if (signup) {
        const normalizedName = fullName.trim();
        const normalizedUsername = username.trim().toLowerCase();
        if (normalizedName.length < 2 || normalizedName.length > 80) {
          throw new Error("Enter your name using 2 to 80 characters.");
        }
        if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(normalizedUsername)) {
          throw new Error("Choose a username with 3–30 characters: letters, numbers, dots, underscores or hyphens.");
        }
        if (password !== confirmPassword) {
          throw new Error("Your passwords do not match.");
        }
        const { data, error: signupError } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            data: {
              full_name: normalizedName,
              name: normalizedName,
              username: normalizedUsername,
            },
            emailRedirectTo: `${window.location.origin}/dashboard`,
          },
        });
        if (signupError) throw signupError;
        if (!data.session) {
          setError(
            "Account created. Check your email to confirm the account, then sign in.",
          );
          setSignup(false);
          return;
        }
        sessionStorage.setItem("misma_id_token", data.session.access_token);
        sessionStorage.setItem("misma_email", data.user?.email || email);
      } else {
        const { data, error: signinError } =
          await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (signinError) throw signinError;
        if (!data.session)
          throw new Error(
            "Sign-in succeeded but Supabase returned no session.",
          );
        sessionStorage.setItem("misma_id_token", data.session.access_token);
        sessionStorage.setItem("misma_email", data.user?.email || email);
      }
      window.location.replace(consumePostLoginDestination());
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="login-promo">
        <a href="/" className="login-brand">
          <span className="login-brand-icon">
            <svg width="22" height="22" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <circle cx="50" cy="50" r="50" fill="white" fillOpacity="0.12"/>
              <polyline points="16,52 28,64 46,40" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
              <polyline points="32,52 44,64 62,40" stroke="white" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </span>Misma
        </a>
        <div className="login-orbit" aria-hidden="true">
          <span>✦</span>
        </div>
        <div className="login-promo-copy">
          <div className="login-eyebrow">WELCOME BACK</div>
          <h1>
            Your business,
            <br />
            <em>always connected.</em>
          </h1>
          <p>
            Sign in to your Misma workspace and keep every customer
            <br className="login-desktop-break" /> conversation moving.
          </p>
        </div>
      </section>
      <section className="login-panel">
        <div className="login-form-wrap">
          <div className="login-eyebrow">MISMA ACCOUNT</div>
          <h2>{signup ? "Create your account." : "Welcome back."}</h2>
          <p className="login-subtitle">
            {signup
              ? "Create an account to open your Misma house. Each connected website gets its own Core.01 room."
              : "Sign in to continue to your workspace."}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            {signup && (
              <>
                <label className="login-field">
                  Full name
                  <input
                    type="text"
                    autoComplete="name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    placeholder="Your name"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </label>
                <label className="login-field">
                  Username
                  <input
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/\s/g, ""))}
                    placeholder="your.username"
                    minLength={3}
                    maxLength={30}
                    pattern="[a-z0-9][a-z0-9._-]{2,29}"
                    title="Use 3–30 lowercase letters, numbers, dots, underscores or hyphens."
                    required
                  />
                </label>
              </>
            )}
            <label className="login-field">
              Email address
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>
            <label className="login-field">
              Password
              <span className="login-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={6}
                  placeholder="........."
                  required
                />
                <button
                  type="button"
                  className="login-show-password"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            {signup && (
              <label className="login-field">
                Confirm password
                <span className="login-password-wrap">
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    minLength={6}
                    placeholder="Enter your password again"
                    required
                  />
                  <button
                    type="button"
                    className="login-show-password"
                    onClick={() => setShowConfirmPassword((value) => !value)}
                  >
                    {showConfirmPassword ? "Hide" : "Show"}
                  </button>
                </span>
              </label>
            )}
            {!signup && (
              <div className="login-options">
                <span />{" "}
                <button
                  type="button"
                  onClick={() => void resetPassword()}
                  disabled={busy}
                >
                  Forgot password?
                </button>
              </div>
            )}
            {error && (
              <div className="login-error" role="status">
                {error}
              </div>
            )}
            <button
              type="submit"
              className="login-submit"
              disabled={busy || !email.trim() || password.length < 6 || (signup && (!fullName.trim() || !/^[a-z0-9][a-z0-9._-]{2,29}$/.test(username.trim().toLowerCase()) || password !== confirmPassword))}
            >
              <span>
                {busy ? "Please wait…" : signup ? "Create account" : "Log in"}
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </form>
          <div className="login-divider">
            <span>or</span>
          </div>
          <button
            type="button"
            className="login-google"
            disabled={busy}
            onClick={signInWithGoogle}
          >
            <span className="login-google-mark">G</span>
            {busy ? "Please wait…" : "Continue with Google"}
          </button>
          <button
            className="login-switch"
            onClick={() => {
              setSignup(!signup);
              setError("");
              setConfirmPassword("");
              setShowConfirmPassword(false);
            }}
          >
            {signup ? (
              <>
                Already have an account? <strong>Log in</strong>
              </>
            ) : (
              <>
                Don't have an account? <strong>Get started</strong>
              </>
            )}
          </button>
        </div>
      </section>
    </main>
  );
}
