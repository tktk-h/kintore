import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { BODY_PART_COLORS, BODY_PART_LABELS, BODY_PARTS } from '../../db/types'
import { formatDateJa, monthGrid, WEEKDAYS } from '../../lib/dates'
import { useToday } from '../../lib/useToday'
import { getMonthInfo } from '../../repo/calendar'

export function Calendar() {
  const [ym, setYm] = useState(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() }
  })
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
    >
      <div className="calendar-head">
        <button type="button" aria-label="前の月" onClick={() => shift(-1)}>
          <ChevronLeft aria-hidden="true" />
        </button>
        <h2>
          {ym.y}年{ym.m + 1}月
        </h2>
        <button type="button" aria-label="次の月" onClick={() => shift(1)}>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {monthGrid(ym.y, ym.m)
          .flat()
          .map((key, i) =>
            key === null ? (
              <div key={`blank-${i}`} />
            ) : (
              <button
                key={key}
                type="button"
                className={`calendar-day ${key === today ? 'today' : ''} ${info[key]?.bodyParts.length ? 'has-log' : ''}`}
                aria-label={formatDateJa(key)}
                onClick={() => navigate(`/day/${key}`)}
              >
                <span>{Number(key.slice(8))}</span>
                <span className="dots">
                  {info[key]?.bodyParts.map((p) => <i key={p} style={{ background: BODY_PART_COLORS[p] }} />)}
                  {info[key]?.hasPlan && <i className="plan-dot" />}
                </span>
              </button>
            ),
          )}
      </div>
      <div className="legend">
        {BODY_PARTS.map((p) => (
          <span key={p}>
            <i style={{ background: BODY_PART_COLORS[p] }} />
            {BODY_PART_LABELS[p]}
          </span>
        ))}
        <span>
          <i className="plan-dot" style={{ border: '1.5px solid currentColor' }} />
          予定
        </span>
      </div>
    </CollapsibleCard>
  )
}
