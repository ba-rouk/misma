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

The core migration does not import BizAI/Core.01 or website-widget tables and does not create Storage buckets. The separate chat-media migration below creates the private media bucket. Review the SQL and apply it only to the intended Misma project after confirming the linked project ref; it does not migrate or delete existing data.

Enable Email/Password in Supabase Auth. Configure the site's allowed redirect URLs for `/dashboard`, `/login`, and `/auth/callback`. Google sign-in is optional and requires enabling/configuring the Google provider in the Supabase dashboard. Google OAuth uses PKCE; the callback exchanges the authorization code in the browser before navigating to the dashboard.

## Dashboard AI

The authenticated dashboard calls `supabase/functions/misma-chat`. Provider routing is automatic and only includes providers whose Edge Function API keys are configured:

- Normal text: Groq → Gemini → NVIDIA → OpenRouter → Agnes → Cohere → Mistral → OpenAI.
- **Think harder**: NVIDIA DeepSeek V4.1 Flash is tried first with higher reasoning effort, followed by the configured fallbacks.
- **Image or video upload**: Agnes vision is tried first. Video uploads are sampled into two keyframes in the browser; the original video is retained in the conversation. The current video-analysis path examines visual frames and does not transcribe video audio.
- **PDF upload**: OpenRouter handles the PDF file input. Text, CSV, and common source-code files are extracted from private Storage and supplied as text context.
- A provider gets one bounded request attempt before the next compatible provider is tried. Non-retryable and transient errors both move to the next provider.

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
| `AGNES_VISION_MODEL` | `agnes-3.0-flash` |
| `AGNES_IMAGE_MODEL` | `agnes-image-2.5-flash` |
| `AGNES_VIDEO_MODEL` | `agnes-video-2.5-flash` (runtime-pinned; environment override not used) |
| `COHERE_MODEL` | `command-a-plus-05-2026` |
| `MISTRAL_MODEL` | `mistral-small-latest` |
| `OPENAI_MODEL` | `gpt-4o-mini` |

The Edge Function validates the user's Supabase access token and uses that token for Postgres and Storage requests, so workspace RLS policies apply. It does not use a service-role key. `supabase/config.toml` keeps JWT verification enabled. Workspace resolution is membership-checked: a user with one workspace is resolved automatically; a user with multiple workspaces must send a selected `workspaceId`, which the function verifies against membership.

### Private chat uploads and Agnes media creation

The migration `supabase/migrations/20261103000000_misma_chat_media.sql` adds `messages.attachments` and the private `misma-media` Storage bucket. The bucket is limited to 25 MB per object. Storage object paths must be `<workspace-id>/<auth-user-id>/<file-name>`; RLS checks membership and user ownership. The dashboard creates one-hour signed URLs for previews and model input. Images are compressed in the browser when they exceed 4 MB; videos are stored and sampled into two JPEG keyframes for visual analysis. Supported text/code file extensions include TXT, Markdown, CSV, JSON, HTML, CSS, JS/TS, Python, SQL, YAML, TOML and common source languages. PDF analysis requires the OpenRouter key and PDFs are limited to 12 MB.

The composer **+** menu provides:
- **Think harder** for a higher-reasoning model route on questions, code and text-based files.
- **File**, **Photo** and **Camera** upload options.
- **Create image** and **Create video**, both routed to Agnes. Image generation returns an image to the chat. Video generation is asynchronous; the dashboard polls Agnes and saves the finished video as an assistant attachment. A queue-full HTTP 503 is classified separately, retried once with a backoff that respects `Retry-After`, and returned with a recoverable prompt so the user can retry without losing their message. Uploaded image references can guide generation; video uploads supply sampled keyframes.

Never place AI provider API keys, a Supabase secret key, or a service-role key in `.env`, `NEXT_PUBLIC_*`, or `VITE_*` variables.

### Chat message controls

The dashboard shows message actions on hover (and persistently on touch devices). User prompts can be copied, shared, or edited. Editing a saved prompt replaces that turn and removes later turns after confirmation. Misma responses can be copied, rated with thumbs up/down (the selection is currently local to the open dashboard session and is not persisted), read aloud with the selected browser speech-synthesis voice, shared, or regenerated. Regeneration reuses the last saved user prompt; the Edge Function replaces the assistant answer and does not insert another user message. Retrying a failed send reuses its optimistic message row instead of appending a duplicate. Uploaded files remain attached to their chat messages; history loads fresh one-hour signed URLs instead of storing public file URLs.


### Live web search and current news

The dashboard Edge Function performs a live search when a message asks for current information, recent updates, or news. It uses Tavily first and Brave Search as a fallback, retrieves up to six result snippets, and passes source titles, dates, and URLs to the model so answers can cite the retrieved pages. This searches indexed results; it does not guarantee an exhaustive search of the entire internet. The assistant is instructed not to invent current facts when search is unavailable.

Configure at least one provider in **Supabase Dashboard → Edge Functions → Secrets**:

```text
TAVILY_API_KEY
BRAVE_SEARCH_API_KEY
```

Tavily is preferred when both are configured; Brave is used if Tavily is missing or does not return usable results. These secrets must remain server-side and must never be added to `.env`, `NEXT_PUBLIC_*`, or `VITE_*` variables. After setting the secret, redeploy `misma-chat` so the updated Edge Function is active. Without either key, Misma will explain that live search is not configured instead of pretending to have searched.

Provider requests now use a single bounded attempt before moving to the next configured provider, with a 15-second timeout for normal text, 22 seconds for image input, and 35 seconds for Think harder. This reduces time lost waiting on an unhealthy provider before fallback.
## Core.01 knowledge model

Misma uses Core.01 as a workspace-scoped, room-based experience and knowledge layer. Each successful dashboard AI exchange is automatically recorded as an observed experience and pending training example, grouped into Business Profile, Products, Prices, Customers, Policies, FAQ, Orders, Staff, Procedures, or General. A positive response rating reinforces that experience into an approved Core.01 lesson; approved lessons are retrieved in future prompts when relevant. A negative rating rejects the lesson. This is retrieval-augmented learning from stored experiences, not direct fine-tuning or changing a provider model's weights.

## Automatic media intent

When a signed-in user types an explicit instruction such as “generate an image of…” or “create a video of…” without first selecting a Create tool, Misma detects the media type and routes the request to Agnes image or video generation automatically.


### Agnes Video 2.5 Flash

Video creation uses the current Agnes Video 2.5 Flash schema: `mode` (`text` or `reference`), `seconds: "5"`, `size: "720P"`, `aspect_ratio: "16:9"`, and `n: 1`. The function polls with `model_name=agnes-video-2.5-flash` and reads the completed URL from either the top-level `url` or `metadata.url` response field. It does not send the legacy v2.0 `width`/`height`/`num_frames` payload or unsupported `negative_prompt` field.


### Agnes moderation and downloads

Agnes 3.0 Flash screens media prompts and supplied reference images before generation. Generated images are screened again before they are stored. Image and video outputs are downloadable through a workspace- and conversation-validated endpoint. Video prompts are safety-constrained before generation; the current integration does not decode and classify every generated video frame, so this is a preventive safeguard rather than an absolute guarantee about every output frame.


## General website widget script (published or unpublished sites)

From **Dashboard → Connect → Website**, register the website's real domain or its preview/staging URL. You can create the connection and copy its general HTML script before publishing the site; publication is not required to issue the site key. Paste the generated snippet into each page before the closing `</body>` tag.

The widget becomes verified when a page loads the script from the registered hostname. Use the exact hostname you registered (for example, a preview subdomain). HTTPS is required for hosted preview/staging pages; local development is supported on `http://localhost:PORT`. The site key is restricted to that registered hostname and should not be shared across unrelated websites. A website content scan still requires the page to be reachable by Misma's scanner; the chat widget can be installed and tested separately on a browser-accessible preview page.


## Website widget customization and Core.01 rooms

Each Misma workspace is the account owner's house. Every connected website receives its own Core.01 website room. Knowledge entered manually or imported from a file can be assigned to a specific connected website; unassigned knowledge remains workspace-wide. Website widget conversations are recorded as observed Core.01 experiences in that website's room.

The website dashboard includes **Customize widget**. Themes are saved in `website_connections.theme` and served by the `misma-widget` configuration action. The widget applies validated theme values as Shadow DOM CSS custom properties and checks the theme with an ETag. Existing websites without a saved theme continue using the original widget CSS. When changing the widget runtime in future releases, bump the `?v=` value used in the website script; the current version is `20261110-widget-theme-2`.

Apply these additive migrations in timestamp order:

- `20261110100000_website_widget_customization_rooms_scan.sql`
- `20261110103000_website_scan_metadata.sql`

The scanner reads public HTTP-rendered responses, not server-side source files, so it can inspect public sites regardless of whether they are built with PHP, Node, Go, Python, Ruby, Java, .NET, WordPress, Shopify, Wix or static HTML. It follows robots.txt disallow rules, restricts scanning to safe same-origin HTTP(S) URLs on ports 80/443, validates public DNS addresses and redirects, limits each response to 1.5 MB, and caps a scan at 50 pages and depth 8. It discovers pages from sitemap XML and RSS/Atom feeds, handles HTML, XHTML, text, JSON, XML and PDF, decodes common legacy character sets, and can use embedded Next.js/Nuxt/JSON-LD data. It stores page checkpoints with content hashes, ETags and Last-Modified values, and persists discovered URLs and progress so a failed scan can be resumed. Scan progress and skipped-page reasons are available from the website card.

For JavaScript-heavy sites whose rendered HTML contains little content, configure the optional Browserless secret in Supabase Edge Function Secrets:

```text
BROWSERLESS_API_KEY
```

Without this secret, the scanner still reads server-rendered HTML and embedded framework data, but cannot guarantee extraction of client-rendered SPA content. Never expose this key in frontend environment variables.

### Deploying these changes

Run the checks before merging:

```sh
bun install
bun run typecheck
bun test
bun run build
```

Apply database migrations to the Misma Supabase project, then deploy the updated widget function:

```sh
supabase link --project-ref grlrrmebnthxguluybgb
supabase db push
supabase functions deploy misma-widget
supabase functions deploy misma-chat
```

Render's `misma` service in the Intelle workspace deploys the dashboard and bundled widget asset from the merged `main` commit. Verify the deployment is live before testing the new customization route.
