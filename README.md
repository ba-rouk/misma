# Misma

Misma is a React application built with TanStack Start and Vite. Supabase provides authentication and Postgres; the dashboard AI uses a Supabase Edge Function with Groq as its primary provider, Gemini as its first fallback, and optional OpenAI and Mistral fallbacks.

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

The authenticated dashboard calls `supabase/functions/misma-chat`. Provider routing is automatic and only includes providers whose Edge Function API keys are configured:

- Normal text: Groq → Gemini → NVIDIA → OpenRouter → Agnes → Cohere → Mistral → OpenAI.
- **Think harder**: NVIDIA DeepSeek V4.1 Flash is tried first with higher reasoning effort, followed by the configured fallbacks.
- **Image or video upload**: Agnes vision is tried first. Video uploads are sampled into two keyframes in the browser; the original video is retained in the conversation. The current video-analysis path examines visual frames and does not transcribe video audio.
- **PDF upload**: OpenRouter handles the PDF file input. Text, CSV, and common source-code files are extracted from private Storage and supplied as text context.
- If a provider rejects a request with a retryable network error, HTTP 408, HTTP 429, or server (5xx) error, it receives one retry before the next provider is tried. Non-retryable errors move to the next compatible provider.

Configure keys in Supabase Edge Function Secrets only:

```text
GROQ_API_KEY
GEMINI_API_KEY
NVIDIA_API_KEY
OPENROUTER_API_KEY
AGNES_API_KEY
COHERE_API_KEY
MISTRAL_API_KEY
OPENAI_API_KEY
```

Optional model overrides:

| Variable | Default |
|---|---|
| `GROQ_MODEL` | `openai/gpt-oss-120b` |
| `GEMINI_MODEL` | `gemini-3.6-flash` |
| `NVIDIA_MODEL` | `deepseek-ai/deepseek-v4.1-flash` |
| `NVIDIA_THINK_MODEL` | `deepseek-ai/deepseek-v4.1-flash` |
| `OPENROUTER_MODEL` | `openrouter/auto` |
| `AGNES_MODEL` | `agnes-2.5-flash` |
| `AGNES_VISION_MODEL` | `agnes-2.0-flash` |
| `AGNES_IMAGE_MODEL` | `agnes-image-2.1-flash` |
| `AGNES_VIDEO_MODEL` | `agnes-video-v2.0` |
| `COHERE_MODEL` | `command-a-plus-05-2026` |
| `MISTRAL_MODEL` | `mistral-small-latest` |
| `OPENAI_MODEL` | `gpt-4o-mini` |

The Edge Function validates the user's Supabase access token and uses that token for Postgres and Storage requests, so workspace RLS policies apply. It does not use a service-role key. `supabase/config.toml` keeps JWT verification enabled. Workspace resolution is membership-checked: a user with one workspace is resolved automatically; a user with multiple workspaces must send a selected `workspaceId`, which the function verifies against membership.

### Private chat uploads and Agnes media creation

The migration `supabase/migrations/20261103000000_misma_chat_media.sql` adds `messages.attachments` and the private `misma-media` Storage bucket. The bucket is limited to 25 MB per object. Storage object paths must be `<workspace-id>/<auth-user-id>/<file-name>`; RLS checks membership and user ownership. The dashboard creates one-hour signed URLs for previews and model input. Images are compressed in the browser when they exceed 4 MB; videos are stored and sampled into two JPEG keyframes for visual analysis. Supported text/code file extensions include TXT, Markdown, CSV, JSON, HTML, CSS, JS/TS, Python, SQL, YAML, TOML and common source languages. PDF analysis requires the OpenRouter key and PDFs are limited to 12 MB.

The composer **+** menu provides:
- **Think harder** for a higher-reasoning model route on questions, code and text-based files.
- **File**, **Photo** and **Camera** upload options.
- **Create image** and **Create video**, both routed to Agnes. Image generation returns an image to the chat. Video generation is asynchronous; the dashboard polls Agnes and saves the finished video as an assistant attachment. Uploaded image references can guide generation; video uploads supply sampled keyframes.

Never place AI provider API keys, a Supabase secret key, or a service-role key in `.env`, `NEXT_PUBLIC_*`, or `VITE_*` variables.

### Chat message controls

The dashboard shows message actions on hover (and persistently on touch devices). User prompts can be copied, shared, or edited. Editing a saved prompt replaces that turn and removes later turns after confirmation. Misma responses can be copied, rated with thumbs up/down (the selection is currently local to the open dashboard session and is not persisted), read aloud with browser speech synthesis, shared, or regenerated. Regeneration reuses the last saved user prompt; the Edge Function replaces the assistant answer and does not insert another user message. Retrying a failed send reuses its optimistic message row instead of appending a duplicate. Uploaded files remain attached to their chat messages; history loads fresh one-hour signed URLs instead of storing public file URLs.


## Core.01 knowledge model

Misma uses Core.01 as a workspace-scoped, room-based experience and knowledge layer. Each successful dashboard AI exchange is automatically recorded as an observed experience and pending training example, grouped into Business Profile, Products, Prices, Customers, Policies, FAQ, Orders, Staff, Procedures, or General. A positive response rating reinforces that experience into an approved Core.01 lesson; approved lessons are retrieved in future prompts when relevant. A negative rating rejects the lesson. This is retrieval-augmented learning from stored experiences, not direct fine-tuning or changing a provider model's weights.

## Automatic media intent

When a signed-in user types an explicit instruction such as “generate an image of…” or “create a video of…” without first selecting a Create tool, Misma detects the media type and routes the request to Agnes image or video generation automatically.
