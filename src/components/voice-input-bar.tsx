import { useEffect, useRef, useState } from "react";
import {
  createDictation, createVoiceMode, voiceSupport,
  type DictationState, type VoiceInputMode, type VoiceModeState,
} from "../lib/misma-voice";
import "./voice-input.css";

type VoiceInputBarProps = {
  inputValue: string;
  hasAttachments?: boolean;
  hasCreateMode?: boolean;
  disabled?: boolean;
  busy?: boolean;
  lang?: string;
  onTranscript: (text: string) => void;
  onDictationDone?: () => void;
  onAction: () => void;
  onStop: () => void;
  onSend: (text: string, signal: AbortSignal, voice: true) => Promise<string | null | undefined>;
  onError: (message: string) => void;
};
const AUTO_SEND_ON_DICTATION = false;
const ERRORS: Record<string, string> = {
  unsupported: "Voice input is not supported here. Try Chrome over HTTPS.",
  permission: "Microphone access is blocked. Allow it for Misma in Chrome site settings, then try again.",
  "permission-timeout": "Microphone permission took too long. Check the browser prompt and try again.",
  "audio-capture": "The microphone could not start. Check it is connected and not in use by another app.",
  network: "Speech recognition could not connect. Check your internet connection.",
  "no-speech": "No speech was detected. Try speaking a little closer to your microphone.",
  "start-timeout": "Voice recognition did not start. Please try again.",
  recognition: "Voice recognition stopped unexpectedly. Please try again.",
  send: "Misma could not get a reply. Listening again.",
  offline: "No internet connection",
};
const LABELS: Record<VoiceModeState, string> = {
  listening: "Listening…", thinking: "Thinking…", speaking: "Speaking · tap the orb to interrupt",
  muted: "Microphone muted", ready: "Hold the button to talk", idle: "",
};
const QUIET = Array.from({ length: 28 }, () => 0.035);
type DictationController = ReturnType<typeof createDictation>;
type VoiceController = ReturnType<typeof createVoiceMode>;

export function VoiceInputBar({
  inputValue, hasAttachments = false, hasCreateMode = false, disabled = false, busy = false,
  lang, onTranscript, onDictationDone, onAction, onStop, onSend, onError,
}: VoiceInputBarProps) {
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [dictationRequesting, setDictationRequesting] = useState(false);
  const [waveform, setWaveform] = useState<number[]>(QUIET);
  const [voiceState, setVoiceState] = useState<VoiceModeState>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [voiceMode, setVoiceMode] = useState<VoiceInputMode>("hands-free");
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const callbacksRef = useRef({ onTranscript, onDictationDone, onAction, onStop, onSend, onError });
  callbacksRef.current = { onTranscript, onDictationDone, onAction, onStop, onSend, onError };
  const baseDraftRef = useRef("");
  const dictationRef = useRef<DictationController | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);
  const overlayOpenRef = useRef(false);
  const dictationStartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleOffline = () => {
      setOffline(true);
      dictationRef.current?.cancel();
      voiceRef.current?.stop();
      overlayOpenRef.current = false;
      setVoiceOverlayOpen(false);
      setDictationRequesting(false);
      setDictationState("idle");
      setWaveform(QUIET);
      callbacksRef.current.onError(ERRORS.offline);
    };
    const handleOnline = () => setOffline(false);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);

    const dictation = createDictation({
      lang,
      onText: (transcript) => {
        const base = baseDraftRef.current.trim();
        callbacksRef.current.onTranscript([base, transcript].filter(Boolean).join(base ? " " : ""));
      },
      onWaveform: setWaveform,
      onDone: (transcript) => {
        const base = baseDraftRef.current.trim();
        const value = [base, transcript].filter(Boolean).join(base ? " " : "");
        if (transcript) {
          callbacksRef.current.onTranscript(value);
          const field = document.querySelector<HTMLTextAreaElement>(".aichat-composer-textarea");
          if (field) {
            field.value = value;
            field.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (AUTO_SEND_ON_DICTATION) window.setTimeout(() => callbacksRef.current.onAction(), 0);
        }
        callbacksRef.current.onDictationDone?.();
      },
      onState: (state) => setDictationState(state),
      onError: (code) => {
        setDictationRequesting(false);
        setDictationState("idle");
        setWaveform(QUIET);
        callbacksRef.current.onError(ERRORS[code] || "Voice input stopped. Please try again.");
      },
    });

    const voice = createVoiceMode({
      lang,
      send: (text, signal, voiceFlag) => callbacksRef.current.onSend(text, signal, voiceFlag),
      onState: (state) => {
        setVoiceState(state);
        if (state === "listening") setVoiceTranscript("");
      },
      onUser: (text) => setVoiceTranscript(text),
      onReply: setVoiceTranscript,
      onError: (code) => {
        callbacksRef.current.onError(ERRORS[code] || "Voice conversation stopped. Please try again.");
        if (["permission", "unsupported", "network", "audio-capture", "no-speech", "start-timeout"].includes(code)) {
          voice.stop();
          overlayOpenRef.current = false;
          setVoiceOverlayOpen(false);
        }
      },
    });
    dictationRef.current = dictation;
    voiceRef.current = voice;

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      if (dictationStartTimerRef.current !== null) window.clearTimeout(dictationStartTimerRef.current);
      dictation.cancel();
      voice.stop();
      dictationRef.current = null;
      voiceRef.current = null;
      overlayOpenRef.current = false;
    };
  }, [lang]);

  const dictating = dictationState === "listening" || dictationRequesting;
  const hasContent = Boolean(inputValue.trim() || hasAttachments || hasCreateMode);
  const overlayVisible = voiceOverlayOpen || voiceState !== "idle";

  const startDictation = async () => {
    const dictation = dictationRef.current;
    if (!dictation || disabled || offline || overlayOpenRef.current) return;
    if (dictation.active) { dictation.stop(); return; }
    if (!voiceSupport.stt) { callbacksRef.current.onError(ERRORS.unsupported); return; }
    baseDraftRef.current = inputValueRef.current.trim();
    setDictationRequesting(true);
    dictationStartTimerRef.current = window.setTimeout(() => {
      if (dictationRef.current?.active && dictationState !== "listening") {
        dictation.cancel();
        setDictationRequesting(false);
        setDictationState("idle");
        setWaveform(QUIET);
        callbacksRef.current.onError(ERRORS["start-timeout"]);
      }
    }, 8000);
    await dictation.start();
    if (dictationStartTimerRef.current !== null) window.clearTimeout(dictationStartTimerRef.current);
    dictationStartTimerRef.current = null;
    if (!dictation.active) setDictationRequesting(false);
  };

  const cancelDictation = () => {
    dictationRef.current?.cancel();
    if (dictationStartTimerRef.current !== null) window.clearTimeout(dictationStartTimerRef.current);
    dictationStartTimerRef.current = null;
    setDictationState("idle");
    setDictationRequesting(false);
    setWaveform(QUIET);
    callbacksRef.current.onTranscript(baseDraftRef.current);
    window.setTimeout(() => document.querySelector<HTMLTextAreaElement>(".aichat-composer-textarea")?.focus(), 0);
  };

  const closeVoiceMode = () => {
    voiceRef.current?.stop();
    overlayOpenRef.current = false;
    setVoiceOverlayOpen(false);
    setVoiceState("idle");
    setVoiceTranscript("");
    setMuted(false);
    setVoiceMode("hands-free");
  };

  const openVoiceMode = async () => {
    if (disabled || offline || overlayOpenRef.current) return;
    if (!voiceSupport.stt) { callbacksRef.current.onError(ERRORS.unsupported); return; }
    dictationRef.current?.cancel();
    overlayOpenRef.current = true;
    setVoiceOverlayOpen(true);
    setVoiceTranscript("");
    setMuted(false);
    setVoiceMode("hands-free");
    await voiceRef.current?.start();
    if (voiceRef.current?.state === "idle") {
      overlayOpenRef.current = false;
      setVoiceOverlayOpen(false);
    }
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    voiceRef.current?.setMuted(next);
  };
  const chooseVoiceMode = (next: VoiceInputMode) => {
    setVoiceMode(next);
    voiceRef.current?.setMode(next);
  };

  useEffect(() => {
    if (!overlayVisible) return;
    const keyHandler = (event: KeyboardEvent) => { if (event.key === "Escape") closeVoiceMode(); };
    window.addEventListener("keydown", keyHandler);
    return () => window.removeEventListener("keydown", keyHandler);
  }, [overlayVisible]);

  return <>
    <div className="misma-voice-input">
      <button type="button" className={"misma-voice-trigger" + (dictating ? " is-recording" : "")}
        aria-label={dictating ? "Dictation is active" : "Start voice dictation"} aria-pressed={dictating}
        title="Dictate message" disabled={disabled || offline || overlayVisible}
        onClick={() => void startDictation()}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6"/></svg>
      </button>

      {dictating ? <>
        <button type="button" className="misma-dictation-cancel" aria-label="Cancel dictation" title="Discard dictation" onClick={cancelDictation}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
        </button>
        <button type="button" className="misma-dictation-finish" aria-label="Finish dictation" title="Use transcript" onClick={() => dictationRef.current?.stop()}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7"/></svg>
        </button>
      </> : !overlayVisible ? <button type="button"
        className={"misma-voice-main-action" + (hasContent ? " has-content" : "") + (busy ? " is-busy" : "")}
        aria-label={busy ? "Stop Misma" : hasContent ? "Send message" : "Start voice mode"}
        title={busy ? "Stop Misma" : hasContent ? "Send message" : "Voice mode"}
        disabled={(!hasContent && offline) || (disabled && !busy)}
        onClick={() => {
          if (busy) callbacksRef.current.onStop();
          else if (hasContent) callbacksRef.current.onAction();
          else void openVoiceMode();
        }}>
        <span className="misma-voice-action-wave" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="2.5" y="9" width="3" height="6" rx="1.5"/><rect x="7.5" y="5" width="3" height="14" rx="1.5"/><rect x="12.5" y="7" width="3" height="10" rx="1.5"/><rect x="17.5" y="3" width="3" height="18" rx="1.5"/></svg></span>
        <span className="misma-voice-action-send" aria-hidden="true">{busy
          ? <svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
          : <svg viewBox="0 0 24 24"><path d="M12 19V5m-7 7 7-7 7 7"/></svg>}</span>
      </button> : null}
    </div>

    {dictating && <div className="misma-dictation-surface" role="status" aria-label="Listening to your voice">
      <div className="misma-dictation-waveform" aria-hidden="true">{waveform.map((level, index) =>
        <span key={index} style={{ height: `${Math.max(3, level * 34)}px` }}/>)}</div>
      <span>Listening…</span>
    </div>}

    {overlayVisible && <div className="misma-voice-overlay" role="dialog" aria-modal="true" aria-label="Misma voice conversation">
      <button type="button" className="misma-voice-overlay-close" aria-label="End voice conversation" onClick={closeVoiceMode}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>
      </button>
      <div className="misma-voice-overlay-content">
        <button type="button" className="misma-voice-orb" data-state={voiceState}
          aria-label={voiceState === "speaking" || voiceState === "thinking" ? "Interrupt Misma and listen" : "Voice conversation state"}
          onClick={() => voiceRef.current?.interrupt()}><span aria-hidden="true"/></button>
        <p className="misma-voice-overlay-status" aria-live="polite">{LABELS[voiceState] || "Starting voice…"}</p>
        <p className="misma-voice-overlay-transcript" aria-live="polite">{voiceTranscript}</p>
      </div>
      <div className="misma-voice-overlay-controls">
        <div className="misma-voice-mode-switch" role="group" aria-label="Voice conversation mode">
          <button type="button" aria-pressed={voiceMode === "hands-free"} onClick={() => chooseVoiceMode("hands-free")}>Hands-free</button>
          <button type="button" aria-pressed={voiceMode === "push-to-talk"} onClick={() => chooseVoiceMode("push-to-talk")}>Push-to-talk</button>
        </div>
        {voiceMode === "push-to-talk" && <button type="button" className="misma-voice-overlay-btn misma-push-to-talk"
          disabled={muted || voiceState === "thinking" || voiceState === "speaking"}
          onPointerDown={(event) => { event.preventDefault(); voiceRef.current?.pushToTalkStart(); }}
          onPointerUp={() => voiceRef.current?.pushToTalkStop()}
          onPointerCancel={() => voiceRef.current?.pushToTalkStop()}
          onLostPointerCapture={() => voiceRef.current?.pushToTalkStop()}
          aria-label="Hold to talk">Hold to talk</button>}
        <button type="button" className="misma-voice-overlay-btn" aria-pressed={muted} onClick={toggleMute}>{muted ? "Unmute" : "Mute"}</button>
        <button type="button" className="misma-voice-overlay-btn is-end" onClick={closeVoiceMode}>End</button>
      </div>
    </div>}
  </>;
}
