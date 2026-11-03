import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { getSupabaseConfig } from "../lib/supabase";
import { MismaIcon } from "./misma-icon";

type GuestMessage = { id: string; role: "user" | "ai"; text: string };

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
            <div className="misma-guest-brand-mark" aria-hidden="true">M</div>
            <div className="misma-guest-heading">
              <strong>Chat with Misma</strong>
              <span><i /> Online preview</span>
            </div>
            <button type="button" className="misma-guest-close" onClick={() => setOpen(false)} aria-label="Close chat">×</button>
          </header>
          <div className="misma-guest-messages" ref={scrollRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="misma-guest-welcome">
                <div className="misma-guest-welcome-icon">✦</div>
                <h3>Welcome to Misma.</h3>
                <p>Ask how Misma works, explore its business AI features, or tell us what you want to test.</p>
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
          <form className="misma-guest-composer" onSubmit={(event) => { event.preventDefault(); void sendMessage(); }}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask Misma anything…"
              aria-label="Message Misma"
              maxLength={2000}
              disabled={busy}
            />
            <button type="submit" disabled={!draft.trim() || busy} aria-label="Send message">↑</button>
          </form>
          <p className="misma-guest-privacy">Temporary guest preview. Chats are not saved to a Misma account.</p>
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
