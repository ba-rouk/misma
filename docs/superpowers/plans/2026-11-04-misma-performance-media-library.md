# Misma Performance and Media Library Implementation Plan

> **For agentic workers:** Use this plan task-by-task with the test-driven-development skill. This implementation is performed on a feature branch and proposed through a pull request.

**Goal:** Reduce avoidable chat/image latency and make generated/shared media reliably downloadable, savable, and previewable from Library.

**Architecture:** Keep the current provider and Supabase/Agnes pipeline. Add explicit latency budgets and diagnostics to existing sequential provider fallback, retain fail-closed prompt/output moderation with a bounded fallback list, reuse secure media download for a new Save to Library operation, and add a Library preview dialog.

**Tech Stack:** React 19, TypeScript, Bun tests, Supabase Edge Functions (Deno), Supabase Storage.

**Spec:** `docs/superpowers/specs/2026-11-04-misma-performance-media-library-design.md`

## Global Constraints
- Preserve existing Supabase workspace authorization and generated-media ownership checks.
- Never bypass media safety checks or treat reviewer failure as ALLOW.
- Do not duplicate human prompt messages during `retryMedia`.
- Reuse the existing provider secrets, storage bucket, and workspace library APIs.
- No new dependencies or destructive migrations.

## Review Focus
- All reviewers fail quickly: moderation must still fail closed and expose a retryable saved-prompt state.
- Slow primary provider: failover must respect a total request budget and still return the first valid answer.
- User retries from another conversation: only the original conversation and prompt may be reused.
- Expired Agnes URL: Library save/download should fail with actionable feedback without losing the saved chat prompt.
- Mobile Library preview: viewer must be usable, closable, and not trigger the row's download or delete controls.

---

### Task 1: Latency budgets and diagnostics

**Files:**
- Modify: `supabase/functions/misma-chat/index.ts`
- Test: `tests/project-config.test.mjs`

**Interfaces:**
- Keep `requestProvider(..., timeoutMs?)` unchanged.
- Bound ordinary chat provider iteration by a total deadline; pass remaining time as `timeoutMs`.
- Bound safety reviewer candidates and each reviewer request; retain ALLOW/BLOCK-only semantics.

- [x] Add static regression assertions for bounded provider attempts, request timing diagnostics, and safety-review fail-closed behavior.
- [x] Verify the regression test fails before implementation.
- [x] Implement a bounded failover deadline and per-provider elapsed timing; do not log credentials or full prompts.
- [x] Use a small configured safety-review fallback list with explicit per-reviewer timeout. If no reviewer returns ALLOW or BLOCK, keep throwing `MEDIA_SAFETY_UNAVAILABLE`.
- [x] Bound Tavily/Brave search network waits so a live search cannot hold a chat request indefinitely.
- [x] Run Bun tests, Deno check, typecheck, and production build.

### Task 2: Generated media download and Save to Library

**Files:**
- Modify: `src/routes/dashboard.tsx`
- Modify: `tests/project-config.test.mjs`

**Interfaces:**
- Add `handleSaveGeneratedMediaToLibrary(attachment, conversationId)`.
- Reuse `fetchAttachmentBlob`, `createWorkspaceLibraryFile`, the current `misma-media` bucket, and existing workspace/user path convention.
- Extend generated-image and generated-video action menus with Save to Library; retain Download.

- [x] Add regression assertions for Save to Library action, secure proxy retrieval, workspace-scoped upload, and video actions.
- [x] Verify the regression test fails before implementation.
- [x] Implement Save to Library with safe filename handling, explicit success/error state, and cleanup if library metadata creation fails.
- [x] Ensure generated videos also expose both Download and Save to Library.
- [x] Run Bun tests, typecheck, and production build.

### Task 3: Library media preview

**Files:**
- Modify: `src/routes/dashboard.tsx`
- Modify: `src/styles.css`
- Modify: `tests/project-config.test.mjs`

**Interfaces:**
- Add a selected Library asset state and closeable preview dialog.
- Images render in an image viewer; videos render with native controls.
- A dedicated download control remains separate from the preview-click target; delete menu keeps its current behavior.

- [x] Add regression assertions for clickable media preview, video controls, accessible close controls, and preserved download/delete actions.
- [x] Verify the regression test fails before implementation.
- [x] Implement the viewer and responsive styles.
- [x] Run the full test suite, typecheck, build, and Deno check.

### Final review
- [x] Inspect the complete branch diff for security, stale state, retry duplication, and mobile interaction regressions (self-review; no reviewer subagent tool is available in this session).
- [x] Confirm all workflow checks pass before merging (GitHub Actions run 41911825922: typecheck, Bun tests, build, and both Deno checks).
