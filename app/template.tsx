// Re-mounted on every navigation, so each page rises into place a beat
// after the camera sets off for it (see .page-enter in global.css).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
