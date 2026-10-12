import { StorageWarning } from '../../components/StorageWarning'
import { formatDateJa } from '../../lib/dates'
import { useToday } from '../../lib/useToday'
import { Calendar } from '../calendar/Calendar'
import { TodayWeightCard } from './TodayWeightCard'
import { TodayWorkoutCard } from './TodayWorkoutCard'

export function HomePage() {
  const today = useToday()
  return (
    <div className="page">
      <header className="page-title">
        <p className="eyebrow">{formatDateJa(today)}</p>
        <h1>ホーム</h1>
      </header>
      <StorageWarning />
      <TodayWeightCard date={today} />
      <TodayWorkoutCard date={today} />
      <Calendar />
    </div>
  )
}
