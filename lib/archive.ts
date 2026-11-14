// Client-side helpers for streaming live shows from the Internet Archive.
// Each show is one Archive item (e.g. ND2025-09-27); the player streams the
// item's VBR MP3 derivatives. Adding a future tape = rendering another
// <LiveTapePlayer identifier="..." /> — everything here is item-agnostic.

export interface ArchiveTrack {
  title: string
  /** File name within the item. */
  file: string
  /** Preferred stream URL (same as urls[0]). */
  url: string
  /**
   * Ordered stream candidates: the item's datanodes first, then the
   * archive.org/download redirector as a last resort. The redirector
   * bounces many files to CDN mirrors (dn*.archive.org) that
   * intermittently answer 500, so it is never the first choice.
   */
  urls: string[]
  /** Duration in seconds, when the item metadata provides one. */
  seconds: number | null
  track: number
}

export interface ArchiveShow {
  identifier: string
  title: string
  tracks: ArchiveTrack[]
}

interface ArchiveFileRaw {
  name: string
  format?: string
  title?: string
  length?: string
  track?: string
}

function encodePath(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/')
}

export function archiveFileUrl(identifier: string, name: string): string {
  return `https://archive.org/download/${identifier}/${encodePath(name)}`
}

interface ArchiveHosts {
  /** Datanode hostnames in preference order (d1, d2, server, workable). */
  nodes: string[]
  /** Item directory on the datanodes, e.g. "/21/items/ND2025-09-27". */
  dir: string | null
}

const HOST_RE = /^[a-z0-9.-]+\.archive\.org$/i

function readHosts(data: Record<string, unknown>): ArchiveHosts {
  const candidates = [data.d1, data.d2, data.server, ...(Array.isArray(data.workable_servers) ? data.workable_servers : [])]
  const nodes: string[] = []
  for (const c of candidates) {
    if (typeof c === 'string' && HOST_RE.test(c) && !nodes.includes(c)) nodes.push(c)
  }
  const dir = typeof data.dir === 'string' && data.dir.startsWith('/') ? data.dir.replace(/\/+$/, '') : null
  return { nodes, dir }
}

/**
 * Stream candidates for one file: direct datanode URLs (these answer 206
 * with `access-control-allow-origin: *`, which the analyser needs), then
 * the generic download URL.
 */
export function archiveStreamUrls(identifier: string, name: string, hosts?: ArchiveHosts): string[] {
  const urls: string[] = []
  if (hosts?.dir) {
    for (const node of hosts.nodes) urls.push(`https://${node}${hosts.dir}/${encodePath(name)}`)
  }
  urls.push(archiveFileUrl(identifier, name))
  return urls
}

export function archiveItemUrl(identifier: string): string {
  return `https://archive.org/details/${identifier}`
}

/** Parses "372.43", "6:12", or "1:02:45" into whole seconds. */
function parseLength(raw?: string): number | null {
  if (!raw) return null
  if (raw.includes(':')) {
    const parts = raw.split(':').map(Number)
    if (parts.some(Number.isNaN)) return null
    return Math.round(parts.reduce((acc, p) => acc * 60 + p, 0))
  }
  const n = Number(raw)
  return Number.isNaN(n) ? null : Math.round(n)
}

/** Parses "3", "03", or "3/13"; falls back to file order. */
function parseTrackNo(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const n = parseInt(raw, 10)
  return Number.isNaN(n) ? fallback : n
}

function cleanTitle(file: ArchiveFileRaw, index: number): string {
  if (file.title) return file.title
  const stem = file.name
    .replace(/^.*\//, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[-_]+/g, ' ')
    .trim()
  return stem || `Track ${index + 1}`
}

/** Track number from an etree-style file name, e.g. "nd2026-09-19_04_wheel_ruts.wav" -> 4. */
function trackNoFromName(name: string): number | undefined {
  const m = name.replace(/^.*\//, '').match(/_(\d{1,2})_/)
  return m ? parseInt(m[1], 10) : undefined
}

/**
 * Song titles from the item description's setlist ("01. Song Title" lines).
 * Fresh uploads have no per-file titles until the Archive's derive job runs,
 * so the WAV fallback names songs from here.
 */
function setlistFromDescription(description: unknown): Map<number, string> {
  const titles = new Map<number, string>()
  if (typeof description !== 'string') return titles
  const text = description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(div|p|li)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&')
  for (const line of text.split('\n')) {
    const m = line.trim().match(/^(\d{1,2})[.)]\s+(.+?)[\s*>]*$/)
    if (m && !titles.has(parseInt(m[1], 10))) titles.set(parseInt(m[1], 10), m[2].trim())
  }
  return titles
}

/**
 * Streamable audio, best first: the Archive's VBR MP3 derivatives, any other
 * MP3, then lossless originals (FLAC, WAV). New items have only their
 * originals until the derive job finishes (it can take days), so the lossless
 * files keep the deck playing in the meantime; the MP3s take over on their own.
 */
function pickStreamFiles(files: ArchiveFileRaw[]): { files: ArchiveFileRaw[]; lossless: boolean } {
  const ext = (f: ArchiveFileRaw, e: string) => f.name?.toLowerCase().endsWith(e)
  const tiers: ((f: ArchiveFileRaw) => boolean)[] = [
    (f) => f.format === 'VBR MP3',
    (f) => ext(f, '.mp3'),
    (f) => ext(f, '.flac'),
    (f) => ext(f, '.wav'),
  ]
  for (const [i, test] of tiers.entries()) {
    const picked = files.filter(test)
    if (picked.length > 0) return { files: picked, lossless: i >= 2 }
  }
  return { files: [], lossless: false }
}

/** Fetches an item's streamable tracklist from the Archive metadata API. */
export async function fetchArchiveShow(identifier: string, signal?: AbortSignal): Promise<ArchiveShow> {
  const res = await fetch(`https://archive.org/metadata/${identifier}`, { signal })
  if (!res.ok) throw new Error(`archive metadata request failed: ${res.status}`)
  const data = await res.json()
  const files: ArchiveFileRaw[] = Array.isArray(data?.files) ? data.files : []

  const picked = pickStreamFiles(files)
  if (picked.files.length === 0) throw new Error('no streamable tracks in item')
  const setlist = picked.lossless ? setlistFromDescription(data?.metadata?.description) : new Map<number, string>()

  const hosts = readHosts(data ?? {})
  const tracks = picked.files
    .map((f, i) => {
      const urls = archiveStreamUrls(identifier, f.name, hosts)
      const track = parseTrackNo(f.track, trackNoFromName(f.name) ?? i + 1)
      return {
        title: f.title || setlist.get(track) || cleanTitle(f, i),
        file: f.name,
        url: urls[0],
        urls,
        seconds: parseLength(f.length),
        track,
      }
    })
    .sort((a, b) => a.track - b.track || a.file.localeCompare(b.file))

  return {
    identifier,
    title: String(data?.metadata?.title ?? identifier),
    tracks,
  }
}

export function formatTime(s: number | null | undefined): string {
  if (s == null || !Number.isFinite(s) || s < 0) return '–:––'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
