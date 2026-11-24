import Link from 'next/link'
import { PLACES } from '@/lib/world/places'
import PlaceIcon from './place-icon'
import './trail.css'

/*
  The trailhead signpost: the site's navigation, standing in the painting.
  Every board is a plain link (the camera walk is added by TrailChrome's
  click handler), so it works with no script at all.
*/
export default function Signpost() {
  const stops = PLACES.filter((p) => p.path !== '/')
  return (
    <nav className="signpost" aria-label="Site">
      <div className="signpost__post" aria-hidden="true" />
      <ul className="signpost__boards">
        {stops.map((place, i) => (
          <li key={place.id} style={{ '--i': i } as React.CSSProperties}>
            <Link href={place.path} className="signboard">
              <PlaceIcon id={place.id} size={22} />
              <span>{place.label}</span>
              <small>{place.name}</small>
            </Link>
          </li>
        ))}
        <li style={{ '--i': stops.length } as React.CSSProperties}>
          <a href="#register" className="signboard">
            <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden="true">
              <path d="M2 5h20v14H2z M4.200 7.200v.600L12 13l7.800-5.200v-.600z M4.200 10.200v6.600h15.600v-6.600L12 15.400z" fillRule="evenodd" />
            </svg>
            <span>Mailing List</span>
            <small>Show alerts</small>
          </a>
        </li>
      </ul>
    </nav>
  )
}
