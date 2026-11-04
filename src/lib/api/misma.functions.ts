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
        .limit(10000);
      if (promptRowsError) throw new Error("Could not load recent chat titles.");
      for (const row of promptRows ?? []) {
        const id = Number(row.conversation_id);
        if (!promptTitles.has(id)) promptTitles.set(id, String(row.text || ""));
      }
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

    // Unread customer messages from non-dashboard channels are website visitor notifications.
    const visitorConversationIds = rawConversations
      .filter((conversation: any) => String(conversation.channel || "").trim().toLowerCase() !== "dashboard")
      .map((conversation: any) => Number(conversation.id));
    let unreadVisitorCount = 0;
    let unreadVisitorMessages: Array<{
      id: number;
      conversationId: number;
      text: string;
      created_at: string;
      channel: string;
      conversationTitle: string;
    }> = [];
    if (visitorConversationIds.length) {
      const [unreadCountResult, unreadRowsResult] = await Promise.all([
        db.from("messages").select("id", { count: "exact", head: true })
          .in("conversation_id", visitorConversationIds)
          .eq("role", "customer")
          .is("read_at", null),
        db.from("messages").select("id,conversation_id,text,created_at")
          .in("conversation_id", visitorConversationIds)
          .eq("role", "customer")
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(50),
      ]);
      if (unreadCountResult.error) throw new Error("Could not count unread visitor messages.");
      if (unreadRowsResult.error) throw new Error("Could not load unread visitor messages.");
      unreadVisitorCount = unreadCountResult.count ?? 0;
      const conversationById = new Map<number, any>(rawConversations.map((conversation: any) => [Number(conversation.id), conversation] as const));
      unreadVisitorMessages = (unreadRowsResult.data ?? []).map((message: any) => {
        const conversationId = Number(message.conversation_id);
        const conversation = conversationById.get(conversationId) as any;
        return {
          id: Number(message.id),
          conversationId,
          text: String(message.text || ""),
          created_at: String(message.created_at || ""),
          channel: String(conversation?.channel || "Website"),
          conversationTitle: cleanConversationTitle(promptTitles.get(conversationId)) || "Website visitor",
        };
      });
    }

    // Collect recent chat attachments for the Images and Library views.
    const assets: WorkspaceAsset[] = [];
    if (conversationIds.length) {
      const { data: assetRows, error: assetRowsError } = await db.from("messages")
        .select("id,conversation_id,role,text,created_at,attachments")
        .in("conversation_id", conversationIds)
        .order("id", { ascending: false })
        .limit(600);
      if (assetRowsError) throw new Error("Could not load your workspace media library.");

      const assetJobs: Array<Promise<WorkspaceAsset | null>> = [];
      for (const row of assetRows ?? []) {
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
      assets.push(...(await Promise.all(assetJobs)).filter(
        (asset): asset is WorkspaceAsset => asset !== null,
      ));
    }
    const orders = check(ordersResult.data, ordersResult.error).map((o: any) => ({
      id: String(o.id), item: o.item, total_rwf: o.total_rwf, status: o.status,
      customer: Array.isArray(o.contacts) ? o.contacts[0]?.name || "Customer" : o.contacts?.name || "Customer",
    }));
    const knowledge = check(knowledgeResult.data, knowledgeResult.error);
    const customers = check(customersResult.data, customersResult.error);
    return { workspace, conversations, orders, knowledge, customers, assets, unreadVisitorMessages, unreadVisitorCount };
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
        .replace(/^(?:(?:customer|visitor|user|human|contact|lead)\\s*(?::|#|-)\\s*)+/i, "")
        .replace(/\\s+/g, " ")
        .trim();
      if (!cleaned || /^(?:customer|visitor|user|human|contact|lead)(?:\\s*[:#-].*)?$/i.test(cleaned)) return "";
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


export const getBusinessHubData = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const [websitesResult, handoffsResult, notificationsResult, productsResult] = await Promise.all([
      db.from("website_connections")
        .select("id,name,website_url,domain,public_key,status,last_seen_at,last_scanned_at,created_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      db.from("human_requests")
        .select("id,conversation_id,contact_id,visitor_name,visitor_email,visitor_phone,reason,status,created_at,handled_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(200),
      db.from("workspace_notifications")
        .select("id,notification_type,title,body,conversation_id,contact_id,human_request_id,website_connection_id,is_read,created_at")
        .eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(200),
      db.from("products_services")
        .select("id,item_type,name,description,price_text,active,created_from,created_at,updated_at")
        .eq("workspace_id", workspaceId).order("updated_at", { ascending: false }),
    ]);
    const websites = check(websitesResult.data, websitesResult.error);
    const handoffs = check(handoffsResult.data, handoffsResult.error);
    const notifications = check(notificationsResult.data, notificationsResult.error);
    const products = check(productsResult.data, productsResult.error);
    const contactIds = [...new Set(handoffs.map((item: any) => Number(item.contact_id)).filter((id: number) => Number.isSafeInteger(id) && id > 0))];
    const contactsResult = contactIds.length
      ? await db.from("contacts").select("id,name,email,phone,source").in("id", contactIds).eq("workspace_id", workspaceId)
      : { data: [], error: null };
    const contacts = check(contactsResult.data, contactsResult.error);
    const contactById = new Map<number, any>(contacts.map((contact: any) => [Number(contact.id), contact]));
    return {
      websites,
      handoffs: handoffs.map((item: any) => ({
        ...item,
        contact: contactById.get(Number(item.contact_id)) ?? null,
      })),
      notifications,
      products,
    };
  });

export const createWebsiteConnection = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    name: z.string().trim().min(1).max(100),
    websiteUrl: z.string().trim().url().max(2048),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const parsed = new URL(data.websiteUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
      throw new Error("Enter a valid public website URL beginning with http:// or https://.");
    }
    const websiteUrl = parsed.origin + parsed.pathname.replace(/\/$/, "");
    const domain = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const { data: website, error } = await db.from("website_connections").insert({
      workspace_id: workspaceId,
      name: data.name.trim(),
      website_url: websiteUrl,
      domain,
      status: "pending",
    }).select("id,name,website_url,domain,public_key,status,last_seen_at,last_scanned_at,created_at").single();
    const saved = check(website, error);
    await recordAudit(db, workspaceId, "website.created", saved.id, { domain });
    return { website: saved };
  });

export const setWebsiteConnectionStatus = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    websiteId: z.string().uuid(),
    status: z.enum(["pending", "connected", "paused"]),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: website, error } = await db.from("website_connections")
      .update({ status: data.status, updated_at: new Date().toISOString() })
      .eq("id", data.websiteId).eq("workspace_id", workspaceId)
      .select("id,status").single();
    const saved = check(website, error);
    if (data.status === "connected") {
      const { data: details } = await db.from("website_connections").select("name,website_url").eq("id", saved.id).eq("workspace_id", workspaceId).single();
      await db.from("workspace_notifications").insert({
        workspace_id: workspaceId,
        notification_type: "website_connected",
        title: "Website marked as connected",
        body: `${details?.name || "Your website"} is ready for its Misma widget installation.`,
        website_connection_id: saved.id,
      });
    }
    await recordAudit(db, workspaceId, "website.status_changed", saved.id, { status: data.status });
    return { website: saved };
  });

export const saveProductService = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    itemType: z.enum(["product", "service"]),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(3000).default(""),
    priceText: z.string().trim().max(120).default(""),
    createdFrom: z.enum(["manual", "customer_demand", "website_scan"]).default("manual"),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: product, error } = await db.from("products_services").insert({
      workspace_id: workspaceId,
      item_type: data.itemType,
      name: data.name,
      description: data.description,
      price_text: data.priceText,
      active: true,
      created_from: data.createdFrom,
    }).select("id,item_type,name,description,price_text,active,created_from,created_at").single();
    const saved = check(product, error);
    await recordAudit(db, workspaceId, "product_service.created", String(saved.id), { itemType: data.itemType, name: data.name });
    return { product: saved };
  });

export const setProductServiceActive = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, id: z.number().int().positive(), active: z.boolean() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { error } = await db.from("products_services")
      .update({ active: data.active, updated_at: new Date().toISOString() })
      .eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    await recordAudit(db, workspaceId, "product_service.status_changed", String(data.id), { active: data.active });
    return { ok: true };
  });

export const updateHumanRequestStatus = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    id: z.number().int().positive(),
    status: z.enum(["pending", "handled", "closed"]),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: request, error } = await db.from("human_requests")
      .update({ status: data.status, handled_at: data.status === "pending" ? null : new Date().toISOString() })
      .eq("id", data.id).eq("workspace_id", workspaceId)
      .select("id,conversation_id,status").single();
    const saved = check(request, error);
    if (data.status === "closed") {
      const { error: conversationError } = await db.from("conversations")
        .update({ status: "Closed", updated_at: new Date().toISOString() })
        .eq("id", saved.conversation_id).eq("workspace_id", workspaceId);
      if (conversationError) throw new Error(conversationError.message);
    } else if (data.status === "pending") {
      const { error: conversationError } = await db.from("conversations")
        .update({ status: "Needs you", updated_at: new Date().toISOString() })
        .eq("id", saved.conversation_id).eq("workspace_id", workspaceId);
      if (conversationError) throw new Error(conversationError.message);
    }
    await recordAudit(db, workspaceId, "human_request.status_changed", String(data.id), { status: data.status });
    return { request: saved };
  });

export const markWorkspaceNotificationRead = createServerFn({ method: "POST" })
  .validator(z.object({ token: auth, id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { error } = await db.from("workspace_notifications")
      .update({ is_read: true }).eq("id", data.id).eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const sendHumanReply = createServerFn({ method: "POST" })
  .validator(z.object({
    token: auth,
    conversationId: z.number().int().positive(),
    text: z.string().trim().min(1).max(4000),
  }))
  .handler(async ({ data }) => {
    const { db, workspaceId } = await ensureWorkspace(data.token);
    const { data: conversation, error: conversationError } = await db.from("conversations")
      .select("id,status,channel").eq("id", data.conversationId).eq("workspace_id", workspaceId).single();
    if (conversationError || !conversation) throw new Error("Customer conversation not found.");
    if (String(conversation.channel || "").toLowerCase() === "dashboard") {
      throw new Error("Human replies are only available for customer-channel conversations.");
    }
    const { data: message, error } = await db.from("messages").insert({
      conversation_id: data.conversationId, role: "human", text: data.text,
    }).select("id,role,text,created_at").single();
    const saved = check(message, error);
    const { error: updateError } = await db.from("conversations").update({
      latest_text: data.text, status: "Needs you", updated_at: new Date().toISOString(),
    }).eq("id", data.conversationId).eq("workspace_id", workspaceId);
    if (updateError) throw new Error(updateError.message);
    await recordAudit(db, workspaceId, "conversation.human_reply", String(data.conversationId), { messageId: saved.id });
    return { message: { id: String(saved.id), role: "human" as const, text: saved.text, created_at: saved.created_at } };
  });
