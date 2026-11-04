# Misma Performance, Media Persistence, and Library Preview

## Intent
Improve chat and media turnaround without weakening moderation, preserve the original prompt on retries without duplicating user messages, provide dependable download and explicit Save to Library actions for generated images/videos, and let users open shared or generated media from Library.

## Goals
- Bound sequential AI-provider and safety-review latency while retaining configured fallback providers.
- Keep prompt and generated-output safety checks fail-closed; never replace a failed review with an automatic allow.
- Make provider and safety stage durations visible in safe server diagnostics (provider name, status/reason category, elapsed milliseconds only).
- Keep retryMedia tied to the original saved human message; a retry must not insert a second human message.
- Provide working Download and Save to Library actions for generated images and videos.
- Preview image/video assets in Library when clicked; keep a separate download control and existing delete behavior.
- Keep media generation status/progress and the existing composer layout.

## Non-goals
- No provider-secret changes or new paid provider dependencies.
- No parallel duplicate model calls for ordinary chat.
- No removal of prompt/output moderation.
- No database schema changes unless the existing library file API proves insufficient.

## Architecture and implementation choice
Keep the existing React/Vite + Supabase Edge Function + Agnes architecture. Use a bounded sequential failover budget for ordinary AI requests and a smaller bounded provider set/timeout for media moderation. This is simpler and avoids duplicate provider spend while preventing a chain of full-length provider timeouts. Preserve both moderation gates. Reuse the existing secure generated-media proxy and workspace library upload API for download/save. Add a local Library media-preview dialog using the existing signed asset URLs and media metadata.

## Constraints
- Do not expose API keys, signed storage tokens, or raw provider bodies in diagnostics.
- Do not allow client-supplied generated-media URLs without the existing workspace/message ownership check.
- Generated assets remain stored as chat attachments; explicit Save to Library creates a durable Supabase Storage object and workspace_library_files record.
- Use existing dependencies and established project conventions.
- Verify with `bun run typecheck`, `bun test`, `bun run build`, and `deno check supabase/functions/misma-chat/index.ts`.
