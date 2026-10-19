import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'
import { usePersistentCollapsed } from './CollapsibleCard'

export interface DayTag {
  label: string
  color: string
}

interface Props {
  /** たたんだかどうかを覚えておくための、変わらない名前 */
  storageKey: string
  /** 覚えていないときにたたんでおくか */
  defaultCollapsed?: boolean
  /** 短い日付。例：「10/19(月)」 */
  date: string
  /** 例：「上半身」 */
  title: string
  /** 部位の小さな色付きチップ */
  tags?: DayTag[]
  /** 右側のまとめ。例：「7種目・約55分」 */
  summary?: string
  /** section の読み上げ名とボタンの名前に使う */
  label: string
  children: ReactNode
}

/** 1日分の見出し行（日付・名前・部位・まとめ）と、たためる中身 */
export function DayGroup({ storageKey, defaultCollapsed = false, date, title, tags = [], summary, label, children }: Props) {
  const [collapsed, toggle] = usePersistentCollapsed(storageKey, defaultCollapsed)
  return (
    <section className={`day-group ${collapsed ? 'is-collapsed' : ''}`.trim()} aria-label={label}>
      <button
        type="button"
        className="day-group-head"
        aria-expanded={!collapsed}
        aria-label={collapsed ? `「${label}」を開く` : `「${label}」をたたむ`}
        onClick={toggle}
      >
        <span className="day-group-date num">{date}</span>
        <span className="day-group-title">{title}</span>
        {tags.length > 0 && (
          <span className="day-group-tags">
            {tags.map((t) => (
              <span key={t.label} className="day-tag" style={{ color: t.color, borderColor: t.color }}>
                {t.label}
              </span>
            ))}
          </span>
        )}
        {summary && <span className="day-group-summary num">{summary}</span>}
        <ChevronDown className="day-group-chevron" aria-hidden="true" />
      </button>
      {!collapsed && <div className="day-group-body">{children}</div>}
    </section>
  )
}
