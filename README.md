# Northern Disconnection — Official Website

The official website for Northern Disconnection, a psychedelic americana band from Sonoma County, CA. Live site: [northerndisconnection.com](https://northerndisconnection.com)

- The whole site is one living WPA-style park poster: a hand-painted WebGL redwood forest behind every page, with each page a place on the trail (trailhead, campfire circle, old grove, base camp, lookout) at its own time of day
- No nav bar: a signpost at the trailhead, a fold-out trail map, and a camera that walks between pages
- Upcoming shows calendar with automatic "next show" highlighting and generative share flyers
- Latest YouTube video, pulled automatically
- Full live sets streamed from the Internet Archive through a redwood-stump visualizer (the forest behind the page listens too)
- Electronic press kit with promo video, bios, photos, stage plot and downloads
- Newsletter with automatic show announcements and week-of reminders (Resend + GitHub Actions)
- schema.org structured data (MusicGroup + MusicEvent) generated from the shows file

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
- **Art**: raw WebGL2 + Canvas2D, painted in code (`lib/world/`), no 3D library
- **Animation**: CSS and Framer Motion
- **Deployment**: Vercel (Analytics + Speed Insights)

© Northern Disconnection. All rights reserved.
