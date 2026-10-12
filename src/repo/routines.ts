import { db } from '../db/db'
import type { Routine } from '../db/types'
import { alive, clonePlannedExercises, newRecord } from '../lib/records'

export type RoutineInput = Pick<Routine, 'name' | 'exercises'>

export async function listRoutines(): Promise<Routine[]> {
  return (await db.routines.toArray()).filter((r) => !r.deleted).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  const r = await db.routines.get(id)
  return alive(r) ? r : undefined
}

export async function createRoutine(input: RoutineInput): Promise<Routine> {
  const r = newRecord<Routine>({ name: input.name, exercises: clonePlannedExercises(input.exercises) })
  await db.routines.add(r)
  return r
}

export async function updateRoutine(id: string, input: RoutineInput): Promise<void> {
  await db.routines.update(id, { name: input.name, exercises: clonePlannedExercises(input.exercises), updatedAt: Date.now() })
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.routines.update(id, { deleted: true, updatedAt: Date.now() })
}
