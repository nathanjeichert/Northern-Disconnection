# Northern Disconnection — Official Website

The official website for Northern Disconnection, a psychedelic americana band from Sonoma County, CA. Live site: [northerndisconnection.com](https://northerndisconnection.com)

- Full-bleed live-photo hero with the band's hand-drawn logo
- Upcoming shows calendar with automatic "next show" highlighting
- Latest YouTube video, pulled automatically
- "Live at G-Fest 2025" full-show stream from the Internet Archive
- Newsletter with automatic show announcements and week-of reminders (Resend + GitHub Actions)
- schema.org structured data (MusicGroup + MusicEvent) generated from the shows file
- Vintage-handbill design system: Fraunces & Alegreya Sans type, deep pine palette, film grain

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Updating Shows

Edit `content/shows.json` (locally or via GitHub's web UI) — Vercel redeploys automatically. Dates are written like `"June 26th, 2026"`; shows are sorted chronologically and the next upcoming one is highlighted automatically.

### Updating the Featured Video

`/api/youtube/latest` reads the channel RSS feed and falls back to `FALLBACK_VIDEO_ID` in `app/api/youtube/latest/route.ts` when the feed is unavailable.

## Tech Stack

- **Framework**: Next.js 16 (App Router, React 19)
- **Styling**: Tailwind CSS v4 + custom design system in `app/global.css`
- **Animation**: Framer Motion
- **Deployment**: Vercel (Analytics + Speed Insights)

© Northern Disconnection. All rights reserved.
