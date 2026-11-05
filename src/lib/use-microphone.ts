import { useCallback, useEffect, useRef, useState } from "react";

export type MicrophoneState =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "error";

export type MicrophonePermission = "granted" | "denied" | "prompt" | "unsupported";

export type MicrophoneDevice = {
  deviceId: string;
  label: string;
};

type MicrophoneError = {
  state: Extract<MicrophoneState, "denied" | "unavailable" | "error">;
  message: string;
};

type ExtendedWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getEnvironmentError(): MicrophoneError | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      state: "unavailable",
      message: "Microphone access is available only in a browser.",
    };
  }

  if (!window.isSecureContext) {
    return {
      state: "unavailable",
      message: "Microphone access requires HTTPS. Use HTTPS on hosted websites, or localhost for local development.",
    };
  }

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    return {
      state: "unavailable",
      message: "This browser does not provide microphone access. Update your browser or open Misma in a supported browser.",
    };
  }

  return null;
}

function mapMicrophoneError(error: unknown): MicrophoneError {
  const name = error instanceof Error ? error.name : "";

  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return {
      state: "denied",
      message: "Microphone access was blocked by you, the browser, your device settings, or this page's permissions policy. Change the site's microphone permission, then check again.",
    };
  }

  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return {
      state: "unavailable",
      message: "No microphone was detected. Connect a microphone or enable an input device in your operating system, then try again.",
    };
  }

  if (name === "NotReadableError" || name === "TrackStartError" || name === "AbortError") {
    return {
      state: "error",
      message: "The microphone could not be opened. It may be in use by another app or browser tab. Close other calls or recording apps, then try again.",
    };
  }

  if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
    return {
      state: "error",
      message: "The selected microphone cannot satisfy the requested audio settings. Choose another input device or reconnect this one.",
    };
  }

  if (name === "SecurityError" || name === "TypeError") {
    return {
      state: "unavailable",
      message: "This page cannot access the microphone. Use HTTPS (or localhost), a supported browser, and allow microphone access for this page.",
    };
  }

  return {
    state: "error",
    message: "The microphone could not be started. Check your device and browser permissions, then try again.",
  };
}

export function useMicrophone() {
  const [state, setStateValue] = useState<MicrophoneState>("idle");
  const [permission, setPermission] = useState<MicrophonePermission>("unsupported");
  const [permissionKnown, setPermissionKnown] = useState(false);
  const [softPromptOpen, setSoftPromptOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [devices, setDevices] = useState<MicrophoneDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState("");
  const [muted, setMuted] = useState(false);
  const [level, setLevel] = useState(0);

  const mountedRef = useRef(false);
  const stateRef = useRef<MicrophoneState>("idle");
  const permissionRef = useRef<MicrophonePermission>("unsupported");
  const permissionStatusRef = useRef<PermissionStatus | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const meterUpdateAtRef = useRef(0);
  const requestIdRef = useRef(0);

  const setState = useCallback((next: MicrophoneState) => {
    stateRef.current = next;
    if (mountedRef.current) setStateValue(next);
  }, []);

  const setPermissionState = useCallback((next: MicrophonePermission) => {
    permissionRef.current = next;
    if (mountedRef.current) {
      setPermission(next);
      setPermissionKnown(true);
    }
  }, []);

  const stopResources = useCallback(() => {
    requestIdRef.current += 1;

    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current = null;

    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close().catch(() => undefined);
    }

    if (mountedRef.current) {
      setLevel(0);
      setMuted(false);
    }
  }, []);

  const updateDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;

    try {
      const available = await navigator.mediaDevices.enumerateDevices();
      const microphones = available
        .filter((device) => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || "Microphone " + (index + 1),
        }));

      if (mountedRef.current) setDevices(microphones);
    } catch {
      if (mountedRef.current) setDevices([]);
    }
  }, []);

  const handlePermissionChange = useCallback(() => {
    const next = (permissionStatusRef.current?.state || "prompt") as MicrophonePermission;
    setPermissionState(next);

    if (next === "denied") {
      setSoftPromptOpen(false);
      stopResources();
      setErrorMessage("Microphone access is blocked for this website. Follow the browser steps below to allow it, then check permission again.");
      setState("denied");
    } else if (stateRef.current === "denied") {
      setErrorMessage("");
      setState("idle");
    }
  }, [setPermissionState, setState, stopResources]);

  const refreshPermission = useCallback(async (): Promise<MicrophonePermission> => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      setPermissionState("unsupported");
      return "unsupported";
    }

    try {
      const permissionStatus = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });

      if (permissionStatusRef.current !== permissionStatus) {
        permissionStatusRef.current?.removeEventListener("change", handlePermissionChange);
        permissionStatusRef.current = permissionStatus;
        permissionStatus.addEventListener("change", handlePermissionChange);
      }

      const next = permissionStatus.state as MicrophonePermission;
      setPermissionState(next);
      return next;
    } catch {
      // Safari and Firefox may not expose the microphone permission name consistently.
      setPermissionState("unsupported");
      return "unsupported";
    }
  }, [handlePermissionChange, setPermissionState]);

  const requestStream = useCallback(async (deviceId?: string) => {
    const environmentError = getEnvironmentError();
    if (environmentError) {
      setErrorMessage(environmentError.message);
      setState(environmentError.state);
      return;
    }

    setErrorMessage("");
    setState("requesting");

    // Stop the previous stream before opening another; this also avoids overlapping streams on iOS Safari.
    stopResources();
    const requestId = requestIdRef.current;

    let pendingAudioContext: AudioContext | null = null;
    let resumeAudioContext: Promise<void> = Promise.resolve();

    try {
      const AudioContextConstructor =
        window.AudioContext || (window as ExtendedWindow).webkitAudioContext;

      if (AudioContextConstructor) {
        try {
          pendingAudioContext = new AudioContextConstructor();
          // Resume during this user gesture for browsers that suspend new audio contexts.
          resumeAudioContext = pendingAudioContext.resume().catch(() => undefined);
        } catch {
          pendingAudioContext = null;
        }
      }

      const audio: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      };

      const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });

      if (!mountedRef.current || requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        if (pendingAudioContext && pendingAudioContext.state !== "closed") {
          void pendingAudioContext.close().catch(() => undefined);
        }
        return;
      }

      streamRef.current = stream;
      audioContextRef.current = pendingAudioContext;

      stream.getAudioTracks().forEach((track) => {
        track.addEventListener("ended", () => {
          if (streamRef.current !== stream) return;
          stopResources();
          setErrorMessage("The microphone was disconnected. Reconnect it or choose another input device.");
          setState("unavailable");
          void updateDevices();
        }, { once: true });
      });

      if (pendingAudioContext) {
        try {
          await resumeAudioContext;
          const source = pendingAudioContext.createMediaStreamSource(stream);
          const analyser = pendingAudioContext.createAnalyser();
          analyser.fftSize = 512;
          source.connect(analyser);
          sourceRef.current = source;
          analyserRef.current = analyser;

          const samples = new Uint8Array(analyser.fftSize);
          const measure = (time: number) => {
            if (!mountedRef.current || streamRef.current !== stream || !analyserRef.current) return;

            analyserRef.current.getByteTimeDomainData(samples);
            let sum = 0;
            for (const sample of samples) {
              const normalized = (sample - 128) / 128;
              sum += normalized * normalized;
            }

            if (time - meterUpdateAtRef.current >= 90) {
              meterUpdateAtRef.current = time;
              setLevel(Math.min(1, Math.sqrt(sum / samples.length) * 3.2));
            }
            animationFrameRef.current = requestAnimationFrame(measure);
          };

          animationFrameRef.current = requestAnimationFrame(measure);
        } catch {
          // Microphone access remains active even if this browser cannot provide an audio level meter.
          setLevel(0);
        }
      }

      const activeTrack = stream.getAudioTracks()[0];
      const actualDeviceId = activeTrack?.getSettings().deviceId || deviceId || "";
      if (actualDeviceId) setSelectedDeviceId(actualDeviceId);

      setMuted(false);
      setState("active");
      setPermissionState("granted");
      await updateDevices();
    } catch (error) {
      if (pendingAudioContext && pendingAudioContext.state !== "closed") {
        void pendingAudioContext.close().catch(() => undefined);
      }
      const mapped = mapMicrophoneError(error);
      setErrorMessage(mapped.message);
      setState(mapped.state);
      if (mapped.state === "denied") setPermissionState("denied");
    }
  }, [setPermissionState, setState, stopResources, updateDevices]);

  const start = useCallback(async () => {
    const environmentError = getEnvironmentError();
    if (environmentError) {
      setErrorMessage(environmentError.message);
      setState(environmentError.state);
      return;
    }

    const currentPermission = await refreshPermission();
    if (currentPermission === "denied") {
      setErrorMessage("Microphone access is blocked for this website. Follow the browser steps below to allow it, then check permission again.");
      setState("denied");
      setSoftPromptOpen(false);
      return;
    }

    if (currentPermission === "granted") {
      setSoftPromptOpen(false);
      await requestStream(selectedDeviceId || undefined);
      return;
    }

    setErrorMessage("");
    setSoftPromptOpen(true);
  }, [refreshPermission, requestStream, selectedDeviceId, setState]);

  const continueStart = useCallback(async () => {
    setSoftPromptOpen(false);
    await requestStream(selectedDeviceId || undefined);
  }, [requestStream, selectedDeviceId]);

  const cancelPrompt = useCallback(() => setSoftPromptOpen(false), []);

  const stop = useCallback(() => {
    setSoftPromptOpen(false);
    stopResources();
    setErrorMessage("");
    setState("idle");
  }, [setState, stopResources]);

  const toggleMute = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || stateRef.current !== "active") return;

    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
  }, [muted]);

  const selectDevice = useCallback(async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (stateRef.current === "active") {
      await requestStream(deviceId || undefined);
    }
  }, [requestStream]);

  const checkPermissionAgain = useCallback(async () => {
    const next = await refreshPermission();
    if (next === "denied") {
      setErrorMessage("Microphone access is still blocked. Update the site permission in your browser, then try again.");
      setState("denied");
      return;
    }
    setErrorMessage("");
    if (stateRef.current === "denied") setState("idle");
  }, [refreshPermission, setState]);

  useEffect(() => {
    mountedRef.current = true;
    void refreshPermission().then((currentPermission) => {
      if (currentPermission === "denied" && mountedRef.current) {
        setErrorMessage("Microphone access is blocked for this website. Follow the browser steps below to allow it, then check permission again.");
        setState("denied");
      }
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && streamRef.current) {
        stopResources();
        setState("idle");
        setErrorMessage("Microphone stopped because this page became hidden.");
      }
    };

    const handlePageHide = () => {
      stopResources();
      setState("idle");
    };

    const handleDeviceChange = () => {
      void updateDevices();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange);

    return () => {
      mountedRef.current = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange);
      permissionStatusRef.current?.removeEventListener("change", handlePermissionChange);
      permissionStatusRef.current = null;
      stopResources();
    };
  }, [handlePermissionChange, refreshPermission, setState, stopResources, updateDevices]);

  return {
    state,
    permission,
    permissionKnown,
    softPromptOpen,
    errorMessage,
    devices,
    selectedDeviceId,
    muted,
    level,
    start,
    continueStart,
    cancelPrompt,
    stop,
    toggleMute,
    selectDevice,
    checkPermissionAgain,
  };
}
