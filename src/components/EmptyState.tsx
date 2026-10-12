import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** 中身がないときの表示 */
export function EmptyState({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="empty">
      <span className="empty-icon" aria-hidden="true">
        <Icon />
      </span>
      {children}
    </div>
  )
}
