import { NavLink } from 'react-router'

const ITEMS = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/body', icon: '⚖️', label: '体' },
  { to: '/routines', icon: '📋', label: 'メニュー' },
  { to: '/exercises', icon: '💪', label: '種目' },
  { to: '/settings', icon: '⚙️', label: '設定' },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="メインメニュー">
      {ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          <span className="icon" aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
