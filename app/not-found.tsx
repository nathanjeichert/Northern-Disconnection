import Link from 'next/link'

export default function NotFound() {
  return (
    <section className="trail-page flex flex-col items-center justify-center text-center">
      <div className="placard placard--keyline max-w-xl px-8 py-12">
        <p className="eyebrow">404 · off the trail</p>
        <h1 className="poster-title mt-2 text-4xl sm:text-5xl">This page wandered off the setlist</h1>
        <p className="font-serif mb-8 mt-4 text-lg italic">What a long, strange trip — but there&apos;s nothing out here.</p>
        <Link href="/" className="retro-button">
          Back to the trailhead
        </Link>
      </div>
    </section>
  )
}
