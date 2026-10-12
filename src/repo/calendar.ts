import { db } from '../db/db'
import { BODY_PARTS, type BodyPart } from '../db/types'
import { monthRange } from '../lib/dates'

export interface CalendarDayInfo {
  bodyParts: BodyPart[]
  hasPlan: boolean
  hasBodyLog: boolean
}

/** month は 0〜11 */
export async function getMonthInfo(year: number, month: number): Promise<Record<string, CalendarDayInfo>> {
  const [from, to] = monthRange(year, month)
  const info: Record<string, CalendarDayInfo> = {}
  const day = (date: string) => (info[date] ??= { bodyParts: [], hasPlan: false, hasBodyLog: false })

  const workouts = (await db.workouts.where('date').between(from, to, true, true).toArray()).filter((w) => !w.deleted)
  if (workouts.length) {
    const dateOf = new Map(workouts.map((w) => [w.id, w.date]))
    const wes = (await db.workoutExercises.where('workoutId').anyOf([...dateOf.keys()]).toArray()).filter((we) => !we.deleted)
    const exercises = await db.exercises.bulkGet([...new Set(wes.map((we) => we.exerciseId))])
    const partOf = new Map(exercises.flatMap((e) => (e ? [[e.id, e.bodyPart] as const] : [])))
    for (const w of workouts) day(w.date)
    for (const we of wes) {
      const part = partOf.get(we.exerciseId)
      const d = day(dateOf.get(we.workoutId)!)
      if (part && !d.bodyParts.includes(part)) d.bodyParts.push(part)
    }
  }

  const plans = await db.plannedWorkouts.where('date').between(from, to, true, true).toArray()
  for (const p of plans) if (!p.deleted) day(p.date).hasPlan = true

  const bodyLogs = await db.bodyLogs.where('date').between(from, to, true, true).toArray()
  for (const b of bodyLogs) if (!b.deleted) day(b.date).hasBodyLog = true

  for (const d of Object.values(info)) d.bodyParts.sort((a, b) => BODY_PARTS.indexOf(a) - BODY_PARTS.indexOf(b))
  return info
}
