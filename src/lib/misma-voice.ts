export type DictationState = "idle" | "requesting" | "listening";
export type VoiceModeState = "idle" | "starting" | "ready" | "listening" | "thinking" | "speaking" | "muted";
export type VoiceConversationMode = "hands-free" | "push-to-talk";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
type AudioContextConstructor = new () => AudioContext;

export const VOICE_START_TIMEOUT_MS = 8000;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const browserWindow = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
}

export const voiceSupport = {
  get stt(): boolean {
    return Boolean(getSpeechRecognition());
  },
  get tts(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  },
  get audioMeter(): boolean {
    return typeof window !== "undefined" && Boolean(
      window.AudioContext || (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext,
    );
  },
};

function voiceError(code: string): Error & { code: string } {
  return Object.assign(new Error(code), { code });
}

function mediaErrorCode(cause: unknown): string {
  const name = cause && typeof cause === "object" && "name" in cause
    ? String((cause as { name: unknown }).name)
    : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") return "permission";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "no-device";
  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") return "audio-capture";
  return "permission";
}

function recognitionErrorCode(error: string): string {
  switch (error) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission";
    case "network":
      return "network";
    case "no-speech":
      return "no-speech";
    case "audio-capture":
      return "audio-capture";
    case "aborted":
      return "aborted";
    default:
      return "recognition";
  }
}

function stopTracks(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/**
 * Request a local microphone stream with a hard timeout. The caller owns the stream
 * and must stop its tracks. Audio is never recorded, encoded, or uploaded by this module.
 */
export function requestMicrophoneStream(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(voiceError("unsupported"));
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return Promise.reject(voiceError("unsupported"));
  }
  if (navigator.onLine === false) return Promise.reject(voiceError("network"));

  return new Promise<MediaStream>((resolve, reject) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      settled = true;
      reject(voiceError("timeout"));
    }, VOICE_START_TIMEOUT_MS);

    navigator.mediaDevices.getUserMedia({ audio: true }).then(
      (stream) => {
        if (settled) {
          stopTracks(stream);
          return;
        }
        settled = true;
        window.clearTimeout(timeoutId);
        resolve(stream);
      },
      (cause) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        reject(voiceError(mediaErrorCode(cause)));
      },
    );
  });
}

/** Ask for permission without retaining the microphone stream. */
export async function ensureMicPermission(): Promise<void> {
  const stream = await requestMicrophoneStream();
  stopTracks(stream);
}

/** Remove markdown and formatting that should not be spoken by text-to-speech. */
export function cleanForSpeech(text = ""): string {
  return String(text)
    .replace(/\u0060{3}[\s\S]*?\u0060{3}/g, " (code omitted) ")
    .replace(/\u0060([^\u0060]+)\u0060/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/[*_~>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sentence-sized chunks prevent long Android Chrome utterances from being cut off. */
export function toSpeechChunks(text: string, max = 200): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [];
  const output: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (current && (current + sentence).length > max) {
      output.push(current.trim());
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current.trim()) output.push(current.trim());
  return output;
}

function startAudioMeter(stream: MediaStream, onAmplitude: (level: number) => void): () => void {
  const browserWindow = window as Window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  const Context = window.AudioContext || browserWindow.webkitAudioContext;
  if (!Context) return () => onAmplitude(0);

  let context: AudioContext | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let frameId = 0;
  let active = true;
  let smoothed = 0;
  let lastUpdate = 0;

  try {
    context = new Context();
    source = context.createMediaStreamSource(stream);
    analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);

    void context.resume().catch(() => undefined);

    const sample = (time: number) => {
      if (!active || !analyser) return;
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (let index = 0; index < samples.length; index += 1) {
        const value = (samples[index] - 128) / 128;
        sum += value * value;
      }
      const rms = Math.sqrt(sum / samples.length);
      const normalized = Math.max(0, Math.min(1, (rms - 0.012) * 4.2));
      smoothed = smoothed * 0.72 + normalized * 0.28;

      if (time - lastUpdate >= 32) {
        onAmplitude(smoothed < 0.035 ? 0 : smoothed);
        lastUpdate = time;
      }
      frameId = window.requestAnimationFrame(sample);
    };

    frameId = window.requestAnimationFrame(sample);
  } catch {
    if (context) void context.close().catch(() => undefined);
    return () => onAmplitude(0);
  }

  return () => {
    if (!active) return;
    active = false;
    window.cancelAnimationFrame(frameId);
    try {
      source?.disconnect();
      analyser?.disconnect();
    } catch {
      // Audio nodes may already be disconnected.
    }
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
    onAmplitude(0);
  };
}

type DictationOptions = {
  lang?: string;
  onText?: (transcript: string) => void;
  onDone?: (finalTranscript: string) => void;
  onState?: (state: DictationState) => void;
  onAmplitude?: (level: number) => void;
  onError?: (code: string) => void;
};

/** Live browser dictation plus a local Web Audio level meter. No audio file is created. */
export function createDictation({
  lang = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US",
  onText,
  onDone,
  onState,
  onAmplitude,
  onError,
}: DictationOptions = {}) {
  let recognition: SpeechRecognitionLike | null = null;
  let active = false;
  let finalText = "";
  let interimText = "";
  let stream: MediaStream | null = null;
  let stopMeter: (() => void) | null = null;
  let restartTimer: number | null = null;
  let finishTimer: number | null = null;
  let generation = 0;

  const clearTimers = () => {
    if (restartTimer !== null) window.clearTimeout(restartTimer);
    if (finishTimer !== null) window.clearTimeout(finishTimer);
    restartTimer = null;
    finishTimer = null;
  };

  const releaseAudio = () => {
    stopMeter?.();
    stopMeter = null;
    stopTracks(stream);
    stream = null;
    onAmplitude?.(0);
  };

  const finishResources = (notifyDone: boolean) => {
    clearTimers();
    const current = recognition;
    recognition = null;
    if (current) {
      current.onresult = null;
      current.onerror = null;
      current.onend = null;
      try {
        current.abort();
      } catch {
        // Recognition may already have stopped.
      }
    }
    active = false;
    releaseAudio();
    onState?.("idle");
    if (notifyDone) onDone?.(finalText.trim());
  };

  const fail = (code: string) => {
    finishResources(false);
    onError?.(code);
  };

  const beginRecognition = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition || !active) return;

    const current = new Recognition();
    recognition = current;
    current.lang = lang;
    current.interimResults = true;
    current.continuous = false;
    current.maxAlternatives = 1;
    let hadError = false;

    current.onresult = (event) => {
      let nextFinal = "";
      let nextInterim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const spoken = String(result?.[0]?.transcript || "").trim();
        if (!spoken) continue;
        if (result.isFinal) nextFinal = [nextFinal, spoken].filter(Boolean).join(" ").trim();
        else nextInterim = [nextInterim, spoken].filter(Boolean).join(" ").trim();
      }
      if (nextFinal) {
        finalText = [finalText, nextFinal].filter(Boolean).join(" ").trim();
        interimText = nextInterim;
      } else {
        interimText = nextInterim;
      }
      const transcript = [finalText, interimText].filter(Boolean).join(" ").trim();
      if (transcript) onText?.(transcript);
    };

    current.onerror = (event) => {
      if (event.error === "aborted" && !active) return;
      hadError = true;
      const code = recognitionErrorCode(event.error);
      if (code === "aborted") return;
      fail(code);
    };

    current.onend = () => {
      if (recognition !== current) return;
      recognition = null;

      if (!active) {
        finishResources(true);
        return;
      }
      if (hadError) {
        fail("recognition");
        return;
      }

      restartTimer = window.setTimeout(() => {
        restartTimer = null;
        if (active) {
          try {
            beginRecognition();
          } catch {
            fail("recognition");
          }
        }
      }, 160);
    };

    current.start();
  };

  return {
    async start(): Promise<boolean> {
      if (active) return true;
      if (!getSpeechRecognition()) {
        onError?.("unsupported");
        return false;
      }

      active = true;
      generation += 1;
      const startGeneration = generation;
      finalText = "";
      interimText = "";
      clearTimers();
      onState?.("requesting");

      try {
        const acquiredStream = await requestMicrophoneStream();
        if (!active || startGeneration !== generation) {
          stopTracks(acquiredStream);
          return false;
        }
        stream = acquiredStream;
        stopMeter = startAudioMeter(acquiredStream, (level) => onAmplitude?.(level));
        onState?.("listening");
        beginRecognition();
        return true;
      } catch (cause) {
        if (startGeneration !== generation) return false;
        const code = cause && typeof cause === "object" && "code" in cause
          ? String((cause as { code: unknown }).code)
          : "permission";
        fail(code);
        return false;
      }
    },

    /** Finish dictation and deliver the final transcript. */
    stop(): void {
      if (!active && !recognition && !stream) return;
      active = false;
      clearTimers();
      const current = recognition;
      if (!current) {
        finishResources(true);
        return;
      }

      try {
        current.stop();
        finishTimer = window.setTimeout(() => finishResources(true), 900);
      } catch {
        finishResources(true);
      }
    },

    /** Cancel dictation and discard every unconfirmed word. */
    cancel(): void {
      generation += 1;
      finishResources(false);
    },

    get active(): boolean {
      return active;
    },
  };
}

type VoiceModeOptions = {
  send: (text: string, signal: AbortSignal) => Promise<string | null | undefined>;
  lang?: string;
  onState?: (state: VoiceModeState) => void;
  onUser?: (text: string, isFinal: boolean) => void;
  onReply?: (replyText: string) => void;
  onError?: (code: string) => void;
};

/** Hands-free or push-to-talk listen -> send text -> speak reply loop. */
export function createVoiceMode({
  send,
  lang = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US",
  onState,
  onUser,
  onReply,
  onError,
}: VoiceModeOptions) {
  let on = false;
  let muted = false;
  let mode: VoiceConversationMode = "hands-free";
  let state: VoiceModeState = "idle";
  let recognition: SpeechRecognitionLike | null = null;
  let controller: AbortController | null = null;
  let wakeLock: WakeLockSentinel | null = null;
  let turn = 0;
  let startAttempt = 0;
  let retryTimer: number | null = null;
  let cancelSpeech: (() => void) | null = null;

  const setState = (next: VoiceModeState) => {
    state = next;
    onState?.(next);
  };

  const clearRetry = () => {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
  };

  const listen = (force = false) => {
    if (!on) return;
    clearRetry();
    if (muted) {
      setState("muted");
      return;
    }
    if (mode === "push-to-talk" && !force) {
      setState("ready");
      return;
    }

    const Recognition = getSpeechRecognition();
    if (!Recognition) {
      onError?.("unsupported");
      stop();
      return;
    }

    setState("listening");
    let transcript = "";
    const current = new Recognition();
    recognition = current;
    current.lang = lang;
    current.interimResults = true;
    current.continuous = false;
    current.maxAlternatives = 1;

    current.onresult = (event) => {
      transcript = Array.from(event.results)
        .map((result) => String(result?.[0]?.transcript || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (transcript) onUser?.(transcript, false);
    };

    current.onerror = (event) => {
      if (event.error === "aborted" && (!on || recognition !== current)) return;
      const code = recognitionErrorCode(event.error);
      if (code === "aborted") return;
      onError?.(code);
      stop();
    };

    current.onend = () => {
      if (recognition !== current) return;
      recognition = null;
      if (!on || muted) return;
      if (transcript.trim()) {
        void respond(transcript.trim());
      } else if (mode === "hands-free") {
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          listen();
        }, 220);
      } else {
        setState("ready");
      }
    };

    try {
      current.start();
    } catch {
      recognition = null;
      onError?.("recognition");
      stop();
    }
  };

  const speak = (rawText: string) => new Promise<void>((resolve) => {
    const synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    const chunks = synth ? toSpeechChunks(cleanForSpeech(rawText)) : [];
    if (!synth || !chunks.length) {
      resolve();
      return;
    }

    let index = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      cancelSpeech = null;
      resolve();
    };

    cancelSpeech = () => {
      if (finished) return;
      synth.cancel();
      finish();
    };

    const speakNext = () => {
      if (finished) return;
      if (index >= chunks.length || !on) {
        finish();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang = lang;
      utterance.onend = speakNext;
      utterance.onerror = speakNext;
      synth.speak(utterance);
    };

    setState("speaking");
    speakNext();
  });

  const respond = async (spokenText: string) => {
    const thisTurn = ++turn;
    setState("thinking");
    onUser?.(spokenText, true);
    const requestController = new AbortController();
    controller = requestController;

    try {
      const reply = await send(spokenText, requestController.signal);
      if (!on || thisTurn !== turn || requestController.signal.aborted) return;
      if (typeof reply !== "string" || !reply.trim()) {
        onError?.("send");
      } else {
        onReply?.(reply);
        await speak(reply);
      }
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError") && thisTurn === turn) {
        onError?.("send");
      }
    } finally {
      if (controller === requestController) controller = null;
    }

    if (on && thisTurn === turn && !muted) {
      if (mode === "hands-free") listen();
      else setState("ready");
    } else if (on && muted) {
      setState("muted");
    }
  };

  /** Interrupt a reply or pending request, then return to the active listening mode. */
  const interrupt = () => {
    if (!on || (state !== "speaking" && state !== "thinking")) return;
    turn += 1;
    controller?.abort();
    controller = null;
    cancelSpeech?.();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (mode === "hands-free") listen();
    else setState("ready");
  };

  const setMuted = (nextMuted: boolean) => {
    muted = Boolean(nextMuted);
    if (!on) return;

    if (muted && state === "listening") {
      const current = recognition;
      recognition = null;
      try {
        current?.abort();
      } catch {
        // Recognition may already have ended.
      }
      setState("muted");
    } else if (!muted && state === "muted") {
      if (mode === "hands-free") listen();
      else setState("ready");
    }
  };

  const setMode = (nextMode: VoiceConversationMode) => {
    if (mode === nextMode) return;
    mode = nextMode;
    clearRetry();

    if (!on) return;
    if (mode === "push-to-talk") {
      if (state === "listening") {
        const current = recognition;
        recognition = null;
        try {
          current?.abort();
        } catch {
          // Recognition may have ended already.
        }
      }
      if (!muted && state !== "thinking" && state !== "speaking") setState("ready");
    } else if (!muted && state === "ready") {
      listen();
    }
  };

  const togglePushToTalk = () => {
    if (!on || mode !== "push-to-talk" || muted) return;
    if (state === "listening") {
      try {
        recognition?.stop();
      } catch {
        setState("ready");
      }
    } else if (state === "ready") {
      listen(true);
    }
  };

  const start = async (): Promise<boolean> => {
    if (on) return true;
    if (!getSpeechRecognition()) {
      onError?.("unsupported");
      return false;
    }

    const attempt = ++startAttempt;
    setState("starting");

    // Unlock browser speech output while this call is still associated with a user tap.
    try {
      if (typeof window !== "undefined" && window.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined") {
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(""));
        window.speechSynthesis.cancel();
      }
    } catch {
      // Some browsers do not expose speech output.
    }

    try {
      await ensureMicPermission();
    } catch (cause) {
      if (attempt !== startAttempt) return false;
      const code = cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code: unknown }).code)
        : "permission";
      onError?.(code);
      setState("idle");
      return false;
    }

    if (attempt !== startAttempt) return false;
    on = true;
    muted = false;

    let acquiredWakeLock: WakeLockSentinel | null = null;
    try {
      acquiredWakeLock = (await navigator.wakeLock?.request("screen")) || null;
    } catch {
      acquiredWakeLock = null;
    }

    if (attempt !== startAttempt || !on && acquiredWakeLock) {
      if (acquiredWakeLock) void acquiredWakeLock.release().catch(() => undefined);
      return false;
    }

    wakeLock = acquiredWakeLock;
    if (mode === "hands-free") listen();
    else setState("ready");
    return true;
  };

  function stop(): void {
    startAttempt += 1;
    on = false;
    turn += 1;
    clearRetry();

    const current = recognition;
    recognition = null;
    try {
      current?.abort();
    } catch {
      // Recognition may already have stopped.
    }

    controller?.abort();
    controller = null;
    cancelSpeech?.();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();

    if (wakeLock) {
      void wakeLock.release().catch(() => undefined);
      wakeLock = null;
    }
    setState("idle");
  }

  return {
    start,
    stop,
    interrupt,
    setMuted,
    setMode,
    togglePushToTalk,
    get state() {
      return state;
    },
    get mode() {
      return mode;
    },
    get muted() {
      return muted;
    },
  };
}
