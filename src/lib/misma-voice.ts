export type DictationState = "idle" | "listening";
export type VoiceModeState = "idle" | "listening" | "thinking" | "speaking" | "muted";

type RecognitionResult = { isFinal: boolean; 0: { transcript: string } };
type RecognitionEvent = { resultIndex: number; results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

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
};

/** Request browser mic permission and release the stream; speech recognition owns capture. */
export async function ensureMicPermission(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("unsupported"), { code: "unsupported" });
  }
  if (typeof window !== "undefined" && !window.isSecureContext) {
    throw Object.assign(new Error("insecure"), { code: "unsupported" });
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch (cause) {
    const name = cause instanceof Error ? cause.name : "";
    const code = name === "NotAllowedError" || name === "PermissionDeniedError"
      ? "permission"
      : name === "NotFoundError" || name === "DevicesNotFoundError"
        ? "no-device"
        : name === "NotReadableError" || name === "TrackStartError"
          ? "in-use"
          : "permission";
    throw Object.assign(new Error(code), { code });
  }
}

/** Remove markdown and formatting that should not be spoken by text-to-speech. */
export function cleanForSpeech(text = ""): string {
  return String(text)
    .replace(/\`\`\`[\s\S]*?\`\`\`/g, " (code omitted) ")
    .replace(/\`([^\`]+)\`/g, "$1")
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

type DictationOptions = {
  lang?: string;
  onText?: (transcript: string) => void;
  onDone?: (finalTranscript: string) => void;
  onState?: (state: DictationState) => void;
  onWaveform?: (levels: number[]) => void;
  onError?: (code: string) => void;
};

/** Browser-native live dictation. Speech audio is never recorded or uploaded. */
export function createDictation({
  lang = typeof navigator === "undefined" ? "en-US" : navigator.language || "en-US",
  onText,
  onDone,
  onState,
  onWaveform,
  onError,
}: DictationOptions = {}) {
  let recognition: SpeechRecognitionLike | null = null;
  let active = false;
  let finalText = "";
  let silentRuns = 0;
  let restartTimer: number | null = null;
  let discardResult = false;

  const clearRestart = () => {
    if (restartTimer !== null && typeof window !== "undefined") {
      window.clearTimeout(restartTimer);
    }
    restartTimer = null;
  };

  const finish = () => {
    clearRestart();
    recognition = null;
    active = false;
    onState?.("idle");
    if (!discardResult) onDone?.(finalText.trim());
  };

  const begin = () => {
    const Recognition = getSpeechRecognition();
    if (!Recognition || !active) return;

    const current = new Recognition();
    recognition = current;
    current.lang = lang;
    current.interimResults = true;
    current.continuous = false;
    let gotSpeech = false;

    current.onresult = (event) => {
      let interim = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const spoken = String(result?.[0]?.transcript || "").trim();
        if (!spoken) continue;
        if (result.isFinal) finalText = [finalText, spoken].filter(Boolean).join(" ").trim();
        else interim = [interim, spoken].filter(Boolean).join(" ").trim();
      }
      if (interim || finalText) {
        gotSpeech = true;
        onText?.([finalText, interim].filter(Boolean).join(" ").trim());
      }
    };

    current.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      active = false;
      clearRestart();
      if (recognition === current) recognition = null;
      onState?.("idle");
      onError?.(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "permission"
          : event.error,
      );
    };

    current.onend = () => {
      if (recognition !== current) return;
      recognition = null;

      if (active) {
        silentRuns = gotSpeech ? 0 : silentRuns + 1;
        if (silentRuns < 3) {
          restartTimer = window.setTimeout(() => {
            restartTimer = null;
            if (!active) return;
            try {
              begin();
            } catch {
              finish();
              onError?.("recognition");
            }
          }, 140);
          return;
        }
      }
      finish();
    };

    current.start();
  };

  return {
    async start() {
      if (active) return;
      if (!getSpeechRecognition()) {
        onError?.("unsupported");
        return;
      }

      active = true;
      finalText = "";
      discardResult = false;
      silentRuns = 0;
      clearRestart();

      try {
        await ensureMicPermission();
      } catch (cause) {
        active = false;
        onState?.("idle");
        const code = cause && typeof cause === "object" && "code" in cause
          ? String((cause as { code: unknown }).code)
          : "permission";
        onError?.(code);
        return;
      }
      if (!active) return;

      onState?.("listening");
      try {
        begin();
      } catch {
        active = false;
        onState?.("idle");
        onError?.("recognition");
      }
    },

    cancel() {
      discardResult = true;
      finalText = "";
      this.stop();
    },

    stop() {
      if (!active && !recognition) return;
      active = false;
      clearRestart();
      const current = recognition;
      if (!current) {
        finish();
        return;
      }
      try {
        current.stop();
      } catch {
        finish();
      }
    },

    get active() {
      return active;
    },
  };
}

type VoiceModeOptions = {
  send: (text: string, signal: AbortSignal, voice: true) => Promise<string | null | undefined>;
  lang?: string;
  onState?: (state: VoiceModeState) => void;
  onUser?: (text: string, isFinal: boolean) => void;
  onReply?: (replyText: string) => void;
  onError?: (code: string) => void;
};

/** Hands-free listen -> send text -> speak reply -> listen again. */
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
  let state: VoiceModeState = "idle";
  let recognition: SpeechRecognitionLike | null = null;
  let controller: AbortController | null = null;
  let wakeLock: WakeLockSentinel | null = null;
  let turn = 0;
  let startAttempt = 0;
  let retryTimer: number | null = null;
  let cancelSpeech: (() => void) | null = null;
  let activeUtterance: SpeechSynthesisUtterance | null = null;

  const setState = (next: VoiceModeState) => {
    state = next;
    onState?.(next);
  };

  const clearRetry = () => {
    if (retryTimer !== null && typeof window !== "undefined") window.clearTimeout(retryTimer);
    retryTimer = null;
  };

  const listen = () => {
    if (!on) return;
    clearRetry();
    if (muted) {
      setState("muted");
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

    current.onresult = (event) => {
      transcript = Array.from(event.results)
        .map((result) => String(result?.[0]?.transcript || "").trim())
        .filter(Boolean)
        .join(" ")
        .trim();
      if (transcript) onUser?.(transcript, false);
    };

    current.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        onError?.("permission");
      } else if (event.error === "network") {
        onError?.("network");
      } else {
        onError?.(event.error || "recognition");
      }
      stop();
    };

    current.onend = () => {
      if (recognition !== current) return;
      recognition = null;
      if (!on || muted) return;
      if (transcript.trim()) {
        void respond(transcript.trim());
      } else {
        retryTimer = window.setTimeout(() => {
          retryTimer = null;
          listen();
        }, 200);
      }
    };

    try {
      current.start();
    } catch {
      recognition = null;
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        listen();
      }, 300);
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
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      cancelSpeech = null;
      activeUtterance = null;
      resolve();
    };

    cancelSpeech = () => {
      index = chunks.length;
      synth.cancel();
      finish();
    };

    const next = () => {
      if (done) return;
      if (index >= chunks.length || !on) {
        finish();
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++]);
      utterance.lang = lang;
      utterance.onend = next;
      utterance.onerror = next;
      activeUtterance = utterance;
      synth.speak(utterance);
    };

    setState("speaking");
    next();
  });

  const respond = async (text: string) => {
    const myTurn = ++turn;
    setState("thinking");
    onUser?.(text, true);

    const requestController = new AbortController();
    controller = requestController;

    try {
      const reply = await send(text, requestController.signal, true);
      if (!on || myTurn !== turn || requestController.signal.aborted) return;
      if (reply) {
        onReply?.(reply);
        await speak(reply);
      }
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError") && myTurn === turn) {
        onError?.("send");
      }
    } finally {
      if (controller === requestController) controller = null;
    }

    if (on && myTurn === turn && !muted) listen();
    else if (on && muted) setState("muted");
  };

  /** Stop TTS or the pending AI turn and immediately return to listening. */
  const interrupt = () => {
    if (!on || (state !== "speaking" && state !== "thinking")) return;
    turn += 1;
    controller?.abort();
    controller = null;
    cancelSpeech?.();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    listen();
  };

  const setMuted = (nextMuted: boolean) => {
    muted = Boolean(nextMuted);
    if (!on) return;

    if (muted && state === "listening") {
      try {
        recognition?.abort();
      } catch {
        // Recognition may have stopped already.
      }
      setState("muted");
    } else if (!muted && state === "muted") {
      listen();
    }
  };

  const start = async () => {
    if (on) return;
    if (!getSpeechRecognition()) {
      onError?.("unsupported");
      return;
    }

    const attempt = ++startAttempt;

    // Unlock text-to-speech before awaiting permission, while the user gesture is active.
    try {
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
    } catch {
      // Speech output may be unavailable in this browser.
    }

    try {
      await ensureMicPermission();
    } catch (cause) {
      if (attempt !== startAttempt) return;
      const code = cause && typeof cause === "object" && "code" in cause
        ? String((cause as { code: unknown }).code)
        : "permission";
      onError?.(code);
      return;
    }

    if (attempt !== startAttempt) return;
    on = true;
    muted = false;

    let acquiredWakeLock: WakeLockSentinel | null = null;
    try {
      acquiredWakeLock = (await navigator.wakeLock?.request("screen")) || null;
    } catch {
      acquiredWakeLock = null;
    }

    if (attempt !== startAttempt || !on) {
      if (acquiredWakeLock) void acquiredWakeLock.release().catch(() => undefined);
      return;
    }

    wakeLock = acquiredWakeLock;
    listen();
  };

  function stop() {
    startAttempt += 1;
    on = false;
    turn += 1;
    clearRetry();

    const current = recognition;
    recognition = null;
    try {
      current?.abort();
    } catch {
      // Recognition may have ended already.
    }

    controller?.abort();
    controller = null;
    cancelSpeech?.();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    activeUtterance = null;

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
    get state() {
      return state;
    },
    get muted() {
      return muted;
    },
  };
}
