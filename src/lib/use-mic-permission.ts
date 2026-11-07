import { useCallback, useEffect, useRef, useState } from "react";

export const MISMA_ORIGIN_LABEL = "misma.onrender.com";
export const MISMA_MIC_PREFERENCE_KEY = "misma_microphone_never_allow";

export type MicPermissionValue = "checking" | "granted" | "denied" | "prompt" | "unsupported";
export type MicPermissionDialogView = "permission" | "blocked" | "no-device" | "insecure" | "unsupported";
export type MicStartAction = () => void | Promise<unknown>;

function readNeverAllowPreference(): boolean {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(MISMA_MIC_PREFERENCE_KEY) === "1";
  } catch {
    return false;
  }
}

function getErrorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error
    ? String((error as { name: unknown }).name)
    : "";
}

export function useMicPermission() {
  const [permission, setPermission] = useState<MicPermissionValue>("checking");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogView, setDialogView] = useState<MicPermissionDialogView>("permission");
  const [neverAllowed, setNeverAllowed] = useState(readNeverAllowPreference);
  const [requesting, setRequesting] = useState(false);

  const permissionRef = useRef<MicPermissionValue>("checking");
  const pendingActionRef = useRef<MicStartAction | null>(null);
  const permissionStatusRef = useRef<PermissionStatus | null>(null);

  const setPermissionValue = useCallback((next: MicPermissionValue) => {
    permissionRef.current = next;
    setPermission(next);
  }, []);

  useEffect(() => {
    let active = true;

    const readPermission = async () => {
      if (typeof navigator === "undefined" || !navigator.permissions?.query) {
        if (active) setPermissionValue("unsupported");
        return;
      }

      try {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (!active) return;

        permissionStatusRef.current = status;
        setPermissionValue(status.state as MicPermissionValue);
        const onChange = () => {
          setPermissionValue(status.state as MicPermissionValue);
        };
        status.addEventListener("change", onChange);
        cleanupPermissionListener = () => status.removeEventListener("change", onChange);
      } catch {
        if (active) setPermissionValue("unsupported");
      }
    };

    let cleanupPermissionListener: () => void = () => undefined;
    void readPermission();

    return () => {
      active = false;
      cleanupPermissionListener();
      permissionStatusRef.current = null;
    };
  }, [setPermissionValue]);

  const closeDialog = useCallback(() => {
    pendingActionRef.current = null;
    setRequesting(false);
    setDialogOpen(false);
  }, []);

  const showFailure = useCallback((error: unknown) => {
    const name = getErrorName(error);
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setDialogView("insecure");
    } else if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      setDialogView("no-device");
    } else if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
      setPermissionValue("denied");
      setDialogView("blocked");
    } else if (name === "TypeError" || name === "NotSupportedError") {
      setDialogView("unsupported");
    } else {
      setDialogView("blocked");
    }
    setRequesting(false);
    setDialogOpen(true);
  }, [setPermissionValue]);

  const requestAndContinue = useCallback(() => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setDialogView("insecure");
      setDialogOpen(true);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setDialogView("unsupported");
      setDialogOpen(true);
      return;
    }

    // Invoke getUserMedia before any await so the browser receives this click's user activation.
    let request: Promise<MediaStream>;
    try {
      request = navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (error) {
      showFailure(error);
      return;
    }

    setRequesting(true);
    void request.then((stream) => {
      stream.getTracks().forEach((track) => track.stop());
      try {
        window.localStorage.removeItem(MISMA_MIC_PREFERENCE_KEY);
      } catch {
        // Browser storage may be unavailable; microphone access still follows browser permission.
      }
      setNeverAllowed(false);
      setPermissionValue("granted");
      setRequesting(false);
      setDialogOpen(false);

      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action) void Promise.resolve(action()).catch(() => undefined);
    }).catch(showFailure);
  }, [setPermissionValue, showFailure]);

  const runWithPermission = useCallback((action: MicStartAction) => {
    pendingActionRef.current = action;

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setDialogView("insecure");
      setDialogOpen(true);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setDialogView("unsupported");
      setDialogOpen(true);
      return;
    }

    if (neverAllowed) {
      setDialogView("permission");
      setDialogOpen(true);
      return;
    }

    const current = permissionRef.current;
    if (current === "prompt" || current === "denied" || current === "checking") {
      setDialogView("permission");
      setDialogOpen(true);
      return;
    }

    // Granted permissions are preflighted without showing Misma's dialog. Browsers
    // without a microphone Permissions API use this same direct getUserMedia fallback.
    requestAndContinue();
  }, [neverAllowed, requestAndContinue]);

  const allow = useCallback(() => {
    requestAndContinue();
  }, [requestAndContinue]);

  const neverAllow = useCallback(() => {
    try {
      window.localStorage.setItem(MISMA_MIC_PREFERENCE_KEY, "1");
    } catch {
      // The preference is best-effort and never changes the browser's permission.
    }
    setNeverAllowed(true);
    closeDialog();
  }, [closeDialog]);

  const dismiss = useCallback(() => {
    closeDialog();
  }, [closeDialog]);

  return {
    permission,
    dialogOpen,
    dialogView,
    neverAllowed,
    requesting,
    runWithPermission,
    allow,
    neverAllow,
    dismiss,
  };
}
