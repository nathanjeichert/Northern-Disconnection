# Show-Alert Newsletter

How the automatic gig-alert emails work. **Status: live and verified** (set up
June 16, 2026 — domain verified, a test broadcast landed in the inbox). Day to day
it needs nothing from you; the reference below is for if something ever breaks.

## Architecture (all free, no database)

- **Subscribers** live in a [Resend](https://resend.com) Audience. The old Redis
  database is gone (deleted by Redis Cloud for inactivity, Nov 2025) and nothing
  like it exists anymore — Resend's free tier has no inactivity expiration.
- **Signups**: the site form POSTs to `/api/subscribe`, which adds the contact to
  the Resend audience. Re-subscribing after an unsubscribe re-opts the contact in.
  A one-time **welcome email** goes out when a brand-new contact is created (best
  effort — a welcome-send failure never fails the signup). The endpoint is protected
  by a hidden **honeypot** field (`company`) and a best-effort in-memory **rate limit**
  (5 requests / 10 min per IP). The honeypot is the real defense; the rate limit only
  throttles bursts on a single warm serverless instance (no shared store by design).
- **Alerts** (new-show announcements): a GitHub Action (`.github/workflows/announce-shows.yml`)
  runs on every push that touches `content/shows.json`. It diffs the file against the
  previous commit and, only when genuinely **new, upcoming** shows were added, sends
  **one digest email** via a Resend Broadcast. Edits to existing shows (times, typos,
  descriptions) never email anyone. Past-dated shows never email anyone.
- **Reminders** (week-of the show): a second GitHub Action
  (`.github/workflows/remind-shows.yml`) runs **daily on a cron** (16:00 UTC ≈ 9am PT).
  It reads the current `content/shows.json` and emails a reminder for any show landing
  within the next **7 days** (`REMINDER_DAYS`). Each show is reminded **exactly once** —
  the script names each reminder broadcast deterministically (`Reminder | <date> | <venue>`)
  and skips any show that already has one, so the daily run never double-sends. Both
  Actions share `scripts/newsletter-lib.mjs` (email chrome, footer, Resend helpers).
- **Unsubscribes**: every email carries Resend's one-click unsubscribe link.
  Resend suppresses unsubscribed contacts from future broadcasts automatically.
  Nothing to manage.

Normal operation is fully hands-off: add a show to `content/shows.json` (locally or
via the GitHub web editor), push, and subscribers get one tasteful email. Vercel
redeploys the site from the same push.

Free-tier limits (plenty for now): 3,000 emails/month, 100/day, 1,000 contacts.

## Email design & dark mode

All three emails (welcome, alert, reminder) render through one shared chrome —
`renderChrome()` in `scripts/newsletter-lib.mjs`: masthead image, eyebrow,
bordered card with the poster shadow, fine-print footer. The welcome email in
`/api/subscribe` uses `renderWelcomeEmail()` from the same file.

Dark mode was the hard part. Gmail's mobile apps (worst on iOS) force-invert
every CSS color with **no opt-out**: they ignore `color-scheme` meta tags,
strip `prefers-color-scheme` media queries, never set Outlook's `data-ogsc`
attributes, and will even invert an already-dark design back to light. Nothing
can target Gmail's dark mode, so the emails are built to *survive* it instead:

- **The header is an image** (`public/email-masthead.png`). Gmail never
  recolors images, so the pine/cream/gold banner is pixel-identical in every
  client and mode. Regenerate after logo or palette changes with
  `node scripts/make-email-masthead.mjs`.
- **The HTML palette inverts gracefully**: light surfaces, no large dark
  fills, and midtone accents (gold, burgundy, gray-greens) that shift little
  under inversion. Gmail keeps each color's *hue* and inverts its *lightness*,
  so the canvas is a pale sage in the pine-hue family — it inverts to a deep
  pine green rather than the olive-brown a warm parchment hue turns into.
  Gmail's dark mode then produces a coherent "night handbill" that matches
  the untouched dark masthead.
- **Clients with real hooks get the branded dark theme** (the `DARK` palette
  in `newsletter-lib.mjs`): Apple Mail via `@media (prefers-color-scheme:
  dark)`, Outlook.com/365 via `[data-ogsc]`/`[data-ogsb]` overrides.
- The card's offset "poster shadow" is a gold-background wrapper `<td>` with
  right/bottom padding — `box-shadow` doesn't render in Gmail.

## How it was set up (already done — for reference)

1. **Resend account**: signed in with Google as nathanjeichert@gmail.com.
2. **Sending domain** `northerndisconnection.com` (region us-east-1) verified with
   three DNS records at **Namecheap → Advanced DNS**:
   - `resend._domainkey` **TXT** (DKIM) — in Host Records
   - `send` **TXT** (`v=spf1 include:amazonses.com ~all`) — in Host Records
   - `send` **MX** (`feedback-smtp.us-east-1.amazonses.com`, priority 10) — added
     via **Mail Settings → Custom MX**

   **Trade-off we accepted:** Namecheap only allows MX records in "Custom MX" mode,
   which disables its Email Forwarding. We had no inbound `@northerndisconnection.com`
   address in use, so forwarding was turned off. Replies still reach you because every
   email sets `Reply-To: nathanjeichert@gmail.com` (see `REPLY_TO` in the script). If
   you ever want inbound `@northerndisconnection.com` mail back, the clean path is to
   move DNS to Cloudflare (free Email Routing + free DNS, and it allows the `send` MX
   alongside forwarding).

   **Verification gotcha (if you ever re-verify a domain):** don't spam the "Verify"
   button. Each click restarts SES's MAIL-FROM detection; clicking every few minutes
   can reset it before it finishes. Add the records, click Verify once, then wait
   ~10–15 min untouched.
3. **Audience**: Resend's default "General" audience.
4. **Secrets wired** — `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` in both Vercel (all
   environments, powers the signup form) and GitHub Actions secrets (powers the
   alert emails). To rotate the key later:

   ```sh
   # Vercel (powers the signup form) — repeat per environment
   npx vercel env rm RESEND_API_KEY production; npx vercel env add RESEND_API_KEY production
   npx vercel redeploy --prod   # or just push any commit

   # GitHub (powers the alert emails)
   gh secret set RESEND_API_KEY --repo nathanjeichert/my-site
   ```

## Testing / operations

- **Dry-run the alert email locally** (renders HTML, sends nothing):

  ```sh
  BEFORE_FILE=old-shows.json AFTER_FILE=content/shows.json DRY_RUN=1 node scripts/announce-shows.mjs
  ```

- **Dry-run in GitHub**: Actions → "Announce new shows" → Run workflow (dry-run
  defaults to on; it previews what the latest shows.json change would have sent).
- **Send a real test broadcast** (goes to everyone in the audience — currently just
  you): make a `before-real.json` copy of `content/shows.json` with one upcoming show
  removed, then:

  ```sh
  RESEND_API_KEY=… RESEND_AUDIENCE_ID=… BEFORE_FILE=before-real.json AFTER_FILE=content/shows.json node scripts/announce-shows.mjs
  ```

- The Action is a graceful no-op (green, with a log message) if the secrets are ever
  missing, so pushes are never blocked by the newsletter.
- Sender address: `shows@northerndisconnection.com`, replies go to
  nathanjeichert@gmail.com.
- Resend dashboard: <https://resend.com> → Broadcasts / Audiences / Logs to see
  what was sent, manage contacts, and view delivery stats.
