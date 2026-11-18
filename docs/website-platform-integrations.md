# Website platform integrations

Misma's first provider adapter is a GitHub App. It creates a workspace-scoped connection, discovers repositories available to that installation, and prepares a narrow pull request that adds or updates the Misma widget script in a standard HTML entrypoint.

The dashboard route is /dashboard/integrations.

## Current implementation boundary

- GitHub App installation, repository discovery, and pull-request-based widget installation are implemented.
- Automatic mode asks GitHub to enable pull-request auto-merge. GitHub only merges when the repository permits it and its protection/check requirements are satisfied. If GitHub refuses auto-merge, the pull request remains available for manual review.
- Manual mode leaves the pull request open for the customer to review and merge.
- The first code adapter supports root index.html and public/index.html. Framework-specific entrypoints (for example Next.js App Router, Astro, SvelteKit, or server-rendered templates) need dedicated adapters; Misma must not guess and modify arbitrary files.
- Vercel, Netlify, and Render have database provider/project records and dashboard cards, but their OAuth/API adapters are not active yet. They require provider application registration and separate server-side credentials before customers can connect them.

## Create the Misma GitHub App

Create a GitHub App owned by the Misma organization/account.

Suggested settings:

- App name: Misma Website Installer
- Homepage URL: https://misma.onrender.com
- Where can this app be installed: Any account
- Setup URL: https://grlrrmebnthxguluybgb.supabase.co/functions/v1/misma-platform-integrations?mode=github-callback
- Webhook URL: https://grlrrmebnthxguluybgb.supabase.co/functions/v1/misma-platform-integrations?mode=webhook
- Webhook active: enabled
- Webhook events: installation, pull_request

Repository permissions (least privilege for the current workflow):

- Metadata: Read-only (GitHub requires this baseline permission)
- Contents: Read and write
- Pull requests: Read and write

Do not request Administration, Actions, Secrets, Workflows, or organization-wide permissions. The installer does not edit workflow files, secrets, or repository settings.

The GitHub App setup callback is not an OAuth user callback. The one-time state value is created by Misma, stored only as a SHA-256 hash, expires after ten minutes, and is consumed after successful installation.

## Supabase Edge Function secrets

Set these in the Misma Supabase project's Edge Function secrets. Do not add them to the browser bundle, Git repository, or customer-facing widget script.

- GITHUB_APP_ID: numeric GitHub App ID
- GITHUB_APP_SLUG: GitHub App URL slug
- GITHUB_PRIVATE_KEY: downloaded GitHub App private key PEM
- GITHUB_WEBHOOK_SECRET: webhook secret configured in the GitHub App

The function also uses the Supabase runtime values SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY. Never expose the service-role key.

## Callback and webhook behavior

The Edge Function has verify_jwt = false because GitHub's setup callback and webhook cannot provide a Misma user JWT. These public entry points are protected separately:

- Setup callback: verifies a short-lived, one-time state hash before saving the installation.
- Webhook: verifies X-Hub-Signature-256 with the configured webhook secret.
- Dashboard actions: require a valid Supabase access token and an owner/admin membership in the supplied workspace.
- Provider tokens: installation tokens are minted server-side for each operation and are not stored in the database.

## Database model

The additive migration creates:

- platform_connections: connected provider accounts/installations, scoped to a Misma workspace.
- platform_projects: repositories, sites, and services discovered through a provider.
- website_installations: the relationship between a Misma website and the selected provider project, including deployment preference and PR status.
- platform_installation_logs: auditable installation events.
- platform_oauth_states: short-lived, service-role-only callback state.

Authenticated users can read only records belonging to their workspace. Writes and callback state are service-role-only.

## Deployment

1. Apply 20261117120000_website_platform_integrations.sql to the Misma Supabase project.
2. Deploy the misma-platform-integrations Edge Function.
3. Set the four GitHub App secrets above.
4. Register the Setup URL, Webhook URL, permissions, and installation event in the GitHub App.
5. Deploy the Misma application containing /dashboard/integrations.
6. Test using a non-production repository first. Verify manual PR mode before testing auto-merge with branch protection enabled.

## Safety guarantees

- Misma never writes directly to the customer's default branch.
- Every source change is isolated on a dedicated branch and submitted as a pull request.
- Automatic deployment is delegated to GitHub auto-merge, which remains subject to repository rules and required checks.
- If auto-merge is unavailable, the PR stays open and the customer receives the GitHub review link.
- Only the widget script in a recognized HTML entrypoint is changed. No unrelated source files, secrets, or deployment configuration are modified.
- Removing a GitHub App installation marks the provider connection disconnected through a signed webhook. A merged pull-request webhook records the deployment as deployed; a separate live-site verification step is still required before marking it verified.


## Shared encrypted credential vault

The shared credential vault is the common storage layer for Vercel, Netlify, and Render. Provider-specific adapters must use this vault rather than writing tokens into `platform_connections.metadata`, browser storage, or logs.

- `platform_credentials` stores one encrypted credential bundle per platform connection.
- The Edge Function encrypts values with AES-256-GCM before writing to Postgres. Each write uses a fresh 96-bit random nonce and authenticated additional data bound to the workspace, provider, connection, and key version.
- The database stores only ciphertext, nonce, provider, credential kind, key version, and validation timestamps/status. There are no browser RLS policies or client grants on this table.
- The dashboard can request credential status, but never receives the ciphertext or plaintext token.
- The key version is stored with each row so keys can be rotated without making old credentials unreadable. Keep old key versions configured until their rows have been re-encrypted.
- The Edge Function exposes owner/admin-only actions: `platform-credential-save`, `platform-credential-status`, and `platform-credential-remove`. Saving is not the same as provider validation; newly stored credentials remain `unverified` until the relevant provider adapter calls the provider API.

### Generate the encryption key

Generate the key locally. Do not use an online key generator, commit the value, or paste it into a chat.

PowerShell:

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToBase64String($bytes)
```

Or a terminal with OpenSSL:

```bash
openssl rand -base64 32
```

The output must decode to exactly 32 random bytes. Add these two values in Supabase Dashboard → Project Settings → Edge Functions → Secrets:

- `PLATFORM_CREDENTIAL_ACTIVE_KEY_VERSION` = `1`
- `PLATFORM_CREDENTIAL_ENCRYPTION_KEY_V1` = the generated base64 value

Do not add either value to Render, GitHub, the website widget, or frontend environment variables. The encryption key belongs only in the Misma Supabase Edge Function secret store. Supabase documents that Edge Function secrets are configured in Project Settings and read server-side through `Deno.env.get`. See the [Supabase Edge Function secrets guide](https://supabase.com/docs/guides/functions/secrets).

### Provider credentials to create before customer rollout

These are Misma's application credentials. Create each application under the Misma-owned account, then save the credentials as Supabase Edge Function secrets. They are not the same as each customer's own account tokens.

| Provider | Credential | Where to create it |
| --- | --- | --- |
| GitHub | `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` | Already covered by the Misma GitHub App setup above |
| Vercel | `VERCEL_CLIENT_ID`, `VERCEL_CLIENT_SECRET` | Vercel Dashboard → select the Misma team/account → Integrations → Integrations Console → Create. Configure the Redirect URL and requested API scopes. The integration credentials are shown in its settings. |
| Netlify | `NETLIFY_CLIENT_ID`, `NETLIFY_CLIENT_SECRET` | Netlify avatar → User settings → Applications → OAuth applications → register a new application. Netlify provides a client ID and secret. A public integration must use OAuth2 rather than asking every customer to paste a personal access token. |
| Render | No global Misma client ID/secret | Each customer authorizes their own Render account with a Render API key. The customer provides it during the Render connection flow; Misma encrypts it in `platform_credentials`. Never use one personal Render API key for all customers. |

For Vercel, register the redirect URL as:

`https://grlrrmebnthxguluybgb.supabase.co/functions/v1/misma-platform-integrations?mode=vercel-callback`

For Netlify, the planned authorization callback is:

`https://grlrrmebnthxguluybgb.supabase.co/functions/v1/misma-platform-integrations?mode=netlify-callback`

Those callback handlers are part of the next provider-adapter phase; registering the OAuth applications now does not, by itself, make the Vercel or Netlify customer connection flow live.

Render API keys are created from the customer's Render Dashboard → Account Settings → API Keys. Render only displays the full key at creation. Customers must keep it private; where Render offers fine-grained/scoped API key permissions, select the minimum permissions needed for listing the intended service and initiating deployments. Render API requests use the key as a bearer token. See the [Render API setup guide](https://render.com/docs/api).

### Secret handling rules

- The Vercel and Netlify client secrets stay in Supabase Edge Function secrets. Customer OAuth access/refresh tokens go into the encrypted vault.
- A customer's Render API key goes into the encrypted vault, not into environment variables shared by all Misma customers.
- Never return a secret in a status response, store it in `metadata`, put it in a URL, or include it in an error/log message.
- Never ask a customer to send a provider secret to Misma support chat.
- When rotating the encryption key, add a new versioned secret first, set the active version to that version, and retain previous versions until every old row has been re-encrypted and verified.

## Website language and framework compatibility

Misma's widget runtime is a browser JavaScript asset loaded with one standard HTML `<script>` element. This means the widget does not need a different backend implementation for PHP, Python, Ruby, Java, C#, Go, Rust, Node.js, or another server-side language: those stacks ultimately return HTML to a browser that can load the same script.

The automatic source-code installer is a separate concern. The current GitHub adapter only edits root `index.html` or `public/index.html`; that is a deliberately narrow first adapter, not full language/framework support.

The long-term installer will use a framework adapter registry:

1. Detect the project from repository manifests and layout files (for example `package.json`, `pyproject.toml`, `Gemfile`, `composer.json`, `pom.xml`/`build.gradle`, `*.csproj`, `go.mod`, and `Cargo.toml`).
2. Select a reviewed adapter for the detected framework and install into its shared document/layout template (for example React/Next.js, Vue/Nuxt, Angular, Svelte/SvelteKit, Astro, Django, Flask, Rails, Laravel/PHP, WordPress, Spring/Java, ASP.NET, and Go templates).
3. Run adapter-specific checks and create a reviewable pull request. Never guess a source file or patch arbitrary application code.
4. If no safe adapter is available, provide the universal script snippet and clear instructions for the site's CMS, template, or shared HTML layout.

This gives broad language coverage without promising that Misma can safely rewrite every unknown codebase automatically. Websites that block JavaScript or third-party scripts with Content Security Policy must explicitly allow Misma's script origin or use an approved integration path. Sites that do not permit custom scripts require a native platform plugin/integration.

## Rollout status

The encrypted database schema and the server-side vault operations are being introduced before the Vercel, Netlify, and Render adapters. The provider OAuth callbacks, customer-facing connect screens, token validation, project discovery, deployment actions, and framework-specific source adapters are not yet enabled by this credential-vault change.
