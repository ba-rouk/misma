import { createClient } from "npm:@supabase/supabase-js@2";
import { persistMemoryExchange } from "../_shared/memory.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function reply(status: number, payload: Record<string, unknown>): Response {
  return Response.json(payload, { status, headers: { ...corsHeaders, "Cache-Control": "no-store" } });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply(401, { error: "Authentication required." });

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return reply(503, { error: "Memory backfill is not configured." });

  const authClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData.user) return reply(401, { error: "Your session is invalid or expired." });
  const userId = userData.user.id;
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const { data: settings } = await db.from("memory_settings").select("enabled")
      .eq("user_id", userId).maybeSingle();
    if (settings && settings.enabled === false) return reply(403, { error: "Turn on Generate memory from chats before running backfill." });

    const { data: memberships, error: membershipError } = await db.from("workspace_members")
      .select("workspace_id").eq("user_id", userId);
    if (membershipError) throw membershipError;
    const workspaceIds = [...new Set((memberships || []).map((row: any) => String(row.workspace_id)).filter(Boolean))];
    if (!workspaceIds.length) return reply(200, { processed: 0, hasMore: false, message: "No workspace chat history was found." });

    let { data: job } = await db.from("memory_backfill_jobs").select("*")
      .eq("user_id", userId).in("status", ["queued", "running", "paused"])
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!job) {
      const created = await db.from("memory_backfill_jobs").insert({ user_id: userId, status: "queued" }).select("*").single();
      if (created.error || !created.data) throw new Error("Could not create the backfill job.");
      job = created.data;
    }
    const jobId = String(job.id);
    await db.from("memory_backfill_jobs").update({
      status: "running",
      started_at: job.started_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", jobId).eq("user_id", userId);

    const batchSize = 4;
    const { data: conversations, error: conversationsError } = await db.from("conversations")
      .select("id,workspace_id,website_connection_id,incognito,channel")
      .in("workspace_id", workspaceIds)
      .eq("channel", "Dashboard")
      .eq("incognito", false)
      .gt("id", Number(job.cursor_conversation_id || 0))
      .order("id", { ascending: true })
      .limit(batchSize);
    if (conversationsError) throw conversationsError;

    let processed = 0;
    let lastConversationId = Number(job.cursor_conversation_id || 0);
    for (const conversation of conversations || []) {
      lastConversationId = Number(conversation.id);
      const { data: messages, error: messagesError } = await db.from("messages")
        .select("id,role,text")
        .eq("conversation_id", conversation.id)
        .in("role", ["human", "ai"])
        .order("id", { ascending: true })
        .limit(160);
      if (messagesError) continue;
      let pendingUser: any = null;
      for (const message of messages || []) {
        if (message.role === "human") {
          pendingUser = message;
          continue;
        }
        if (message.role !== "ai" || !pendingUser) continue;
        const { data: existing } = await db.from("memory_exchanges").select("id")
          .eq("user_id", userId).eq("source_user_message_id", pendingUser.id).maybeSingle();
        if (!existing) {
          const userText = String(pendingUser.text || "");
          const assistantText = String(message.text || "");
          const toolOutput = /@(github|vercel|render|netlify)\b/i.test(userText) ||
            /(?:tool result|repository files|search results|deployment logs|commit sha|pull request created)/i.test(assistantText);
          const saved = await persistMemoryExchange(db, {
            userId,
            workspaceId: String(conversation.workspace_id),
            websiteId: conversation.website_connection_id ? String(conversation.website_connection_id) : null,
            chatId: Number(conversation.id),
            userMessageId: Number(pendingUser.id),
            assistantMessageId: Number(message.id),
            userText,
            assistantText,
            toolOutput,
          });
          if (saved.saved) processed++;
        }
        pendingUser = null;
      }
    }

    const hasMore = (conversations || []).length === batchSize;
    await db.from("memory_backfill_jobs").update({
      status: hasMore ? "paused" : "completed",
      cursor_conversation_id: lastConversationId,
      processed_count: Number(job.processed_count || 0) + processed,
      completed_at: hasMore ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", jobId).eq("user_id", userId);

    return reply(200, {
      jobId,
      processed,
      totalProcessed: Number(job.processed_count || 0) + processed,
      hasMore,
      status: hasMore ? "paused" : "completed",
    });
  } catch (error) {
    console.error("[misma-memory-backfill] Backfill batch failed.", error instanceof Error ? error.name : "unknown");
    return reply(500, { error: "Could not process this memory backfill batch." });
  }
});
