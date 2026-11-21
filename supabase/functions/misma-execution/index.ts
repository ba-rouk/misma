import { createClient } from "npm:@supabase/supabase-js@2";

const APP_ORIGIN = "https://misma.onrender.com";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const API_VERSION = "2022-11-28";
const CORS = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
type Row = Record<string, any>;
type Repo = { id: number; full_name: string; name: string; default_branch: string; html_url: string; private: boolean; description: string; visibility: string; language: string | null; created_at: string | null; updated_at: string | null; pushed_at: string | null; fork: boolean; archived: boolean; stargazers_count: number; forks_count: number; open_issues_count: number; size: number; topics: string[]; license: string | null };
type Adapter = "html" | "next-app" | "astro" | "sveltekit" | "blade" | "django" | "php";
function json(body: Row, status = 200, origin = APP_ORIGIN) {
  return Response.json(body, { status, headers: { ...CORS, "Access-Control-Allow-Origin": origin, "Cache-Control": "no-store" } });
}
function safe(value: unknown, max = 240): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function b64url(value: string | Uint8Array): string {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function derLength(length: number): number[] {
  if (length < 128) return [length];
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) { bytes.unshift(remaining & 255); remaining >>>= 8; }
  return [0x80 | bytes.length, ...bytes];
}
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
  const algorithm = new Uint8Array([0x30,0x0d,0x06,0x09,0x2a,0x86,0x48,0x86,0xf7,0x0d,0x01,0x01,0x01,0x05,0x00]);
  const version = new Uint8Array([0x02,0x01,0x00]);
  const octet = new Uint8Array([0x04,...derLength(pkcs1.length),...pkcs1]);
  const body = new Uint8Array([...version,...algorithm,...octet]);
  return new Uint8Array([0x30,...derLength(body.length),...body]);
}
async function githubJwt(): Promise<string> {
  const appId = Deno.env.get("GITHUB_APP_ID")?.trim() || "";
  const pem = (Deno.env.get("GITHUB_PRIVATE_KEY") || "").replace(/\\n/g, "\n");
  if (!/^\d+$/.test(appId) || !pem.includes("PRIVATE KEY-----")) {
    throw new Error("Misma GitHub App credentials are not configured in the Supabase Edge Function.");
  }
  const pkcs1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const encoded = pem.replace(/-----BEGIN (?:RSA )?PRIVATE KEY-----|-----END (?:RSA )?PRIVATE KEY-----|\s/g, "");
  const raw = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const der = pkcs1 ? pkcs1ToPkcs8(raw) : raw;
  const keyBytes = new ArrayBuffer(der.byteLength);
  new Uint8Array(keyBytes).set(der);
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const unsigned = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." +
    b64url(JSON.stringify({ iat: now - 60, exp: now + 8 * 60, iss: appId }));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return unsigned + "." + b64url(new Uint8Array(signature));
}
async function githubRequest(path: string, token: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": API_VERSION,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(20_000),
  });
  const raw = await response.text();
  let result: any = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { message: raw.slice(0, 400) }; }
  if (!response.ok) throw new Error("GitHub API (" + response.status + "): " + safe(result.message, 220));
  return result;
}
async function installationToken(installationId: number, repositoryId?: number): Promise<string> {
  const jwt = await githubJwt();
  const result = await githubRequest("/app/installations/" + installationId + "/access_tokens", jwt, {
    method: "POST",
    body: JSON.stringify(repositoryId ? { repository_ids: [repositoryId] } : {}),
  });
  if (typeof result.token !== "string" || !result.token) throw new Error("GitHub did not issue an installation token.");
  return result.token;
}
async function authorize(request: Request, workspaceId: string) {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Sign in to use Misma execution.");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const publicKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!serviceKey || !publicKey) throw new Error("Misma execution is not configured.");
  const admin = createClient(SUPABASE_URL, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const user = createClient(SUPABASE_URL, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: auth, error: authError } = await user.auth.getUser(token);
  if (authError || !auth.user) throw new Error("Your sign-in session has expired.");
  const { data: member, error: memberError } = await admin.from("workspace_members")
    .select("role").eq("workspace_id", workspaceId).eq("user_id", auth.user.id).maybeSingle();
  if (memberError || !member || !["owner", "admin"].includes(member.role)) {
    throw new Error("Only workspace owners and admins can execute repository changes.");
  }
  return { admin, userId: auth.user.id, role: member.role };
}
async function addLog(admin: any, workspaceId: string, jobId: string, actor: string | null, event: string, details: Row = {}) {
  await admin.from("plugin_execution_logs").insert({
    workspace_id: workspaceId, job_id: jobId, actor_user_id: actor, event, details,
  });
}
async function step(
  admin: any, workspaceId: string, jobId: string, key: string, status: string,
  output: Row = {}, error = "", progress?: (event: Row) => void,
) {
  await admin.from("plugin_execution_steps").upsert({
    workspace_id: workspaceId, job_id: jobId, step_key: key, status,
    output_summary: output, error_message: error || null,
    attempt_count: status === "running" ? 1 : 0,
    started_at: status === "running" ? new Date().toISOString() : null,
    finished_at: ["succeeded","failed","skipped"].includes(status) ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "job_id,step_key" });
  const titles: Record<string, string> = {
    resolve_website: "Checking Misma website context",
    inspect_repository: "Inspecting repository files",
    create_branch: "Creating a GitHub feature branch",
    commit_widget_patch: "Adding the approved widget script",
    create_pull_request: "Opening a GitHub pull request",
  };
  progress?.({
    type: "activity", step: key, title: titles[key] || key.replace(/_/g, " "),
    status, detail: safe(output.repository || output.filePath || output.branchName || output.entrypoint || error, 180),
  });
}
async function getGithubConnection(admin: any, workspaceId: string) {
  const { data, error } = await admin.from("platform_connections")
    .select("id,installation_id,external_account_name,status")
    .eq("workspace_id", workspaceId).eq("provider", "github").eq("status", "connected")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error || !data?.installation_id) throw new Error("Connect the Misma GitHub App and grant access to the website repository first.");
  return data;
}
async function listRepos(installationId: number, progress?: (event: Row) => void): Promise<Repo[]> {
  progress?.({ type: "activity", step: "list_repositories", title: "Listing repositories accessible to GitHub", status: "running" });
  const token = await installationToken(installationId);
  const results: Repo[] = [];
  let page = 1;
  while (page <= 10) {
    const payload = await githubRequest("/installation/repositories?per_page=100&page=" + page, token);
    const items = Array.isArray(payload.repositories) ? payload.repositories : [];
    for (const repo of items) {
      if (!repo || !Number.isSafeInteger(Number(repo.id)) || !repo.full_name) continue;
      results.push({
        id: Number(repo.id), full_name: String(repo.full_name), name: String(repo.name || ""),
        default_branch: String(repo.default_branch || "main"), html_url: String(repo.html_url || ""),
        private: Boolean(repo.private), description: safe(repo.description, 300),
        visibility: String(repo.visibility || (repo.private ? "private" : "public")),
        language: typeof repo.language === "string" ? repo.language : null,
        created_at: typeof repo.created_at === "string" ? repo.created_at : null,
        updated_at: typeof repo.updated_at === "string" ? repo.updated_at : null,
        pushed_at: typeof repo.pushed_at === "string" ? repo.pushed_at : null,
        fork: Boolean(repo.fork), archived: Boolean(repo.archived),
        stargazers_count: Number(repo.stargazers_count || 0), forks_count: Number(repo.forks_count || 0),
        open_issues_count: Number(repo.open_issues_count || 0), size: Number(repo.size || 0),
        topics: Array.isArray(repo.topics) ? repo.topics.map((topic: unknown) => safe(topic, 48)).filter(Boolean) : [],
        license: safe(repo.license?.spdx_id || repo.license?.name, 80) || null,
      });
    }
    if (items.length < 100) break;
    page++;
  }
  progress?.({ type: "activity", step: "list_repositories", title: "Repository listing complete", status: "succeeded", detail: String(results.length) + " repositories" });
  return results;
}
function isRepositoryListIntent(message: string): boolean {
  const lower = message.toLowerCase();
  const hasRepo = /\b(repos?|repositories)\b/.test(lower);
  const asksToList = /\b(list|show|display|view|find|what|which|all|my|account|available|accessible|details?)\b/.test(lower);
  return hasRepo && asksToList && !isInstallIntent(message);
}
function isReadApprovalMessage(message: string): boolean {
  return /^@?github\s+(?:approve read|allow read|approve repository access)[.!]?$/i.test(message.trim());
}
function formatRepositoryInventory(repositories: Repo[], accountName: string): string {
  const heading = "I checked the connected GitHub App for **" + (accountName || "your GitHub account") + "** and found **" +
    repositories.length + "** accessible repositories.\n\n";
  if (!repositories.length) {
    return heading + "No repositories are currently available to this GitHub App. Review its repository access in GitHub App settings and grant the repositories you want Misma to manage.";
  }
  const rows = repositories.map((repo, index) => {
    const visibility = repo.visibility || (repo.private ? "private" : "public");
    const updated = repo.pushed_at || repo.updated_at;
    const facts = [
      visibility, "default branch: " + (repo.default_branch || "not reported"),
      "language: " + (repo.language || "not detected"),
      updated ? "last pushed: " + updated.slice(0, 10) : "",
      repo.fork ? "fork" : "", repo.archived ? "archived" : "",
      "stars: " + repo.stargazers_count, "forks: " + repo.forks_count,
      "open issues: " + repo.open_issues_count,
      repo.license ? "license: " + repo.license : "",
      repo.topics.length ? "topics: " + repo.topics.slice(0, 6).join(", ") : "",
    ].filter(Boolean);
    const description = repo.description ? " — " + repo.description.replace(/\s+/g, " ").slice(0, 180) : "";
    return (index + 1) + ". **[" + repo.full_name + "](" + repo.html_url + ")**" + description + "\n   " + facts.join(" · ");
  }).join("\n\n");
  return heading + rows + "\n\nThese are the repositories currently granted to Misma's GitHub App. If one you expect is missing, expand the app installation's repository access in GitHub.";
}
function decodeContent(value: string): string {
  const normalized = value.replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeContent(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function chooseAdapter(paths: string[]): { framework: string; adapter: Adapter; entrypoint: string } | null {
  const has = (path: string) => paths.includes(path);
  const nextApp = ["app/layout.tsx","app/layout.jsx","app/layout.js","src/app/layout.tsx","src/app/layout.jsx","src/app/layout.js"].find(has);
  if (nextApp) return { framework: "Next.js App Router", adapter: "next-app", entrypoint: nextApp };
  const nextDocument = ["pages/_document.tsx","pages/_document.jsx","pages/_document.js","src/pages/_document.tsx","src/pages/_document.jsx","src/pages/_document.js"].find(has);
  if (nextDocument) return { framework: "Next.js Pages Router", adapter: "html", entrypoint: nextDocument };
  if (has("src/app.html") && has("svelte.config.js") || has("src/app.html") && has("svelte.config.ts")) {
    return { framework: "SvelteKit", adapter: "sveltekit", entrypoint: "src/app.html" };
  }
  if (has("src/index.html") && has("angular.json")) return { framework: "Angular", adapter: "html", entrypoint: "src/index.html" };
  if (has("src/layouts/Layout.astro")) return { framework: "Astro", adapter: "astro", entrypoint: "src/layouts/Layout.astro" };
  if (has("resources/views/layouts/app.blade.php")) return { framework: "Laravel", adapter: "blade", entrypoint: "resources/views/layouts/app.blade.php" };
  if (has("resources/views/layout.blade.php")) return { framework: "Laravel", adapter: "blade", entrypoint: "resources/views/layout.blade.php" };
  if (has("templates/base.html")) return { framework: "Django", adapter: "django", entrypoint: "templates/base.html" };
  if (has("index.php")) return { framework: "PHP", adapter: "php", entrypoint: "index.php" };
  if (has("index.html")) {
    const framework = has("vite.config.ts") || has("vite.config.js") || has("vite.config.mjs") ? "Vite" :
      has("package.json") ? "React/Vue or JavaScript application" : "Static HTML";
    return { framework, adapter: "html", entrypoint: "index.html" };
  }
  if (has("public/index.html")) return { framework: "React/CRA or static site", adapter: "html", entrypoint: "public/index.html" };
  return null;
}
function buildWidgetPatch(adapter: Adapter, path: string, original: string, siteKey: string): string {
  if (/misma-widget\.js/i.test(original)) throw new Error("This repository already contains a Misma widget script. I will not add a duplicate.");
  const endpoint = SUPABASE_URL.replace(/\/$/, "") + "/functions/v1/misma-widget";
  const attrs = 'src="https://misma.onrender.com/assets/misma-widget.js" data-site-key="' + siteKey + '" data-endpoint="' + endpoint + '"';
  if (adapter === "next-app") {
    if (!/<\/body\s*>/i.test(original)) throw new Error("The Next.js root layout has no closing </body> element. Misma will not guess where to insert the widget.");
    const importLine = /import\s+Script\s+from\s+["']next\/script["'];?/;
    const withImport = importLine.test(original) ? original : 'import Script from "next/script";\n' + original;
    return withImport.replace(/<\/body\s*>/i, '<Script strategy="afterInteractive" ' + attrs + ' />\n</body>');
  }
  if (adapter === "astro") {
    if (!/<\/body\s*>/i.test(original)) throw new Error("The Astro layout has no closing </body> element.");
    return original.replace(/<\/body\s*>/i, '<script is:inline defer ' + attrs + '></script>\n</body>');
  }
  if (!/<\/body\s*>/i.test(original)) throw new Error("The detected entry file has no closing </body> element. Misma will not append a script to an unknown template.");
  return original.replace(/<\/body\s*>/i, '<script defer ' + attrs + '></script>\n</body>');
}
async function getFile(owner: string, repo: string, path: string, branch: string, token: string) {
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  const item = await githubRequest("/repos/" + owner + "/" + repo + "/contents/" + safePath + "?ref=" + encodeURIComponent(branch), token);
  if (item.encoding !== "base64" || typeof item.content !== "string" || typeof item.sha !== "string") {
    throw new Error("GitHub did not return a readable text file for " + path + ".");
  }
  const content = decodeContent(item.content);
  if (content.length > 300_000) throw new Error("The selected entry file is too large for a safe automatic patch.");
  return { content, sha: String(item.sha) };
}
async function inspectRepo(
  repo: Repo, installationId: number, siteKey: string, progress?: (event: Row) => void,
) {
  progress?.({ type: "activity", step: "search_repository", title: "Searching repository files for a safe widget entry point", status: "running", detail: repo.full_name });
  try {
    const token = await installationToken(installationId, repo.id);
    const [owner, name] = repo.full_name.split("/");
    const tree = await githubRequest("/repos/" + owner + "/" + name + "/git/trees/" + encodeURIComponent(repo.default_branch) + "?recursive=1", token);
    if (tree.truncated) throw new Error("GitHub truncated this repository tree. Misma cannot reliably identify the application entry point.");
    const paths = (Array.isArray(tree.tree) ? tree.tree : [])
      .filter((item: any) => item.type === "blob" && typeof item.path === "string")
      .map((item: any) => String(item.path));
    const chosen = chooseAdapter(paths);
    progress?.({ type: "activity", step: "search_repository", title: "Repository search complete", status: "succeeded", detail: String(paths.length) + " files scanned" });
    if (!chosen) {
      const packagePath = paths.includes("package.json") ? "package.json" : null;
      let technologies: string[] = [];
      if (packagePath) {
        const pkg = await getFile(owner, name, packagePath, repo.default_branch, token);
        try {
          const parsed = JSON.parse(pkg.content);
          technologies = Object.keys({ ...(parsed.dependencies || {}), ...(parsed.devDependencies || {}) })
            .filter(x => ["next","nuxt","vue","react","@angular/core","svelte","@sveltejs/kit","astro"].includes(x)).slice(0, 12);
        } catch { /* detection remains conservative */ }
      }
      throw new Error("I inspected " + repo.full_name + " but could not identify a verified widget entry point." +
        (technologies.length ? " Detected packages: " + technologies.join(", ") + "." : "") +
        " This framework needs a dedicated adapter or a customer-selected shared HTML layout.");
    }
    const file = await getFile(owner, name, chosen.entrypoint, repo.default_branch, token);
    const updated = buildWidgetPatch(chosen.adapter, chosen.entrypoint, file.content, siteKey);
    if (updated === file.content) throw new Error("No safe widget change was generated.");
    return {
      framework: chosen.framework, adapter: chosen.adapter, entrypoint: chosen.entrypoint,
      originalSha: file.sha, updatedContent: updated,
      additions: updated.split("\n").length - file.content.split("\n").length,
      summary: "Add the Misma widget loader to " + chosen.entrypoint + ".",
    };
  } catch (cause) {
    progress?.({ type: "activity", step: "search_repository", title: "Repository search failed", status: "failed", detail: cause instanceof Error ? cause.message : "Repository search failed" });
    throw cause;
  }
}
async function createOrUpdateConversation(admin: any, workspaceId: string, conversationId: number | null, userText: string, assistantText: string) {
  let id = conversationId;
  if (id) {
    const { data: conversation, error } = await admin.from("conversations").select("id")
      .eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
    if (error || !conversation) throw new Error("Conversation not found.");
  } else {
    const { data: conversation, error } = await admin.from("conversations").insert({
      workspace_id: workspaceId, channel: "Dashboard", latest_text: userText.slice(0, 200), status: "AI",
    }).select("id").single();
    if (error || !conversation) throw new Error("Could not start an execution conversation.");
    id = Number(conversation.id);
  }
  const { data: saved, error: messageError } = await admin.from("messages").insert([
    { conversation_id: id, role: "human", text: userText, attachments: [], is_voice: false },
    { conversation_id: id, role: "ai", text: assistantText, attachments: [], is_voice: false },
  ]).select("id,role,text,created_at,attachments");
  if (messageError || !saved || saved.length !== 2) throw new Error("Could not save the execution update to chat.");
  const userMessage = saved.find((x: any) => x.role === "human");
  const aiMessage = saved.find((x: any) => x.role === "ai");
  await admin.from("conversations").update({ latest_text: assistantText.slice(0, 200), updated_at: new Date().toISOString() })
    .eq("id", id).eq("workspace_id", workspaceId);
  return { conversationId: id, userMessage, aiMessage };
}
function isInstallIntent(message: string): boolean {
  const text = message.toLowerCase();
  return /\b(install|add|set up|integrate|put)\b.{0,100}\bmisma\b.{0,60}\b(widget|chat)\b/.test(text) ||
    /\bmisma\s+(?:chat\s+)?widget\b.{0,80}\b(website|site|repository|repo|github)\b/.test(text);
}
function chooseNumberOrName(message: string, choices: Array<{ name: string; full_name?: string }>): number {
  const raw = message.trim();
  const numeric = raw.match(/^(?:#?\s*)?(\d{1,3})\s*[.!]?$/);
  if (numeric) {
    const index = Number(numeric[1]) - 1;
    return index >= 0 && index < choices.length ? index : -1;
  }
  const normalized = raw.toLowerCase().replace(/^please\s+/, "").replace(/[.!]$/, "").trim();
  return choices.findIndex(item => normalized === String(item.full_name || "").toLowerCase() ||
    normalized === item.name.toLowerCase());
}
async function executeApprovedPlan(admin: any, job: Row, userId: string, connection: Row, progress?: (event: Row) => void) {
  const plan = isRecord(job.plan) ? job.plan : {};
  const repoId = Number(job.repository_id);
  const fullName = String(job.repository_full_name || "");
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo || !Number.isSafeInteger(repoId)) throw new Error("The saved repository selection is invalid.");
  if (!isRecord(plan) || typeof plan.updatedContent !== "string" || typeof plan.originalSha !== "string" ||
      typeof plan.entrypoint !== "string" || typeof plan.framework !== "string") {
    throw new Error("The approved installation plan is incomplete. Please inspect the repository again.");
  }
  await step(admin, job.workspace_id, job.id, "create_branch", "running", {}, "", progress);
  const token = await installationToken(Number(connection.installation_id), repoId);
  // The token was minted with repository_ids=[repoId], so this API read
  // verifies both the repository identity and that the installation still grants it.
  const repositoryCheck = await githubRequest("/repos/" + owner + "/" + repo, token);
  if (Number(repositoryCheck.id) !== repoId || repositoryCheck.full_name !== fullName) {
    throw new Error("The selected repository is no longer available to the connected GitHub App.");
  }
  const base = safe(job.default_branch, 120) || "main";
  const baseRef = await githubRequest("/repos/" + owner + "/" + repo + "/git/ref/heads/" + encodeURIComponent(base), token);
  const branchName = "misma/widget-" + job.id.slice(0, 8);
  await githubRequest("/repos/" + owner + "/" + repo + "/git/refs", token, {
    method: "POST", body: JSON.stringify({ ref: "refs/heads/" + branchName, sha: baseRef.object.sha }),
  });
  await step(admin, job.workspace_id, job.id, "create_branch", "succeeded", { branchName, baseBranch: base }, "", progress);

  await step(admin, job.workspace_id, job.id, "commit_widget_patch", "running", { filePath: plan.entrypoint }, "", progress);
  const safePath = String(plan.entrypoint).split("/").map(encodeURIComponent).join("/");
  const currentFile = await githubRequest("/repos/" + owner + "/" + repo + "/contents/" + safePath + "?ref=" + encodeURIComponent(base), token);
  if (currentFile.sha !== plan.originalSha) {
    throw new Error("The target file changed after Misma prepared the plan. No customer file was overwritten. Ask Misma to inspect the repository again.");
  }
  const updated = await githubRequest("/repos/" + owner + "/" + repo + "/contents/" + safePath, token, {
    method: "PUT",
    body: JSON.stringify({
      message: "Install Misma website widget",
      content: encodeContent(String(plan.updatedContent)),
      branch: branchName,
      sha: plan.originalSha,
    }),
  });
  const commitSha = String(updated.commit?.sha || "");
  await step(admin, job.workspace_id, job.id, "commit_widget_patch", "succeeded", { filePath: plan.entrypoint, commitSha }, "", progress);

  await step(admin, job.workspace_id, job.id, "create_pull_request", "running", {}, "", progress);
  const pull = await githubRequest("/repos/" + owner + "/" + repo + "/pulls", token, {
    method: "POST",
    body: JSON.stringify({
      title: "Install Misma chat widget",
      head: branchName,
      base,
      body: [
        "## Misma widget installation",
        "",
        "This pull request adds the Misma widget loader to the selected website.",
        "",
        "- Repository: " + fullName,
        "- Detected framework: " + plan.framework,
        "- Adapter: " + plan.adapter,
        "- Entry point: `" + plan.entrypoint + "`",
        "",
        "Misma prepared this change and the workspace owner explicitly approved it in Misma chat. Review the diff and merge this pull request to publish the change.",
        "No environment variables, secrets, build configuration, or unrelated application files were modified.",
      ].join("\n"),
    }),
  });
  const pullUrl = String(pull.html_url || "");
  const pullNumber = Number(pull.number);
  if (!pullUrl || !Number.isSafeInteger(pullNumber)) throw new Error("GitHub did not return a valid pull request.");
  const { data: installation, error: saveError } = await admin.from("repository_installations").upsert({
    workspace_id: job.workspace_id,
    github_connection_id: connection.id,
    website_connection_id: job.metadata.website_connection_id,
    repository_id: repoId,
    repository_full_name: fullName,
    framework: String(plan.framework),
    adapter: String(plan.adapter),
    entrypoint: String(plan.entrypoint),
    status: "pending",
    branch_name: branchName,
    commit_sha: commitSha,
    pull_request_number: pullNumber,
    pull_request_url: pullUrl,
    metadata: { execution_job_id: job.id },
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,website_connection_id,repository_id" }).select("id").single();
  if (saveError || !installation) throw new Error("GitHub created the pull request, but Misma could not save its installation record.");
  await admin.from("plugin_execution_jobs").update({
    status: "awaiting_merge", branch_name: branchName, pull_request_number: pullNumber,
    pull_request_url: pullUrl, updated_at: new Date().toISOString(),
  }).eq("id", job.id).eq("workspace_id", job.workspace_id);
  await step(admin, job.workspace_id, job.id, "create_pull_request", "succeeded", { pullRequestUrl: pullUrl, pullRequestNumber: pullNumber }, "", progress);
  await addLog(admin, job.workspace_id, job.id, userId, "github.pull_request_created", {
    repository: fullName, pull_request_number: pullNumber, framework: plan.framework, entrypoint: plan.entrypoint,
  });
  return { pullUrl, pullNumber, branchName, commitSha, entrypoint: plan.entrypoint, framework: plan.framework };
}

async function processExecutionRequest(request: Request, progress: (event: Row) => void): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const requestedOrigin = request.headers.get("origin") || APP_ORIGIN;
  const allowedOrigins = [APP_ORIGIN, "http://localhost:5173", "http://localhost:3000"];
  const origin = allowedOrigins.includes(requestedOrigin) ? requestedOrigin : APP_ORIGIN;
  if (!allowedOrigins.includes(requestedOrigin)) return json({ error: "Origin not allowed." }, 403, APP_ORIGIN);
  try {
    const input: unknown = await request.json();
    if (!isRecord(input)) return json({ error: "Invalid execution request." }, 400, origin);
    const workspaceId = safe(input.workspaceId, 80);
    if (!/^[0-9a-f-]{36}$/i.test(workspaceId)) return json({ error: "Select a valid workspace." }, 400, origin);
    const message = safe(input.message, 4000);
    let conversationId = input.conversationId == null ? null : Number(input.conversationId);
    if (conversationId !== null && (!Number.isSafeInteger(conversationId) || conversationId < 1)) return json({ error: "Invalid conversation." }, 400, origin);
    const { admin, userId } = await authorize(request, workspaceId);

    let job: Row | null = null;
    if (conversationId) {
      const { data } = await admin.from("plugin_execution_jobs").select("*")
        .eq("workspace_id", workspaceId).eq("conversation_id", conversationId)
        .in("status", ["awaiting_website","awaiting_repository","awaiting_approval","awaiting_merge","deploying","verifying"])
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      job = data;
    }
    const activePlugins = Array.isArray(input.activePlugins) ? input.activePlugins.map(x => String(x).toLowerCase()) : [];
    // An explicit @github mention is the user's intent signal. Do not require
    // a client-side cached connection list: it can be stale during OAuth return
    // or workspace hydration. Authorization and installation are still checked
    // below on the server before any GitHub data is read.
    const githubMentioned = /(?:^|[^a-z0-9_])@github\b/i.test(message);
    const githubActive = githubMentioned || activePlugins.includes("github");
    const repositoryListIntent = githubMentioned && isRepositoryListIntent(message);
    const repositoryReadApproved = githubMentioned && isReadApprovalMessage(message);
    if (!job && (!githubActive || (!isInstallIntent(message) && !repositoryListIntent && !repositoryReadApproved))) {
      return json({ handled: false }, 200, origin);
    }

    const { data: githubPreference, error: preferenceError } = await admin.from("user_plugins")
      .select("permission_mode,is_installed")
      .eq("user_id", userId).eq("provider", "github").maybeSingle();
    if (preferenceError) throw new Error("Could not verify the GitHub plugin permission settings.");
    const configuredPermissionMode = String(githubPreference?.permission_mode || "low_risk");
    const permissionMode = ["always_ask", "read", "low_risk", "all"].includes(configuredPermissionMode)
      ? configuredPermissionMode : "low_risk";
    const jobNeedsPluginAccess = !job || ["awaiting_website", "awaiting_repository", "awaiting_approval"].includes(String(job.status));
    if (jobNeedsPluginAccess && (!githubPreference || githubPreference.is_installed !== true)) {
      throw new Error("Install the GitHub plugin in your Misma account before continuing repository actions.");
    }

    progress({ type: "activity", step: "github_connection", title: "Checking your connected GitHub account", status: "running" });
    const connection = await getGithubConnection(admin, workspaceId);
    progress({ type: "activity", step: "github_connection", title: "GitHub account verified", status: "succeeded", detail: safe(connection.external_account_name, 100) });
    const installationId = Number(connection.installation_id);
    if (!Number.isSafeInteger(installationId) || installationId <= 0) throw new Error("The connected GitHub App installation is invalid.");
    let responseText = "";
    let jobId = job?.id || "";
    const now = new Date().toISOString();

    if (!job && (repositoryListIntent || repositoryReadApproved)) {
      if (permissionMode === "always_ask" && !repositoryReadApproved) {
        const approvalText = "Before I read your GitHub repository metadata, please approve read access for this request. Reply **@github APPROVE READ** to continue, or leave it unanswered to cancel.";
        const saved = await createOrUpdateConversation(admin, workspaceId, conversationId, message, approvalText);
        return json({ handled: true, ...saved, execution: { provider: "github", action: "list_repositories", status: "awaiting_read_approval" } }, 200, origin);
      }
      const repositories = await listRepos(installationId, progress);
      const inventoryText = formatRepositoryInventory(repositories, safe(connection.external_account_name, 100));
      const saved = await createOrUpdateConversation(admin, workspaceId, conversationId, message, inventoryText);
      return json({ handled: true, ...saved, execution: { provider: "github", action: "list_repositories", status: "succeeded", repositoryCount: repositories.length } }, 200, origin);
    }

    if (!job) {
      const { data: websites, error: websitesError } = await admin.from("website_connections")
        .select("id,name,domain,public_key,widget_public_key")
        .eq("workspace_id", workspaceId).is("widget_deleted_at", null)
        .order("created_at", { ascending: false }).limit(20);
      if (websitesError) throw new Error("Could not load the websites connected to this workspace.");
      if (!websites?.length) {
        responseText = "I can prepare a GitHub installation, but this workspace has no active Misma website connection yet. Connect the website in Misma first, then ask me to install the widget.";
      } else {
        if (!conversationId) {
          const { data: newConversation, error: conversationCreateError } = await admin.from("conversations").insert({
            workspace_id: workspaceId, channel: "Dashboard",
            latest_text: message.slice(0, 200) || "Install Misma widget", status: "AI",
          }).select("id").single();
          if (conversationCreateError || !newConversation) throw new Error("Could not start an execution conversation.");
          conversationId = Number(newConversation.id);
        }
        const { data: created, error: createError } = await admin.from("plugin_execution_jobs").insert({
          workspace_id: workspaceId, user_id: userId, conversation_id: conversationId,
          provider: "github", operation: "widget_install",
          status: websites.length === 1 ? "awaiting_repository" : "awaiting_website",
          request_text: message,
          metadata: {
            website_choices: websites.map((item: any) => ({ id: item.id, name: item.name, domain: item.domain })),
            ...(websites.length === 1 ? { website_connection_id: websites[0].id } : {}),
          },
        }).select("*").single();
        if (createError || !created) throw new Error("Could not create the execution job.");
        job = created;
        jobId = created.id;
        await addLog(admin, workspaceId, jobId, userId, "execution.job_created", { operation: "widget_install" });
        await step(admin, workspaceId, jobId, "resolve_website", "succeeded", { websiteCount: websites.length }, "", progress);
        if (websites.length > 1) {
          responseText = "I found " + websites.length + " active Misma websites in this workspace. Which website should receive the widget?\n\n" +
            websites.map((site: any, index: number) => (index + 1) + ". " + (site.name || site.domain || "Website") + (site.domain ? " — " + site.domain : "")).join("\n") +
            "\n\nReply with the number or exact website name.";
        }
      }
    }

    if (job && job.status === "awaiting_website") {
      const choices = Array.isArray(job.metadata?.website_choices) ? job.metadata.website_choices : [];
      const index = chooseNumberOrName(message, choices.map((x: any) => ({ name: String(x.name || x.domain || ""), full_name: String(x.domain || "") })));
      if (index < 0) {
        responseText ||= "Choose one of the Misma websites listed above by number or exact name.";
      } else {
        const selected = choices[index];
        const { error } = await admin.from("plugin_execution_jobs").update({
          status: "awaiting_repository",
          metadata: { ...job.metadata, website_connection_id: selected.id, selected_website: selected.domain || selected.name },
          updated_at: now,
        }).eq("id", job.id).eq("workspace_id", workspaceId);
        if (error) throw new Error("Could not save the selected website.");
        job = { ...job, status: "awaiting_repository", metadata: { ...job.metadata, website_connection_id: selected.id } };
        responseText = "";
      }
    }

    if (job && job.status === "awaiting_repository" && permissionMode === "always_ask" && job.metadata?.read_actions_approved !== true) {
      if (/^(?:approve read|allow read|approve repository access)[.!]?$/i.test(message.trim())) {
        const nextMetadata = { ...job.metadata, read_actions_approved: true, read_approved_at: now };
        const { error: readApprovalError } = await admin.from("plugin_execution_jobs").update({
          metadata: nextMetadata, updated_at: now,
        }).eq("id", job.id).eq("workspace_id", workspaceId);
        if (readApprovalError) throw new Error("Could not record your repository-read approval.");
        job = { ...job, metadata: nextMetadata };
        await addLog(admin, workspaceId, job.id, userId, "execution.repository_read_approved", { permission_mode: permissionMode });
      } else {
        responseText = "Before I list repositories or inspect repository files, may I read the GitHub repository information for this request? Reply APPROVE READ to continue, or CANCEL to stop.";
      }
    }

    if (job && job.status === "awaiting_repository" &&
        (permissionMode !== "always_ask" || job.metadata?.read_actions_approved === true)) {
      if (!job.metadata?.website_connection_id) {
        const websites = Array.isArray(job.metadata?.website_choices) ? job.metadata.website_choices : [];
        responseText ||= "Select the website first: " + websites.map((x: any, i: number) => (i + 1) + ". " + (x.name || x.domain)).join("; ");
      } else {
        const repos = await listRepos(installationId);
        if (!repos.length) throw new Error("The connected GitHub App cannot access any repositories. Open GitHub App settings and grant access to the website repository.");
        if (!job.metadata?.repository_choices) {
          const { error } = await admin.from("plugin_execution_jobs").update({
            metadata: { ...job.metadata, repository_choices: repos.map(({ id, full_name, name, default_branch, html_url, private: isPrivate }) => ({ id, full_name, name, default_branch, html_url, private: isPrivate })) },
            updated_at: now,
          }).eq("id", job.id).eq("workspace_id", workspaceId);
          if (error) throw new Error("Could not save the GitHub repository choices.");
          job.metadata = { ...job.metadata, repository_choices: repos };
          responseText = "I found " + repos.length + " repositories accessible to the connected GitHub App. Which repository contains the website?\n\n" +
            repos.slice(0, 30).map((repo, index) => (index + 1) + ". " + repo.full_name + (repo.private ? " (private)" : "")).join("\n") +
            (repos.length > 30 ? "\n…and " + (repos.length - 30) + " more. Reply with the exact owner/repository name." : "") +
            "\n\nReply with the number or exact repository name.";
        } else {
          const choices = job.metadata.repository_choices as Repo[];
          const index = chooseNumberOrName(message, choices.map(x => ({ name: x.name, full_name: x.full_name })));
          if (index < 0) {
            responseText = "Choose a repository from the list above. Reply with its number or exact owner/repository name.";
          } else {
            const selected = choices[index];
            const { data: website, error: websiteError } = await admin.from("website_connections")
              .select("id,domain,public_key,widget_public_key")
              .eq("id", job.metadata.website_connection_id).eq("workspace_id", workspaceId).is("widget_deleted_at", null).maybeSingle();
            if (websiteError || !website) throw new Error("The selected Misma website is no longer available.");
            const siteKey = safe(website.widget_public_key || website.public_key, 200);
            if (!siteKey) throw new Error("The selected Misma website does not have a public widget key. Reconnect the website before installation.");
            await admin.from("plugin_execution_jobs").update({
              status: "planning", repository_id: selected.id, repository_full_name: selected.full_name,
              repository_url: selected.html_url, default_branch: selected.default_branch,
              updated_at: now,
            }).eq("id", job.id).eq("workspace_id", workspaceId);
            await step(admin, workspaceId, job.id, "inspect_repository", "running", { repository: selected.full_name }, "", progress);
            let plan: Awaited<ReturnType<typeof inspectRepo>>;
            try {
              plan = await inspectRepo(selected, installationId, siteKey, progress);
            } catch (inspectionError) {
              const failure = inspectionError instanceof Error ? inspectionError.message : "Repository inspection failed.";
              await admin.from("plugin_execution_jobs").update({
                status: "failed", error_message: failure.slice(0, 600), updated_at: new Date().toISOString(),
              }).eq("id", job.id).eq("workspace_id", workspaceId);
              await step(admin, workspaceId, job.id, "inspect_repository", "failed", {}, failure.slice(0, 300), progress);
              await addLog(admin, workspaceId, job.id, userId, "repository.inspection_failed", { message: failure.slice(0, 240) });
              throw inspectionError;
            }
            const { error: planError } = await admin.from("plugin_execution_jobs").update({
              status: "awaiting_approval", file_path: plan.entrypoint, plan, updated_at: new Date().toISOString(),
            }).eq("id", job.id).eq("workspace_id", workspaceId);
            if (planError) throw new Error("Repository inspection succeeded, but Misma could not save the prepared patch.");
            job = { ...job, status: "awaiting_approval", file_path: plan.entrypoint, plan };
            await step(admin, workspaceId, job.id, "inspect_repository", "succeeded", {
              repository: selected.full_name, framework: plan.framework, entrypoint: plan.entrypoint,
            }, "", progress);
            await addLog(admin, workspaceId, job.id, userId, "repository.widget_plan_prepared", {
              repository: selected.full_name, framework: plan.framework, entrypoint: plan.entrypoint,
            });
            responseText = "I inspected **" + selected.full_name + "** and detected **" + plan.framework + "**. The widget is not installed in the selected entry point.\n\n" +
              "Proposed change:\n- " + plan.summary + "\n- File: `" + plan.entrypoint + "`\n- No existing environment variables, build settings, or unrelated files will be changed.\n\n" +
              "I prepared the patch on the server but have not changed GitHub yet. Reply **APPROVE** to create a dedicated branch and pull request, or **CANCEL** to discard this plan.";
          }
        }
      }
    }

    if (job && job.status === "awaiting_approval") {
      if (/^(?:cancel|reject|discard)(?:\s+(?:this|the)\s+(?:plan|changes))?[.!]?$/i.test(message.trim())) {
        await admin.from("plugin_execution_jobs").update({ status: "cancelled", updated_at: now }).eq("id", job.id).eq("workspace_id", workspaceId);
        await admin.from("plugin_execution_approvals").upsert({
          workspace_id: workspaceId, job_id: job.id, approved_by: userId, decision: "rejected",
          approved_scope: { repository: job.repository_full_name, file_path: job.file_path },
        }, { onConflict: "job_id" });
        await addLog(admin, workspaceId, job.id, userId, "execution.plan_rejected");
        responseText = "I discarded the prepared changes. No GitHub branch, commit, or pull request was created.";
      } else if (/^(?:approve|approved|yes(?:,? approve)?|approve changes|create the pull request)(?:\s+changes)?[.!]?$/i.test(message.trim()) ||
          permissionMode === "low_risk" || permissionMode === "all") {
        const explicitApproval = /^(?:approve|approved|yes(?:,? approve)?|approve changes|create the pull request)(?:\s+changes)?[.!]?$/i.test(message.trim());
        const { data: website } = await admin.from("website_connections").select("id")
          .eq("id", job.metadata.website_connection_id).eq("workspace_id", workspaceId).is("widget_deleted_at", null).maybeSingle();
        if (!website) throw new Error("The selected website is no longer active. Prepare the plan again.");
        const { error: approvalError } = await admin.from("plugin_execution_approvals").upsert({
          workspace_id: workspaceId, job_id: job.id, approved_by: userId, decision: "approved",
          approved_scope: { repository: job.repository_full_name, file_path: job.file_path, operation: "create_pull_request", permission_mode: permissionMode, auto_approved_by_policy: !explicitApproval },
        }, { onConflict: "job_id" });
        if (approvalError) throw new Error("Could not record your approval.");
        await admin.from("plugin_execution_jobs").update({
          status: "approved", approved_by: userId, approved_at: now, updated_at: now,
        }).eq("id", job.id).eq("workspace_id", workspaceId);
        await addLog(admin, workspaceId, job.id, userId, explicitApproval ? "execution.plan_approved" : "execution.plan_auto_approved", { repository: job.repository_full_name, permission_mode: permissionMode });
        let result: Row;
        try {
          result = await executeApprovedPlan(admin, { ...job, status: "approved" }, userId, connection, progress);
          job = { ...job, status: "awaiting_merge", pull_request_url: result.pullUrl, pull_request_number: result.pullNumber };
        } catch (executionError) {
          const failure = executionError instanceof Error ? executionError.message : "GitHub execution failed.";
          await admin.from("plugin_execution_jobs").update({
            status: "failed", error_message: failure.slice(0, 600), updated_at: new Date().toISOString(),
          }).eq("id", job.id).eq("workspace_id", workspaceId);
          await addLog(admin, workspaceId, job.id, userId, "execution.failed", { message: failure.slice(0, 240) });
          throw executionError;
        }
        responseText = "GitHub created the pull request successfully.\n\n- Repository: " + job.repository_full_name +
          "\n- Framework: " + result.framework + "\n- File changed: `" + result.entrypoint + "`\n- Branch: `" + result.branchName +
          "`\n\nReview the changes here: " + result.pullUrl +
          "\n\nYour production website has not been changed yet. Merge the pull request in GitHub. Misma will only report deployment as complete after a hosting deployment has been verified.";
      } else {
        responseText = "The proposed patch is waiting for your decision. Reply **APPROVE** to create the GitHub pull request, or **CANCEL** to discard it. No repository changes have been made yet.";
      }
    }

    if (job && ["awaiting_merge","deploying","verifying"].includes(String(job.status)) && !responseText) {
      progress({
        type: "activity", step: "pull_request_merge",
        title: "Waiting for the pull request to be merged in GitHub",
        status: "waiting", detail: job.pull_request_url || job.repository_full_name,
      });
      progress({
        type: "activity", step: "deployment_verification",
        title: "Deployment verification is waiting for the merge",
        status: "waiting",
        detail: "Misma will report deployment only after the hosting provider confirms it.",
      });
      responseText = "This installation is waiting for its pull request to be merged.\n\n" +
        (job.pull_request_url ? "Pull request: " + job.pull_request_url + "\n\n" : "") +
        "The pull request must be merged in GitHub. Misma has not reported a production deployment as successful.";
    }
    if (!responseText) responseText = "Misma execution is processing this request. Check the current execution status in this conversation.";

    const saved = await createOrUpdateConversation(admin, workspaceId, conversationId, message, responseText);
    return json({
      handled: true, ...saved,
      execution: { jobId: jobId || job?.id || null, status: job?.status || "awaiting_repository", provider: "github" },
    }, 200, origin);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Misma could not complete this execution step.";
    console.error("[misma-execution] Request failed:", message.slice(0, 300));
    return json({ error: message }, 400, origin);
  }
}

async function main(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const requestedOrigin = request.headers.get("origin") || APP_ORIGIN;
  const allowedOrigins = [APP_ORIGIN, "http://localhost:5173", "http://localhost:3000"];
  const origin = allowedOrigins.includes(requestedOrigin) ? requestedOrigin : APP_ORIGIN;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: Row) => {
        try { controller.enqueue(encoder.encode("data: " + JSON.stringify(event) + "\n\n")); }
        catch { /* The requesting chat was closed while the action was running. */ }
      };
      void processExecutionRequest(request, send).then(async (response) => {
        const body = await response.json().catch(() => ({ error: "Misma could not read the execution response." }));
        send({ type: "result", status: response.status, body });
        try { controller.close(); } catch { /* The stream was already cancelled. */ }
      }).catch((cause) => {
        send({ type: "result", status: 500, body: { error: cause instanceof Error ? cause.message : "Misma execution failed." } });
        try { controller.close(); } catch { /* The stream was already cancelled. */ }
      });
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      ...CORS,
      "Access-Control-Allow-Origin": origin,
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
Deno.serve(main);
