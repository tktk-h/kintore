import { StorageWarning } from '../../components/StorageWarning'
import { todayKey } from '../../lib/dates'
import { Calendar } from '../calendar/Calendar'
import { TodayWeightCard } from './TodayWeightCard'
import { TodayWorkoutCard } from './TodayWorkoutCard'

export function HomePage() {
  const today = todayKey()
  return (
    <div className="page">
      <StorageWarning />
      <TodayWeightCard date={today} />
      <TodayWorkoutCard date={today} />
      <Calendar />
    </div>
  )
}
