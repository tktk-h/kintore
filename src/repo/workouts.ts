import { db } from '../db/db'
import type {
  Exercise,
  PlannedExercise,
  PlannedWorkout,
  Routine,
  SetRecord,
  SetValues,
  Workout,
  WorkoutExercise,
} from '../db/types'
import { alive, newRecord } from '../lib/records'
import { valuesOf } from '../lib/setValues'
import { suggestSets } from './history'
import { createRoutine } from './routines'

export interface WorkoutExerciseDetail {
  workoutExercise: WorkoutExercise
  exercise: Exercise
  sets: SetRecord[]
}

export interface WorkoutDetail {
  workout: Workout
  exercises: WorkoutExerciseDetail[]
}

/** condition / satisfaction / note は undefined を渡すとその項目が消える */
export type FinishResult = Pick<Workout, 'condition' | 'satisfaction' | 'note'>

export interface StartWorkoutOptions {
  date: string
  title?: string
  /** 予定メニューから始める場合 */
  plan?: PlannedWorkout
  /** マイメニューや前回のメニューから始める場合。sets が空の種目は前回の値を入れる */
  exercises?: PlannedExercise[]
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

export async function getActiveWorkout(): Promise<Workout | undefined> {
  return (await db.workouts.toArray())
    .filter((w) => !w.deleted && w.finishedAt === undefined)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
}

export async function getLastFinishedWorkout(): Promise<Workout | undefined> {
  return (await db.workouts.toArray())
    .filter((w) => !w.deleted && w.finishedAt !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
}

export async function listWorkoutsByDate(date: string): Promise<Workout[]> {
  return (await db.workouts.where('date').equals(date).toArray())
    .filter((w) => !w.deleted)
    .sort((a, b) => a.startedAt - b.startedAt)
}

export async function getWorkoutDetail(id: string): Promise<WorkoutDetail | undefined> {
  const workout = await db.workouts.get(id)
  if (!alive(workout)) return undefined
  const wes = (await db.workoutExercises.where('workoutId').equals(id).toArray()).filter((we) => !we.deleted).sort(byOrder)
  const sets = (await db.sets.where('workoutId').equals(id).toArray()).filter((s) => !s.deleted)
  const exercises = await db.exercises.bulkGet(wes.map((we) => we.exerciseId))
  return {
    workout,
    exercises: wes.flatMap((we, i) => {
      const exercise = exercises[i]
      if (!exercise) return []
      return [{ workoutExercise: we, exercise, sets: sets.filter((s) => s.workoutExerciseId === we.id).sort(byOrder) }]
    }),
  }
}

async function insertExercise(
  workoutId: string,
  exerciseId: string,
  restSec: number,
  order: number,
  values: SetValues[],
  now: number,
): Promise<void> {
  const we = newRecord<WorkoutExercise>({ workoutId, exerciseId, order, restSec }, now)
  await db.workoutExercises.add(we)
  await db.sets.bulkAdd(
    values.map((v, i) =>
      newRecord<SetRecord>({ ...valuesOf(v), workoutId, workoutExerciseId: we.id, order: i, done: false }, now),
    ),
  )
}

export async function startWorkout(opts: StartWorkoutOptions): Promise<string> {
  const now = Date.now()
  const planned = opts.plan ? opts.plan.exercises : (opts.exercises ?? [])
  const workout = newRecord<Workout>(
    { date: opts.date, startedAt: now, title: opts.title ?? opts.plan?.title, plannedWorkoutId: opts.plan?.id },
    now,
  )
  // 読み込みは書き込みのトランザクションの前に済ませる
  const prepared: { pe: PlannedExercise; values: SetValues[] }[] = []
  for (const pe of planned) {
    const exercise = await db.exercises.get(pe.exerciseId)
    if (!exercise) continue
    prepared.push({ pe, values: pe.sets.length ? pe.sets : await suggestSets(exercise, now) })
  }
  await db.transaction('rw', [db.workouts, db.workoutExercises, db.sets], async () => {
    await db.workouts.add(workout)
    for (const [i, { pe, values }] of prepared.entries()) {
      await insertExercise(workout.id, pe.exerciseId, pe.restSec, i, values, now)
    }
  })
  return workout.id
}

export async function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<void> {
  const exercise = await db.exercises.get(exerciseId)
  const workout = await db.workouts.get(workoutId)
  if (!alive(exercise) || !alive(workout)) throw new Error('種目またはトレーニングが見つかりません')
  const values = await suggestSets(exercise, workout.startedAt)
  const existing = (await db.workoutExercises.where('workoutId').equals(workoutId).toArray()).filter((we) => !we.deleted)
  const order = existing.length ? Math.max(...existing.map((we) => we.order)) + 1 : 0
  await db.transaction('rw', [db.workoutExercises, db.sets], () =>
    insertExercise(workoutId, exerciseId, exercise.defaultRestSec, order, values, Date.now()),
  )
}

export async function finishWorkout(id: string, result: FinishResult): Promise<void> {
  const now = Date.now()
  await db.workouts.update(id, { ...result, finishedAt: now, updatedAt: now })
}

export async function deleteWorkout(id: string): Promise<void> {
  const now = Date.now()
  await db.transaction('rw', [db.workouts, db.workoutExercises, db.sets], async () => {
    await db.workouts.update(id, { deleted: true, updatedAt: now })
    await db.workoutExercises.where('workoutId').equals(id).modify({ deleted: true, updatedAt: now })
    await db.sets.where('workoutId').equals(id).modify({ deleted: true, updatedAt: now })
  })
}

/** 実施したトレーニングをメニューの形にする（完了セットがあればその値、なければ全セット） */
export function toPlannedExercises(detail: WorkoutDetail): PlannedExercise[] {
  return detail.exercises.map((e) => {
    const done = e.sets.filter((s) => s.done)
    return {
      exerciseId: e.exercise.id,
      restSec: e.workoutExercise.restSec,
      sets: (done.length ? done : e.sets).map(valuesOf),
    }
  })
}

export async function saveWorkoutAsRoutine(workoutId: string, name: string): Promise<Routine> {
  const detail = await getWorkoutDetail(workoutId)
  if (!detail) throw new Error('トレーニングが見つかりません')
  return createRoutine({ name, exercises: toPlannedExercises(detail) })
}
