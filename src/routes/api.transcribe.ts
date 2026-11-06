import { createFileRoute } from "@tanstack/react-router";
import { getSupabaseConfig } from "../lib/supabase";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function errorResponse(status: number, error: string) {
  return Response.json(
    { error },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") || "";
        if (!/^Bearer\s+\S+$/i.test(authorization)) {
          return errorResponse(401, "Sign in to transcribe a voice recording.");
        }

        const contentType = request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) {
          return errorResponse(415, "Send the voice recording as multipart form data.");
        }

        const contentLength = Number(request.headers.get("content-length") || 0);
        if (contentLength > MAX_AUDIO_BYTES + 1024 * 1024) {
          return errorResponse(413, "The recording is larger than 25 MB.");
        }

        const config = getSupabaseConfig();
        if (!config) {
          return errorResponse(500, "Misma's transcription service is not configured.");
        }

        try {
          const incoming = await request.formData();
          const audio = incoming.get("audio");
          if (!(audio instanceof File)) {
            return errorResponse(400, "Choose a voice recording to transcribe.");
          }
          if (!audio.type.startsWith("audio/")) {
            return errorResponse(415, "The uploaded recording must be an audio file.");
          }
          if (audio.size === 0) {
            return errorResponse(400, "The voice recording is empty.");
          }
          if (audio.size > MAX_AUDIO_BYTES) {
            return errorResponse(413, "The recording is larger than 25 MB.");
          }

          const outgoing = new FormData();
          outgoing.set("audio", audio, audio.name || "misma-voice-input");

          const response = await fetch(
            config.url.replace(/\/$/, "") + "/functions/v1/misma-transcribe",
            {
              method: "POST",
              headers: {
                apikey: config.publishableKey,
                Authorization: authorization,
              },
              body: outgoing,
              signal: AbortSignal.timeout(50_000),
            },
          );

          const result = await response.json().catch(() => ({})) as Record<string, unknown>;
          if (!response.ok) {
            const message = typeof result.error === "string"
              ? result.error
              : "Misma could not transcribe this recording. Please try again.";
            return errorResponse(response.status, message);
          }

          const text = typeof result.text === "string" ? result.text.trim() : "";
          if (!text) return errorResponse(502, "No speech was detected in this recording.");
          return Response.json({ text }, { headers: { "Cache-Control": "no-store" } });
        } catch (cause) {
          if (cause instanceof Error && cause.name === "TimeoutError") {
            return errorResponse(504, "Transcription took too long. Please try again with a shorter recording.");
          }
          console.error("[api/transcribe] Request failed.", cause instanceof Error ? cause.name : "unknown");
          return errorResponse(502, "Misma could not transcribe this recording. Please try again.");
        }
      },
    },
  },
});
