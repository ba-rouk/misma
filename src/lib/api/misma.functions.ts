import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { ensureWorkspace } from "./workspace-context.server";

type WorkspaceAsset = {
  id: string;
  messageId: number;
  conversationId: number;
  role: string;
  text: string;
  created_at: string;
  kind: string;
  name: string;
  mimeType: string;
  size: number;
  path: string;
  url: string;
  libraryFileId?: string;
};

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
    const [workspaceResult, conversationsResult, ordersResult, knowledgeResult, customersResult, websitesResult, handoffsResult, notificationsResult, productsResult, channelConnectionsResult] =
      await Promise.all([
        db.from("workspaces").select("id,name,location,description,opening_hours,primary_language").eq("id", workspaceId).single(),
        db.from("conversations").select("id,channel,latest_text,status,updated_at,group_name,contact_id,website_connection_id").eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(200),
        db.from("orders").select("id,item,total_rwf,status,created_at,contacts(name)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
        db.from("knowledge_entries").select("id,question,answer,source_type,source_ref").eq("workspace_id", workspaceId).eq("approved", true).order("id", { ascending: false }),
        db.from("contacts").select("id,name,email,phone,source,orders_count,lifetime_value_rwf,last_interaction").eq("workspace_id", workspaceId).order("last_interaction", { ascending: false }),
        db.from("website_connections").select("id,name,website_url,domain,public_key,widget_public_key,instagram_url,whatsapp_country_code,whatsapp_number,whatsapp_message,widget_deleted_at,status,last_seen_at,last_scanned_at,created_at").eq("workspace_id", workspaceId).is("widget_deleted_at", null).order("created_at", { ascending: false }),
        db.from("human_requests").select("id,conversation_id,contact_id,visitor_name,visitor_email,visitor_phone,reason,status,created_at,handled_at,conversations(channel,latest_text,updated_at),contacts(name,email,phone)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
        db.from("workspace_notifications").select("id,notification_type,title,body,conversation_id,contact_id,human_request_id,website_connection_id,is_read,created_at").eq("workspace_id", workspaceId).eq("notification_type", "human_request").order("created_at", { ascending: false }).limit(200),
        db.from("products_services").select("id,item_type,name,description,price_text,active,created_from,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
        db.from("channel_connections").select("id,channel,provider,display_name,external_id,phone_number,status,created_at").eq("workspace_id", workspaceId),
      ]);
    const workspace = check(workspaceResult.data, workspaceResult.error);
    const rawConversations = check(conversationsResult.data, conversationsResult.error);
    const websites = check(websitesResult.data, websitesResult.error);
    const handoffs = check(handoffsResult.data, handoffsResult.error);
    const notifications = check(notificationsResult.data, notificationsResult.error);
    const products = check(productsResult.data, productsResult.error);
    const channelConnections = check(channelConnectionsResult.data, channelConnectionsResult.error);
    const conversationIds = rawConversations.map((conversation: any) => conversation.id);
    const visitorConversationIds = rawConversations
      .filter((conversation: any) => String(conversation.channel || "").trim().toLowerCase() !== "dashboard")
      .map((conversation: any) => Number(conversation.id));

    // Resolve recent chat labels and visitor unread counts in the same round trip.
    // Previously these database reads ran one after another, delaying the dashboard.
    const [promptRowsResult, unreadCountResult, unreadRowsResult] = await Promise.all([
      conversationIds.length
        ? db.from("messages").select("conversation_id,id,text")
          .in("conversation_id", conversationIds)
          .in("role", ["human", "customer"])
          .order("id", { ascending: true })
          .limit(10000)
        : Promise.resolve({ data: [] as any[], error: null }),
      visitorConversationIds.length
        ? db.from("messages").select("id", { count: "exact", head: true })
          .in("conversation_id", visitorConversationIds)
          .eq("role", "customer")
          .is("read_at", null)
        : Promise.resolve({ count: 0, error: null }),
      visitorConversationIds.length
        ? db.from("messages").select("id,conversation_id,text,created_at")
          .in("conversation_id", visitorConversationIds)
          .eq("role", "customer")
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(50)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    if (promptRowsResult.error) throw new Error("Could not load recent chat titles.");
    if (unreadCountResult.error) throw new Error("Could not count unread visitor messages.");
    if (unreadRowsResult.error) throw new Error("Could not load unread visitor messages.");

    const promptTitles = new Map<number, string>();
    for (const row of promptRowsResult.data ?? []) {
      const id = Number(row.conversation_id);
      if (!promptTitles.has(id)) promptTitles.set(id, String(row.text || ""));
    }

    const cleanConversationTitle = (value: unknown): string => {
      const cleaned = String(value ?? "")
        .replace(/^(?:(?:customer|visitor|user|human|contact|lead)\s*(?::|#|-)\s*)+/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned || /^(?:customer|visitor|user|human|contact|lead)(?:\s*[:#-].*)?$/i.test(cleaned)) return "";
      if (/^(?:customer|visitor|user|human)[-_ ]+[0-9a-f-]{6,}$/i.test(cleaned)) return "";
      return cleaned.slice(0, 72);
    };
    const conversations = rawConversations.map((c: any) => ({
      id: c.id,
      channel: c.channel,
      text: c.latest_text,
      status: c.status,
      updated_at: c.updated_at,
      name: cleanConversationTitle(promptTitles.get(Number(c.id))) || cleanConversationTitle(c.latest_text) || "New chat",
      group_name: c.group_name || null,
    }));

    const unreadVisitorCount = unreadCountResult.count ?? 0;
    const conversationById = new Map<number, any>(rawConversations.map((conversation: any) => [Number(conversation.id), conversation] as const));
    const unreadVisitorMessages = (unreadRowsResult.data ?? []).map((message: any) => {
      const conversationId = Number(message.conversation_id);
      const conversation = conversationById.get(conversationId);
      return {
        id: Number(message.id),
        conversationId,
        text: String(message.text || ""),
        created_at: String(message.created_at || ""),
        channel: String(conversation?.channel || "Website"),
        conversationTitle: cleanConversationTitle(promptTitles.get(conversationId)) || "Website visitor",
      };
    });

    const orders = check(ordersResult.data, ordersResult.error).map((o: any) => ({
      id: String(o.id), item: o.item, total_rwf: o.total_rwf, status: o.status,
      customer: Array.isArray(o.contacts) ? o.contacts[0]?.name || "Customer" : o.contacts?.name || "Customer",
    }));
    const knowledge = check(knowledgeResult.data, knowledgeResult.error);
    const customers = check(customersResult.data, customersResult.error);
    return {
      workspace, conversations, orders, knowledge, customers, assets: [],
      unreadVisitorMessages, unreadVisitorCount, websites, handoffs, notifications, products, channelConnections,
    };
  });

/**
 * Load signed media URLs only when the Images or Library view is opened.
 * These queries and storage signing calls are intentionally kept off the
 * dashboard's critical chat / notification bootstrap path.
 */
export const getWorkspaceAssets = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const [conversationsResult, libraryFilesResult] = await Promise.all([
      db.from("conversations").select("id")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false })
        .limit(200),
      db.from("workspace_library_files")
        .select("id,storage_path,file_name,mime_type,file_size,created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(200),
    ]);
    const conversations = check(conversationsResult.data, conversationsResult.error);
    const libraryFiles = check(libraryFilesResult.data, libraryFilesResult.error);
    const conversationIds = conversations.map((conversation: any) => conversation.id);

    const assetRowsResult = conversationIds.length
      ? await db.from("messages")
        .select("id,conversation_id,role,text,created_at,attachments")
        .in("conversation_id", conversationIds)
        .order("id", { ascending: false })
        .limit(250)
      : { data: [] as any[], error: null };
    if (assetRowsResult.error) throw new Error("Could not load your workspace media library.");

    const assetJobs: Array<Promise<WorkspaceAsset | null>> = [];
    for (const row of assetRowsResult.data ?? []) {
      const attachments: unknown[] = Array.isArray(row.attachments) ? row.attachments : [];
      attachments.forEach((rawAttachment, index) => {
        if (!rawAttachment || typeof rawAttachment !== "object" || Array.isArray(rawAttachment)) return;
        const item = rawAttachment as Record<string, unknown>;
        const kind = typeof item.kind === "string" ? item.kind : "file";
        if (kind === "video-frame" || kind === "video-job") return;
        const path = typeof item.path === "string" && item.path.startsWith(`${workspaceId}/`)
          ? item.path
          : "";
        const originalUrl = typeof item.url === "string" && /^https:\/\//i.test(item.url)
          ? item.url
          : "";
        if (!path && !originalUrl) return;

        assetJobs.push((async () => {
          let url = originalUrl;
          if (path) {
            const { data: signed } = await db.storage.from("misma-media").createSignedUrl(path, 3600);
            if (signed?.signedUrl) url = signed.signedUrl;
          }
          if (!url) return null;
          return {
            id: String(row.id) + "-" + index,
            messageId: Number(row.id),
            conversationId: Number(row.conversation_id),
            role: typeof row.role === "string" ? row.role : "",
            text: typeof row.text === "string" ? row.text : "",
            created_at: typeof row.created_at === "string" ? row.created_at : "",
            kind,
            name: typeof item.name === "string" ? item.name : "Workspace file",
            mimeType: typeof item.mimeType === "string" ? item.mimeType : "",
            size: typeof item.size === "number" && Number.isFinite(item.size) ? item.size : 0,
            path,
            url,
          };
        })());
      });
    }

    const [conversationAssets, libraryAssets] = await Promise.all([
      (async () => {
        const signedAssets: WorkspaceAsset[] = [];
        for (let index = 0; index < assetJobs.length; index += 30) {
          const batch = await Promise.all(assetJobs.slice(index, index + 30));
          signedAssets.push(...batch.filter((asset): asset is WorkspaceAsset => asset !== null));
        }
        return signedAssets;
      })(),
      Promise.all(libraryFiles.map(async (row: any): Promise<WorkspaceAsset | null> => {
        const { data: signed, error } = await db.storage.from("misma-media").createSignedUrl(row.storage_path, 3600);
        if (error || !signed?.signedUrl) return null;
        const mimeType = String(row.mime_type || "application/octet-stream");
        const kind = mimeType.startsWith("image/") ? "image" : mimeType.startsWith("video/") ? "video" : "file";
        return {
          id: "library-" + String(row.id),
          libraryFileId: String(row.id),
          messageId: 0,
          conversationId: 0,
          role: "library",
          text: "",
          created_at: String(row.created_at || ""),
          kind,
          name: String(row.file_name || "Library file"),
          mimeType,
          size: Number(row.file_size || 0),
          path: String(row.storage_path),
          url: signed.signedUrl,
        };
      })),
    ]);

    return {
      assets: [
        ...conversationAssets.filter((asset): asset is WorkspaceAsset => asset !== null),
        ...libraryAssets.filter((asset): asset is WorkspaceAsset => asset !== null),
      ],
    };
  });

export const getWorkspaceLiveUpdates = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const [websitesResult, handoffsResult, notificationsResult, customersResult, conversationsResult, channelsResult] =
      await Promise.all([
        db.from("website_connections").select("id,name,website_url,domain,public_key,status,last_seen_at,last_scanned_at,created_at")
          .eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
        db.from("human_requests").select("id,conversation_id,contact_id,visitor_name,visitor_email,visitor_phone,reason,status,created_at,handled_at,conversations(channel,latest_text,updated_at),contacts(name,email,phone)")
          .eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
        db.from("workspace_notifications").select("id,notification_type,title,body,conversation_id,contact_id,human_request_id,website_connection_id,is_read,created_at")
          .eq("workspace_id", workspaceId).eq("notification_type", "human_request").order("created_at", { ascending: false }).limit(200),
        db.from("contacts").select("id,name,email,phone,source,orders_count,lifetime_value_rwf,last_interaction")
          .eq("workspace_id", workspaceId).order("last_interaction", { ascending: false }),
        db.from("conversations").select("id,channel,latest_text,status,updated_at,group_name")
          .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }).limit(200),
        db.from("channel_connections").select("id,channel,provider,display_name,external_id,phone_number,status,created_at")
          .eq("workspace_id", workspaceId),
      ]);
    return {
      websites: check(websitesResult.data, websitesResult.error),
      handoffs: check(handoffsResult.data, handoffsResult.error),
      notifications: check(notificationsResult.data, notificationsResult.error),
      customers: check(customersResult.data, customersResult.error),
      conversations: check(conversationsResult.data, conversationsResult.error),
      channelConnections: check(channelsResult.data, channelsResult.error),
    };
  });

export const markHumanRequestNotificationRead = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, notificationId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: notification, error } = await db.from("workspace_notifications")
      .update({ is_read: true })
      .eq("id", data.notificationId)
      .eq("workspace_id", workspaceId)
      .eq("notification_type", "human_request")
      .select("id")
      .single();
    const saved = check(notification, error);
    return { ok: true, notificationId: Number(saved.id) };
  });

export const getVisitorNotifications = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: conversations, error: conversationsError } = await db.from("conversations")
      .select("id,channel,latest_text")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(200);
    if (conversationsError) throw new Error("Could not load visitor notification conversations.");
    const visitorConversations = (conversations ?? []).filter(
      (conversation: any) => String(conversation.channel || "").trim().toLowerCase() !== "dashboard",
    );
    const conversationIds = visitorConversations.map((conversation: any) => Number(conversation.id));
    if (!conversationIds.length) return { unreadVisitorMessages: [], unreadVisitorCount: 0 };

    const [countResult, messagesResult, promptResult] = await Promise.all([
      db.from("messages").select("id", { count: "exact", head: true })
        .in("conversation_id", conversationIds)
        .eq("role", "customer")
        .is("read_at", null),
      db.from("messages").select("id,conversation_id,text,created_at")
        .in("conversation_id", conversationIds)
        .eq("role", "customer")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(50),
      db.from("messages").select("conversation_id,id,text")
        .in("conversation_id", conversationIds)
        .in("role", ["human", "customer"])
        .order("id", { ascending: true })
        .limit(10000),
    ]);
    if (countResult.error) throw new Error("Could not count unread visitor messages.");
    if (messagesResult.error) throw new Error("Could not load unread visitor messages.");
    if (promptResult.error) throw new Error("Could not load visitor conversation titles.");

    const cleanTitle = (value: unknown): string => {
      const cleaned = String(value ?? "")
        .replace(/^(?:(?:customer|visitor|user|human|contact|lead)\s*(?::|#|-)\s*)+/i, "")
        .replace(/\s+/g, " ")
        .trim();
      if (!cleaned || /^(?:customer|visitor|user|human|contact|lead)(?:\s*[:#-].*)?$/i.test(cleaned)) return "";
      if (/^(?:customer|visitor|user|human)[-_ ]+[0-9a-f-]{6,}$/i.test(cleaned)) return "";
      return cleaned.slice(0, 72);
    };
    const titleByConversation = new Map<number, string>();
    for (const row of promptResult.data ?? []) {
      const id = Number(row.conversation_id);
      if (!titleByConversation.has(id)) titleByConversation.set(id, String(row.text || ""));
    }
    const conversationById = new Map<number, any>(
      visitorConversations.map((conversation: any) => [Number(conversation.id), conversation] as const),
    );
    const unreadVisitorMessages = (messagesResult.data ?? []).map((message: any) => {
      const conversationId = Number(message.conversation_id);
      const conversation = conversationById.get(conversationId);
      return {
        id: Number(message.id),
        conversationId,
        text: String(message.text || ""),
        created_at: String(message.created_at || ""),
        channel: String(conversation?.channel || "Website"),
        conversationTitle: cleanTitle(titleByConversation.get(conversationId)) || "Website visitor",
      };
    });
    return { unreadVisitorMessages, unreadVisitorCount: countResult.count ?? 0 };
  });

export const markVisitorMessagesRead = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, conversationId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: conversation, error: conversationError } = await db.from("conversations")
      .select("id")
      .eq("id", data.conversationId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (conversationError || !conversation) throw new Error("Conversation not found.");
    const { data: markedMessages, error } = await db.from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("conversation_id", data.conversationId)
      .eq("role", "customer")
      .is("read_at", null)
      .select("id");
    if (error) throw new Error("Could not mark visitor messages as read.");
    return { ok: true, markedCount: markedMessages?.length ?? 0 };
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

export const createWorkspaceLibraryFile = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    path: z.string().min(1).max(1024),
    name: z.string().trim().min(1).max(180),
    mimeType: z.string().trim().max(180).default("application/octet-stream"),
    size: z.number().int().min(0).max(25 * 1024 * 1024),
  }))
  .handler(async ({ data }) => {
    const { db, user, workspaceId } = await ensureWorkspace(data.token);
    if (!data.path.startsWith(`${workspaceId}/${user.id}/`)) throw new Error("The uploaded file does not belong to this workspace.");
    const result = await db.from("workspace_library_files").insert({
      workspace_id: workspaceId,
      uploaded_by: user.id,
      storage_path: data.path,
      file_name: data.name,
      mime_type: data.mimeType || "application/octet-stream",
      file_size: data.size,
    }).select("id").single();
    const saved = check(result.data, result.error);
    await recordAudit(db, workspaceId, "library.file_uploaded", String(saved.id), { name: data.name, size: data.size });
    return { id: String(saved.id) };
  });

export const deleteWorkspaceLibraryFile = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, id: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const found = await db.from("workspace_library_files").select("id,storage_path,file_name")
      .eq("id", data.id).eq("workspace_id", workspaceId).single();
    if (found.error || !found.data) throw new Error("Library file not found.");
    const removed = await db.from("workspace_library_files").delete()
      .eq("id", data.id).eq("workspace_id", workspaceId);
    if (removed.error) throw new Error(removed.error.message);
    const storage = await db.storage.from("misma-media").remove([found.data.storage_path]);
    if (storage.error) console.warn("Library record deleted but its storage object could not be removed:", storage.error.message);
    await recordAudit(db, workspaceId, "library.file_deleted", data.id, { name: found.data.file_name });
    return { ok: true };
  });

export const deleteChatAttachment = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    conversationId: z.number().int().positive(),
    messageId: z.number().int().positive(),
    path: z.string().max(1024).optional(),
    url: z.string().url().max(4096).optional(),
  }).refine((value) => Boolean(value.path || value.url), { message: "A file path or URL is required." }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const [conversation, message] = await Promise.all([
      db.from("conversations").select("id").eq("id", data.conversationId).eq("workspace_id", workspaceId).single(),
      db.from("messages").select("id,conversation_id,attachments").eq("id", data.messageId).eq("conversation_id", data.conversationId).single(),
    ]);
    if (conversation.error || !conversation.data || message.error || !message.data) throw new Error("Chat attachment not found.");
    const attachments: unknown[] = Array.isArray(message.data.attachments) ? message.data.attachments : [];
    let removedPath = "";
    let found = false;
    const next = attachments.filter((raw) => {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
      const item = raw as Record<string, unknown>;
      const matches = data.path
        ? item.path === data.path
        : item.url === data.url;
      if (matches && !found) {
        found = true;
        if (typeof item.path === "string" && item.path.startsWith(`${workspaceId}/`)) removedPath = item.path;
        return false;
      }
      return true;
    });
    if (!found) throw new Error("This media item is no longer attached to that chat.");
    const updated = await db.from("messages").update({ attachments: next })
      .eq("id", data.messageId).eq("conversation_id", data.conversationId);
    if (updated.error) throw new Error(updated.error.message);
    if (removedPath) {
      const storage = await db.storage.from("misma-media").remove([removedPath]);
      if (storage.error) console.warn("Chat attachment removed but storage cleanup failed:", storage.error.message);
    }
    await recordAudit(db, workspaceId, "chat.attachment_deleted", String(data.messageId), { path: data.path || null });
    return { ok: true };
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


export const createWebsiteConnection = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    name: z.string().trim().max(120).optional(),
    websiteUrl: z.string().url().max(2048),
    sharedWidgetKey: z.string().uuid().optional(),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const parsed = new URL(data.websiteUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Use an HTTP or HTTPS website URL.");
    const websiteUrl = parsed.origin;
    let widgetPublicKey: `${string}-${string}-${string}-${string}-${string}` = crypto.randomUUID();
    if (data.sharedWidgetKey) {
      const existingWidget = await db.from("website_connections").select("id")
        .eq("workspace_id", workspaceId).eq("widget_public_key", data.sharedWidgetKey)
        .is("widget_deleted_at", null).limit(1).maybeSingle();
      if (existingWidget.error || !existingWidget.data) throw new Error("Choose an active shared widget from this workspace.");
      widgetPublicKey = data.sharedWidgetKey as typeof widgetPublicKey;
    }
    const result = await db.from("website_connections").insert({
      workspace_id: workspaceId,
      name: data.name?.trim() || parsed.hostname,
      website_url: websiteUrl,
      domain: parsed.hostname.toLowerCase(),
      widget_public_key: widgetPublicKey,
      status: "pending",
    }).select("id,name,website_url,domain,public_key,widget_public_key,status,last_seen_at,last_scanned_at,created_at").single();
    const website = check(result.data, result.error);
    await recordAudit(db, workspaceId, "website.connection_created", website.id, { domain: website.domain, sharedWidget: Boolean(data.sharedWidgetKey) });
    return { website };
  });

export const shareWebsiteWidgetAcrossWorkspace = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const websites = await db.from("website_connections").select("id,public_key,widget_public_key")
      .eq("workspace_id", workspaceId).is("widget_deleted_at", null).order("created_at", { ascending: true });
    if (websites.error) throw new Error("Could not load connected websites.");
    if (!websites.data?.length) throw new Error("Register at least one website first.");
    const sharedKey = websites.data[0].widget_public_key || websites.data[0].public_key;
    if (!sharedKey) throw new Error("The first website has no widget key.");
    const update = await db.from("website_connections").update({ widget_public_key: sharedKey })
      .eq("workspace_id", workspaceId).is("widget_deleted_at", null);
    if (update.error) throw new Error("Could not apply the shared widget to every website: " + update.error.message);
    await recordAudit(db, workspaceId, "website.widget_shared", sharedKey, { websiteCount: websites.data.length });
    return { widgetPublicKey: sharedKey, websiteCount: websites.data.length };
  });


export const saveWebsiteSocialLinks = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    websiteId: z.string().uuid(),
    instagramUrl: z.string().url().max(2048).nullable(),
    whatsappCountryCode: z.string().regex(/^\d{1,4}$/).nullable(),
    whatsappNumber: z.string().regex(/^\d{6,14}$/).nullable(),
    whatsappMessage: z.string().max(1000).nullable(),
  }))
  .handler(async ({ data }) => {
    const { db, user, workspaceId } = await ensureWorkspace(data.token);
    const workspaceResult = await db.from("workspaces").select("owner_id").eq("id", workspaceId).single();
    if (workspaceResult.error || workspaceResult.data?.owner_id !== user.id) {
      throw new Error("Only the workspace owner can edit website social links.");
    }

    let instagramUrl: string | null = null;
    if (data.instagramUrl) {
      const parsed = new URL(data.instagramUrl);
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const segments = parsed.pathname.split("/").filter(Boolean);
      if (host !== "instagram.com" || parsed.protocol !== "https:" || segments.length !== 1 || !/^[A-Za-z0-9._]{1,30}$/.test(segments[0])) {
        throw new Error("Only a valid https://instagram.com/<handle> profile URL is accepted.");
      }
      instagramUrl = "https://instagram.com/" + segments[0];
    }

    const countryCode = data.whatsappCountryCode?.replace(/\D/g, "") || null;
    const whatsappNumber = data.whatsappNumber?.replace(/\D/g, "").replace(/^0+/, "") || null;
    let whatsappMessage: string | null = null;
    if (countryCode || whatsappNumber || data.whatsappMessage?.trim()) {
      if (!countryCode || !whatsappNumber || countryCode.length > 4 || countryCode.length + whatsappNumber.length < 7 || countryCode.length + whatsappNumber.length > 15) {
        throw new Error("A valid WhatsApp country code and phone number totaling 7–15 digits are required.");
      }
      whatsappMessage = data.whatsappMessage?.trim() || null;
      if (!whatsappMessage) throw new Error("A WhatsApp welcome message is required.");
    }

    const update = await db.from("website_connections").update({
      instagram_url: instagramUrl,
      whatsapp_country_code: whatsappNumber ? countryCode : null,
      whatsapp_number: whatsappNumber,
      whatsapp_message: whatsappNumber ? whatsappMessage : null,
      updated_at: new Date().toISOString(),
    }).eq("id", data.websiteId).eq("workspace_id", workspaceId)
      .is("widget_deleted_at", null)
      .select("id,instagram_url,whatsapp_country_code,whatsapp_number,whatsapp_message")
      .single();

    if (update.error || !update.data) {
      throw new Error(update.error?.message || "Could not save the website social links.");
    }
    await recordAudit(db, workspaceId, "website.social_links_updated", data.websiteId, {
      instagram: Boolean(update.data.instagram_url),
      whatsapp: Boolean(update.data.whatsapp_number),
    });
    return { website: update.data };
  });

export const deleteWebsiteConnection = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, websiteId: z.string().uuid() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const result = await db.from("website_connections").update({
      status: "paused",
      widget_deleted_at: new Date().toISOString(),
      widget_public_key: crypto.randomUUID(),
    }).eq("id", data.websiteId).eq("workspace_id", workspaceId)
      .is("widget_deleted_at", null).select("id,domain").maybeSingle();
    if (result.error || !result.data) throw new Error("Could not remove this website widget.");
    await recordAudit(db, workspaceId, "website.widget_removed", result.data.id, { domain: result.data.domain });
    return { ok: true, websiteId: result.data.id };
  });

export const createProductService = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    kind: z.enum(["product", "service"]),
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000).default(""),
    price: z.string().trim().max(120).default(""),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const result = await db.from("products_services").insert({
      workspace_id: workspaceId,
      item_type: data.kind,
      name: data.name,
      description: data.description,
      price_text: data.price,
      active: true,
      created_from: "manual",
    }).select("id,item_type,name,description,price_text,active,created_from,created_at").single();
    const product = check(result.data, result.error);
    await recordAudit(db, workspaceId, "product_service.created", String(product.id), { kind: data.kind, name: data.name });
    return { product };
  });


export const updateHumanRequestStatus = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    requestId: z.number().int().positive(),
    status: z.enum(["pending", "handled"]),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: request, error } = await db.from("human_requests")
      .update({
        status: data.status,
        handled_at: data.status === "handled" ? new Date().toISOString() : null,
      })
      .eq("id", data.requestId)
      .eq("workspace_id", workspaceId)
      .select("id,conversation_id,status,handled_at")
      .single();
    const saved = check(request, error);
    if (data.status === "handled") {
      await db.from("conversations").update({ status: "AI", updated_at: new Date().toISOString() })
        .eq("id", saved.conversation_id).eq("workspace_id", workspaceId);
    } else {
      await db.from("conversations").update({ status: "Needs you", updated_at: new Date().toISOString() })
        .eq("id", saved.conversation_id).eq("workspace_id", workspaceId);
    }
    return { request: saved };
  });

export const updateProductServiceStatus = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    productId: z.number().int().positive(),
    active: z.boolean(),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: product, error } = await db.from("products_services")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.productId)
      .eq("workspace_id", workspaceId)
      .select("id,item_type,name,description,price_text,active,created_from,created_at")
      .single();
    const saved = check(product, error);
    await recordAudit(db, workspaceId, "product_service.status_changed", String(saved.id), { active: data.active });
    return { product: saved };
  });
