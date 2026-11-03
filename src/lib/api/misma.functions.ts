import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ensureWorkspace } from "./workspace-context.server";

const auth = z.string().min(20);
function check<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("Supabase returned no data.");
  return data;
}

async function recordAudit(
  db: SupabaseClient,
  workspaceId: string,
  eventType: string,
  entityId?: string,
  payload?: Record<string, unknown>,
) {
  const { error } = await db.from("audit_events").insert({
    workspace_id: workspaceId,
    event_type: eventType,
    entity_id: entityId,
    payload,
  });
  if (error) throw new Error(`Could not record workspace activity: ${error.message}`);
}

export const getMismaData = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const [workspaceResult, conversationsResult, ordersResult, knowledgeResult, customersResult] =
      await Promise.all([
        db.from("workspaces").select("id,name,location,description,opening_hours,primary_language").eq("id", workspaceId).single(),
        db.from("conversations").select("id,channel,latest_text,status,updated_at,group_name").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(200),
        db.from("orders").select("id,item,total_rwf,status,created_at,contacts(name)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
        db.from("knowledge_entries").select("id,question,answer").eq("workspace_id", workspaceId).eq("approved", true).order("id", { ascending: false }),
        db.from("contacts").select("id,name,orders_count,lifetime_value_rwf,last_interaction").eq("workspace_id", workspaceId).order("lifetime_value_rwf", { ascending: false }),
      ]);
    const workspace = check(workspaceResult.data, workspaceResult.error);
    const rawConversations = check(conversationsResult.data, conversationsResult.error);
    const conversationIds = rawConversations.map((conversation: any) => conversation.id);
    const promptTitles = new Map<number, string>();
    if (conversationIds.length) {
      const { data: promptRows, error: promptRowsError } = await db.from("messages")
        .select("conversation_id,id,text")
        .in("conversation_id", conversationIds)
        .in("role", ["human", "customer"])
        .order("id", { ascending: true })
        .limit(1000);
      if (promptRowsError) throw new Error("Could not load recent chat titles.");
      for (const row of promptRows ?? []) {
        const id = Number(row.conversation_id);
        if (!promptTitles.has(id)) promptTitles.set(id, String(row.text || ""));
      }
    }
    const conversations = rawConversations.map((c: any) => ({
      id: c.id,
      channel: c.channel,
      text: c.latest_text,
      status: c.status,
      updated_at: c.updated_at,
      name: (promptTitles.get(Number(c.id)) || c.latest_text || "New chat").replace(/^(?:customer|visitor|user|human)\s*[:\-]\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 72) || "New chat",
      group_name: c.group_name || null,
    }));
    const orders = check(ordersResult.data, ordersResult.error).map((o: any) => ({
      id: String(o.id), item: o.item, total_rwf: o.total_rwf, status: o.status,
      customer: Array.isArray(o.contacts) ? o.contacts[0]?.name || "Customer" : o.contacts?.name || "Customer",
    }));
    const knowledge = check(knowledgeResult.data, knowledgeResult.error);
    const customers = check(customersResult.data, customersResult.error);
    return { workspace, conversations, orders, knowledge, customers };
  });

export const addKnowledge = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, question: z.string().trim().min(2).max(500), answer: z.string().trim().min(2).max(4000) }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const result = await db.from("knowledge_entries").insert({ workspace_id: workspaceId, question: data.question, answer: data.answer, approved: true }).select("id,question,answer").single();
    const saved = check(result.data, result.error);
    await recordAudit(db, workspaceId, "knowledge.created", String(saved.id), { question: data.question });
    return { id: saved.id, question: saved.question, answer: saved.answer };
  });

export const deleteKnowledge = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { error } = await db.from("knowledge_entries").delete().eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    await recordAudit(db, workspaceId, "knowledge.deleted", String(data.id));
    return { ok: true };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, id: z.string().min(1), status: z.enum(["New", "Confirmed", "Preparing", "Delivered"]) }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { error } = await db.from("orders").update({ status: data.status }).eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    await recordAudit(db, workspaceId, "order.status_changed", data.id, { status: data.status });
    return { ok: true };
  });

export const takeoverConversation = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { error } = await db.from("conversations").update({ status: "Needs you", latest_text: "Human takeover is active for this customer.", updated_at: new Date().toISOString() }).eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    await recordAudit(db, workspaceId, "conversation.human_takeover", String(data.id));
    return { ok: true };
  });

export const saveWorkspaceProfile = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, name: z.string().trim().min(2).max(120), location: z.string().trim().min(2).max(180), description: z.string().trim().min(2).max(2000), openingHours: z.string().trim().min(2).max(120), primaryLanguage: z.enum(["English", "Kinyarwanda", "French", "Swahili"]) }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const profile = { name: data.name, location: data.location, description: data.description, opening_hours: data.openingHours, primary_language: data.primaryLanguage, updated_at: new Date().toISOString() };
    const { error } = await db.from("workspaces").update(profile).eq("id", workspaceId);
    if (error) throw new Error(error.message);
    await recordAudit(db, workspaceId, "workspace.updated", undefined, profile);
    return { ok: true, workspace: data };
  });

export const getConversationMessages = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, conversationId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: conv, error: convErr } = await db
      .from("conversations")
      .select("id,channel,latest_text,status,created_at,updated_at")
      .eq("id", data.conversationId)
      .eq("workspace_id", workspaceId)
      .single();
    if (convErr || !conv) throw new Error("Conversation not found.");

    const { data: messages, error: msgErr } = await db
      .from("messages")
      .select("id,conversation_id,role,text,created_at,attachments")
      .eq("conversation_id", data.conversationId)
      .order("id", { ascending: true });
    if (msgErr) throw new Error(msgErr.message);

    const mappedMessages = await Promise.all((messages ?? []).map(async (m: any) => {
      const attachments = Array.isArray(m.attachments)
        ? await Promise.all(m.attachments.map(async (item: any) => {
            if (!item || typeof item !== "object" || typeof item.path !== "string" ||
                !item.path.startsWith(`${workspaceId}/`)) return item;
            const { data: signed } = await db.storage
              .from("misma-media")
              .createSignedUrl(item.path, 3600);
            return { ...item, ...(signed?.signedUrl ? { url: signed.signedUrl } : {}) };
          }))
        : [];
      return {
        id: String(m.id),
        role: m.role as "customer" | "ai" | "human" | "system",
        text: m.text as string,
        created_at: m.created_at as string,
        attachments,
      };
    }));

    return { conversation: conv, messages: mappedMessages };
  });

export const createConversation = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, title: z.string().optional() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: conv, error } = await db
      .from("conversations")
      .insert({
        workspace_id: workspaceId,
        channel: "Dashboard",
        latest_text: data.title || "New chat",
        status: "AI",
      })
      .select("id,channel,latest_text,status,created_at,updated_at")
      .single();
    if (error || !conv) throw new Error(error?.message || "Could not start conversation.");
    return { conversation: conv };
  });

export const deleteConversation = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, conversationId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { error } = await db
      .from("conversations")
      .delete()
      .eq("id", data.conversationId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const setConversationGroup = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    conversationId: z.number().int().positive(),
    groupName: z.string().trim().max(60).nullable(),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const normalizedGroup = data.groupName?.trim() || null;
    const { error } = await db.from("conversations")
      .update({ group_name: normalizedGroup })
      .eq("id", data.conversationId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true, groupName: normalizedGroup };
  });
