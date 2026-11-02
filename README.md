# Misma

Misma is a React application built with TanStack Start and Vite. Supabase provides authentication and Postgres; the dashboard AI uses a Supabase Edge Function and Gemini.

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

Only the project URL and publishable key belong in frontend environment variables. Never put a Gemini API key, Supabase secret key, or service-role key in `.env`, `NEXT_PUBLIC_*`, or `VITE_*` variables.

## Supabase setup

The migration `supabase/migrations/20261031000000_misma_core.sql` defines the Misma dashboard schema and RLS policies. It creates:

- `workspaces` and `workspace_members`
- `contacts`, `conversations`, and `messages`
- `orders`, `knowledge_entries`, and `audit_events`

The migration does not import BizAI/Core.01 or website-widget tables, and does not create Storage buckets. The current app has no file-upload feature. Review the SQL and apply it only to the new Misma project after confirming the linked project ref; it does not migrate or delete existing data.

Enable Email/Password in Supabase Auth. Configure the site's allowed redirect URLs for `/dashboard`, `/login`, and `/auth/callback`. Google sign-in is optional and requires enabling/configuring the Google provider in the Supabase dashboard. Google OAuth uses PKCE; the callback exchanges the authorization code in the browser before navigating to the dashboard.

## Dashboard AI

The authenticated dashboard calls `supabase/functions/misma-chat`. Deploy it to the Misma project and set `GEMINI_API_KEY` in that project's Edge Function secrets. `GEMINI_MODEL` is optional; the function defaults to `gemini-2.5-flash`. Supabase supplies `SUPABASE_URL` and the publishable/anon key to the function runtime.

The Edge Function validates the user's Supabase access token and uses that token for all Postgres requests, so workspace RLS applies. It reads the Gemini key only through `Deno.env.get("GEMINI_API_KEY")`; it does not use a service-role key. `supabase/config.toml` keeps JWT verification enabled.

After reviewing the migration and confirming the linked ref is `grlrrmebnthxguluybgb`, apply the schema and deploy the function:

```sh
supabase link --project-ref grlrrmebnthxguluybgb
supabase db push
supabase functions deploy misma-chat
```

Set `GEMINI_API_KEY` in the Misma project's Edge Function secrets before testing chat. No Supabase migration or function deployment has been run automatically by this repository change.
