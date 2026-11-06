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
  hasAttachments?: boolean;
  hasCreateMode?: boolean;
  disabled?: boolean;
  lang?: string;
  onTranscript: (text: string) => void;
  onDictationDone?: () => void;
  onSend: (text: string, signal: AbortSignal, voice: true) => Promise<string | null | undefined>;
  onError: (message: string) => void;
};

const AUTO_SEND_ON_DICTATION = false;

const ERROR_MESSAGES: Record<string, string> = {
  unsupported: "Voice needs Chrome, Edge or Safari over HTTPS.",
  permission: "Microphone is blocked. Allow microphone access for Misma in your browser's site settings, then try again.",
  "no-device": "No microphone was found. Check your device microphone and try again.",
  "in-use": "The microphone is busy. Close other apps or tabs using it, then try again.",
  network: "The browser speech service could not be reached. Check your connection.",
  "audio-capture": "The microphone could not start. Check that it is connected and not in use.",
  "start-timeout": "Voice recognition did not start. Please try again.",
  offline: "No internet connection",
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
  hasAttachments = false,
  hasCreateMode = false,
  disabled = false,
  lang,
  onTranscript,
  onDictationDone,
  onSend,
  onError,
}: VoiceInputBarProps) {
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [dictationRequesting, setDictationRequesting] = useState(false);
  const dictationStateRef = useRef<DictationState>("idle");
  const [voiceState, setVoiceState] = useState<VoiceModeState>("idle");
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceOverlayOpen, setVoiceOverlayOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [offline, setOffline] = useState(typeof navigator !== "undefined" && !navigator.onLine);
  const [waveform, setWaveform] = useState<number[]>(Array.from({ length: 28 }, () => 0.03));
  const meterStreamRef = useRef<MediaStream | null>(null);
  const meterContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number>(0);
  const startTimeoutRef = useRef<number | null>(null);

  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const callbacksRef = useRef({ onTranscript, onDictationDone, onSend, onError });
  callbacksRef.current = { onTranscript, onDictationDone, onSend, onError };
  const baseDraftRef = useRef("");
  const dictationRef = useRef<DictationController | null>(null);
  const voiceRef = useRef<VoiceModeController | null>(null);
  const overlayOpenRef = useRef(false);

  useEffect(() => {
    const offlineHandler = () => { setOffline(true); callbacksRef.current.onError(ERROR_MESSAGES.offline); };
    const onlineHandler = () => setOffline(false);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("online", onlineHandler);

    const dictation = createDictation({
      lang,
      onText: (transcript) => {
        const base = baseDraftRef.current.trim();
        callbacksRef.current.onTranscript([base, transcript].filter(Boolean).join(base ? " " : ""));
      },
      onDone: (transcript) => {
        const base = baseDraftRef.current.trim();
        if (transcript) {
          const value = [base, transcript].filter(Boolean).join(base ? " " : "");
          callbacksRef.current.onTranscript(value);
          const field = document.querySelector<HTMLTextAreaElement>(".aichat-composer-textarea");
          if (field) {
            field.value = value;
            field.dispatchEvent(new Event("input", { bubbles: true }));
          }
          if (AUTO_SEND_ON_DICTATION) window.setTimeout(() => {
            field?.form?.requestSubmit();
          }, 0);
        }
        callbacksRef.current.onDictationDone?.();
        setDictationRequesting(false);
        stopMeter();
        if (AUTO_SEND_ON_DICTATION && transcript) window.setTimeout(() => callbacksRef.current.onSend(transcript, new AbortController().signal, true), 0);
      },
      onState: (state) => {
        dictationStateRef.current = state;
        setDictationState(state);
        if (state === "idle") setDictationRequesting(false);
      },
      onError: (code) => {
        setDictationRequesting(false);
        stopMeter();
        callbacksRef.current.onError(ERROR_MESSAGES[code] || "Voice input stopped. Please try again.");
      },
    });

    const voice = createVoiceMode({
      lang,
      send: (text, signal, voice) => callbacksRef.current.onSend(text, signal, voice),
      onState: (state) => {
        setVoiceState(state);
        if (state === "listening") setVoiceTranscript("");
      },
      onUser: (text, isFinal) => setVoiceTranscript(text),
      onReply: (reply) => setVoiceTranscript(reply),
      onError: (code) => {
        callbacksRef.current.onError(ERROR_MESSAGES[code] || "Voice conversation stopped. Please try again.");
        if (code === "permission" || code === "unsupported" || code === "network" || code === "audio-capture" || code === "start-timeout") {
          voice.stop();
          overlayOpenRef.current = false;
          setVoiceOverlayOpen(false);
        }
      },
    });

    dictationRef.current = dictation;
    voiceRef.current = voice;

    return () => {
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("online", onlineHandler);
      stopMeter();
      dictation.cancel();
      voice.stop();
      dictationRef.current = null;
      voiceRef.current = null;
      overlayOpenRef.current = false;
      setVoiceOverlayOpen(false);
    };
  }, [lang]);

  const stopMeter = () => {
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    meterFrameRef.current = 0;
    meterStreamRef.current?.getTracks().forEach((track) => track.stop());
    meterStreamRef.current = null;
    if (meterContextRef.current && meterContextRef.current.state !== "closed") void meterContextRef.current.close().catch(() => undefined);
    meterContextRef.current = null;
    setWaveform(Array.from({ length: 28 }, () => 0.03));
  };

  const startMeter = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!dictationRef.current?.active) { stream.getTracks().forEach((track) => track.stop()); return; }
      meterStreamRef.current = stream;
      const context = new AudioContext();
      meterContextRef.current = context;
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      context.createMediaStreamSource(stream).connect(analyser);
      const tick = () => {
        if (!meterContextRef.current) return;
        const values = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(values);
        let energy = 0;
        for (const value of values) { const sample = (value - 128) / 128; energy += sample * sample; }
        const volume = Math.sqrt(energy / values.length);
        setWaveform(Array.from({ length: 28 }, (_, index) => Math.max(0.03, Math.min(1, volume * 9 * (0.55 + 0.45 * Math.abs(Math.sin(index * 1.7 + performance.now() / 115))))));
        meterFrameRef.current = requestAnimationFrame(tick);
      };
      if (context.state === "suspended") await context.resume();
      tick();
    } catch {
      callbacksRef.current.onError(ERROR_MESSAGES.permission);
      dictationRef.current?.cancel();
      stopMeter();
    }
  };

  const toggleDictation = async () => {
    const dictation = dictationRef.current;
    if (!dictation || disabled || offline) return;
    if (dictation.active) {
      dictation.stop();
      stopMeter();
      return;
    }
    if (!voiceSupport.stt) {
      callbacksRef.current.onError(ERROR_MESSAGES.unsupported);
      return;
    }

    baseDraftRef.current = inputValueRef.current.trim();
    setDictationRequesting(true);
    startTimeoutRef.current = window.setTimeout(() => {
      if (dictationRef.current?.active && dictationStateRef.current !== "listening") {
        dictation.cancel();
        setDictationRequesting(false);
        stopMeter();
        callbacksRef.current.onError(ERROR_MESSAGES["start-timeout"]);
      }
    }, 8000);
    await dictation.start();
    if (startTimeoutRef.current) window.clearTimeout(startTimeoutRef.current);
    startTimeoutRef.current = null;
    if (dictation.active) void startMeter();
  };

  const cancelDictation = () => {
    dictationRef.current?.cancel();
    stopMeter();
    setDictationState("idle");
    setDictationRequesting(false);
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
  };

  const openVoiceMode = async () => {
    if (disabled || offline || overlayOpenRef.current) return;
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
          disabled={disabled || offline || overlayVisible}
          onClick={() => void toggleDictation()}
        >
          {
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="9" y="2.5" width="6" height="12" rx="3" />
              <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6" />
            </svg>
          }
        </button>

        {isDictating && (
          <>
            <button type="button" className="misma-dictation-cancel" aria-label="Cancel dictation" title="Discard dictation" onClick={cancelDictation}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17" /></svg>
            </button>
            <button type="button" className="misma-dictation-finish" aria-label="Finish dictation" title="Use transcript" onClick={() => dictationRef.current?.stop()}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" /></svg>
            </button>
          </>
        )}

        {!isDictating && !inputValue.trim() && !hasAttachments && !hasCreateMode && !overlayVisible && <button
          type="button"
          className="misma-voice-mode-trigger"
          aria-label="Start hands-free voice conversation"
          title="Voice mode"
          disabled={disabled || offline}
          onClick={() => void openVoiceMode()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3" y="9" width="2.6" height="6" rx="1.3" />
            <rect x="8" y="5" width="2.6" height="14" rx="1.3" />
            <rect x="13" y="8" width="2.6" height="8" rx="1.3" />
            <rect x="18" y="3" width="2.6" height="18" rx="1.3" />
          </svg>
        </button>}
      </div>

      {isDictating && <div className="misma-dictation-surface" role="status" aria-label="Listening to your voice"><div className="misma-dictation-waveform" aria-hidden="true">{waveform.map((level, index) => <span key={index} style={{ height: `${Math.max(3, level * 34)}px` }} />)}</div><span>Listening…</span></div>}

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
