import './trail.css'

/*
  The band's logo — hand-drawn guitar-redwood mark and wordmark — inked as
  a two-colour print: a deep offset shade under cream. Each layer is a box
  painted through a mask of the original artwork, so the drawing itself is
  never touched.
*/
export default function Lockup({
  ink = '#f7f2e5',
  line = '#0d2019',
  shade = 'rgba(5, 20, 18, 0.72)',
  className = '',
}: {
  /** Wordmark and the mark's body. */
  ink?: string
  /** The mark's drawn lines. */
  line?: string
  shade?: string
  className?: string
}) {
  return (
    <div className={`lockup ${className}`} role="img" aria-label="Northern Disconnection">
      <div className="lockup__plate lockup__plate--shade">
        <div className="lockup__mark lockup__mark--sil" style={{ background: shade }} />
        <div className="lockup__word" style={{ background: shade }} />
      </div>
      <div className="lockup__plate">
        <div className="lockup__mark lockup__mark--fill" style={{ background: ink }} />
        <div className="lockup__mark lockup__mark--ink" style={{ background: line }} />
        <div className="lockup__word" style={{ background: ink }} />
      </div>
    </div>
  )
}
