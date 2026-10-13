import { db } from '../db/db'
import { BODY_PARTS, type BodyPart, type Exercise } from '../db/types'
import { alive, newRecord } from '../lib/records'

export type ExerciseInput = Pick<Exercise, 'name' | 'bodyPart' | 'equipment' | 'logType' | 'defaultRestSec'> &
  Partial<Pick<Exercise, 'pattern' | 'primary' | 'secondary' | 'compound'>>

function compareExercises(a: Exercise, b: Exercise): number {
  const byPart = BODY_PARTS.indexOf(a.bodyPart) - BODY_PARTS.indexOf(b.bodyPart)
  return byPart !== 0 ? byPart : a.name.localeCompare(b.name, 'ja')
}

export async function listExercises(): Promise<Exercise[]> {
  return (await db.exercises.toArray()).filter((e) => !e.deleted).sort(compareExercises)
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  const e = await db.exercises.get(id)
  return alive(e) ? e : undefined
}

export async function createExercise(input: ExerciseInput): Promise<Exercise> {
  const e = newRecord<Exercise>({ ...input, custom: true })
  await db.exercises.add(e)
  return e
}

export async function updateExercise(id: string, input: ExerciseInput): Promise<void> {
  await db.exercises.update(id, { ...input, updatedAt: Date.now() })
}

/** ひらがなをカタカナにそろえて、どちらで入力しても検索できるようにする */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
}

export function filterExercises(list: Exercise[], query: string, bodyPart?: BodyPart): Exercise[] {
  const q = normalize(query)
  return list.filter((e) => (!bodyPart || e.bodyPart === bodyPart) && (!q || normalize(e.name).includes(q)))
}
