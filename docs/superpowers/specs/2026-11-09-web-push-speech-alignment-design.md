# Misma Web Push and Speech Talk Parity — Design

## Goals
- Deliver a push notification to each opted-in owner/admin/staff device when a website visitor creates or updates a human assistance request.
- Keep browser permission explicit and device subscriptions scoped to the signed-in workspace member.
- Make dashboard Speech Talk sound the same as the website widget Speech Talk.

## Architecture
- The dashboard registers `/misma-push-sw.js` only from the user's explicit enable action, requests Notification permission during that gesture, obtains the VAPID public key from the authenticated `misma-widget` Edge Function, subscribes with PushManager, and saves the serialized subscription through an authenticated Edge Function action.
- Public `push_subscriptions` rows are protected by RLS and a composite workspace-membership foreign key. Each device endpoint is unique and can be removed by its owning user.
- The Edge Function creates a VAPID P-256 keypair once, persists it in a non-API-exposed `private` schema, and exposes only the public key. A restricted SECURITY DEFINER RPC can return the keypair only to the `service_role`.
- `saveHumanRequest` keeps its existing database notification behavior. It also queues a best-effort Web Push delivery to the workspace's registered devices. Expired endpoints (404/410) are removed. Push delivery errors must never undo a saved human request.
- The service worker displays a generic, privacy-preserving alert and opens the dashboard notification center with the relevant conversation ID.
- Dashboard Speech Talk uses the widget's woman/Siri-first voice selection, actual selected voice language, 1.16 pitch, 0.98 rate, sentence chunking, and device-default retry. The dashboard's separate read-aloud preset remains user-configurable.

## Compatibility and privacy
- Push requires HTTPS, a supported browser, an active service worker, and an explicit user opt-in. On iPhone/iPad, web push requires a Home Screen web app on iOS/iPadOS 16.4 or later.
- Push payloads contain only a generic human-request notice, website domain, and same-origin dashboard route; no visitor email or phone number is placed on the lock screen.
- The endpoint and encryption keys are treated as private subscription credentials. VAPID private key material never enters browser code.
- If push is unsupported, permission is denied, or sending fails, the existing in-dashboard notification remains available.

## Acceptance criteria
1. A member can enable/disable push alerts for the current device without changing other devices.
2. A human request reaches all opted-in members' registered devices; duplicate human requests use a stable notification tag.
3. Invalid push endpoints are cleaned up.
4. Unauthorized users cannot read or modify another member's subscriptions or the private VAPID keypair.
5. Notification click opens the Misma dashboard notification center and targets the associated conversation.
6. Dashboard Speech Talk and widget Speech Talk share voice choice, language fallback, pitch, and rate; the read-aloud voice selector is unaffected.
