import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function response(status: number, body: Json, origin: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function normalizeHost(value: string) {
  return value.toLowerCase().replace(/^www\./, "");
}
function cleanHtml(html: string) {
  return html
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n")
    .trim().slice(0, 9000);
}
function safePublicUrl(value: string) {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw new Error("Invalid website URL.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":")) {
    throw new Error("Only public websites can be scanned.");
  }
  return url;
}
async function askModel(system: string, history: Array<{ role: string; text: string }>, message: string) {
  const groqKey = Deno.env.get("GROQ_API_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  const failures: string[] = [];
  if (groqKey) {
    try {
      const result = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
        signal: AbortSignal.timeout(18000),
        body: JSON.stringify({
          model: Deno.env.get("GROQ_MODEL") || "openai/gpt-oss-120b",
          temperature: 0.25,
          messages: [
            { role: "system", content: system },
            ...history.slice(-8).map((item) => ({ role: item.role === "ai" ? "assistant" : "user", content: item.text.slice(0, 1800) })),
            { role: "user", content: message },
          ],
        }),
      });
      const payload = await result.json().catch(() => ({}));
      const answer = payload?.choices?.[0]?.message?.content;
      if (result.ok && typeof answer === "string" && answer.trim()) return answer.trim().slice(0, 6000);
      failures.push("groq:" + result.status);
    } catch (error) { failures.push("groq:" + (error instanceof Error ? error.name : "error")); }
  }
  if (geminiKey) {
    try {
      const model = Deno.env.get("GEMINI_MODEL") || "gemini-3.6-flash";
      const contents = [
        ...history.slice(-8).map((item) => ({ role: item.role === "ai" ? "model" : "user", parts: [{ text: item.text.slice(0, 1800) }] })),
        { role: "user", parts: [{ text: message }] },
      ];
      const result = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(18000),
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: 0.25, maxOutputTokens: 1200 } }),
      });
      const payload = await result.json().catch(() => ({}));
      const answer = payload?.candidates?.[0]?.content?.parts?.map((part: any) => part.text || "").join("");
      if (result.ok && typeof answer === "string" && answer.trim()) return answer.trim().slice(0, 6000);
      failures.push("gemini:" + result.status);
    } catch (error) { failures.push("gemini:" + (error instanceof Error ? error.name : "error")); }
  }
  console.error("[misma-widget] AI providers unavailable", failures);
  throw new Error("Misma is temporarily unable to reply. Please try again shortly.");
}

Deno.serve(async (request) => {
  const origin = request.headers.get("origin");
  if (request.method === "OPTIONS") return response(204, {}, origin);
  if (request.method !== "POST") return response(405, { error: "Method not allowed." }, origin);
  if (!supabaseUrl || !serviceKey) return response(500, { error: "Widget service is not configured." }, origin);
  let input: Json;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 18000) return response(413, { error: "Request is too large." }, origin);
    input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid");
  } catch { return response(400, { error: "Send a valid JSON request." }, origin); }

  const publicKey = typeof input.siteKey === "string" ? input.siteKey : "";
  const action = typeof input.action === "string" ? input.action : "chat";
  const sessionId = input.sessionId;
  if (!validUuid(publicKey) || !validUuid(sessionId)) return response(400, { error: "Invalid website or visitor session." }, origin);
  const { data: website, error: websiteError } = await db.from("website_connections")
    .select("id,workspace_id,name,website_url,domain,status,public_key")
    .eq("public_key", publicKey).maybeSingle();
  if (websiteError || !website || website.status === "paused") return response(404, { error: "This website chat is not currently available." }, origin);

  if (action === "scan") {
    const auth = request.headers.get("authorization") || "";
    const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
    if (!bearer || !anonKey) return response(401, { error: "Sign in to review this website." }, origin);
    const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${bearer}` } } });
    const { data: userData, error: userError } = await userClient.auth.getUser(bearer);
    if (userError || !userData.user) return response(401, { error: "Your Misma session has expired." }, origin);
    const { data: membership } = await db.from("workspace_members").select("workspace_id")
      .eq("workspace_id", website.workspace_id).eq("user_id", userData.user.id).maybeSingle();
    if (!membership) return response(403, { error: "You do not have access to this website." }, origin);
    const scanUrl = safePublicUrl(website.website_url);
    const pages = new Map<string, { title: string; text: string }>();
    const queue = [scanUrl.href];
    while (queue.length && pages.size < 10) {
      const next = queue.shift()!;
      if (pages.has(next)) continue;
      try {
        const pageUrl = safePublicUrl(next);
        if (normalizeHost(pageUrl.hostname) !== normalizeHost(scanUrl.hostname)) continue;
        const res = await fetch(pageUrl, { redirect: "manual", signal: AbortSignal.timeout(9000), headers: { "User-Agent": "MismaWebsiteReview/1.0" } });
        if (!res.ok || !/text\/html/i.test(res.headers.get("content-type") || "")) continue;
        const html = (await res.text()).slice(0, 1_500_000);
        const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() || pageUrl.pathname || website.name;
        const text = cleanHtml(html);
        if (text.length > 120) pages.set(pageUrl.href, { title: title.slice(0, 180), text });
        for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
          if (queue.length > 40) break;
          try {
            const link = new URL(match[1], pageUrl);
            link.hash = "";
            if (link.hostname === scanUrl.hostname && ["http:", "https:"].includes(link.protocol) &&
                !/\.(?:jpg|jpeg|png|gif|svg|webp|pdf|zip|mp4|css|js)$/i.test(link.pathname)) {
              const href = link.href.replace(/\/$/, "");
              if (!pages.has(href) && !queue.includes(href)) queue.push(href);
            }
          } catch { /* Ignore malformed links. */ }
        }
      } catch (error) { console.warn("[misma-widget] skipped scan page", error instanceof Error ? error.name : "error"); }
    }
    if (!pages.size) return response(422, { error: "Misma could not read public pages on this website. Check that the site is public and allows automated requests." }, origin);
    let savedCount = 0;
    for (const [url, page] of pages) {
      const question = `Website information — ${page.title}`;
      const { data: existing } = await db.from("knowledge_entries").select("id")
        .eq("workspace_id", website.workspace_id).eq("source_type", "website_scan").eq("source_ref", url).maybeSingle();
      const values = { workspace_id: website.workspace_id, question, answer: page.text.slice(0, 4000), approved: true, source_type: "website_scan", source_ref: url };
      const result = existing?.id
        ? await db.from("knowledge_entries").update(values).eq("id", existing.id)
        : await db.from("knowledge_entries").insert(values);
      if (!result.error) savedCount++;
    }
    await db.from("website_connections").update({ last_scanned_at: new Date().toISOString(), status: "connected", updated_at: new Date().toISOString() }).eq("id", website.id);
    await db.from("workspace_notifications").insert({
      workspace_id: website.workspace_id, notification_type: "website_scan_completed",
      title: "Website review completed", body: `Misma reviewed ${pages.size} pages and added ${savedCount} knowledge sources.`,
      website_connection_id: website.id,
    });
    return response(200, { ok: true, pagesScanned: pages.size, knowledgeSources: savedCount }, origin);
  }

  if (!origin) return response(403, { error: "The website origin could not be verified." }, origin);
  let originHost = "";
  try { originHost = normalizeHost(new URL(origin).hostname); } catch { return response(403, { error: "Invalid website origin." }, origin); }
  if (originHost !== normalizeHost(website.domain)) return response(403, { error: "This widget can only run on its registered website." }, origin);

  await db.from("website_connections").update({ last_seen_at: new Date().toISOString(), status: "connected" }).eq("id", website.id);
  const visitorName = typeof input.name === "string" ? input.name.trim().slice(0, 120) : "";
  const visitorEmail = typeof input.email === "string" ? input.email.trim().slice(0, 254) : "";
  const visitorPhone = typeof input.phone === "string" ? input.phone.trim().slice(0, 50) : "";
  const { data: contactExisting } = await db.from("contacts").select("id,name,email,phone")
    .eq("workspace_id", website.workspace_id).eq("visitor_id", sessionId).maybeSingle();
  let contactId = contactExisting?.id as number | undefined;
  if (!contactId) {
    const { data: contact, error } = await db.from("contacts").insert({
      workspace_id: website.workspace_id, visitor_id: sessionId,
      name: visitorName || "Website visitor", email: visitorEmail || null, phone: visitorPhone || null, source: "website",
    }).select("id").single();
    if (error || !contact) return response(500, { error: "Could not create visitor record." }, origin);
    contactId = Number(contact.id);
  } else if (visitorName || visitorEmail || visitorPhone) {
    await db.from("contacts").update({
      ...(visitorName ? { name: visitorName } : {}),
      ...(visitorEmail ? { email: visitorEmail } : {}),
      ...(visitorPhone ? { phone: visitorPhone } : {}),
      last_interaction: new Date().toISOString(),
    }).eq("id", contactId).eq("workspace_id", website.workspace_id);
  }

  let { data: conversation } = await db.from("conversations").select("id,status")
    .eq("workspace_id", website.workspace_id).eq("website_connection_id", website.id)
    .eq("visitor_session_id", sessionId).maybeSingle();
  if (!conversation) {
    const { data: created, error } = await db.from("conversations").insert({
      workspace_id: website.workspace_id, contact_id: contactId,
      channel: "Website", status: "AI", website_connection_id: website.id, visitor_session_id: sessionId,
      visitor_id: sessionId, latest_text: "",
    }).select("id,status").single();
    if (error || !created) return response(500, { error: "Could not start the visitor conversation." }, origin);
    conversation = created;
  }
  const conversationId = Number(conversation.id);

  if (action === "human") {
    const note = typeof input.reason === "string" ? input.reason.trim().slice(0, 500) : "Visitor requested a human agent.";
    const { data: existing } = await db.from("human_requests").select("id,status")
      .eq("conversation_id", conversationId).eq("workspace_id", website.workspace_id)
      .in("status", ["pending", "handled"]).maybeSingle();
    if (!existing) {
      const { data: handoff, error } = await db.from("human_requests").insert({
        workspace_id: website.workspace_id, conversation_id: conversationId, contact_id: contactId,
        visitor_name: visitorName || contactExisting?.name || "Website visitor",
        visitor_email: visitorEmail || contactExisting?.email || null,
        visitor_phone: visitorPhone || contactExisting?.phone || null,
        reason: note, status: "pending",
      }).select("id").single();
      if (error || !handoff) return response(500, { error: "Could not send the human handoff request." }, origin);
      await db.from("workspace_notifications").insert({
        workspace_id: website.workspace_id, notification_type: "human_request",
        title: "A visitor requested a human", body: note, conversation_id: conversationId,
        contact_id: contactId, human_request_id: handoff.id, website_connection_id: website.id,
      });
    }
    await db.from("conversations").update({
      status: "Needs you", latest_text: "Visitor requested a human agent.", updated_at: new Date().toISOString(),
    }).eq("id", conversationId);
    await db.from("messages").insert({ conversation_id: conversationId, role: "customer", text: "I'd like to speak with a human, please." });
    return response(200, { ok: true, message: "Your request has been sent. A team member will join this conversation as soon as possible." }, origin);
  }

  if (action !== "chat") return response(400, { error: "Unsupported widget action." }, origin);
  const message = typeof input.message === "string" ? input.message.trim().slice(0, 3000) : "";
  if (!message) return response(400, { error: "Enter a message." }, origin);
  await db.from("messages").insert({ conversation_id: conversationId, role: "customer", text: message });
  await db.from("conversations").update({ latest_text: message, updated_at: new Date().toISOString() }).eq("id", conversationId);
  await db.from("workspace_notifications").insert({
    workspace_id: website.workspace_id, notification_type: "visitor_message",
    title: "New website visitor message", body: message.slice(0, 500),
    conversation_id: conversationId, contact_id: contactId, website_connection_id: website.id,
  });

  const [workspaceResult, knowledgeResult, productsResult, historyResult] = await Promise.all([
    db.from("workspaces").select("name,description,location,opening_hours,primary_language").eq("id", website.workspace_id).single(),
    db.from("knowledge_entries").select("question,answer").eq("workspace_id", website.workspace_id).eq("approved", true).order("id", { ascending: false }).limit(40),
    db.from("products_services").select("item_type,name,description,price_text").eq("workspace_id", website.workspace_id).eq("active", true).limit(60),
    db.from("messages").select("role,text").eq("conversation_id", conversationId).order("id", { ascending: true }).limit(12),
  ]);
  const business = workspaceResult.data || { name: website.name };
  const knowledge = knowledgeResult.data || [];
  const products = productsResult.data || [];
  const history = (historyResult.data || []).slice(0, -1).map((item: any) => ({ role: item.role === "ai" ? "ai" : "user", text: String(item.text || "") }));
  const system = [
    `You are the customer-support and sales assistant for ${business.name || website.name}.`,
    `Business description: ${business.description || "Not provided"}`,
    `Location: ${business.location || "Not provided"}; hours: ${business.opening_hours || "Not provided"}; language: ${business.primary_language || "Match the visitor"}.`,
    "Answer only from the business knowledge and catalogue below. If information is missing, say you do not have it and offer to connect a human. Never invent prices, stock, delivery promises, policies, or contact details.",
    "If a visitor asks for a person, invite them to use the Request a human button. Do not claim a human has joined until the dashboard team replies.",
    "Business knowledge:\n" + knowledge.map((item: any) => `Q: ${item.question}\nA: ${item.answer}`).join("\n\n").slice(0, 14000),
    "Products and services:\n" + products.map((item: any) => `${item.item_type}: ${item.name} — ${item.description} — Price: ${item.price_text || "not listed"}`).join("\n").slice(0, 6000),
  ].join("\n\n");
  try {
    const answer = await askModel(system, history, message);
    await db.from("messages").insert({ conversation_id: conversationId, role: "ai", text: answer });
    await db.from("conversations").update({ latest_text: answer.slice(0, 500), updated_at: new Date().toISOString() }).eq("id", conversationId);
    return response(200, { ok: true, conversationId, answer }, origin);
  } catch (error) {
    return response(503, { error: error instanceof Error ? error.message : "Misma is temporarily unavailable." }, origin);
  }
});
