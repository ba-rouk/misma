import { useEffect, useRef } from "react";
import { useVoiceRecorder, type VoiceRecorderPhase } from "../hooks/use-voice-recorder";
import "./voice-input.css";

type VoiceInputBarProps = {
  accessToken: string | null | undefined;
  disabled?: boolean;
  onTranscript: (text: string) => void;
  onSend: (text: string) => void | Promise<void>;
  onError: (message: string) => void;
  onPhaseChange?: (phase: VoiceRecorderPhase) => void;
};

export function VoiceInputBar({
  accessToken,
  disabled = false,
  onTranscript,
  onSend,
  onError,
  onPhaseChange,
}: VoiceInputBarProps) {
  const voice = useVoiceRecorder({ accessToken, onTranscript, onSend, onError });
  const phaseChangeRef = useRef(onPhaseChange);
  phaseChangeRef.current = onPhaseChange;

  useEffect(() => {
    phaseChangeRef.current?.(voice.phase);
  }, [voice.phase]);

  const active = voice.phase !== "idle";
  const controlsDisabled = disabled || voice.phase === "transcribing";

  return (
    <div className={"misma-voice-input" + (active ? " is-active" : "")}>
      {voice.phase === "idle" ? (
        <button
          type="button"
          className="misma-voice-trigger"
          aria-label="Start voice input"
          title="Voice input"
          disabled={disabled}
          onClick={() => void voice.start()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="9" y="2.5" width="6" height="12" rx="3" />
            <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3.5M9 21.5h6" />
          </svg>
        </button>
      ) : (
        <div
          className={"misma-voice-recording-pill is-" + voice.phase}
          role="group"
          aria-label={voice.phase === "transcribing" ? "Transcribing voice input" : "Recording voice input"}
        >
          <button
            type="button"
            className="misma-voice-control is-cancel"
            aria-label="Cancel voice recording"
            title="Cancel"
            disabled={voice.phase === "transcribing"}
            onClick={voice.cancel}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>

          <div
            className="misma-voice-waveform"
            role="status"
            aria-live="polite"
            aria-label={voice.phase === "requesting" ? "Connecting to microphone" : voice.phase === "transcribing" ? "Transcribing recording" : "Live microphone waveform"}
          >
            {voice.waveform.map((level, index) => (
              <i
                key={index}
                aria-hidden="true"
                style={{
                  height: Math.round(3 + level * 25) + "px",
                  opacity: 0.38 + level * 0.62,
                }}
              />
            ))}
            {voice.phase === "requesting" && <span className="misma-voice-status-label">Connecting…</span>}
            {voice.phase === "transcribing" && <span className="misma-voice-status-label">Transcribing…</span>}
          </div>

          <button
            type="button"
            className="misma-voice-control is-stop"
            aria-label="Stop recording and insert transcript"
            title="Stop and insert transcript"
            disabled={controlsDisabled || voice.phase !== "recording"}
            onClick={voice.stopAndInsert}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
          </button>

          <button
            type="button"
            className="misma-voice-control is-send"
            aria-label="Transcribe and send voice input"
            title="Transcribe and send"
            disabled={controlsDisabled || voice.phase !== "recording"}
            onClick={voice.sendTranscript}
          >
            {voice.phase === "transcribing" ? (
              <span className="misma-voice-spinner" aria-hidden="true" />
            ) : (
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 19V5m-7 7 7-7 7 7" />
              </svg>
            )}
          </button>
        </div>
      )}

      {voice.toast && <span className="misma-voice-toast" role="status">{voice.toast}</span>}
    </div>
  );
}
