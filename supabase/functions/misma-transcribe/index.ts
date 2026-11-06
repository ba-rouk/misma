const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Cache-Control": "no-store" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed." });
  }

  const authorization = request.headers.get("authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return jsonResponse(401, { error: "Sign in to transcribe a voice recording." });
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey =
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY");
  if (!projectUrl || !publishableKey) {
    console.error("[misma-transcribe] Supabase configuration is missing.");
    return jsonResponse(500, { error: "Misma transcription is not configured." });
  }

  const { createClient } = await import("npm:@supabase/supabase-js@2");
  const db = createClient(projectUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await db.auth.getUser(accessToken);
  if (userError || !userData.user) {
    return jsonResponse(401, { error: "Your sign-in session expired. Please sign in again." });
  }

  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) {
    console.error("[misma-transcribe] GROQ_API_KEY is not configured.");
    return jsonResponse(503, { error: "Voice transcription is temporarily unavailable. Please try again later." });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_AUDIO_BYTES + 1024 * 1024) {
    return jsonResponse(413, { error: "The recording is larger than 25 MB." });
  }

  try {
    const formData = await request.formData();
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return jsonResponse(400, { error: "Choose a voice recording to transcribe." });
    }
    if (!audio.type.startsWith("audio/")) {
      return jsonResponse(415, { error: "The uploaded recording must be an audio file." });
    }
    if (audio.size === 0) {
      return jsonResponse(400, { error: "The voice recording is empty." });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return jsonResponse(413, { error: "The recording is larger than 25 MB." });
    }

    const safeName = audio.name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-100) || "misma-voice-input";
    const transcriptionForm = new FormData();
    transcriptionForm.set("file", new File([audio], safeName, { type: audio.type || "audio/webm" }));
    transcriptionForm.set("model", Deno.env.get("GROQ_TRANSCRIPTION_MODEL") || "whisper-large-v3-turbo");
    transcriptionForm.set("response_format", "json");

    const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey },
      body: transcriptionForm,
      signal: AbortSignal.timeout(45_000),
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;

    if (!response.ok) {
      const groqError = typeof payload.error === "object" && payload.error !== null
        ? (payload.error as Record<string, unknown>)
        : {};
      const details = typeof groqError.message === "string"
        ? groqError.message.slice(0, 400)
        : "The transcription provider rejected the recording.";
      console.warn("[misma-transcribe] Provider returned an error.", response.status);
      return jsonResponse(502, { error: details });
    }

    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      return jsonResponse(422, { error: "No speech was detected. Record your message again or type it instead." });
    }
    return jsonResponse(200, { text: text.slice(0, 30_000) });
  } catch (cause) {
    console.error("[misma-transcribe] Transcription failed.", cause instanceof Error ? cause.name : "unknown");
    return jsonResponse(502, { error: "Misma could not transcribe this recording. Please try again." });
  }
});
