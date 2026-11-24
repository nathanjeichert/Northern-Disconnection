# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Development Commands

- `npm run dev` - Start development server on localhost:3000
- `npm run build` - Build production application
- `npx tsc --noEmit` - Typecheck

## Project Architecture

Next.js 16 (App Router, React 19, Turbopack) website for Northern Disconnection, a psychedelic americana band from Sonoma County, CA. Deployed on Vercel; GitHub repo `nathanjeichert/Northern-Disconnection`.

The whole site is one living WPA-era park poster of an old redwood forest. A painted world sits behind every page; each page is a *place* on one trail through it, at its own time of day, and changing page walks the camera there. The look follows the "National Park" share flyer: a handful of flat inks per scene, halftone fades, condensed gothic caps, a cream paper margin round the viewport.

| Route | Place | Scene |
| --- | --- | --- |
| `/` | The Trailhead | golden dusk over the valley |
| `/shows` | Campfire Circle | night, firelight, sparks |
| `/music` | The Old Grove | violet moonlight, owl, toadstools, fireflies |
| `/about` | Base Camp | gold morning, tent, river |
| `/press` | The Lookout | high summer above a sea of fog |

- **Styling**: Tailwind CSS v4 plus the design system in `app/global.css`
- **Animations**: the world canvas (raw WebGL2, no library); Framer Motion and CSS for the page
- **Typography**: Oswald (poster caps, `--font-poster`, `.font-display` / `.poster-title`), Fraunces (serif italic for quieter lines, `--font-serif`, `.font-serif`) and Alegreya Sans (body, `--font-body`), loaded via `next/font/google` in `app/layout.tsx`
- **Analytics**: Vercel Analytics & Speed Insights

### The world (`lib/world/`)

- `places.ts` — the trail: id, route, plain label ("Shows") and place name ("Campfire Circle") for each page, in order. Light and DOM-safe; everything that needs to know "where are we" imports this. `<html data-place>` carries the current id (set before first paint by an inline script in the layout, then by `WorldCanvas`).
- `palette.ts` — per-place inks *and* scene parameters (sun position, rays, stars, ridges, fog distance, river, fireflies…). All numbers or colours, so the engine interpolates between two places mid-walk. Retune a scene here first.
- `paint.ts` — every cut-out prop painted by hand in Canvas2D (boughs, ferns, firs, campfire, benches, guitar, fallen log, toadstools, owl, tent, canoe, lookout tower, rocks, deer, birds). Painted in three pure "inks" (red = base, green = shade, blue = light) that the sprite shader swaps for real colours, so one fern serves every time of day.
- `shaders.ts` — GLSL: the backdrop (banded sky with halftone bleeds, sun/moon and rings, clouds, four ridges sinking into mist, and a true perspective ground plane with the trail, its wheel ruts, dapples, river, fog sea), procedural redwood trunks, the sprite shader, point particles, and paper grain.
- `engine.ts` — builds the seeded forest along the trail (`buildScene`), sorts it far to near, and draws it. Camera follows `pathX(z)`; places are `SPACING` units apart; `setPlace()` eases between them. Handles resolution budget and adaptive downscaling, half-rate idle frames, hidden-tab pause, reduced motion (one still frame per place, no walk), and aspect: on narrow screens the framing trunks, boughs and offsets shrink so the composition survives a phone.
- `bus.ts` — the only thing components import to talk to the world: `travelTo(index)`, and `worldInput` (`audio`, written by the stump visualizer so the grove pulses with the tape; `paused`, set by the press intro when the video hides everything).

`app/components/world/world-canvas.tsx` mounts it in the layout and lazy-loads the engine. The canvas is **taller than the viewport** and `position: sticky` (`.world-sticky`, 160lvh, `top: -60lvh`): it scrolls natively with the page for the first 60% of a screen, then holds on the forest floor. That keeps anything laid out over the first screen registered with the painting with no scroll-linked JS — keep `LOCK` in `engine.ts` and those two CSS numbers in step. The horizon sits 58% down the first screen (`HY0`). Without WebGL2 the wrapper shows a flat two-ink sky/ground from `--place-sky` / `--place-ground`.

Dev only: `?wt=1.5` parks the camera at a fractional place for screenshots.

### Wayfinding (`app/components/trail/`) — there is no nav bar

- `signpost.tsx` — the trailhead signpost on the home page: one paper board per page, plus the mailing list.
- `trail-chrome.tsx` — two paper tags fixed to the top of every page (home, and "Trail Map"), and the click handler that turns every in-site link into a walk: page fades (`html[data-leaving]`), `travelTo()` starts the camera, the route changes ~230 ms later.
- `trail-map.tsx` — the fold-out map (the full site navigation as a dialog): contours, river, timber and a dotted trail drawn in SVG, each page a labelled stop, "you are here", plus booking and socials. Two layouts from one set of stops (wide, and tall for phones).
- `page-head.tsx` — the title block on inner pages: mile marker, outlined poster caps (`.page-head`, legible over any backdrop), optional deck ribbon.
- `lockup.tsx` — the logo, inked through CSS masks of the original artwork.
- `place-icon.tsx` — one-ink pictograms for the five places.
- `trail.css` — all of the above.
- `app/components/footer.tsx` — "trail continues" back/onward signs, the trail register (mailing list, `#register`), booking, socials.
- `app/template.tsx` — re-mounts per navigation so each page rises in (`.page-enter`).

### Theme System

`app/global.css`: palette in `:root` (`--pine`, `--cream`, `--rust`, `--gold`, `--paper`, `--ink`, `--redwood`…) with utility classes (`.text-cream`, `.bg-pine`…), plus per-place variables under `html[data-place='…']` (`--band`, `--sky-ink`, `--sky-shade-solid`, `--accent`, `--place-sky`, `--place-ground`). Reusable pieces:

- `.placard` (+ `--keyline`) — cream paper notice with pine ink; buttons inside it ink themselves
- `.band` (+ `--keyline`) — solid block of the place's deep ink, cream type (the tape deck, press sheet, footer)
- `.retro-button` / `--ghost` / `--sm` — poster buttons with hard offset shadows
- `.eyebrow`, `.poster-title`, `.font-display`, `.font-serif`, `.on-sky`
- `.poster-frame` — the fixed paper margin; `.grain-overlay`
- `.logo-cream` / `.logo-ink` — CSS-filter recolours of the black-ink logo
- `.page` has no `z-index` on purpose: a stacking context there would trap modals under the trail tags

### Logo

`public/logo/mark-ink.svg` and `mark-fill.svg` split the hand-drawn mark's vector trace (`public/logonotext.svg`) into its ink lines and fill regions; with `public/logo-wordmark.png` they're used as CSS masks so each can be inked separately. Never redraw or distort the artwork — recolour/mask only.

### Architecture Notes

- Server components load content at build time; client components handle interactivity
- "Next show" is computed server-side and passed as props to avoid hydration mismatches
- Horizontal overflow is clipped globally (`overflow-x: clip`) so decorative elements can bleed off-canvas safely
- If a CSS edit doesn't show up in `next dev`, delete `.next` and restart — Turbopack's cache has gone stale on `global.css` before

## Content

The only dynamic content file is `content/shows.json`, loaded at build time by `lib/content.ts` (`getShowsContent()`). Edit the JSON (locally or via GitHub's web UI) and Vercel redeploys automatically. Dates are strings like `"June 26th, 2026"` (abbreviations like "Sept 5, 2026" work; a missing year means the next occurrence; anything unreadable, e.g. "TBA", is displayed as written and treated as undated); `lib/show-dates.mjs` parses them strictly (shared by the site via `lib/dates.ts` and by the newsletter scripts, so both always agree), and the site sorts them and finds the next upcoming show (home page notice + shows page flag). Past shows drop off automatically: `/` and `/shows` filter out any show whose day is over in Pacific time and re-render hourly (`revalidate = 3600`), so a gig disappears the day after it happens with no edit or redeploy — the JSON entry itself can stay. Pushing new upcoming shows to `main` also triggers the subscriber announcement email (see Newsletter below).

**Preview sample dates**: `lib/preview.ts` fills an *empty* calendar with labelled stand-in shows on Vercel preview deployments and in local dev only (`VERCEL_ENV === 'preview'`), so the shows page, home notice and flyer maker can be reviewed between gigs. Production never renders them and they never reach the JSON-LD.

Other page content is inline in its component:

- `app/page.tsx` (server: loads next show) → `app/components/home-client.tsx` (+ `home.css`) — the poster: logo lockup in the dusk sky, the next-show notice, the signpost, then the latest YouTube video on the forest floor
- `app/shows/` — show "bills" (`shows.css`): date on a block of ink, venue in poster caps, add-to-calendar, share flyer, tickets
- `app/about/page.tsx` (+ `about.css`) — story on placards, photos as tacked-up snapshots, booking call-out
- `app/music/page.tsx` — the tape deck (`app/components/tape-shelf.tsx` picks the tape; `live-tape-player.tsx` plays it): tracklist/seek/volume UI around the redwood-stump audio visualizer (`app/components/stump-visualizer.tsx` → `app/components/stump/woodcut.tsx`: a living linocut whose inked rings, one per frequency band, are carved by the music; analysis in `stump/analysis.ts`). The stump also reports its level to the world (`worldInput.audio`), so fireflies, toadstools and the moon's rings move with the tape. Streams the item's VBR MP3s via `lib/archive.ts`, which builds per-track URL lists straight to the item's datanodes (`d1`, `d2`, …) with `archive.org/download` last — its redirect mirror has been returning HTTP 500s. The player retries the analysed (CORS + Web Audio) pipeline host by host, falls back to a plain pipeline per song only, pre-buffers the first song while the page is open and the next song near the end of each track. Degrades to the old Archive.org iframe embed if the metadata API is unreachable. Future tapes: add to `TAPES` in `tape-shelf.tsx`.

- `app/press/page.tsx` — the press kit (EPK), linked from the signpost, map, footer and sitemap. All its words and lists live in `content/press.json` (bios, tagline, highlights, venues, booking facts, input list, featured tracks, photos, downloads, links); `seoGenres` go only into metadata. It opens on `press-intro.tsx`: the promo fills the first screen and starts muted on load (looping, paused when scrolled away), with a play button superimposed; clicking/tapping restarts it from the top with sound and locks the page. Where the 16:9 picture doesn't match the screen, the painted lookout shows around it and the picture's edges are feathered into the scene (most visible on phones); the backdrop dims once sound is playing. The trail tags stay hidden while the hero fills the screen (`html[data-press-immersive] .trail-chrome`) and return on scroll or when the pointer touches the top edge (`data-press-peek`). During sound playback, scroll, swipe, Esc, "Skip intro" or the video ending glide down to `#press-kit`; controls fade after 2.5 s idle. The kit itself is one long `.press-sheet.band`. `press-tracks.tsx` streams the featured songs from the Archive tape. The example stage plot is `public/press/stage-plot.svg`, inlined on the page.
  - Downloads (`public/press/*.zip|pdf`) are generated by `node scripts/make-press-kit.mjs` (needs `zip` and Playwright for the PDFs); re-run after editing `press.json`, the photos in `public/press/photos/`, the logo sources in `public/press/logos/` or the stage plot.
  - Promo video: `promo-1080.mp4` / `promo-720.mp4` are re-encoded from the 1080p master in the band Drive ("Promo Video (G-Fest 2026)"), since the share file is over GitHub's 100 MB limit: `ffmpeg -i master.mp4 -c:v libx264 -preset veryslow -crf 24 -maxrate 4M -bufsize 8M -pix_fmt yuv420p -c:a aac -b:a 160k -movflags +faststart promo-1080.mp4`, and the same with `-vf scale=-2:720 -crf 25 -maxrate 2M -bufsize 4M -b:a 128k` for 720p. Phones and small screens get the 720p file.

Show flyers ("Share Flyer" on /shows): `app/components/show-flyer-modal.tsx` draws seeded canvas posters via `lib/flyer/` — `index.ts` (API), `kit.ts` (paper/ink/misregistration/text helpers), and one file per style in `lib/flyer/styles/` (Hatch Show, National Park, Tree Rings, Topo, Night Sky, Marbled, Fillmore, Woodcut, Golden State, Ticket Stub). Extra flyer fonts are self-hosted in `public/fonts/flyer/` and loaded only when a flyer is drawn.

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
- **Announcements**: `.github/workflows/announce-shows.yml` runs on pushes touching `content/shows.json`, diffs against the previous commit, and sends one digest Broadcast only for genuinely new, upcoming shows. Edits/typo fixes never email anyone. Undated shows ("TBA") aren't announced; filling in the real date later counts as a new show and announces it then.
- **Reminders**: `.github/workflows/remind-shows.yml` (daily cron, 16:00 UTC) emails for shows within 7 days (days counted in Pacific time). Dedupe via deterministic broadcast names (`Reminder | <date> | <venue>`) — each show reminded exactly once.
- **Shared chrome**: `scripts/newsletter-lib.mjs` (`renderChrome()`, `renderWelcomeEmail()`, Resend helpers). Unsubscribes are Resend one-click, auto-suppressed.

Email design: built to survive Gmail's forced dark-mode inversion (no opt-out exists) — the masthead is an image (`public/email-masthead.png`, regenerate with `node scripts/make-email-masthead.mjs` after logo/palette changes), the HTML palette uses light surfaces and midtone accents that invert gracefully, and clients with real hooks (Apple Mail, Outlook.com) get the branded `DARK` palette in `newsletter-lib.mjs`.

Ops reference:

- Secrets: `RESEND_API_KEY` + `RESEND_AUDIENCE_ID` in Vercel env (signup form) **and** GitHub Actions secrets (broadcasts). Rotate with `npx vercel env rm/add` + `gh secret set RESEND_API_KEY --repo nathanjeichert/Northern-Disconnection`.
- Every email sets `Reply-To: booking@northerndisconnection.com` (the same address the site shows for booking). Inbound mail is free DNS-only forwarding via Forward Email: root MX `mx1`/`mx2.forwardemail.net` plus TXT `forward-email=booking:<gmail>` on `@` (change the TXT to add or reroute addresses; no account involved). It coexists with Resend because Namecheap's Custom MX mode allows both the root and `send` MX records.
- DNS (Namecheap → Advanced DNS): DKIM TXT `resend._domainkey`, SPF TXT + MX on `send` (Resend); MX + `forward-email=` TXT on `@` (forwarding). If re-verifying a domain in Resend, click Verify once and wait ~15 min — repeated clicks restart detection.
- Dry-run an announcement locally (renders HTML, sends nothing):
  `BEFORE_FILE=old-shows.json AFTER_FILE=content/shows.json DRY_RUN=1 node scripts/announce-shows.mjs`
