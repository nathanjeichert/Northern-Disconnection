/* Map furniture for the Topo backdrop: a small engraved compass rose and
   survey caption pinned to the lower-right corner. Purely decorative. */
export default function CompassRose() {
  const points = [0, 90, 180, 270]
  const minor = [45, 135, 225, 315]
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-5 right-5 z-0 hidden flex-col items-center gap-1.5 text-rust opacity-[0.32] sm:flex"
    >
      <svg viewBox="-60 -60 120 120" className="h-20 w-20" fill="none" stroke="currentColor">
        <circle r="44" strokeWidth="0.8" />
        <circle r="40" strokeWidth="0.4" strokeDasharray="1 2.2" />
        {Array.from({ length: 72 }, (_, i) => (
          <line
            key={i}
            x1="0"
            y1={i % 2 === 0 ? -44 : -44}
            x2="0"
            y2={i % 6 === 0 ? -38.5 : -41.5}
            strokeWidth="0.5"
            transform={`rotate(${i * 5})`}
          />
        ))}
        {minor.map((a) => (
          <path key={a} d="M0 -28 L4 -4 L0 0 L-4 -4 Z" transform={`rotate(${a})`} strokeWidth="0.6" />
        ))}
        {points.map((a) => (
          <g key={a} transform={`rotate(${a})`}>
            <path d="M0 -50 L6 -6 L0 0 Z" fill="currentColor" stroke="none" />
            <path d="M0 -50 L-6 -6 L0 0 Z" strokeWidth="0.7" />
          </g>
        ))}
        <circle r="2.2" fill="currentColor" stroke="none" />
        <text y="-53" textAnchor="middle" fontSize="9" fill="currentColor" stroke="none" style={{ fontFamily: 'var(--font-display), serif' }}>
          N
        </text>
      </svg>
      <p className="text-[0.55rem] uppercase tracking-[0.3em]">38°28′ N · 122°53′ W</p>
    </div>
  )
}
