import { NextResponse } from 'next/server'

const CHANNEL_ID = 'UCOpZMRlcndhoCcN1knIHIHA'
const CHANNEL_HANDLE = 'northerndisconnection'
const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=' + CHANNEL_ID

// Pinned homepage video: when set, it is shown instead of the newest upload.
// Set to null to go back to showing the latest upload automatically.
const FEATURED_VIDEO_ID: string | null = 'P9Yb_kUIUGo'
const FEATURED_TITLE = 'Nighttime in the Switching Yard, Live at G-Fest 2026'

// Last-resort fallback if both the RSS feed and the channel page are
// unreachable (the feed has had day-long outages for this channel).
const FALLBACK_VIDEO_ID = 'nekXO8t1tcE'
const FALLBACK_TITLE = 'Dark Hollow, Live at G-Fest 2025'

type LatestVideo = {
  videoId: string
  title: string
  publishedAt: string | null
  thumbnail: string | null
  url: string
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function jsonWithCache(payload: LatestVideo) {
  return new NextResponse(JSON.stringify(payload), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600',
    },
  })
}

function videoPayload(videoId: string, title: string, publishedAt: string | null, thumbnail: string | null): LatestVideo {
  return {
    videoId,
    title,
    publishedAt,
    thumbnail: thumbnail ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    url: 'https://www.youtube.com/watch?v=' + videoId,
  }
}

// Fetch a video's title via oEmbed (no API key needed).
async function fetchTitle(videoId: string): Promise<{ title: string; thumbnail: string | null } | null> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { next: { revalidate: 1800 } }
    )
    if (!response.ok) return null
    const data = await response.json()
    if (typeof data.title !== 'string') return null
    return { title: data.title, thumbnail: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null }
  } catch {
    return null
  }
}

// Primary source: the channel RSS feed. Parses every entry and returns
// the most recently published one rather than trusting feed order.
async function fetchFromFeed(): Promise<LatestVideo | null> {
  const response = await fetch(FEED_URL, {
    next: { revalidate: 1800 },
    headers: {
      'User-Agent': 'NorthernDisconnectionSite/1.0',
      Accept: 'application/atom+xml,application/xml',
    },
  })

  if (!response.ok) return null

  const xml = await response.text()
  const entries = [...xml.matchAll(/<entry>[\s\S]*?<\/entry>/g)]
  if (entries.length === 0) return null

  let newest: { videoId: string; title: string; publishedAt: string | null; thumbnail: string | null; time: number } | null = null

  for (const [entry] of entries) {
    const videoId = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/)?.[1]
    const title = entry.match(/<title>(.*?)<\/title>/)?.[1]
    if (!videoId || !title) continue

    const publishedAt = entry.match(/<published>(.*?)<\/published>/)?.[1] ?? null
    const thumbnail = entry.match(/<media:thumbnail[^>]+url="([^"]+)"/)?.[1] ?? null
    const time = publishedAt ? Date.parse(publishedAt) : 0

    if (!newest || time > newest.time) {
      newest = { videoId, title: decodeHtmlEntities(title), publishedAt, thumbnail, time }
    }
  }

  if (!newest) return null
  return videoPayload(newest.videoId, newest.title, newest.publishedAt, newest.thumbnail)
}

// Secondary source: scrape the channel's Videos tab (sorted latest-first)
// for the first video id, then resolve its title via oEmbed.
async function fetchFromChannelPage(): Promise<LatestVideo | null> {
  try {
    const response = await fetch(`https://www.youtube.com/@${CHANNEL_HANDLE}/videos`, {
      next: { revalidate: 1800 },
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!response.ok) return null

    const html = await response.text()
    const videoId = html.match(/"videoRenderer":\{"videoId":"([A-Za-z0-9_-]{11})"/)?.[1]
    if (!videoId) return null

    const meta = await fetchTitle(videoId)
    if (!meta) return null
    return videoPayload(videoId, meta.title, null, meta.thumbnail)
  } catch {
    return null
  }
}

async function fetchFallback(): Promise<LatestVideo> {
  const meta = await fetchTitle(FALLBACK_VIDEO_ID)
  return videoPayload(FALLBACK_VIDEO_ID, meta?.title ?? FALLBACK_TITLE, null, meta?.thumbnail ?? null)
}

export async function GET() {
  if (FEATURED_VIDEO_ID) {
    const meta = await fetchTitle(FEATURED_VIDEO_ID)
    return jsonWithCache(videoPayload(FEATURED_VIDEO_ID, meta?.title ?? FEATURED_TITLE, null, meta?.thumbnail ?? null))
  }

  try {
    const fromFeed = await fetchFromFeed()
    if (fromFeed) return jsonWithCache(fromFeed)
  } catch (error) {
    console.error('Error loading YouTube feed', error)
  }

  const fromChannel = await fetchFromChannelPage()
  if (fromChannel) return jsonWithCache(fromChannel)

  return jsonWithCache(await fetchFallback())
}
