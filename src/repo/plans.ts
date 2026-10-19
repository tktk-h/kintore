import { db } from '../db/db'
import type { PlannedExercise, PlannedWorkout, SetValues } from '../db/types'
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

/** 予定の種目を直すときの値（回数・重さは1セット目の値。ない種目は undefined） */
export interface PlannedValues {
  exerciseId: string
  sets: number
  reps?: number
  weight?: number
  restSec: number
}

/** 予定の種目の今の値 */
export function plannedValues(pe: PlannedExercise): PlannedValues {
  const first = pe.sets[0]
  return { exerciseId: pe.exerciseId, sets: pe.sets.length, reps: first?.reps, weight: first?.weight, restSec: pe.restSec }
}

/**
 * 直した値を予定の種目に当てる。枠と回数の幅はそのまま。
 * セット数・回数・重さが変わったときだけ、セットを同じ {重さ, 回数} の N 個に並べ直す
 */
export function editPlannedExercise(pe: PlannedExercise, v: PlannedValues): PlannedExercise {
  const now = plannedValues(pe)
  const changed = v.sets !== now.sets || v.reps !== now.reps || v.weight !== now.weight
  const one: SetValues = { ...pe.sets[0], reps: v.reps, weight: v.weight }
  for (const k of ['reps', 'weight'] as const) if (one[k] === undefined) delete one[k]
  const sets = changed ? Array.from({ length: v.sets }, () => ({ ...one })) : pe.sets
  return { ...pe, exerciseId: v.exerciseId, restSec: v.restSec, sets }
}

async function changeExercises(planId: string, change: (list: PlannedExercise[]) => PlannedExercise[]): Promise<void> {
  await db.transaction('rw', db.plannedWorkouts, async () => {
    const plan = await db.plannedWorkouts.get(planId)
    if (!plan || plan.deleted) throw new Error('予定が見つかりません')
    await db.plannedWorkouts.update(planId, { exercises: change(plan.exercises), updatedAt: Date.now() })
  })
}

/** 予定の index 番目の種目を置き換える */
export function updatePlannedExercise(planId: string, index: number, pe: PlannedExercise): Promise<void> {
  return changeExercises(planId, (list) => list.map((x, i) => (i === index ? pe : x)))
}

/** 予定から index 番目の種目を外す */
export function removePlannedExercise(planId: string, index: number): Promise<void> {
  return changeExercises(planId, (list) => list.filter((_, i) => i !== index))
}
