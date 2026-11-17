import { createClient } from "npm:@supabase/supabase-js@2";

type Json = Record<string, unknown>;
const APP_ORIGIN = "https://misma.onrender.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const API_VERSION = "2022-11-28";

function json(body: Json, status = 200, origin = APP_ORIGIN) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Vary": "Origin",
    },
  });
}
function required(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Server integration setting ${name} is not configured.`);
  return value;
}
function b64url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function derLength(length: number): number[] {
  if (length < 128) return [length];
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) { bytes.unshift(remaining & 255); remaining >>>= 8; }
  return [0x80 | bytes.length, ...bytes];
}
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00]);
  const version = new Uint8Array([0x02, 0x01, 0x00]);
  const octet = new Uint8Array([0x04, ...derLength(pkcs1.length), ...pkcs1]);
  const body = new Uint8Array([...version, ...algorithm, ...octet]);
  return new Uint8Array([0x30, ...derLength(body.length), ...body]);
}
async function githubAppJwt() {
  const appId = required("GITHUB_APP_ID");
  const pem = required("GITHUB_PRIVATE_KEY").replace(/\\n/g, "\n");
  const isPkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const base64 = pem.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----|-----END (?:RSA )?PRIVATE KEY-----|\s/g, "");
  const decoded = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const binary = isPkcs1 ? pkcs1ToPkcs8(decoded) : decoded;
  // WebCrypto's Deno typings require an ArrayBuffer-backed BufferSource.
  const keyData = new ArrayBuffer(binary.byteLength);
  new Uint8Array(keyData).set(binary);
  const key = await crypto.subtle.importKey(
    "pkcs8", keyData, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"],
  );
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ iat: now - 60, exp: now + 8 * 60, iss: appId }));
  const unsigned = header + "." + payload;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return unsigned + "." + b64url(new Uint8Array(signature));
}
async function githubRequest(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body: any = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text.slice(0, 500) }; }
  if (!response.ok) {
    const message = typeof body.message === "string" ? body.message : "GitHub API request failed.";
    throw new Error(`GitHub request failed (${response.status}): ${message}`);
  }
  return body;
}
async function installationToken(installationId: number, repositoryId?: number) {
  const jwt = await githubAppJwt();
  const body = await githubRequest(`/app/installations/${installationId}/access_tokens`, jwt, {
    method: "POST",
    body: JSON.stringify(repositoryId ? { repository_ids: [repositoryId] } : {}),
  });
  return String(body.token || "");
}
function base64Utf8(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function safeText(value: unknown, max = 160) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
async function verifyWebhook(raw: string, signature: string) {
  const secret = required("GITHUB_WEBHOOK_SECRET");
  if (!/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  const supplied = signature.slice(7).toLowerCase();
  const actual = Array.from(expected, (byte) => byte.toString(16).padStart(2, "0")).join("");
  let mismatch = supplied.length ^ actual.length;
  for (let i = 0; i < Math.max(supplied.length, actual.length); i++) mismatch |= (supplied.charCodeAt(i) || 0) ^ (actual.charCodeAt(i) || 0);
  return mismatch === 0;
}
function clients(accessToken?: string) {
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = accessToken
    ? createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || required("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: "Bearer " + accessToken } },
    })
    : null;
  return { admin, user };
}
function bearer(request: Request) {
  return (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
}
async function authorize(request: Request, workspaceId: string) {
  const token = bearer(request);
  if (!token) throw new Error("Sign in to connect a platform.");
  const { admin, user } = clients(token);
  const { data: auth, error: authError } = await user!.auth.getUser(token);
  if (authError || !auth.user) throw new Error("Your sign-in session has expired.");
  const { data: member, error } = await admin.from("workspace_members")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", auth.user.id).maybeSingle();
  if (error || !member || !["owner", "admin"].includes(member.role)) {
    throw new Error("Only workspace owners and admins can connect hosting platforms.");
  }
  return { admin, userId: auth.user.id };
}
async function githubCallback(request: Request) {
  const url = new URL(request.url);
  const state = safeText(url.searchParams.get("state"), 300);
  const installationId = Number(url.searchParams.get("installation_id"));
  const setupAction = safeText(url.searchParams.get("setup_action"), 40);
  if (!state || !Number.isSafeInteger(installationId) || installationId <= 0 || setupAction !== "install") {
    return Response.redirect(APP_ORIGIN + "/dashboard/integrations?github=error", 302);
  }
  const { admin } = clients();
  const stateHash = await sha256(state);
  const { data: saved, error } = await admin.from("platform_oauth_states").select("*")
    .eq("provider", "github").eq("state_hash", stateHash).is("consumed_at", null)
    .gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error || !saved) return Response.redirect(APP_ORIGIN + "/dashboard/integrations?github=state-expired", 302);
  const jwt = await githubAppJwt();
  const installation = await githubRequest(`/app/installations/${installationId}`, jwt);
  const account = installation.account || {};
  const accountId = String(account.id || installationId);
  const accountName = safeText(account.login || account.name || "GitHub account", 160);
  const { error: upsertError } = await admin.from("platform_connections").upsert({
    workspace_id: saved.workspace_id,
    provider: "github",
    external_account_id: accountId,
    external_account_name: accountName,
    installation_id: installationId,
    status: "connected",
    metadata: { account_type: account.type || null, app_slug: Deno.env.get("GITHUB_APP_SLUG") || null },
  }, { onConflict: "workspace_id,provider,external_account_id" });
  if (upsertError) throw new Error("GitHub was installed, but Misma could not save the connection.");
  await admin.from("platform_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", saved.id);
  await admin.from("platform_installation_logs").insert({
    workspace_id: saved.workspace_id, provider: "github", level: "info",
    event: "github.app_installed", details: { account: accountName, installation_id: installationId },
  });
  return Response.redirect(APP_ORIGIN + "/dashboard/integrations?github=connected", 302);
}
async function githubWebhook(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256") || "";
  if (!(await verifyWebhook(raw, signature))) return new Response("Invalid webhook signature", { status: 401 });
  const event = request.headers.get("x-github-event") || "";
  let payload: any = {};
  try { payload = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
  const { admin } = clients();
  if (event === "installation" && payload.action === "deleted") {
    const id = Number(payload.installation?.id);
    if (id) {
      await admin.from("platform_connections").update({ status: "disconnected", updated_at: new Date().toISOString() })
        .eq("provider", "github").eq("installation_id", id);
    }
  }
  if (event === "pull_request" && payload.action === "closed" && payload.pull_request?.merged === true) {
    const branchName = safeText(payload.pull_request?.head?.ref, 240);
    const repository = safeText(payload.repository?.full_name, 240);
    if (branchName && repository) {
      const { data: installations } = await admin.from("website_installations")
        .select("id,workspace_id,provider,metadata")
        .eq("provider", "github").eq("branch_name", branchName)
        .in("status", ["awaiting_approval", "auto_merge_enabled", "deploying"]);
      for (const item of installations || []) {
        const details = (item.metadata && typeof item.metadata === "object" ? item.metadata : {}) as Record<string, unknown>;
        if (details.repository !== repository) continue;
        await admin.from("website_installations").update({
          status: "deployed",
          deployed_at: new Date().toISOString(),
          metadata: { ...details, merged: true, merge_commit_sha: payload.pull_request?.merge_commit_sha || null },
        }).eq("id", item.id);
        await admin.from("platform_installation_logs").insert({
          workspace_id: item.workspace_id, installation_id: item.id, provider: "github", level: "info",
          event: "github.widget_pr_merged",
          details: { repository, branch: branchName, merge_commit_sha: payload.pull_request?.merge_commit_sha || null },
        });
      }
    }
  }
  return new Response("ok", { status: 200 });
}
async function main(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode");
  if (request.method === "OPTIONS") return json({ ok: true });
  if (request.method === "GET" && mode === "github-callback") return await githubCallback(request);
  if (request.method === "POST" && mode === "webhook") return await githubWebhook(request);
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  const origin = request.headers.get("origin") || "";
  if (origin !== APP_ORIGIN && origin !== "http://localhost:5173" && origin !== "http://localhost:3000") {
    return json({ error: "Origin not allowed." }, 403, origin || APP_ORIGIN);
  }
  try {
    const body = await request.json() as Json;
    const action = safeText(body.action, 60);
    const workspaceId = safeText(body.workspaceId, 80);
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return json({ error: "Choose a valid workspace." }, 400, origin);
    const { admin } = await authorize(request, workspaceId);

    if (action === "github-install-url") {
      const slug = required("GITHUB_APP_SLUG");
      const state = crypto.randomUUID() + "." + crypto.randomUUID();
      const { error } = await admin.from("platform_oauth_states").insert({
        workspace_id: workspaceId, user_id: (await admin.auth.getUser(bearer(request))).data.user?.id,
        provider: "github", state_hash: await sha256(state),
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      if (error) throw new Error("Could not start GitHub authorization. Please try again.");
      return json({ installUrl: `https://github.com/apps/${encodeURIComponent(slug)}/installations/new?state=${encodeURIComponent(state)}` }, 200, origin);
    }

    const { data: connection, error: connectionError } = await admin.from("platform_connections")
      .select("id,installation_id,external_account_name,status")
      .eq("workspace_id", workspaceId).eq("provider", "github").eq("status", "connected")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (connectionError) throw new Error("Could not load the GitHub connection.");
    if (!connection?.installation_id) throw new Error("Connect the Misma GitHub App first.");
    const installationId = Number(connection.installation_id);

    if (action === "github-repositories") {
      const token = await installationToken(installationId);
      const result = await githubRequest("/installation/repositories?per_page=100", token);
      const repositories = (result.repositories || []).map((repo: any) => ({
        id: Number(repo.id), fullName: String(repo.full_name), name: String(repo.name),
        defaultBranch: String(repo.default_branch || "main"), htmlUrl: String(repo.html_url),
        private: Boolean(repo.private),
      }));
      return json({ repositories }, 200, origin);
    }

    if (action === "prepare-github-install") {
      const repositoryId = Number(body.repositoryId);
      const fullName = safeText(body.fullName, 240);
      const defaultBranch = safeText(body.defaultBranch, 120) || "main";
      const websiteConnectionId = safeText(body.websiteConnectionId, 80);
      const deploymentMode = body.deploymentMode === "automatic" ? "automatic" : "manual";
      if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0 || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName)) {
        return json({ error: "Select a valid GitHub repository." }, 400, origin);
      }
      if (!/^[0-9a-f-]{36}$/i.test(websiteConnectionId)) return json({ error: "Select a website in Misma." }, 400, origin);
      const { data: website, error: websiteError } = await admin.from("website_connections")
        .select("id,workspace_id,name,domain,public_key,widget_public_key,widget_deleted_at")
        .eq("id", websiteConnectionId).eq("workspace_id", workspaceId).is("widget_deleted_at", null).maybeSingle();
      if (websiteError || !website) throw new Error("That website is not available in this workspace.");
      const token = await installationToken(installationId);
      const allowed = await githubRequest("/installation/repositories?per_page=100", token);
      const repo = (allowed.repositories || []).find((item: any) => Number(item.id) === repositoryId && item.full_name === fullName);
      if (!repo) throw new Error("The selected repository is not accessible to the connected GitHub App.");
      const [owner, name] = fullName.split("/");
      const baseBranch = String(repo.default_branch || defaultBranch);
      const branchName = "misma/widget-" + websiteConnectionId.slice(0, 8) + "-" + Date.now();
      const branch = await githubRequest(`/repos/${owner}/${name}/branches/${encodeURIComponent(baseBranch)}`, token);
      await githubRequest(`/repos/${owner}/${name}/git/refs`, token, {
        method: "POST", body: JSON.stringify({ ref: "refs/heads/" + branchName, sha: branch.commit.sha }),
      });

      let filePath = "index.html";
      let file: any;
      try {
        file = await githubRequest(`/repos/${owner}/${name}/contents/index.html?ref=${encodeURIComponent(baseBranch)}`, token);
      } catch {
        filePath = "public/index.html";
        file = await githubRequest(`/repos/${owner}/${name}/contents/public/index.html?ref=${encodeURIComponent(baseBranch)}`, token);
      }
      const decoded = atob(String(file.content || "").replace(/\n/g, ""));
      const original = new TextDecoder().decode(Uint8Array.from(decoded, (char) => char.charCodeAt(0)));
      const siteKey = String(website.widget_public_key || website.public_key);
      const endpoint = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/misma-widget";
      const script = `<script defer src="https://misma.onrender.com/assets/misma-widget.js?v=20261110-widget-theme-2" data-site-key="${siteKey}" data-endpoint="${endpoint}"></script>`;
      const existingScript = /<script\b(?=[^>]*misma-widget\.js)[^>]*>\s*<\/script>/i;
      const updated = existingScript.test(original)
        ? original.replace(existingScript, script)
        : /<\/body>/i.test(original) ? original.replace(/<\/body>/i, script + "\n</body>") : original + "\n" + script + "\n";
      if (updated === original) throw new Error("The existing widget script is already current.");
      await githubRequest(`/repos/${owner}/${name}/contents/${filePath}`, token, {
        method: "PUT",
        body: JSON.stringify({
          message: "Install Misma website widget for " + website.domain,
          content: base64Utf8(updated), branch: branchName, sha: file.sha,
        }),
      });
      const pr = await githubRequest(`/repos/${owner}/${name}/pulls`, token, {
        method: "POST",
        body: JSON.stringify({
          title: "Install Misma website widget",
          head: branchName,
          base: baseBranch,
          body: [
            "## Misma widget installation",
            "",
            "This pull request adds or updates the Misma widget script for **" + website.domain + "**.",
            "",
            "- Website: " + website.domain,
            "- File changed: `" + filePath + "`",
            "- Deployment preference: " + deploymentMode,
            "",
            "Review this focused change before merging. Misma never edits environment variables or unrelated website files.",
          ].join("\n"),
        }),
      });
      const { data: project, error: projectError } = await admin.from("platform_projects").upsert({
        workspace_id: workspaceId, platform_connection_id: connection.id, provider: "github",
        external_project_id: String(repositoryId), name: String(repo.name), full_name: fullName,
        repository_url: repo.html_url, dashboard_url: repo.html_url, default_branch: baseBranch,
        metadata: { private: Boolean(repo.private) }, last_synced_at: new Date().toISOString(),
      }, { onConflict: "workspace_id,provider,external_project_id" }).select("id").single();
      if (projectError || !project) throw new Error("The pull request was created, but Misma could not save the repository link.");
      let status = "awaiting_approval";
      if (deploymentMode === "automatic" && pr.node_id) {
        try {
          const autoMerge = await githubRequest("/graphql", token, {
            method: "POST",
            body: JSON.stringify({
              query: "mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number}}}",
              variables: { id: pr.node_id },
            }),
          });
          if (Array.isArray(autoMerge.errors) && autoMerge.errors.length) throw new Error("GitHub auto-merge is not enabled for this repository.");
          status = "auto_merge_enabled";
        } catch {
          // Auto-merge is unavailable unless repository settings and branch rules allow it.
          status = "awaiting_approval";
        }
      }
      const { data: installation, error: installError } = await admin.from("website_installations").insert({
        workspace_id: workspaceId, website_connection_id: websiteConnectionId, platform_project_id: project.id,
        provider: "github", deployment_mode: deploymentMode, status, branch_name: branchName,
        target_branch: baseBranch, file_path: filePath, pull_request_number: Number(pr.number),
        pull_request_url: String(pr.html_url), dashboard_url: String(repo.html_url),
        metadata: { repository_id: repositoryId, repository: fullName, auto_merge_requested: status === "auto_merge_enabled" },
      }).select("id").single();
      if (installError || !installation) throw new Error("The pull request was created, but Misma could not save the installation record.");
      await admin.from("platform_installation_logs").insert({
        workspace_id: workspaceId, installation_id: installation.id, provider: "github", level: "info",
        event: "github.widget_pr_created",
        details: { repository: fullName, pull_request: pr.html_url, deployment_mode: deploymentMode, status },
      });
      return json({
        installationId: installation.id, status, branchName, filePath,
        pullRequestUrl: pr.html_url, repositoryUrl: repo.html_url,
        message: status === "auto_merge_enabled"
          ? "Pull request created. GitHub will merge it automatically when repository protection rules and required checks are satisfied."
          : "Pull request created. Review and merge it in GitHub to publish the widget.",
      }, 200, origin);
    }

    return json({ error: "Unsupported platform integration action." }, 400, origin);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Could not complete the platform integration action.";
    console.error("Misma platform integration error:", message);
    return json({ error: message }, 400, request.headers.get("origin") || APP_ORIGIN);
  }
}
Deno.serve(main);
