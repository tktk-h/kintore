import { useLiveQuery } from 'dexie-react-hooks'
import { useLayoutEffect, useRef, type Ref } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../../components/PageHeader'
import { parseDateKey } from '../../lib/dates'
import { useToday } from '../../lib/useToday'
import { getMonthInfo } from '../../repo/calendar'
import { MonthGrid, WeekdayRow } from './MonthGrid'

/** 今月から何か月前・何か月後まで並べるか */
const MONTHS_BACK = 6
const MONTHS_AHEAD = 3

function MonthSection({ y, m, today, current }: { y: number; m: number; today: string; current?: Ref<HTMLElement> }) {
  const info = useLiveQuery(() => getMonthInfo(y, m), [y, m]) ?? {}
  const navigate = useNavigate()
  return (
    <section ref={current} className="cal-month" aria-label={`${y}年${m + 1}月`}>
      <h2 className="cal-month-title">
        {m + 1}月<span className="cal-year">{y}年</span>
      </h2>
      <MonthGrid year={y} month={m} info={info} today={today} onSelect={(d) => navigate(`/day/${d}`)} />
    </section>
  )
}

/** 過去から未来へ縦に続くカレンダー。開いたときは今月を出し、「今日」でいつでも戻れる */
export function CalendarPage() {
  const today = useToday()
  const t = parseDateKey(today)
  const currentRef = useRef<HTMLElement>(null)
  const months = Array.from({ length: MONTHS_BACK + MONTHS_AHEAD + 1 }, (_, i) => {
    const d = new Date(t.getFullYear(), t.getMonth() - MONTHS_BACK + i, 1)
    return { y: d.getFullYear(), m: d.getMonth() }
  })

  const scrollToToday = (behavior: ScrollBehavior) => {
    currentRef.current?.scrollIntoView?.({ block: 'start', behavior })
  }
  // 開いたときだけ今月まで送る
  useLayoutEffect(() => {
    scrollToToday('auto')
  }, [])

  return (
    <div className="page cal-page">
      <PageHeader backTo="/" title="カレンダー" />
      <WeekdayRow className="is-sticky" />
      {months.map(({ y, m }) => (
        <MonthSection key={`${y}-${m}`} y={y} m={m} today={today} current={y === t.getFullYear() && m === t.getMonth() ? currentRef : undefined} />
      ))}
      <button type="button" className="cal-today-btn" onClick={() => scrollToToday('smooth')}>
        今日
      </button>
    </div>
  )
}
