import { useCallback, useEffect, useRef, useState } from "react";
import { requestMicStream, toMicError } from "../lib/microphone";

export type VoiceRecorderPhase = "idle" | "requesting" | "recording" | "transcribing";

type CaptureResult = {
  blob: Blob;
  durationMs: number;
  mimeType: string;
};

type UseVoiceRecorderOptions = {
  accessToken: string | null | undefined;
  onTranscript: (text: string) => void;
  onSend: (text: string) => void | Promise<void>;
  onError: (message: string) => void;
};

const EMPTY_WAVEFORM = Array.from({ length: 40 }, () => 0);

export function useVoiceRecorder({
  accessToken,
  onTranscript,
  onSend,
  onError,
}: UseVoiceRecorderOptions) {
  const [phase, setPhase] = useState<VoiceRecorderPhase>("idle");
  const [waveform, setWaveform] = useState<number[]>(EMPTY_WAVEFORM);
  const [toast, setToast] = useState("");

  const callbacksRef = useRef({ onTranscript, onSend, onError });
  callbacksRef.current = { onTranscript, onSend, onError };

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const activeRef = useRef(false);
  const startAttemptRef = useRef(0);
  const mountedRef = useRef(true);
  const transcriptionControllerRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const cleanupCapture = useCallback(() => {
    activeRef.current = false;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    analyserRef.current = null;

    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // The recorder may already have stopped.
        }
      }
    }

    chunksRef.current = [];

    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToast("");
      toastTimerRef.current = null;
    }, 2400);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      startAttemptRef.current += 1;
      transcriptionControllerRef.current?.abort();
      transcriptionControllerRef.current = null;
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
      cleanupCapture();
    };
  }, [cleanupCapture]);

  const start = useCallback(async () => {
    if (activeRef.current || !mountedRef.current) return;

    const attempt = ++startAttemptRef.current;
    activeRef.current = true;
    setToast("");
    setWaveform(EMPTY_WAVEFORM);
    setPhase("requesting");

    try {
      // Request the native browser permission immediately from the user's tap.
      const stream = await requestMicStream({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: { ideal: 1 },
      });

      if (!mountedRef.current || attempt !== startAttemptRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("No microphone audio was detected. Check your input device and try again.");
      }

      streamRef.current = stream;

      if (typeof MediaRecorder === "undefined") {
        throw new Error("Audio recording is not supported by this browser. Try the latest version of Chrome or Safari.");
      }

      const isIOS =
        /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const mimeCandidates = isIOS
        ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"]
        : ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"];
      const selectedMime = mimeCandidates.find((mime) =>
        typeof MediaRecorder.isTypeSupported !== "function" || MediaRecorder.isTypeSupported(mime),
      );

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, selectedMime ? { mimeType: selectedMime } : undefined);
      } catch {
        // Safari versions differ in their MediaRecorder MIME support. Use its default.
        recorder = new MediaRecorder(stream);
      }

      chunksRef.current = [];
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        cleanupCapture();
        if (mountedRef.current) {
          setPhase("idle");
          callbacksRef.current.onError("The recording stopped unexpectedly. Please try again.");
        }
      };

      const AudioContextConstructor =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (AudioContextConstructor) {
        try {
          const audioContext = new AudioContextConstructor();
          audioContextRef.current = audioContext;
          if (audioContext.state === "suspended") await audioContext.resume();
          if (!mountedRef.current || attempt !== startAttemptRef.current) {
            cleanupCapture();
            return;
          }

          const source = audioContext.createMediaStreamSource(stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 2048;
          analyser.smoothingTimeConstant = 0.78;
          source.connect(analyser);
          analyserRef.current = analyser;

          const samples = new Uint8Array(analyser.fftSize);
          let lastUiUpdate = 0;
          const draw = (time: number) => {
            if (!mountedRef.current || analyserRef.current !== analyser) return;
            analyser.getByteTimeDomainData(samples);

            const dotCount = 40;
            const next = Array.from({ length: dotCount }, (_, index) => {
              const first = Math.floor((index * samples.length) / dotCount);
              const last = Math.max(first + 1, Math.floor(((index + 1) * samples.length) / dotCount));
              let energy = 0;
              for (let cursor = first; cursor < last; cursor += 1) {
                const sample = (samples[cursor] - 128) / 128;
                energy += sample * sample;
              }
              const rms = Math.sqrt(energy / (last - first));
              return Math.max(0, Math.min(1, rms * 7));
            });

            if (time - lastUiUpdate >= 48) {
              lastUiUpdate = time;
              setWaveform(next);
            }
            animationFrameRef.current = requestAnimationFrame(draw);
          };
          animationFrameRef.current = requestAnimationFrame(draw);
        } catch {
          // Recording still works when a browser cannot expose Web Audio analysis.
          analyserRef.current = null;
        }
      }

      if (!mountedRef.current || attempt !== startAttemptRef.current) {
        cleanupCapture();
        return;
      }

      startedAtRef.current = performance.now();
      recorder.start(200);
      setPhase("recording");

      audioTrack.addEventListener("ended", () => {
        if (recorderRef.current !== recorder) return;
        cleanupCapture();
        if (mountedRef.current) {
          setPhase("idle");
          callbacksRef.current.onError("The microphone disconnected. Please check it and try again.");
        }
      }, { once: true });
    } catch (cause) {
      cleanupCapture();
      if (mountedRef.current && attempt === startAttemptRef.current) {
        setPhase("idle");
        const micError = toMicError(cause);
        callbacksRef.current.onError(micError.message);
      }
    }
  }, [cleanupCapture]);

  const stopCapture = useCallback((): Promise<CaptureResult> => {
    const recorder = recorderRef.current;
    if (!recorder) return Promise.reject(new Error("The microphone is not recording."));

    return new Promise((resolve, reject) => {
      const finish = () => {
        const chunks = chunksRef.current.slice();
        const mimeType = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || "audio/webm";
        const blob = new Blob(chunks, { type: mimeType });
        const durationMs = Math.max(0, performance.now() - startedAtRef.current);

        recorderRef.current = null;
        cleanupCapture();
        resolve({ blob, durationMs, mimeType });
      };

      recorder.onstop = finish;
      recorder.onerror = () => {
        cleanupCapture();
        reject(new Error("The audio recording could not be completed. Please try again."));
      };

      if (recorder.state === "inactive") {
        finish();
        return;
      }

      try {
        recorder.stop();
      } catch {
        cleanupCapture();
        reject(new Error("The audio recording could not be stopped. Please try again."));
      }
    });
  }, [cleanupCapture]);

  const transcribe = useCallback(async (mode: "insert" | "send") => {
    if (!activeRef.current || !recorderRef.current || !mountedRef.current) return;

    try {
      setPhase("transcribing");
      const capture = await stopCapture();

      if (capture.durationMs < 500 || capture.blob.size === 0) {
        showToast("Record for at least 0.5 seconds.");
        return;
      }

      if (capture.blob.size > 25 * 1024 * 1024) {
        throw new Error("This recording is larger than 25 MB. Record a shorter message and try again.");
      }

      if (!accessToken) {
        throw new Error("Your sign-in session expired. Please sign in again.");
      }

      const extension = capture.mimeType.includes("mp4")
        ? "m4a"
        : capture.mimeType.includes("ogg")
          ? "ogg"
          : capture.mimeType.includes("wav")
            ? "wav"
            : "webm";
      const audioFile = new File([capture.blob], "misma-voice-input." + extension, {
        type: capture.mimeType,
        lastModified: Date.now(),
      });
      const formData = new FormData();
      formData.set("audio", audioFile, audioFile.name);

      const controller = new AbortController();
      transcriptionControllerRef.current = controller;
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: "Bearer " + accessToken },
        body: formData,
        signal: controller.signal,
      });
      const result = await response.json().catch(() => ({})) as { text?: unknown; error?: unknown };
      if (!response.ok) {
        throw new Error(typeof result.error === "string" ? result.error : "Misma could not transcribe this recording. Please try again.");
      }

      const transcript = typeof result.text === "string" ? result.text.trim() : "";
      if (!transcript) throw new Error("No speech was detected. Record your message again or type it instead.");

      if (!mountedRef.current || controller.signal.aborted) return;
      if (mode === "insert") {
        callbacksRef.current.onTranscript(transcript);
      } else {
        await callbacksRef.current.onSend(transcript);
      }
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError") && mountedRef.current) {
        callbacksRef.current.onError(cause instanceof Error ? cause.message : "Voice transcription failed. Please try again.");
      }
    } finally {
      transcriptionControllerRef.current = null;
      activeRef.current = false;
      if (mountedRef.current) {
        setPhase("idle");
        setWaveform(EMPTY_WAVEFORM);
      }
    }
  }, [accessToken, showToast, stopCapture]);

  const stopAndInsert = useCallback(() => {
    void transcribe("insert");
  }, [transcribe]);

  const sendTranscript = useCallback(() => {
    void transcribe("send");
  }, [transcribe]);

  const cancel = useCallback(() => {
    startAttemptRef.current += 1;
    transcriptionControllerRef.current?.abort();
    transcriptionControllerRef.current = null;
    cleanupCapture();
    setPhase("idle");
    setWaveform(EMPTY_WAVEFORM);
    setToast("");
  }, [cleanupCapture]);

  return {
    phase,
    waveform,
    toast,
    start,
    cancel,
    stopAndInsert,
    sendTranscript,
  };
}
