import { useEffect, useRef, useState } from "react";
import {
  createDictation,
  createVoiceMode,
  voiceSupport,
  type DictationState,
  type VoiceModeState,
} from "../lib/misma-voice";
import "./voice-input.css";

type VoiceInputBarProps = {
  inputValue: string;
  disabled?: boolean;
  lang?: string;
  onTranscript: (text: string) => void;
  onDictationDone?: () => void;
  onSend: (text: string, signal: AbortSignal) => Promise<string | null | undefined>;
  onError: (message: string) => void;
};

const ERROR_MESSAGES: Record<string, string> = {
  unsupported: "Voice needs Chrome, Edge or Safari over HTTPS.",
  permission: "Microphone is blocked. Allow microphone access for Misma in your browser's site settings, then try again.",
  "no-device": "No microphone was found. Check your device microphone and try again.",
  "in-use": "The microphone is busy. Close other apps or tabs using it, then try again.",
  network: "The browser speech service could not be reached. Check your connection.",
  send: "Misma could not get a reply. Try again.",
};

const STATE_LABELS: Record<VoiceModeState, string> = {
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking · tap the orb to interrupt",
  muted: "Muted",
  idle: "",
};

type DictationController = ReturnType<typeof createDictation>;
type VoiceModeController = ReturnType<typeof createVoiceMode>;

export function VoiceInputBar({
  inputValue,
  disabled = false,
  lang,
  onTranscript,
  onDictationDone,
  onSend,
  onError,
}: VoiceInputBarProps) {
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [dictationRequesting, setDictationRequesting] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceModeState>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [muted, setMuted] = useState(false);

  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const callbacksRef = useRef({ onTranscript, onDictationDone, onSend, onError });
  callbacksRef.current = { onTranscript, onDictationDone, onSend, onError };
  const baseDraftRef = useRef("");
  const dictationRef = useRef<DictationController | null>(null);
  const voiceRef = useRef<VoiceModeController | null>(null);
  const overlayOpenRef = useRef(false);

  useEffect(() => {
    const dictation = createDictation({
      lang,
      onText: (transcript) => {
        const base = baseDraftRef.current.trim();
        callbacksRef.current.onTranscript([base, transcript].filter(Boolean).join(base ? " " : ""));
      },
      onDone: (transcript) => {
        const base = baseDraftRef.current.trim();
        if (transcript) {
          callbacksRef.current.onTranscript([base, transcript].filter(Boolean).join(base ? " " : ""));
        }
        callbacksRef.current.onDictationDone?.();
        setDictationRequesting(false);
      },
      onState: (state) => {
        setDictationState(state);
        if (state === "idle") setDictationRequesting(false);
      },
      onError: (code) => {
        setDictationRequesting(false);
        callbacksRef.current.onError(ERROR_MESSAGES[code] || "Voice input stopped. Please try again.");
      },
    });

    const voice = createVoiceMode({
      lang,
      send: (text, signal) => callbacksRef.current.onSend(text, signal),
      onState: (state) => {
        setVoiceState(state);
        if (state === "listening") setVoiceTranscript("");
      },
      onUser: (text, isFinal) => setVoiceTranscript(text),
      onReply: (reply) => setVoiceTranscript(reply),
      onError: (code) => {
        callbacksRef.current.onError(ERROR_MESSAGES[code] || "Voice conversation stopped. Please try again.");
        if (code === "permission" || code === "unsupported" || code === "network") {
          voice.stop();
          overlayOpenRef.current = false;
          setVoiceOverlayOpen(false);
        }
      },
    });

    dictationRef.current = dictation;
    voiceRef.current = voice;

    return () => {
      dictation.stop();
      voice.stop();
      dictationRef.current = null;
      voiceRef.current = null;
      overlayOpenRef.current = false;
      setVoiceOverlayOpen(false);
    };
  }, [lang]);

  const toggleDictation = async () => {
    const dictation = dictationRef.current;
    if (!dictation || disabled) return;
    if (dictation.active) {
      dictation.stop();
      return;
    }
    if (!voiceSupport.stt) {
      callbacksRef.current.onError(ERROR_MESSAGES.unsupported);
      return;
    }

    baseDraftRef.current = inputValueRef.current.trim();
    setDictationRequesting(true);
    await dictation.start();
  };

  const closeVoiceMode = () => {
    voiceRef.current?.stop();
    overlayOpenRef.current = false;
    setVoiceOverlayOpen(false);
    setVoiceState("idle");
    setVoiceTranscript("");
    setMuted(false);
  };

  const openVoiceMode = async () => {
    if (disabled || overlayOpenRef.current) return;
    if (!voiceSupport.stt) {
      callbacksRef.current.onError(ERROR_MESSAGES.unsupported);
      return;
    }
    dictationRef.current?.stop();
    overlayOpenRef.current = true;
    setVoiceOverlayOpen(true);
    setVoiceTranscript("");
    setMuted(false);
    await voiceRef.current?.start();
    if (voiceRef.current?.state === "idle") {
      overlayOpenRef.current = false;
      setVoiceOverlayOpen(false);
    }
  };

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    voiceRef.current?.setMuted(next);
  };

  useEffect(() => {
    if (!overlayOpenRef.current) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeVoiceMode();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [voiceOverlayOpen, voiceState]);

  const isDictating = dictationState === "listening" || dictationRequesting;
  const overlayVisible = voiceOverlayOpen || voiceState !== "idle";

  return (
    <>
      <div className="misma-voice-input">
        <button
          type="button"
          className={"misma-voice-trigger" + (isDictating ? " is-recording" : "")}
          aria-label={isDictating ? "Stop voice dictation" : "Start voice dictation"}
          aria-pressed={isDictating}
          title={isDictating ? "Stop dictation" : "Dictate message"}
          disabled={disabled}
          onClick={() => void toggleDictation()}
        >
          {dictationRequesting ? (
            <span className="misma-voice-spinner" aria-hidden="true" />
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="2.5" width="6" height="12" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="misma-voice-mode-trigger"
          aria-label="Start hands-free voice conversation"
          title="Voice mode"
          disabled={disabled}
          onClick={() => void openVoiceMode()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="9" width="2.6" height="6" rx="1.3" />
            <rect x="8" y="5" width="2.6" height="14" rx="1.3" />
            <rect x="13" y="8" width="2.6" height="8" rx="1.3" />
            <rect x="18" y="3" width="2.6" height="18" rx="1.3" />
          </svg>
        </button>
      </div>

      {overlayVisible && (
        <div className="misma-voice-overlay" role="dialog" aria-modal="true" aria-label="Misma voice conversation">
          <button type="button" className="misma-voice-overlay-close" aria-label="End voice conversation" onClick={closeVoiceMode}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>

          <div className="misma-voice-overlay-content">
            <button
              type="button"
              className="misma-voice-orb"
              data-state={voiceState}
              aria-label={voiceState === "speaking" || voiceState === "thinking" ? "Interrupt Misma and listen" : "Voice conversation is active"}
              onClick={() => voiceRef.current?.interrupt()}
            >
              <span aria-hidden="true" />
            </button>
            <p className="misma-voice-overlay-status" aria-live="polite">{STATE_LABELS[voiceState] || "Starting voice…"}</p>
            <p className="misma-voice-overlay-transcript" aria-live="polite">{voiceTranscript}</p>
          </div>

          <div className="misma-voice-overlay-controls">
            <button type="button" className="misma-voice-overlay-btn" aria-pressed={muted} onClick={toggleMuted}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <button type="button" className="misma-voice-overlay-btn is-end" onClick={closeVoiceMode}>
              End
            </button>
          </div>
        </div>
      )}
    </>
  );
}
