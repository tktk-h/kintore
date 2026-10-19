import { BODY_PART_COLORS, BODY_PART_LABELS } from '../../db/types'
import { formatDateJa, monthGrid, WEEKDAYS } from '../../lib/dates'
import type { CalendarDayInfo } from '../../repo/calendar'

/** 曜日の見出し（日〜土） */
export function WeekdayRow({ className = '' }: { className?: string }) {
  return (
    <div className={`cal-weekdays ${className}`.trim()} aria-hidden="true">
      {WEEKDAYS.map((w, i) => (
        <span key={w} className={i === 0 || i === 6 ? 'is-weekend' : undefined}>
          {w}
        </span>
      ))}
    </div>
  )
}

/** 読み上げ用の名前：「10月12日(月) 胸・背中 予定あり」 */
export function dayLabel(key: string, info: CalendarDayInfo | undefined, isToday: boolean): string {
  const parts = [formatDateJa(key)]
  if (info?.bodyParts.length) parts.push(info.bodyParts.map((p) => BODY_PART_LABELS[p]).join('・'))
  if (info?.hasPlan) parts.push('予定あり')
  if (isToday) parts.push('今日')
  return parts.join(' ')
}

/** 日付の下の印。部位が1つなら点、いくつかなら色を分けた短い棒、予定だけなら中が空の点 */
function DayIndicator({ info }: { info: CalendarDayInfo | undefined }) {
  const parts = info?.bodyParts ?? []
  if (parts.length > 0)
    return (
      <span className={`cal-ind ${parts.length > 1 ? 'is-pill' : 'is-dot'}`} aria-hidden="true">
        {parts.map((p) => (
          <i key={p} className="cal-seg" data-part={p} style={{ background: BODY_PART_COLORS[p] }} />
        ))}
      </span>
    )
  if (info?.hasPlan) return <span className="cal-ind is-dot is-plan" aria-hidden="true" />
  return <span className="cal-ind is-empty" aria-hidden="true" />
}

interface Props {
  year: number
  /** 0〜11 */
  month: number
  info: Record<string, CalendarDayInfo>
  today: string
  onSelect: (date: string) => void
}

/** 1か月分の週の行。マスの枠や背景はなく、週ごとに細い線で区切る */
export function MonthGrid({ year, month, info, today, onSelect }: Props) {
  return (
    <div className="cal-month-grid">
      {monthGrid(year, month).map((week, wi) => (
        <div key={wi} className="cal-week">
          {week.map((key, i) => {
            if (key === null) return <span key={`blank-${i}`} className="cal-blank" />
            const isToday = key === today
            const weekend = i === 0 || i === 6
            return (
              <button
                key={key}
                type="button"
                className={`cal-day${weekend ? ' is-weekend' : ''}${isToday ? ' is-today' : ''}`}
                aria-label={dayLabel(key, info[key], isToday)}
                aria-current={isToday ? 'date' : undefined}
                onClick={() => onSelect(key)}
              >
                <span className="cal-num">{Number(key.slice(8))}</span>
                <DayIndicator info={info[key]} />
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
