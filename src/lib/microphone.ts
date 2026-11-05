export type MicPermission = "granted" | "denied" | "prompt" | "unknown";

export type MicErrorCode =
  | "denied"
  | "no-device"
  | "in-use"
  | "constraints"
  | "insecure"
  | "unsupported"
  | "unknown";

export class MicError extends Error {
  code: MicErrorCode;

  constructor(code: MicErrorCode, message: string) {
    super(message);
    this.name = "MicError";
    this.code = code;
  }
}

const MESSAGES: Record<MicErrorCode, string> = {
  denied:
    "Microphone access is blocked for this site. Allow it in your browser's site settings, then try again.",
  "no-device":
    "No microphone was found. Plug one in or check your system sound settings.",
  "in-use":
    "The microphone is busy. Close other apps or tabs that are using it and try again.",
  constraints:
    "The selected microphone can't be used with these settings.",
  insecure:
    'The microphone needs a secure (HTTPS) page. Also check the Permissions-Policy header and iframe allow="microphone" setting.',
  unsupported:
    "This browser doesn't support microphone access.",
  unknown:
    "Couldn't start the microphone. Please try again.",
};

/** Normalize browser getUserMedia errors into stable, user-facing Misma errors. */
export function toMicError(error: unknown): MicError {
  if (error instanceof MicError) return error;

  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";

  let code: MicErrorCode = "unknown";

  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      code = "denied";
      break;
    case "NotFoundError":
    case "DevicesNotFoundError":
      code = "no-device";
      break;
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      code = "in-use";
      break;
    case "OverconstrainedError":
    case "ConstraintNotSatisfiedError":
      code = "constraints";
      break;
    case "SecurityError":
      code = "insecure";
      break;
    case "TypeError":
      code = "unsupported";
      break;
  }

  return new MicError(code, MESSAGES[code]);
}

/** Read the permission state when the browser exposes the Permissions API. */
export async function getMicPermission(): Promise<MicPermission> {
  try {
    if (
      typeof navigator === "undefined" ||
      !navigator.permissions?.query
    ) {
      return "unknown";
    }

    const status = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });

    return status.state;
  } catch {
    // Safari and Firefox may not support querying microphone permission.
    return "unknown";
  }
}

/**
 * Request the microphone. Call this from the user click/tap handler so that
 * the browser can show its native permission prompt when permission is "prompt".
 * Do not await a permission query before calling getUserMedia().
 */
export async function requestMicStream(
  constraints: MediaTrackConstraints | boolean = true,
): Promise<MediaStream> {
  if (
    typeof window !== "undefined" &&
    !window.isSecureContext
  ) {
    throw new MicError("insecure", MESSAGES.insecure);
  }

  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw new MicError("unsupported", MESSAGES.unsupported);
  }

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: constraints,
      video: false,
    });
  } catch (error) {
    throw toMicError(error);
  }
}

/** Stop every track so the browser's microphone indicator turns off. */
export function stopStream(
  stream: MediaStream | null | undefined,
): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Request access and immediately release the stream. */
export async function ensureMicPermission(): Promise<void> {
  const stream = await requestMicStream();
  stopStream(stream);
}
