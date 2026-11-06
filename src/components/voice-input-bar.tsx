import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  createDictation,
  createVoiceMode,
  type DictationState,
  type VoiceConversationMode,
  type VoiceModeState,
} from "../lib/misma-voice";
import "./voice-input.css";

const AUTO_SEND_ON_DICTATION = false;
const WAVEFORM_BARS = Array.from({ length: 28 }, (_, index) => index);

type VoiceSendOptions = { voice?: boolean };

type VoiceInputBarProps = {
  children: ReactNode;
  inputValue: string;
  hasContent: boolean;
  isBusy?: boolean;
  disabled?: boolean;
  primaryActionLabel?: string;
  onPrimaryAction: () => void;
  onTranscript: (text: string) => void;
  onDictationDone?: () => void;
  onSend: (
    text: string,
    signal: AbortSignal,
    options?: VoiceSendOptions,
  ) => Promise<string | null | undefined>;
};

const ERROR_MESSAGES: Record<string, string> = {
  unsupported: "Voice input needs Chrome or another supported browser over HTTPS.",
  permission: "Microphone access is blocked. Allow it for Misma in your browser's site settings, then try again.",
  "no-device": "No microphone was found. Check your device microphone and try again.",
  "audio-capture": "The microphone could not start. Close other apps using it and try again.",
  network: "The speech service could not connect. Check your internet connection.",
  "no-speech": "No speech was detected. Try again and speak clearly.",
  timeout: "Microphone startup took too long. Check the permission prompt and try again.",
  recognition: "Voice recognition stopped unexpectedly. Please try again.",
  send: "Misma could not reply. You can try speaking again.",
};

const STATE_LABELS: Record<VoiceModeState, string> = {
  idle: "Voice mode ended",
  starting: "Connecting to your microphone…",
  ready: "Tap the orb to speak",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking · tap Stop to interrupt",
  muted: "Microphone muted",
};

function appendTranscript(base: string, transcript: string): string {
  const cleanBase = base.trim();
  const cleanTranscript = transcript.trim();
  if (!cleanTranscript) return cleanBase;
  return cleanBase ? cleanBase + " " + cleanTranscript : cleanTranscript;
}

export function VoiceInputBar({
  children,
  inputValue,
  hasContent,
  isBusy = false,
  disabled = false,
  primaryActionLabel = "Send message",
  onPrimaryAction,
  onTranscript,
  onDictationDone,
  onSend,
}: VoiceInputBarProps) {
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [waveLevel, setWaveLevel] = useState(0);
  const [voiceState, setVoiceState] = useState<VoiceModeState>("idle");
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [voiceModeChoice, setVoiceModeChoice] = useState<VoiceConversationMode>("hands-free");
  const [muted, setMuted] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [toast, setToast] = useState("");

  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const callbacksRef = useRef({ onTranscript, onDictationDone, onSend, onPrimaryAction });
  callbacksRef.current = { onTranscript, onDictationDone, onSend, onPrimaryAction };

  const fieldRef = useRef<HTMLDivElement | null>(null);
  const baseDraftRef = useRef("");
  const dictationRef = useRef<ReturnType<typeof createDictation> | null>(null);
  const voiceRef = useRef<ReturnType<typeof createVoiceMode> | null>(null);
  const overlayOpenRef = useRef(false);
  const sendAfterDictationRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);
  const showToastRef = useRef<(message: string) => void>(() => undefined);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      toastTimerRef.current = null;
      setToast("");
    }, 3600);
  };
  showToastRef.current = showToast;

  const writeNativeInputValue = (value: string) => {
    const textarea = fieldRef.current?.querySelector("textarea");
    if (!textarea) return;

    const descriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    descriptor?.set?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  };

  useEffect(() => {
    const dictation = createDictation({
      onText: (transcript) => {
        callbacksRef.current.onTranscript(appendTranscript(baseDraftRef.current, transcript));
      },
      onDone: (transcript) => {
        const nextValue = appendTranscript(baseDraftRef.current, transcript);
        callbacksRef.current.onTranscript(nextValue);
        window.requestAnimationFrame(() => {
          writeNativeInputValue(nextValue);
          callbacksRef.current.onDictationDone?.();
          if (sendAfterDictationRef.current) {
            sendAfterDictationRef.current = false;
            if (nextValue.trim()) {
              void callbacksRef.current.onSend(nextValue, new AbortController().signal, { voice: false });
            } else {
              showToastRef.current("No speech was detected. Try again.");
            }
          }
        });

        if (AUTO_SEND_ON_DICTATION && nextValue.trim()) {
          void callbacksRef.current.onSend(nextValue, new AbortController().signal, { voice: false });
        }
      },
      onState: (state) => {
        setDictationState(state);
        if (state === "idle") setWaveLevel(0);
      },
      onAmplitude: (level) => setWaveLevel(level),
      onError: (code) => {
        const base = baseDraftRef.current;
        callbacksRef.current.onTranscript(base);
        window.requestAnimationFrame(() => {
          writeNativeInputValue(base);
          callbacksRef.current.onDictationDone?.();
        });
        showToastRef.current(ERROR_MESSAGES[code] || ERROR_MESSAGES.recognition);
      },
    });

    const voice = createVoiceMode({
      send: async (text, signal) => {
        const reply = await callbacksRef.current.onSend(text, signal, { voice: true });
        if (typeof reply !== "string" || !reply.trim()) throw new Error("Voice reply was empty.");
        return reply;
      },
      onState: (state) => {
        setVoiceState(state);
      },
      onError: (code) => {
        showToastRef.current(ERROR_MESSAGES[code] || ERROR_MESSAGES.recognition);
        if (code !== "send") {
          overlayOpenRef.current = false;
          setVoiceOverlayOpen(false);
        }
      },
    });

    dictationRef.current = dictation;
    voiceRef.current = voice;

    return () => {
      dictation.cancel();
      voice.stop();
      dictationRef.current = null;
      voiceRef.current = null;
      overlayOpenRef.current = false;
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => {
      setOnline(false);
      const base = baseDraftRef.current;
      dictationRef.current?.cancel();
      callbacksRef.current.onTranscript(base);
      window.requestAnimationFrame(() => {
        writeNativeInputValue(base);
        callbacksRef.current.onDictationDone?.();
      });
      voiceRef.current?.stop();
      overlayOpenRef.current = false;
      setVoiceOverlayOpen(false);
      setDictationState("idle");
      setWaveLevel(0);
      showToastRef.current("No internet connection");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const finishDictation = (sendNow = false) => {
    sendAfterDictationRef.current = sendNow;
    dictationRef.current?.stop();
  };

  const cancelDictation = () => {
    dictationRef.current?.cancel();
    const base = baseDraftRef.current;
    callbacksRef.current.onTranscript(base);
    setDictationState("idle");
    setWaveLevel(0);
    window.requestAnimationFrame(() => {
      writeNativeInputValue(base);
      callbacksRef.current.onDictationDone?.();
    });
  };

  const toggleDictation = async () => {
    if (disabled) return;
    if (!online) {
      showToast("No internet connection");
      return;
    }

    const dictation = dictationRef.current;
    if (!dictation) return;
    if (dictation.active) {
      finishDictation();
      return;
    }
    if (overlayOpenRef.current) return;

    baseDraftRef.current = inputValueRef.current;
    setWaveLevel(0);
    const started = await dictation.start();
    if (!started) setDictationState("idle");
  };

  const closeVoiceMode = () => {
    voiceRef.current?.stop();
    overlayOpenRef.current = false;
    setVoiceOverlayOpen(false);
    setVoiceState("idle");
    setMuted(false);
  };

  const openVoiceMode = async () => {
    if (disabled || overlayOpenRef.current) return;
    if (!online) {
      showToast("No internet connection");
      return;
    }

    dictationRef.current?.cancel();
    callbacksRef.current.onTranscript(baseDraftRef.current);
    setDictationState("idle");
    setWaveLevel(0);
    overlayOpenRef.current = true;
    setVoiceOverlayOpen(true);
    setMuted(false);

    try {
      const started = await voiceRef.current?.start();
      if (!started) {
        overlayOpenRef.current = false;
        setVoiceOverlayOpen(false);
      }
    } catch {
      showToast(ERROR_MESSAGES.permission);
      overlayOpenRef.current = false;
      setVoiceOverlayOpen(false);
    }
  };

  const toggleMuted = () => {
    const next = !muted;
    setMuted(next);
    voiceRef.current?.setMuted(next);
  };

  const selectVoiceMode = (mode: VoiceConversationMode) => {
    setVoiceModeChoice(mode);
    voiceRef.current?.setMode(mode);
  };

  const handleOrbClick = () => {
    if (voiceModeChoice === "push-to-talk") voiceRef.current?.togglePushToTalk();
    else voiceRef.current?.interrupt();
  };

  const isDictating = dictationState !== "idle";
  const primaryActionVisible = !isDictating && !voiceOverlayOpen;
  const primaryIsVoice = !hasContent && !isBusy;

  return (
    <>
      <div className={"misma-voice-composer" + (isDictating ? " is-dictating" : "")}>
        <button
          type="button"
          className={"misma-voice-mic" + (isDictating ? " is-active" : "")}
          aria-label={isDictating ? "Finish voice dictation" : "Start voice dictation"}
          aria-pressed={isDictating}
          title={isDictating ? "Finish dictation" : "Dictate message"}
          disabled={disabled || !online || voiceOverlayOpen}
          onClick={() => void toggleDictation()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="2.5" width="6" height="12" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6" />
          </svg>
        </button>

        <div
          className={"misma-voice-field" + (isDictating ? " is-dictating" : "")}
          ref={fieldRef}
          aria-live={isDictating ? "polite" : undefined}
        >
          {isDictating ? (
            <div className="misma-voice-waveform" role="status" aria-label="Listening. Speak to see the waveform.">
              {WAVEFORM_BARS.map((index) => {
                const variation = 0.34 + ((index * 7) % 11) / 16;
                const height = waveLevel < 0.035 ? 3 : Math.max(4, 3 + waveLevel * variation * 34);
                return (
                  <span
                    key={index}
                    className="misma-voice-waveform-bar"
                    style={{ height: height + "px" }}
                    aria-hidden="true"
                  />
                );
              })}
            </div>
          ) : (
            children
          )}
        </div>

        {isDictating ? (
          <div className="misma-voice-dictation-actions">
            <button
              type="button"
              className="misma-voice-dictation-btn is-cancel"
              aria-label="Cancel dictation and discard transcript"
              title="Cancel dictation"
              onClick={cancelDictation}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
            </button>
            <button
              type="button"
              className="misma-voice-dictation-btn is-finish"
              aria-label="Finish dictation and insert transcript"
              title="Finish dictation"
              onClick={() => finishDictation(false)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
            </button>
            <button
              type="button"
              className="misma-voice-dictation-btn is-send"
              aria-label="Stop dictation and send transcript"
              title="Stop and send"
              onClick={() => finishDictation(true)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7" /></svg>
            </button>
          </div>
        ) : primaryActionVisible ? (
          primaryIsVoice ? (
            <button
              type="button"
              className="misma-voice-primary is-voice"
              aria-label="Start voice mode"
              title="Start voice mode"
              disabled={disabled || !online}
              onClick={() => void openVoiceMode()}
            >
              <span className="misma-voice-primary-glyph" key="wave" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="9" width="3" height="6" rx="1.5" />
                  <rect x="8" y="5" width="3" height="14" rx="1.5" />
                  <rect x="13" y="7" width="3" height="10" rx="1.5" />
                  <rect x="18" y="3" width="3" height="18" rx="1.5" />
                </svg>
              </span>
            </button>
          ) : (
            <button
              type="button"
              className={"misma-voice-primary is-send" + (isBusy ? " is-busy" : "")}
              aria-label={isBusy ? "Stop Misma" : primaryActionLabel}
              title={isBusy ? "Stop Misma" : primaryActionLabel}
              onClick={() => callbacksRef.current.onPrimaryAction()}
            >
              <span className="misma-voice-primary-glyph" key={isBusy ? "stop" : "send"} aria-hidden="true">
                {isBusy ? (
                  <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><path d="M12 19V5m-7 7 7-7 7 7" /></svg>
                )}
              </span>
            </button>
          )
        ) : null}
      </div>

      {voiceOverlayOpen && (
        <div className="misma-voice-overlay" role="dialog" aria-modal="true" aria-label="Misma voice conversation">
          <button
            type="button"
            className="misma-voice-overlay-close"
            aria-label="Exit voice mode"
            title="Exit voice mode"
            onClick={closeVoiceMode}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
          </button>

          <div className="misma-voice-overlay-content">
            <div className="misma-voice-mode-choice" role="group" aria-label="Voice conversation style">
              <button
                type="button"
                aria-pressed={voiceModeChoice === "hands-free"}
                className={voiceModeChoice === "hands-free" ? "is-selected" : ""}
                onClick={() => selectVoiceMode("hands-free")}
              >
                Hands-free
              </button>
              <button
                type="button"
                aria-pressed={voiceModeChoice === "push-to-talk"}
                className={voiceModeChoice === "push-to-talk" ? "is-selected" : ""}
                onClick={() => selectVoiceMode("push-to-talk")}
              >
                Push to talk
              </button>
            </div>

            <button
              type="button"
              className="misma-voice-orb"
              data-state={voiceState}
              aria-label={
                voiceModeChoice === "push-to-talk"
                  ? voiceState === "listening" ? "Finish speaking turn" : "Start speaking turn"
                  : voiceState === "speaking" || voiceState === "thinking" ? "Interrupt Misma and listen" : "Voice conversation is active"
              }
              onClick={handleOrbClick}
            >
              <span aria-hidden="true" />
            </button>
            <p className="misma-voice-overlay-status" aria-live="polite">
              {voiceState === "ready" && voiceModeChoice === "hands-free" ? "Ready" : STATE_LABELS[voiceState]}
            </p>
                      </div>

          <div className="misma-voice-overlay-controls">
            <button type="button" className="misma-voice-overlay-btn" aria-pressed={muted} onClick={toggleMuted}>
              {muted ? "Unmute" : "Mute"}
            </button>
            {(voiceState === "speaking" || voiceState === "thinking") && (
              <button
                type="button"
                className="misma-voice-overlay-btn is-stop"
                onClick={() => voiceRef.current?.interrupt()}
              >
                Stop
              </button>
            )}
            <button type="button" className="misma-voice-overlay-btn is-end" onClick={closeVoiceMode}>
              End
            </button>
          </div>
        </div>
      )}

      {toast && <div className="misma-voice-toast" role="alert">{toast}</div>}
    </>
  );
}
