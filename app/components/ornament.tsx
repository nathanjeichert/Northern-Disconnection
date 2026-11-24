import Image from 'next/image'

interface OrnamentProps {
  className?: string
  /** Render a glyph instead of the logo mark. */
  glyph?: string
  /** Ink the mark for paper instead of for dark bands. */
  ink?: boolean
}

// Section divider:  ── ✕ ──  where ✕ is the band's guitar-redwood mark
// (a printer's mark between two rules), or a glyph.
export default function Ornament({ className = '', glyph, ink }: OrnamentProps) {
  return (
    <div className={`ornament ${className}`.trim()} aria-hidden="true">
      {glyph ?? (
        <Image src="/logonotext.svg" alt="" width={15} height={44} className={`${ink ? 'logo-ink' : 'logo-cream'} h-11 w-auto opacity-80`} />
      )}
    </div>
  )
}
