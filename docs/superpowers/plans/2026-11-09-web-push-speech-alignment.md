# Web Push Human Requests and Speech Talk Parity Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with test-first verification.

**Goal:** Add opt-in, multi-device Web Push notifications for website human requests and make dashboard Speech Talk match the widget.

**Architecture:** A service worker receives web push. A workspace-scoped subscription table uses RLS and a private VAPID key store; the existing `misma-widget` Edge Function handles subscription management and best-effort notification delivery. Dashboard Speech Talk uses the widget's fixed voice profile without changing the read-aloud preset.

**Tech Stack:** React 19, TypeScript, Bun, Supabase Postgres/RLS, Supabase Edge Functions (Deno), Web Push, browser Service Worker / Push APIs.

**Spec:** `docs/superpowers/specs/2026-11-09-web-push-speech-alignment-design.md`

## Global Constraints
- Never prompt for browser notification permission on page load; request it only from the user's enable action.
- Never expose a VAPID private key or a push endpoint to unrelated workspace members.
- Push delivery is best-effort and must not fail a saved customer handoff.
- Preserve the existing in-dashboard notification centre and read-aloud voice selection.
- Use the widget speech profile: Siri-first woman voice, voice-provided English locale, fallback `en-US`, pitch `1.16`, rate `0.98`.

## Review Focus
- Permission denied or unsupported Push API: user receives a clear message and can still use dashboard notifications.
- Duplicate human request: notification tag stays stable and does not create an unbounded notification pile.
- Expired subscription endpoint: 404/410 is deleted without rejecting handoff.
- Account/workspace switch: endpoint registration is owned by the authenticated workspace member, not a client-supplied user ID.
- Speech device has no Siri/female metadata: use the same US-first English fallback strategy as the widget.

---

### Task 1: Define push storage and trigger regression tests

**Files:**
- Create: `supabase/migrations/20261109091625_web_push_subscriptions.sql`
- Create: `public/misma-push-sw.js`
- Modify: `supabase/functions/misma-widget/index.ts`
- Modify: `src/routes/dashboard.tsx`
- Modify: `src/lib/misma-voice.ts`
- Modify: `src/assets/misma-widget-runtime.js`
- Test: `tests/project-config.test.mjs`

**Interfaces:**
- Public browser subscription row: `{ workspace_id, user_id, endpoint, p256dh, auth }`.
- Edge actions: `push-public-key`, `save-push-subscription`, `delete-push-subscription`.
- VAPID key RPC: `get_or_create_push_vapid_key_pair(p_public_key text, p_private_key text)`.

- [x] Write a failing test named `web push is workspace-scoped, opt-in, and connected to website human handoff`.
- [ ] Write a failing test named `dashboard Speech Talk shares the widget's woman English voice profile`.
- [x] Run the new tests and verify they fail because the new migration, service worker, push actions, and speech parity are missing.

### Task 2: Implement migration, subscription UI, worker, and push delivery

- [x] Add `push_subscriptions` with unique endpoint, membership FK, RLS read/insert/update/delete policies, and workspace/user index.
- [x] Add a private, non-API-exposed VAPID singleton and service-role-only keypair RPC.
- [x] Add authenticated public-key/save/delete actions to `misma-widget`; derive user ID from the verified bearer token.
- [x] Add VAPID-backed push delivery after `saveHumanRequest`; keep it best-effort and prune 404/410 subscriptions.
- [x] Add service worker display/click handling with same-origin URL validation.
- [x] Add Settings > Notifications device opt-in/disable controls and subscription restoration for this device.

### Task 3: Align dashboard Speech Talk

- [x] Keep the dashboard VoiceInputBar Speech Talk on the same woman/Siri-first preset the widget uses.
- [x] Match widget pitch 1.16, rate 0.98, selected-voice locale and `en-US` fallback; keep the system default retry.
- [x] Speak up to 1,600 cleaned characters in sentence chunks instead of truncating dashboard voice replies at 320 characters.
- [x] Keep the dashboard's read-aloud selector and its pitch logic unchanged.

### Task 4: Verify and ship

- [x] Run `bun test`, `bun run typecheck`, and `bun run build`.
- [x] Run `deno check supabase/functions/misma-widget/index.ts`.
- [x] Apply the additive Supabase migration, deploy the updated Edge Function, and check Supabase security/performance advisors.
- [x] Open PR, verify CI, and perform a separate whole-branch review.
- [ ] Merge the PR and verify the Render deployment is live.
