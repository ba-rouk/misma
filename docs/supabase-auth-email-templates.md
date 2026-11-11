# Misma Supabase Auth email templates

Set the Supabase Site URL to https://misma.onrender.com before using these templates.

The token-hash links defer token verification until Misma's page runs supabase.auth.verifyOtp. They also avoid tying a PKCE verifier to the browser that originally requested the email, so they are recommended when users may open email on a different device.

## Confirm signup

**Subject:** Confirm your Misma email address

```html
<div style="margin:0;padding:40px 16px;background:#090b0e;color:#f4f7fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px;border:1px solid #2b3542;border-radius:18px;background:#111720;">
    <p style="margin:0 0 22px;color:#4ade80;font-size:13px;font-weight:700;letter-spacing:2px;">MISMA</p>
    <h1 style="margin:0 0 14px;color:#f4f7fb;font-family:Georgia,serif;font-size:30px;font-weight:400;">Confirm your email address</h1>
    <p style="margin:0 0 26px;color:#aab6c5;font-size:15px;line-height:1.6;">Thanks for creating a Misma account. Confirm your email address to finish setting up your workspace.</p>
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=signup" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#16a34a;color:#07140c;font-size:15px;font-weight:700;text-decoration:none;">Confirm email</a>
    <p style="margin:26px 0 0;color:#768496;font-size:12px;line-height:1.6;">If you did not create a Misma account, you can ignore this email.</p>
  </div>
</div>
```

## Reset password

**Subject:** Reset your Misma password

```html
<div style="margin:0;padding:40px 16px;background:#090b0e;color:#f4f7fb;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:32px;border:1px solid #2b3542;border-radius:18px;background:#111720;">
    <p style="margin:0 0 22px;color:#4ade80;font-size:13px;font-weight:700;letter-spacing:2px;">MISMA</p>
    <h1 style="margin:0 0 14px;color:#f4f7fb;font-family:Georgia,serif;font-size:30px;font-weight:400;">Reset your password</h1>
    <p style="margin:0 0 26px;color:#aab6c5;font-size:15px;line-height:1.6;">We received a request to reset the password for your Misma account. Use the button below to choose a new password.</p>
    <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=recovery" style="display:inline-block;padding:14px 22px;border-radius:10px;background:#16a34a;color:#07140c;font-size:15px;font-weight:700;text-decoration:none;">Reset password</a>
    <p style="margin:26px 0 0;color:#768496;font-size:12px;line-height:1.6;">If you did not request a password reset, you can ignore this email. Your password will not change.</p>
  </div>
</div>
```

The type value must match the email flow: signup for confirmation and recovery for password reset.
