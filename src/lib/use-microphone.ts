import { useCallback, useEffect, useRef, useState } from "react";

export type MicrophoneState =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "error";

export type MicrophonePermission = PermissionState | "unknown" | "unsupported";

const DENIED_MESSAGE =
  "Microphone access is blocked. Re-enable it in this site's browser permissions, then check again.";

function isSecureEnough(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const host = window.location.hostname.toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

function messageForError(error: unknown): {
  state: MicrophoneState;
  message: string;
} {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return { state: "denied", message: DENIED_MESSAGE };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      state: "error",
      message: "No microphone was detected. Connect a microphone or check that your device has one enabled.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      state: "error",
      message: "The microphone could not be opened. It may be in use by another app or browser tab. Close other apps using it and try again.",
    };
  }
  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    const constraint = error && typeof error === "object" && "constraint" in error
      ? String((error as { constraint?: unknown }).constraint || "")
      : "";
    return {
      state: "error",
      message: constraint
        ? "The microphone does not support the requested audio setting (" + constraint + "). Choose another device and try again."
        : "The microphone could not satisfy the requested audio settings. Choose another device and try again.",
    };
  }
  if (name === "SecurityError" || name === "TypeError") {
    return {
      state: "unavailable",
      message: "Microphone access is unavailable in this browser context. Use a supported browser over HTTPS, or use localhost for local development.",
    };
  }
  return {
    state: "error",
    message: "The microphone could not be started. Check your device and browser permissions, then try again.",
  };
}

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function useMicrophoneAccess() {
  const [state, setState] = useState<MicrophoneState>("idle");
  const [message, setMessage] = useState(
    "Your microphone is off. Start a microphone check when you are ready.",
  );
  const [permission, setPermission] = useState<MicrophonePermission>("unknown");
  const [promptVisible, setPromptVisible] = useState(false);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [isMuted, setIsMuted] = useState(false);
  const [level, setLevel] = useState(0);
  const [meterAvailable, setMeterAvailable] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const permissionStatusRef = useRef<PermissionStatus | null>(null);

  const releaseResources = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    try {
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();
    } catch {
      // The audio nodes may already be disconnected.
    }
    sourceRef.current = null;
    analyserRef.current = null;

    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }

    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });
    setIsMuted(false);
    setLevel(0);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const inputs = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "audioinput");
      setDevices(inputs);
      setSelectedDeviceId((current) =>
        current && !inputs.some((device) => device.deviceId === current) ? "" : current
      );
    } catch {
      setDevices([]);
    }
  }, []);

  const requestAccess = useCallback(async (deviceId = selectedDeviceId) => {
    setPromptVisible(false);
    setState("requesting");
    setMessage("Requesting microphone access…");

    if (!isSecureEnough()) {
      setState("unavailable");
      setMessage("Microphone access requires HTTPS. Use an HTTPS website, or localhost during development.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      setMessage("This browser does not provide microphone access. Try an up-to-date version of Chrome, Firefox, or Safari.");
      return;
    }

    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    };

    let mediaRequest: Promise<MediaStream>;
    try {
      // getUserMedia is called directly from the user's Continue/Start click.
      mediaRequest = navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    } catch (error) {
      const result = messageForError(error);
      setState(result.state);
      setMessage(result.message);
      return;
    }

    let context: AudioContext | null = null;
    try {
      const AudioContextConstructor =
        window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext;
      if (AudioContextConstructor) {
        context = new AudioContextConstructor();
        audioContextRef.current = context;
        void context.resume().catch(() => undefined);
        setMeterAvailable(true);
      } else {
        setMeterAvailable(false);
      }
    } catch {
      setMeterAvailable(false);
    }

    try {
      const stream = await mediaRequest;
      streamRef.current = stream;
      const track = stream.getAudioTracks()[0];
      if (!track) {
        releaseResources();
        setState("error");
        setMessage("The selected device did not provide an audio track. Choose another microphone and try again.");
        return;
      }

      track.onended = () => {
        releaseResources();
        setState("error");
        setMessage("The microphone was disconnected. Connect it again and restart the microphone check.");
      };

      if (context) {
        try {
          if (context.state === "suspended") await context.resume();
          const analyser = context.createAnalyser();
          analyser.fftSize = 512;
          const source = context.createMediaStreamSource(stream);
          source.connect(analyser);
          // The analyser is intentionally not connected to the audio destination.
          analyserRef.current = analyser;
          sourceRef.current = source;
        } catch {
          setMeterAvailable(false);
        }
      }

      setState("active");
      setPermission("granted");
      setMessage(
        "Microphone is live. Audio is analyzed locally for the level meter; it is not recorded, saved, or uploaded.",
      );
      await refreshDevices();
    } catch (error) {
      releaseResources();
      const result = messageForError(error);
      setState(result.state);
      setMessage(result.message);
      if (result.state === "denied") setPermission("denied");
    }
  }, [refreshDevices, releaseResources, selectedDeviceId]);

  const begin = useCallback(async () => {
    setMessage("");
    if (!isSecureEnough()) {
      setState("unavailable");
      setMessage("Microphone access requires HTTPS. Use an HTTPS website, or localhost during development.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unavailable");
      setMessage("This browser does not provide microphone access. Try an up-to-date version of Chrome, Firefox, or Safari.");
      return;
    }

    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        permissionStatusRef.current = status;
        status.onchange = () => {
          setPermission(status.state);
          if (status.state === "denied") {
            releaseResources();
            setState("denied");
            setMessage(DENIED_MESSAGE);
          } else if (status.state === "granted") {
            setState((current) => current === "denied" ? "idle" : current);
            setMessage((current) =>
              current === DENIED_MESSAGE ? "Permission restored. Start the microphone check when ready." : current
            );
          }
        };
        setPermission(status.state);

        if (status.state === "denied") {
          setState("denied");
          setMessage(DENIED_MESSAGE);
          return;
        }
        if (status.state === "granted") {
          await requestAccess();
          return;
        }
      } else {
        setPermission("unsupported");
      }
    } catch {
      // Safari and Firefox may not expose the microphone permission query consistently.
      setPermission("unsupported");
    }

    setPromptVisible(true);
    setState("idle");
    setMessage("Continue when you are ready to let Misma check your microphone.");
  }, [releaseResources, requestAccess]);

  const continueAfterPrompt = useCallback(() => {
    void requestAccess();
  }, [requestAccess]);

  const cancelPrompt = useCallback(() => {
    setPromptVisible(false);
    setState("idle");
    setMessage("Microphone access was not requested. Your microphone remains off.");
  }, []);

  const stop = useCallback(() => {
    releaseResources();
    setState("idle");
    setMessage("Microphone stopped. No audio was recorded or uploaded.");
  }, [releaseResources]);

  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setIsMuted(!track.enabled);
  }, []);

  const updateLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const samples = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const sample of samples) {
      const normalized = (sample - 128) / 128;
      sum += normalized * normalized;
    }
    const rms = Math.sqrt(sum / samples.length);
    setLevel(Math.min(100, Math.round(rms * 360)));
    animationFrameRef.current = requestAnimationFrame(updateLevel);
  }, []);

  useEffect(() => {
    if (state !== "active" || !analyserRef.current) return;
    animationFrameRef.current = requestAnimationFrame(updateLevel);
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [state, updateLevel, isMuted]);

  useEffect(() => {
    const mediaDevices = navigator.mediaDevices;
    if (!mediaDevices?.enumerateDevices) return;
    const update = () => { void refreshDevices(); };
    update();
    mediaDevices.addEventListener("devicechange", update);
    return () => mediaDevices.removeEventListener("devicechange", update);
  }, [refreshDevices]);

  useEffect(() => {
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden" && streamRef.current) {
        releaseResources();
        setState("idle");
        setMessage("Microphone stopped because this page became inactive.");
      }
    };
    const stopOnPageHide = () => releaseResources();

    document.addEventListener("visibilitychange", stopWhenHidden);
    window.addEventListener("pagehide", stopOnPageHide);
    return () => {
      document.removeEventListener("visibilitychange", stopWhenHidden);
      window.removeEventListener("pagehide", stopOnPageHide);
      if (permissionStatusRef.current) permissionStatusRef.current.onchange = null;
      releaseResources();
    };
  }, [releaseResources]);

  return {
    state,
    message,
    permission,
    promptVisible,
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    isMuted,
    level,
    meterAvailable,
    begin,
    continueAfterPrompt,
    cancelPrompt,
    stop,
    toggleMute,
  };
}
