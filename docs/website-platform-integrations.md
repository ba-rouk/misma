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
