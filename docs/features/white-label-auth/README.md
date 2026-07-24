# White-label branded auth: full methods + sign-out

The branded sign-in at `/wl/signin` (on the canonical host) used to offer only email+password, so
anyone who signed up with Google, forgot their password, or had no account yet got bounced to the
main site. It now offers the same methods as `/account`, minus the anonymous-trial machinery, all
wearing the org's branding.

The unifying rule: the instant a real session exists on the branded page (password, a returning
Google or password-reset redirect, or an already-signed-in canonical session), it is handed to the
custom domain via the one-time code (`/wl-callback`). Every redirect stays on
`solutionseeking.com/wl/signin?page=…`, so it is still one centralized auth host, and one
`https://solutionseeking.com/**` Supabase redirect-allowlist entry covers every custom domain.

Sessions are signed out from the white-label chat itself (`signOut({ scope: 'local' })`).

Captured end to end in a headless browser across two origins (the branded host and the custom
domain, played by `127.0.0.1:4321`).

## Screenshots

1. **1-auth-methods.png** — The branded sign-in now shows Continue with Google, email+password,
   Forgot password, and Create an account.
2. **2-create-account.png** — The register form (branded), for members who do not have an account
   yet: password + confirm + live checklist.
3. **3-forgot-password.png** — Forgot password. The button shows "Sending…" (disabled) while the
   request runs, then a prominent callout confirms the reset link was sent (with the email echoed
   back and a spam reminder). Previously there was no feedback during the on-production Turnstile
   solve, so users re-clicked thinking nothing happened; the page now also pre-warms the captcha on
   mount to cut that lag. The link returns here to set a new password, then hands off.
4. **4-signed-in-sign-out.png** — After a successful hand-off, the user is signed in on the custom
   domain and the chat header shows a **Sign out** control.
5. **5-signed-out.png** — After Sign out, the page reverts to the signed-out card.
