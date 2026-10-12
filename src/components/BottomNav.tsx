import { ClipboardList, Dumbbell, House, Scale, Settings, type LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router'

const ITEMS: { to: string; icon: LucideIcon; label: string }[] = [
  { to: '/', icon: House, label: 'ホーム' },
  { to: '/body', icon: Scale, label: '体' },
  { to: '/routines', icon: ClipboardList, label: 'メニュー' },
  { to: '/exercises', icon: Dumbbell, label: '種目' },
  { to: '/settings', icon: Settings, label: '設定' },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="メインメニュー">
      {ITEMS.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'}>
          <Icon aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
