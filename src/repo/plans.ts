import { db } from '../db/db'
import type { PlannedWorkout } from '../db/types'
import { clonePlannedExercises, newRecord } from '../lib/records'
import { getRoutine } from './routines'

export async function getPlanForDate(date: string): Promise<PlannedWorkout | undefined> {
  return (await db.plannedWorkouts.where('date').equals(date).toArray()).find((p) => !p.deleted)
}

export async function assignRoutineToDate(routineId: string, date: string): Promise<PlannedWorkout> {
  const routine = await getRoutine(routineId)
  if (!routine) throw new Error('マイメニューが見つかりません')
  return db.transaction('rw', db.plannedWorkouts, async () => {
    const now = Date.now()
    const existing = await db.plannedWorkouts.where('date').equals(date).toArray()
    for (const p of existing) {
      if (!p.deleted) await db.plannedWorkouts.update(p.id, { deleted: true, updatedAt: now })
    }
    const plan = newRecord<PlannedWorkout>(
      { date, title: routine.name, exercises: clonePlannedExercises(routine.exercises), source: 'routine', routineId },
      now,
    )
    await db.plannedWorkouts.add(plan)
    return plan
  })
}

export async function deletePlan(id: string): Promise<void> {
  await db.plannedWorkouts.update(id, { deleted: true, updatedAt: Date.now() })
}
