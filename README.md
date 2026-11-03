# Misma

Misma is a React application built with TanStack Start and Vite. Supabase provides authentication and Postgres; the dashboard AI uses a Supabase Edge Function with Gemini as its primary provider and optional Groq, OpenAI, and Mistral fallbacks.

## Local development

Requirements: Bun 1.4.4 or newer.

1. Copy `.env.example` to `.env`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the Misma Supabase project values.
3. Install and start the app:

   ```sh
   bun install
   bun run dev
   ```

Useful checks:

```sh
bun run typecheck
bun test
bun run build
```

Only the project URL and publishable key belong in frontend environment variables. Never put AI provider API keys, a Supabase secret key, or a service-role key in `.env`, `NEXT_PUBLIC_*`, or `VITE_*` variables.

## Supabase setup

The migration `supabase/migrations/20261031000000_misma_core.sql` defines the Misma dashboard schema and RLS policies. It creates:

- `workspaces` and `workspace_members`
- `contacts`, `conversations`, and `messages`
- `orders`, `knowledge_entries`, and `audit_events`

The migration does not import BizAI/Core.01 or website-widget tables, and does not create Storage buckets. The current app has no file-upload feature. Review the SQL and apply it only to the new Misma project after confirming the linked project ref; it does not migrate or delete existing data.

Enable Email/Password in Supabase Auth. Configure the site's allowed redirect URLs for `/dashboard`, `/login`, and `/auth/callback`. Google sign-in is optional and requires enabling/configuring the Google provider in the Supabase dashboard. Google OAuth uses PKCE; the callback exchanges the authorization code in the browser before navigating to the dashboard.

## Dashboard AI

The authenticated dashboard calls `supabase/functions/misma-chat`. Gemini is tried first. If it fails, the function tries configured providers in this order: Groq, OpenAI, then Mistral. Each provider gets up to two attempts for network/time-out, HTTP 408, HTTP 429, and server (5xx) failures. Non-retryable client errors move directly to the next provider. Each attempt has a 12-second timeout. At least one provider key is required.

Set provider keys as Supabase Edge Function secrets (never in frontend environment variables):

```sh
supabase secrets set GEMINI_API_KEY=... GROQ_API_KEY=... OPENAI_API_KEY=... MISTRAL_API_KEY=...
```

Only configure the providers you want available. Gemini remains primary whenever `GEMINI_API_KEY` is present. Optional model overrides are `GEMINI_MODEL` (default `gemini-2.5-flash`), `GROQ_MODEL` (default `llama-3.3-70b-versatile`), `OPENAI_MODEL` (default `gpt-4o-mini`), and `MISTRAL_MODEL` (default `mistral-small-latest`). Supabase supplies `SUPABASE_URL` and the publishable/anon key to the function runtime.

The Edge Function validates the user's Supabase access token and uses that token for all Postgres requests, so workspace RLS applies. It does not use a service-role key. `supabase/config.toml` keeps JWT verification enabled. The successful response retains the existing `conversationId`, `userMessage`, and `aiMessage` fields, and adds `provider` and `usedFallback` metadata.

Workspace resolution is membership-checked. If the user belongs to exactly one workspace, it is selected automatically. If the user belongs to multiple workspaces, the request must include the selected `workspaceId`; the Edge Function verifies that the authenticated user is a member before reading or writing workspace data. Requests without a valid selection receive HTTP 409 or 403 rather than silently using an arbitrary membership.

After reviewing the migration and confirming the linked ref is `grlrrmebnthxguluybgb`, apply the schema and deploy the function:

```sh
supabase link --project-ref grlrrmebnthxguluybgb
supabase db push
supabase functions deploy misma-chat
```

Set the API keys for the providers you intend to use in the Misma project's Edge Function secrets before testing chat. Deploy the updated function after reviewing the branch. No Supabase migration or function deployment is required for this provider and workspace-resolution change.
