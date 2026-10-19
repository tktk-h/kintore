import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { BODY_PART_COLORS, BODY_PART_LABELS, BODY_PARTS } from '../../db/types'
import { useToday } from '../../lib/useToday'
import { getMonthInfo } from '../../repo/calendar'
import { MonthGrid, WeekdayRow } from './MonthGrid'

/** ホームのカレンダー。1か月分を表示し、矢印で前後の月へ。全体は「すべて見る」から */
export function Calendar() {
  const [ym, setYm] = useState(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() }
  })
  const [showLegend, setShowLegend] = useState(false)
  const info = useLiveQuery(() => getMonthInfo(ym.y, ym.m), [ym.y, ym.m]) ?? {}
  const navigate = useNavigate()
  const today = useToday()
  const shift = (delta: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })

  return (
    <CollapsibleCard
      storageKey="home.calendar"
      label="カレンダー"
      bodyClassName=""
      title={
        <>
          <CalendarDays aria-hidden="true" />
          カレンダー
        </>
      }
      actions={
        <Link to="/calendar" className="cal-see-all">
          すべて見る
        </Link>
      }
    >
      <div className="cal-card-head">
        <h3 className="cal-month-title">
          {ym.m + 1}月<span className="cal-year">{ym.y}年</span>
        </h3>
        <div className="cal-nav">
          <button type="button" aria-label="前の月" onClick={() => shift(-1)}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" aria-label="次の月" onClick={() => shift(1)}>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
      <WeekdayRow />
      <MonthGrid year={ym.y} month={ym.m} info={info} today={today} onSelect={(d) => navigate(`/day/${d}`)} />
      <button type="button" className="cal-legend-toggle" aria-expanded={showLegend} onClick={() => setShowLegend((s) => !s)}>
        色の見方
      </button>
      {showLegend && (
        <p className="cal-legend">
          {BODY_PARTS.map((p) => (
            <span key={p}>
              <i style={{ background: BODY_PART_COLORS[p] }} />
              {BODY_PART_LABELS[p]}
            </span>
          ))}
          <span>
            <i className="is-plan" />
            予定
          </span>
        </p>
      )}
    </CollapsibleCard>
  )
}
