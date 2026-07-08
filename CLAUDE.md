# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production application
- `npx tsc --noEmit` - Typecheck

## Project Architecture

Next.js 16 (App Router, React 19, Turbopack) website for Northern Disconnection, a psychedelic americana band from Sonoma County, CA. Deployed on Vercel; GitHub repo `nathanjeichert/Northern-Disconnection`. The design language is "vintage handbill meets redwood forest": deep pine greens, parchment cream, warm tan and marigold, film-grain overlay, and hard-offset "poster" shadows.

- **Styling**: Tailwind CSS v4 plus custom utilities in `app/global.css`
- **Animations**: Framer Motion
- **Typography**: Fraunces (display, `--font-display`) and Alegreya Sans (body, `--font-body`), loaded via `next/font/google` in `app/layout.tsx`
- **Analytics**: Vercel Analytics & Speed Insights

### Theme System

Palette lives in `app/global.css` `:root` variables (`--pine`, `--cream`, `--rust`, `--gold`, ...) with matching utility classes (`.text-cream`, `.bg-pine`, `.border-rust`, ...). Reusable pieces:

- `.retro-button` / `.retro-button--ghost` — poster-style buttons with hard offset shadows
- `.eyebrow` — small-caps section label
- `.ornament` — fleuron divider (`<div class="ornament">❦</div>`)
- `.vintage-shadow` — letterpress heading shadow
- `.logo-cream` — CSS-filter recolor rendering the black-ink logo in cream (nav, footer, home hero)

### Layout Structure

- `app/layout.tsx` — fonts, metadata, sitewide `MusicGroup` JSON-LD, grain overlay, `Navbar`, page content, `Footer`
- `app/components/nav.tsx` — fixed nav, hides on scroll down
- `app/components/footer.tsx` — booking email and socials

### Architecture Notes

- Server components load content at build time; client components handle interactivity
- "Next show" is computed server-side and passed as props to avoid hydration mismatches
- Horizontal overflow is clipped globally (`overflow-x: clip`) so decorative elements can bleed off-canvas safely

## Content

The only dynamic content file is `content/shows.json`, loaded at build time by `lib/content.ts` (`getShowsContent()`). Edit the JSON (locally or via GitHub's web UI) and Vercel redeploys automatically. Dates are strings like `"June 26th, 2026"`; `lib/dates.ts` parses and sorts them and finds the next upcoming show (home hero banner + shows page badge). Pushing new upcoming shows also triggers the subscriber announcement email (see Newsletter below).

Other page content is inline in its component:

- `app/page.tsx` (server: loads next show) → `app/components/home-client.tsx` — live-photo hero, next-show banner, latest YouTube video, subscribe form
- `app/about/page.tsx` — about + booking call-out
- `app/music/page.tsx` — Archive.org "Live at G-Fest 2025" embed

`/api/youtube/latest` resolves the channel's newest upload: RSS feed first, then a scrape of the channel's Videos tab, then the hardcoded `FALLBACK_VIDEO_ID` in the route. New uploads appear on the homepage without code changes.

## SEO & Structured Data

`lib/structured-data.ts` builds all JSON-LD:

- **MusicGroup** (`musicGroupJsonLd`) — rendered sitewide in `app/layout.tsx`. Update its `sameAs` array whenever the band gains a new official profile (Facebook, Spotify, Bandsintown, ...).
- **MusicEvent** (`upcomingEventsJsonLd`) — one `@graph` script on `/shows`, generated from `shows.json`. Past-dated shows are excluded; shows with a `time` get a full ISO datetime with the correct PDT/PST offset, otherwise date-only. Ticket offers render only when `hasTickets` + `ticketsUrl` are set.

Every page sets its own `alternates.canonical` and per-page `openGraph` (title/url/image) — keep this pattern for any new page. `app/sitemap.ts` exports `baseUrl` and the sitemap; `app/robots.ts` references it.

## Newsletter (Resend — live since June 2026)

Fully automatic gig-alert emails; day-to-day it needs nothing. Architecture:

- **Subscribers** live in a Resend Audience (free tier: 3,000 emails/mo, 100/day, 1,000 contacts).
- **Signups**: site form POSTs to `/api/subscribe` → adds contact + sends best-effort welcome email. Spam defense: hidden honeypot field (`company`) plus a best-effort in-memory rate limit.
- **Announcements**: `.github/workflows/announce-shows.yml` runs on pushes touching `content/shows.json`, diffs against the previous commit, and sends one digest Broadcast only for genuinely new, upcoming shows. Edits/typo fixes never email anyone.
- **Reminders**: `.github/workflows/remind-shows.yml` (daily cron, 16:00 UTC) emails for shows within 7 days. Dedupe via deterministic broadcast names (`Reminder | <date> | <venue>`) — each show reminded exactly once.
- **Shared chrome**: `scripts/newsletter-lib.mjs` (`renderChrome()`, `renderWelcomeEmail()`, Resend helpers). Unsubscribes are Resend one-click, auto-suppressed.

Email design: built to survive Gmail's forced dark-mode inversion (no opt-out exists) — the masthead is an image (`public/email-masthead.png`, regenerate with `node scripts/make-email-masthead.mjs` after logo/palette changes), the HTML palette uses light surfaces and midtone accents that invert gracefully, and clients with real hooks (Apple Mail, Outlook.com) get the branded `DARK` palette in `newsletter-lib.mjs`.

Ops reference:

- Secrets: `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` in Vercel env (signup form) **and** GitHub Actions secrets (broadcasts). Rotate with `npx vercel env rm/add` + `gh secret set RESEND_API_KEY --repo nathanjeichert/Northern-Disconnection`.
- Every email sets `Reply-To: nathanjeichert@gmail.com`. There is no inbound `@northerndisconnection.com` mail — Namecheap's Custom MX (needed for Resend's `send` MX record) disables its email forwarding. If inbound mail is ever wanted, move DNS to Cloudflare.
- DNS (Namecheap → Advanced DNS): DKIM TXT `resend._domainkey`, SPF TXT + MX on `send`. If re-verifying a domain in Resend, click Verify once and wait ~15 min — repeated clicks restart detection.
- Dry-run an announcement locally (renders HTML, sends nothing):
  `BEFORE_FILE=old-shows.json AFTER_FILE=content/shows.json DRY_RUN=1 node scripts/announce-shows.mjs`
