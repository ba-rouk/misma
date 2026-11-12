# Misma website feedback email

The public landing-page feedback form sends submissions to **rukundobarouk33@gmail.com** through the Gmail API. It does not send mail from the visitor's browser.

## Google Cloud setup

1. In the Google Cloud project that owns the sending mailbox, enable the Gmail API.
2. Create or use an OAuth 2.0 Web application client.
3. Authorize the mailbox that should send the feedback emails with the scope `https://www.googleapis.com/auth/gmail.send` and offline access.
4. Obtain a refresh token for that same mailbox. The refresh token must retain the Gmail send scope.
5. Add these secrets in Supabase → Edge Functions → Secrets:

| Secret | Value |
| --- | --- |
| `GOOGLE_GMAIL_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_GMAIL_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_GMAIL_REFRESH_TOKEN` | Refresh token authorized for Gmail send |
| `GOOGLE_GMAIL_FROM_EMAIL` | The sending mailbox or a Gmail-verified send-as alias |

The function sends to `rukundobarouk33@gmail.com` and sets the visitor's email as Reply-To. Keep all four values in Supabase secrets; never add them to frontend environment variables or source code.

## Deployment

Deploy the `misma-feedback` Supabase Edge Function after its secrets are configured. The function is public (JWT verification is disabled) so the landing page can submit without a Misma account. It validates the request origin, email, message length, uses a hidden honeypot, applies a best-effort per-instance rate limit, and sends only from the configured Gmail account.

The form can be committed and previewed before deployment, but it cannot deliver mail until the Gmail OAuth secrets are configured and the Edge Function has been deployed.
