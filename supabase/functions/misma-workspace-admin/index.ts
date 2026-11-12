import { createClient } from "npm:@supabase/supabase-js@2";

type AnyRecord = Record<string, unknown>;
const allowedOrigins = new Set([
  "https://misma.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(body: AnyRecord, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors(origin),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name) || "";
  if (!value) throw new Error("Server configuration is incomplete.");
  return value;
}

function clients(token: string) {
  const url = requiredEnv("SUPABASE_URL");
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const userDb = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const adminDb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return { userDb, adminDb };
}

function parseBearer(request: Request): string {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function requireOwner(adminDb: ReturnType<typeof createClient>, workspaceId: string, userId: string) {
  const { data: workspace, error } = await adminDb
    .from("workspaces")
    .select("id,owner_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error("Could not verify workspace ownership.");
  if (!workspace || workspace.owner_id !== userId) {
    throw new Error("Only the workspace owner can manage staff accounts or delete this account.");
  }
  return workspace;
}

async function listWorkspaceFiles(
  adminDb: ReturnType<typeof createClient>,
  workspaceId: string,
): Promise<string[]> {
  const storage = adminDb.storage.from("misma-media");
  const files: string[] = [];

  const walk = async (folder: string): Promise<void> => {
    let offset = 0;
    while (true) {
      const { data, error } = await storage.list(folder, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
      if (error) throw new Error("Could not prepare your stored files for account deletion.");
      const entries = data || [];
      for (const entry of entries) {
        const path = folder ? folder + "/" + entry.name : entry.name;
        if (entry.id) {
          files.push(path);
        } else {
          await walk(path);
        }
      }
      if (entries.length < 1000) break;
      offset += entries.length;
    }
  };

  await walk(workspaceId);
  return files;
}

async function removeWorkspaceFiles(
  adminDb: ReturnType<typeof createClient>,
  workspaceId: string,
): Promise<void> {
  const files = await listWorkspaceFiles(adminDb, workspaceId);
  const storage = adminDb.storage.from("misma-media");
  for (let index = 0; index < files.length; index += 100) {
    const batch = files.slice(index, index + 100);
    const { error } = await storage.remove(batch);
    if (error) {
      throw new Error("Could not remove all workspace files. Your account has not been deleted.");
    }
  }
}

async function createSupportUser(
  adminDb: ReturnType<typeof createClient>,
  ownerId: string,
  workspaceId: string,
  input: AnyRecord,
) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";

  if (name.length < 2 || name.length > 80) throw new Error("Enter a name between 2 and 80 characters.");
  if (title.length < 2 || title.length > 60) throw new Error("Enter a staff role between 2 and 60 characters.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Enter a valid staff email address.");
  if (password.length < 8 || password.length > 128) throw new Error("Use a password between 8 and 128 characters.");

  const { data: created, error: createError } = await adminDb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name, name },
  });
  if (createError || !created.user) {
    throw new Error(createError?.message || "Could not create this staff account.");
  }

  const userId = created.user.id;
  const { error: memberError } = await adminDb.from("workspace_members").insert({
    workspace_id: workspaceId,
    user_id: userId,
    role: "member",
  });
  if (memberError) {
    await adminDb.auth.admin.deleteUser(userId);
    throw new Error(memberError.message.includes("duplicate") ? "This account is already connected to the workspace." : "Could not add this staff account to the workspace.");
  }

  const { error: accessError } = await adminDb.from("workspace_staff_access").insert({
    workspace_id: workspaceId,
    user_id: userId,
    title,
    role: "support",
    created_by: ownerId,
  });
  if (accessError) {
    await adminDb.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", userId);
    await adminDb.auth.admin.deleteUser(userId);
    throw new Error("Could not assign the restricted support role.");
  }

  await adminDb.from("audit_events").insert({
    workspace_id: workspaceId,
    event_type: "workspace.support_user_created",
    entity_id: userId,
    payload: { email, title },
  });

  return { userId, email, name, title };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (!allowedOrigins.has(origin)) return new Response("Origin not allowed", { status: 403 });
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405, origin);

  try {
    const token = parseBearer(request);
    if (!token) return json({ error: "Sign in to continue." }, 401, origin);

    const { userDb, adminDb } = clients(token);
    const { data: authData, error: authError } = await userDb.auth.getUser(token);
    const user = authData.user;
    if (authError || !user) return json({ error: "Your sign-in session has expired." }, 401, origin);

    const body = await request.json() as AnyRecord;
    const action = typeof body.action === "string" ? body.action : "";
    const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return json({ error: "Choose a valid workspace." }, 400, origin);
    await requireOwner(adminDb, workspaceId, user.id);

    if (action === "create-support-user") {
      const staff = await createSupportUser(adminDb, user.id, workspaceId, body);
      return json({ ok: true, staff }, 200, origin);
    }

    if (action === "delete-account") {
      if (body.confirmation !== "DELETE") {
        return json({ error: "Confirm account deletion before continuing." }, 400, origin);
      }

      // Storage ownership must be cleared before deleting the Auth user. All
      // workspace objects in Misma's media bucket use the workspace UUID prefix.
      await removeWorkspaceFiles(adminDb, workspaceId);

      const { error: deleteError } = await adminDb.auth.admin.deleteUser(user.id);
      if (deleteError) {
        return json({ error: "Stored workspace files were removed, but the account could not be deleted. Contact support before retrying." }, 502, origin);
      }
      return json({ ok: true, deleted: true }, 200, origin);
    }

    return json({ error: "Unsupported workspace action." }, 400, origin);
  } catch (cause) {
    console.error("Misma workspace admin action failed:", cause instanceof Error ? cause.message : "unknown error");
    return json({ error: cause instanceof Error ? cause.message : "Could not complete the request." }, 400, origin);
  }
});
