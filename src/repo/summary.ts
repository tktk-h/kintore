import { isPersonalRecord, totalVolume } from '../lib/workoutStats'
import { getHistorySets } from './history'
import { workoutDurationMs, type WorkoutDetail } from './workouts'

export interface WorkoutSummary {
  durationMs: number
  volume: number
  doneSets: number
  /** 自己ベストを更新した種目名 */
  personalRecords: string[]
}

export async function summarizeWorkout(detail: WorkoutDetail): Promise<WorkoutSummary> {
  const { workout } = detail
  const personalRecords: string[] = []
  for (const e of detail.exercises) {
    const done = e.sets.filter((s) => s.done)
    if (!done.length) continue
    const history = await getHistorySets(e.exercise.id, workout.startedAt)
    if (isPersonalRecord(e.exercise.logType, done, history)) personalRecords.push(e.exercise.name)
  }
  return {
    durationMs: workoutDurationMs(workout),
    volume: totalVolume(detail.exercises.map((e) => ({ logType: e.exercise.logType, sets: e.sets }))),
    doneSets: detail.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0),
    personalRecords,
  }
}
