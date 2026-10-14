import { db } from '../db/db'
import type { Exercise, SetRecord, SetValues } from '../db/types'
import { alive } from '../lib/records'
import { defaultSets, valuesOf } from '../lib/setValues'

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

/** before より前に始まり、終了済みのトレーニングでの、その種目の完了セット（新しい順） */
async function finishedEntries(exerciseId: string, before: number): Promise<{ date: string; startedAt: number; sets: SetRecord[] }[]> {
  const wes = (await db.workoutExercises.where('exerciseId').equals(exerciseId).toArray()).filter((we) => !we.deleted)
  const workouts = await db.workouts.bulkGet(wes.map((we) => we.workoutId))
  const entries: { date: string; startedAt: number; sets: SetRecord[] }[] = []
  for (let i = 0; i < wes.length; i++) {
    const w = workouts[i]
    if (!alive(w) || w.finishedAt === undefined || w.startedAt >= before) continue
    const sets = (await db.sets.where('workoutExerciseId').equals(wes[i].id).toArray())
      .filter((s) => !s.deleted && s.done)
      .sort(byOrder)
    if (sets.length) entries.push({ date: w.date, startedAt: w.startedAt, sets })
  }
  return entries.sort((a, b) => b.startedAt - a.startedAt)
}

/** 「前回」の記録 */
export async function getPreviousSets(exerciseId: string, before = Date.now()): Promise<SetRecord[]> {
  return (await finishedEntries(exerciseId, before))[0]?.sets ?? []
}

/** 「前回」の記録（日付と完了セット）。なければ undefined */
export async function getLastRecord(exerciseId: string, before = Date.now()): Promise<{ date: string; sets: SetValues[] } | undefined> {
  const last = (await finishedEntries(exerciseId, before))[0]
  return last ? { date: last.date, sets: last.sets.map(valuesOf) } : undefined
}

/** 自己ベスト判定用の、過去すべての完了セット */
export async function getHistorySets(exerciseId: string, before: number): Promise<SetRecord[]> {
  return (await finishedEntries(exerciseId, before)).flatMap((e) => e.sets)
}

/** 予定がないときに最初に入れておく値。前回があれば前回、なければ初期値 */
export async function suggestSets(exercise: Exercise, before = Date.now()): Promise<SetValues[]> {
  const previous = await getPreviousSets(exercise.id, before)
  return previous.length ? previous.map(valuesOf) : defaultSets(exercise.logType, exercise.bodyPart)
}
