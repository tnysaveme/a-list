# Email sign-in

Sign-in emails use Supabase Auth and Resend SMTP. The active confirmation and magic-link HTML must match the generated files in `supabase/templates/`; a Git/Vercel deployment does not update hosted Supabase Auth templates. Generate them with `npm run email:render` after changing `emails/sign-in.tsx`.

Both templates point to `/auth/confirm?token_hash={{ .TokenHash }}&type=email` on the configured Site URL. A GET only displays the confirmation form. The recipient submits that form to `/auth/verify`, which checks same-origin requests and a separate verification rate limit, then verifies the one-time token with Supabase and stores the session in that browser. This works without the original browser’s PKCE cookie and prevents a link-scanning GET from redeeming the token. Confirmation pages are private and uncached; the referrer policy sends only an origin, never the token-bearing URL.

Deploy the application routes first, then publish the two generated HTML templates in Supabase Authentication → Emails. Preserve SMTP credentials, sender, redirect URLs, OTP lifetime, signup policy and account permissions. Old emails retain their original link, so request a fresh email after rollout. The legacy PKCE callback remains for compatibility.

Never log email addresses, token hashes, confirmation links or provider credentials. Provider failures show a temporary-service message; expired/used links ask for a new email. Gmail’s Spam and other categories can contain a provider-delivered message; search all mail by the configured sender when diagnosing delivery.
