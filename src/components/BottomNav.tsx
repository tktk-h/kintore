import { ClipboardList, House, Scale, Settings, Sparkles, type LucideIcon } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'

const ITEMS: { to: string; icon: LucideIcon; label: string; also?: string }[] = [
  { to: '/', icon: House, label: 'ホーム' },
  { to: '/coach', icon: Sparkles, label: 'AIコーチ' },
  // 種目の追加・編集も「メニュー」の中のページ
  { to: '/routines', icon: ClipboardList, label: 'メニュー', also: '/exercises' },
  { to: '/body', icon: Scale, label: '体' },
  { to: '/settings', icon: Settings, label: '設定' },
]

export function BottomNav() {
  const { pathname } = useLocation()
  return (
    <nav className="bottom-nav" aria-label="メインメニュー">
      {ITEMS.map(({ to, icon: Icon, label, also }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => (isActive || (also && pathname.startsWith(also)) ? 'active' : '')}
        >
          <Icon aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
