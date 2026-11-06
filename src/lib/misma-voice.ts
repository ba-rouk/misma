export type DictationState = "idle" | "listening";
export type VoiceModeState = "idle" | "listening" | "thinking" | "speaking" | "muted" | "ready";
export type VoiceInputMode = "hands-free" | "push-to-talk";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };
type SpeechRecognitionLike = {
  lang: string; interimResults: boolean; continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
};
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;
const START_TIMEOUT_MS = 8000;
const QUIET_WAVEFORM = () => Array.from({ length: 28 }, () => 0.035);

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function normalizeError(cause: unknown): string {
  if (cause && typeof cause === "object" && "code" in cause) return String((cause as { code: unknown }).code);
  const name = cause instanceof Error ? cause.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") return "permission";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "NotReadableError") return "audio-capture";
  if (name === "NotSupportedError") return "unsupported";
  return "permission";
}

/** Request microphone access for the local waveform meter. Audio is never recorded or uploaded. */
async function requestMicrophone(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia ||
      (typeof window !== "undefined" && !window.isSecureContext)) {
    throw Object.assign(new Error("unsupported"), { code: "unsupported" });
  }
  const request = navigator.mediaDevices.getUserMedia({ audio: true });
  let timer = 0;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => reject(Object.assign(new Error("permission-timeout"), { code: "permission-timeout" })), START_TIMEOUT_MS);
    });
    return await Promise.race([request, timeout]);
  } catch (cause) {
    request.then((lateStream) => lateStream.getTracks().forEach((track) => track.stop())).catch(() => undefined);
    throw Object.assign(new Error(normalizeError(cause)), { code: normalizeError(cause) });
  } finally {
    window.clearTimeout(timer);
  }
}

export const voiceSupport = {
  get stt(): boolean { return Boolean(getSpeechRecognition()); },
  get tts(): boolean { return typeof window !== "undefined" && "speechSynthesis" in window; },
};

export function cleanForSpeech(text = ""): string {
  return String(text)
    .replace(/```[\s\S]*?```/g, " code omitted ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/[*_~>]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function toSpeechChunks(text: string, max = 200): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current + sentence).length > max) {
      chunks.push(current.trim());
      current = sentence;
    } else current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

type DictationOptions = {
  lang?: string;
  onText?: (transcript: string) => void;
  onDone?: (finalTranscript: string) => void;
  onState?: (state: DictationState) => void;
  onWaveform?: (levels: number[]) => void;
  onError?: (code: string) => void;
};

/** Live dictation with a local Web Audio waveform meter. No recording or file upload. */
export function createDictation({
  lang = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US",
  onText, onDone, onState, onWaveform, onError,
}: DictationOptions = {}) {
  let recognition: SpeechRecognitionLike | null = null;
  let active = false;
  let finishRequested = false;
  let finalText = "";
  let interimText = "";
  let restartTimer = 0;
  let startTimer = 0;
  let stopFallbackTimer = 0;
  let stream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let animationFrame = 0;
  let started = false;

  const clearTimers = () => {
    window.clearTimeout(restartTimer);
    window.clearTimeout(startTimer);
    window.clearTimeout(stopFallbackTimer);
    restartTimer = startTimer = stopFallbackTimer = 0;
  };

  const releaseAudio = () => {
    if (animationFrame) cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    if (audioContext && audioContext.state !== "closed") void audioContext.close().catch(() => undefined);
    audioContext = null;
    analyser = null;
    onWaveform?.(QUIET_WAVEFORM());
  };

  const finishNow = (commit: boolean) => {
    if (!active && !recognition && !stream && !audioContext) return;
    active = false;
    clearTimers();
    const current = recognition;
    recognition = null;
    try { current?.abort(); } catch { /* Recognition may already have ended. */ }
    releaseAudio();
    onState?.("idle");
    if (commit) onDone?.(finalText.trim());
  };

  const fail = (code: string) => {
    finishNow(false);
    onError?.(code);
  };

  const meterTick = () => {
    if (!active || !analyser) return;
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    let energy = 0;
    for (const byte of data) {
      const sample = (byte - 128) / 128;
      energy += sample * sample;
    }
    const rms = Math.sqrt(energy / data.length);
    const now = performance.now();
    const levels = Array.from({ length: 28 }, (_, index) => {
      const mod = 0.55 + 0.45 * Math.abs(Math.sin(index * 1.7 + now / 115));
      return Math.max(0.035, Math.min(1, rms * 9 * mod));
    });
    onWaveform?.(levels);
    animationFrame = requestAnimationFrame(meterTick);
  };

  const beginRecognition = () => {
    const Constructor = getSpeechRecognition();
    if (!Constructor || !active || finishRequested) return;
    const current = new Constructor();
    recognition = current;
    started = false;
    interimText = "";
    current.lang = lang;
    current.interimResults = true;
    current.continuous = false;
    current.onstart = () => {
      started = true;
      window.clearTimeout(startTimer);
      startTimer = 0;
    };
    current.onresult = (event) => {
      interimText = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const spoken = String(result?.[0]?.transcript || "").trim();
        if (!spoken) continue;
        if (result.isFinal) finalText = [finalText, spoken].filter(Boolean).join(" ").trim();
        else interimText = [interimText, spoken].filter(Boolean).join(" ").trim();
      }
      onText?.([finalText, interimText].filter(Boolean).join(" ").trim());
    };
    current.onerror = (event) => {
      if (event.error === "aborted") return;
      const code = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "permission"
        : event.error === "audio-capture" ? "audio-capture"
          : event.error === "no-speech" ? "no-speech"
            : event.error === "network" ? "network" : event.error || "recognition";
      fail(code);
    };
    current.onend = () => {
      if (recognition !== current) return;
      recognition = null;
      if (finishRequested) {
        finishRequested = false;
        finishNow(true);
        return;
      }
      if (!active) return;
      restartTimer = window.setTimeout(() => {
        restartTimer = 0;
        if (active && !finishRequested) {
          try { beginRecognition(); } catch { fail("recognition"); }
        }
      }, 180);
    };
    startTimer = window.setTimeout(() => {
      if (active && recognition === current && !started) fail("start-timeout");
    }, START_TIMEOUT_MS);
    current.start();
  };

  const start = async () => {
    if (active) return;
    if (!getSpeechRecognition()) { onError?.("unsupported"); return; }
    active = true;
    finishRequested = false;
    finalText = "";
    interimText = "";
    onState?.("listening");
    try {
      stream = await requestMicrophone();
      if (!active) {
        stream.getTracks().forEach((track) => track.stop());
        stream = null;
        return;
      }
      audioContext = new AudioContext();
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.82;
      audioContext.createMediaStreamSource(stream).connect(analyser);
      if (audioContext.state === "suspended") await audioContext.resume();
      if (!active) return;
      meterTick();
      beginRecognition();
    } catch (cause) {
      fail(normalizeError(cause));
    }
  };

  const stop = () => {
    if (!active) return;
    finishRequested = true;
    window.clearTimeout(restartTimer);
    window.clearTimeout(startTimer);
    restartTimer = startTimer = 0;
    const current = recognition;
    if (!current) {
      finishRequested = false;
      finishNow(true);
      return;
    }
    try {
      current.stop();
      stopFallbackTimer = window.setTimeout(() => {
        if (finishRequested) {
          finishRequested = false;
          finishNow(true);
        }
      }, 700);
    } catch {
      finishRequested = false;
      finishNow(true);
    }
  };

  const cancel = () => {
    finishRequested = false;
    finalText = "";
    finishNow(false);
  };

  return { start, stop, cancel, get active() { return active; } };
}

type VoiceModeOptions = {
  send: (text: string, signal: AbortSignal, voice: true) => Promise<string | null | undefined>;
  lang?: string;
  onState?: (state: VoiceModeState) => void;
  onUser?: (text: string, isFinal: boolean) => void;
  onReply?: (replyText: string) => void;
  onError?: (code: string) => void;
};

/** Hands-free or push-to-talk voice conversation. Only recognized text reaches Misma. */
export function createVoiceMode({
  send, lang = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US",
  onState, onUser, onReply, onError,
}: VoiceModeOptions) {
  let active = false;
  let muted = false;
  let mode: VoiceInputMode = "hands-free";
  let state: VoiceModeState = "idle";
  let recognition: SpeechRecognitionLike | null = null;
  let controller: AbortController | null = null;
  let wakeLock: WakeLockSentinel | null = null;
  let turn = 0;
  let startAttempt = 0;
  let retryTimer = 0;
  let cancelSpeech: (() => void) | null = null;

  const setState = (next: VoiceModeState) => { state = next; onState?.(next); };
  const clearRetry = () => { window.clearTimeout(retryTimer); retryTimer = 0; };

  const createRecognition = (pushToTalk: boolean) => {
    if (!active || muted) return;
    const Constructor = getSpeechRecognition();
    if (!Constructor) { onError?.("unsupported"); stop(); return; }
    setState(pushToTalk ? "listening" : "listening");
    let transcript = "";
    let didStart = false;
    const current = new Constructor();
    recognition = current;
    current.lang = lang;
    current.interimResults = true;
    current.continuous = false;
    const startTimer = window.setTimeout(() => {
      if (active && recognition === current && !didStart) {
        onError?.("start-timeout");
        stop();
      }
    }, START_TIMEOUT_MS);
    current.onstart = () => { didStart = true; window.clearTimeout(startTimer); };
    current.onresult = (event) => {
      transcript = Array.from(event.results)
        .map((result) => String(result?.[0]?.transcript || "").trim())
        .filter(Boolean).join(" ").trim();
      if (transcript) onUser?.(transcript, false);
    };
    current.onerror = (event) => {
      if (event.error === "aborted") return;
      window.clearTimeout(startTimer);
      const code = event.error === "not-allowed" || event.error === "service-not-allowed"
        ? "permission"
        : event.error === "audio-capture" ? "audio-capture"
          : event.error === "no-speech" ? "no-speech"
            : event.error === "network" ? "network" : event.error || "recognition";
      onError?.(code);
      if (code === "no-speech" && active && mode === "push-to-talk") setState("ready");
      else stop();
    };
    current.onend = () => {
      window.clearTimeout(startTimer);
      if (recognition !== current) return;
      recognition = null;
      if (!active || muted) return;
      if (transcript.trim()) void respond(transcript.trim());
      else if (mode === "hands-free") retryTimer = window.setTimeout(() => { retryTimer = 0; listen(); }, 220);
      else setState("ready");
    };
    try { current.start(); }
    catch {
      window.clearTimeout(startTimer);
      recognition = null;
      if (mode === "hands-free") retryTimer = window.setTimeout(() => { retryTimer = 0; listen(); }, 300);
      else setState("ready");
    }
  };

  const listen = () => {
    if (!active || muted) return;
    clearRetry();
    if (mode === "push-to-talk") { setState("ready"); return; }
    createRecognition(false);
  };

  const speak = (rawText: string) => new Promise<void>((resolve) => {
    const synth = window.speechSynthesis;
    const chunks = toSpeechChunks(cleanForSpeech(rawText));
    if (!chunks.length) { resolve(); return; }
    let index = 0, finished = false;
    const finish = () => { if (finished) return; finished = true; cancelSpeech = null; resolve(); };
    cancelSpeech = () => { synth.cancel(); finish(); };
    const next = () => {
      if (finished) return;
      if (index >= chunks.length || !active) { finish(); return; }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang = lang;
      utterance.onend = next;
      utterance.onerror = next;
      synth.speak(utterance);
    };
    setState("speaking");
    next();
  });

  const respond = async (text: string) => {
    const currentTurn = ++turn;
    setState("thinking");
    onUser?.(text, true);
    const request = new AbortController();
    controller = request;
    try {
      const reply = await send(text, request.signal, true);
      if (!active || currentTurn !== turn || request.signal.aborted) return;
      if (!reply) throw new Error("empty-reply");
      onReply?.(reply);
      await speak(reply);
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError") && currentTurn === turn) onError?.("send");
    } finally {
      if (controller === request) controller = null;
    }
    if (active && currentTurn === turn && !muted) listen();
    else if (active && muted) setState("muted");
  };

  const pushToTalkStart = () => {
    if (!active || muted || mode !== "push-to-talk" || recognition || state === "thinking" || state === "speaking") return;
    createRecognition(true);
  };
  const pushToTalkStop = () => {
    if (!active || mode !== "push-to-talk" || !recognition) return;
    try { recognition.stop(); } catch { setState("ready"); }
  };

  const setMode = (next: VoiceInputMode) => {
    if (mode === next) return;
    mode = next;
    if (!active) return;
    const current = recognition;
    recognition = null;
    try { current?.abort(); } catch { /* already ended */ }
    if (mode === "hands-free") listen();
    else setState(muted ? "muted" : "ready");
  };

  const interrupt = () => {
    if (!active || (state !== "speaking" && state !== "thinking")) return;
    turn++;
    controller?.abort();
    controller = null;
    cancelSpeech?.();
    window.speechSynthesis?.cancel();
    listen();
  };

  const setMuted = (next: boolean) => {
    muted = Boolean(next);
    if (!active) return;
    if (muted) {
      try { recognition?.abort(); } catch { /* already ended */ }
      recognition = null;
      cancelSpeech?.();
      window.speechSynthesis?.cancel();
      setState("muted");
    } else if (state === "muted") listen();
  };

  const start = async () => {
    if (active) return;
    if (!getSpeechRecognition()) { onError?.("unsupported"); return; }
    const attempt = ++startAttempt;
    try { window.speechSynthesis?.speak(new SpeechSynthesisUtterance("")); } catch { /* browser may block TTS */ }
    try {
      const stream = await requestMicrophone();
      stream.getTracks().forEach((track) => track.stop());
    } catch (cause) {
      if (attempt !== startAttempt) return;
      onError?.(normalizeError(cause));
      return;
    }
    if (attempt !== startAttempt) return;
    active = true;
    muted = false;
    try { wakeLock = (await navigator.wakeLock?.request("screen")) || null; } catch { wakeLock = null; }
    if (attempt !== startAttempt || !active) {
      if (wakeLock) void wakeLock.release().catch(() => undefined);
      wakeLock = null;
      return;
    }
    listen();
  };

  function stop() {
    startAttempt++;
    active = false;
    turn++;
    clearRetry();
    const current = recognition;
    recognition = null;
    try { current?.abort(); } catch { /* ended */ }
    controller?.abort();
    controller = null;
    cancelSpeech?.();
    window.speechSynthesis?.cancel();
    if (wakeLock) { void wakeLock.release().catch(() => undefined); wakeLock = null; }
    setState("idle");
  }

  return {
    start, stop, interrupt, setMuted, setMode, pushToTalkStart, pushToTalkStop,
    get state() { return state; },
    get muted() { return muted; },
    get mode() { return mode; },
  };
}
