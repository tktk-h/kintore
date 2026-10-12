import { StorageWarning } from '../../components/StorageWarning'
import { useToday } from '../../lib/useToday'
import { Calendar } from '../calendar/Calendar'
import { TodayWeightCard } from './TodayWeightCard'
import { TodayWorkoutCard } from './TodayWorkoutCard'

export function HomePage() {
  const today = useToday()
  return (
    <div className="page">
      <StorageWarning />
      <TodayWeightCard date={today} />
      <TodayWorkoutCard date={today} />
      <Calendar />
    </div>
  )
}
