import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getSupabaseConfig } from "../lib/supabase";
import { MismaIcon } from "./misma-icon";

type GuestMessage = { id: string; role: "user" | "ai"; text: string };

function GmailIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="23" fill="#fff" />
      <path d="M12 35V16" fill="none" stroke="url(#misma-gmail-left)" strokeWidth="7" strokeLinecap="round" />
      <path d="M12 16 24 26" fill="none" stroke="#EA4335" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 26 36 16" fill="none" stroke="url(#misma-gmail-top)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M36 16V35" fill="none" stroke="url(#misma-gmail-right)" strokeWidth="7" strokeLinecap="round" />
      <defs>
        <linearGradient id="misma-gmail-left" x1="12" y1="15" x2="12" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EA719B" />
          <stop offset=".45" stopColor="#EA4335" />
        </linearGradient>
        <linearGradient id="misma-gmail-top" x1="24" y1="26" x2="36" y2="16" gradientUnits="userSpaceOnUse">
          <stop stopColor="#EA4335" />
          <stop offset=".65" stopColor="#FBBC04" />
        </linearGradient>
        <linearGradient id="misma-gmail-right" x1="36" y1="16" x2="36" y2="35" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34A853" />
          <stop offset="1" stopColor="#4285F4" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export function LandingChatWidget() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<GuestMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, busy]);

  const sendMessage = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const config = getSupabaseConfig();
    if (!config) {
      setError("The Misma preview is not configured yet. Please try again later.");
      return;
    }
    const userMessage: GuestMessage = { id: `guest-user-${Date.now()}`, role: "user", text };
    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`${config.url.replace(/\/$/, "")}/functions/v1/misma-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: config.publishableKey },
        body: JSON.stringify({
          publicDemo: true,
          action: "chat",
          message: text,
          history: messages.slice(-8).map((item) => ({ role: item.role === "ai" ? "model" : "user", text: item.text })),
        }),
      });
      const result = await response.json() as { aiMessage?: { text?: string }; error?: string };
      if (!response.ok || typeof result.aiMessage?.text !== "string") {
        throw new Error(result.error || "Misma could not reply right now.");
      }
      setMessages((current) => [...current, {
        id: `guest-ai-${Date.now()}`,
        role: "ai",
        text: result.aiMessage!.text!,
      }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to Misma.");
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  };

  return (
    <div className="misma-guest-widget">
      {open && (
        <section className="misma-guest-panel" aria-label="Chat with Misma">
          <header className="misma-guest-header">
            <div className="misma-guest-heading">
              <strong>Misma</strong>
              <span>Business assistant</span>
            </div>
            <a
              className="misma-guest-gmail"
              href="https://mail.google.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open Gmail"
              title="Gmail"
            >
              <GmailIcon />
            </a>
            <button type="button" className="misma-guest-close" onClick={() => setOpen(false)} aria-label="Close chat" title="Close">×</button>
          </header>
          <div className="misma-guest-messages" ref={scrollRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="misma-guest-welcome">
                <div className="misma-guest-welcome-icon"><MismaIcon size={22} /></div>
                <h3>Hello! I am Misma.</h3>
                <p>How can I help you today? Explore what Misma can do for your business.</p>
                <div className="misma-guest-prompts">
                  {["What can Misma do for my business?", "How does the AI learn about my products?", "Can I try Misma?"].map((prompt) => (
                    <button type="button" key={prompt} onClick={() => { setDraft(prompt); inputRef.current?.focus(); }}>{prompt}<span>↗</span></button>
                  ))}
                </div>
              </div>
            ) : messages.map((message) => (
              <div key={message.id} className={`misma-guest-message is-${message.role}`}>
                <div>{message.text}</div>
              </div>
            ))}
            {busy && (
              <div className="misma-guest-message is-ai">
                <div className="misma-guest-typing" role="status" aria-label="Misma is thinking"><i /><i /><i /></div>
              </div>
            )}
          </div>
          {error && <p className="misma-guest-error" role="alert">{error}</p>}
          <div className="misma-guest-composer-wrap">
            <form className="misma-guest-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
              <textarea
                ref={inputRef}
                rows={1}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Message Misma…"
                aria-label="Message Misma"
                maxLength={2000}
                disabled={busy}
              />
              <button type="submit" disabled={!draft.trim() || busy} aria-label="Send message" title="Send message">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg>
              </button>
            </form>
            <p className="misma-guest-privacy">Temporary guest preview. Chats are not saved to a Misma account.</p>
          </div>
        </section>
      )}
      <button
        type="button"
        className={`misma-guest-launcher${open ? " is-open" : ""}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label={open ? "Close Misma chat" : "Chat with Misma"}
      >
        {open ? "×" : (
          <>
            <MismaIcon size={28} className="misma-guest-launcher-logo" />
            <span className="misma-guest-launcher-label">Ask Misma</span>
          </>
        )}
      </button>
    </div>
  );
}
