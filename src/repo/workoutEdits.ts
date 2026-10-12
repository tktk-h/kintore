import { db } from '../db/db'
import type { Rating, SetRecord, SetValues } from '../db/types'
import { newRecord } from '../lib/records'
import { defaultSets, valuesOf } from '../lib/setValues'

const touch = () => ({ updatedAt: Date.now() })
const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

export async function updateSet(id: string, values: SetValues): Promise<void> {
  await db.sets.update(id, { ...values, ...touch() })
}

export async function setDone(id: string, done: boolean): Promise<void> {
  await db.sets.update(id, { done, doneAt: done ? Date.now() : undefined, ...touch() })
}

export async function addSet(workoutExerciseId: string): Promise<void> {
  const we = await db.workoutExercises.get(workoutExerciseId)
  if (!we) throw new Error('種目が見つかりません')
  const sets = (await db.sets.where('workoutExerciseId').equals(workoutExerciseId).toArray())
    .filter((s) => !s.deleted)
    .sort(byOrder)
  const last = sets[sets.length - 1]
  let values: SetValues
  if (last) {
    values = valuesOf(last)
  } else {
    const exercise = await db.exercises.get(we.exerciseId)
    values = exercise ? defaultSets(exercise.logType, exercise.bodyPart)[0] : {}
  }
  await db.sets.add(
    newRecord<SetRecord>({
      ...values,
      workoutId: we.workoutId,
      workoutExerciseId,
      order: last ? last.order + 1 : 0,
      done: false,
    }),
  )
}

export async function deleteSet(id: string): Promise<void> {
  await db.sets.update(id, { deleted: true, ...touch() })
}

export async function removeExerciseFromWorkout(workoutExerciseId: string): Promise<void> {
  await db.transaction('rw', [db.workoutExercises, db.sets], async () => {
    await db.workoutExercises.update(workoutExerciseId, { deleted: true, ...touch() })
    await db.sets.where('workoutExerciseId').equals(workoutExerciseId).modify({ deleted: true, ...touch() })
  })
}

export async function moveExercise(workoutExerciseId: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.workoutExercises, async () => {
    const we = await db.workoutExercises.get(workoutExerciseId)
    if (!we) return
    const list = (await db.workoutExercises.where('workoutId').equals(we.workoutId).toArray())
      .filter((e) => !e.deleted)
      .sort(byOrder)
    const other = list[list.findIndex((e) => e.id === workoutExerciseId) + direction]
    if (!other) return
    await db.workoutExercises.update(we.id, { order: other.order, ...touch() })
    await db.workoutExercises.update(other.id, { order: we.order, ...touch() })
  })
}

/** 両方の項目を必ず渡す。undefined を渡した項目は消える */
export async function updateExerciseNote(
  workoutExerciseId: string,
  changes: { effort: Rating | undefined; note: string | undefined },
): Promise<void> {
  await db.workoutExercises.update(workoutExerciseId, { effort: changes.effort, note: changes.note, ...touch() })
}
