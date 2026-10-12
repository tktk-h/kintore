import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import type { PlannedWorkout } from '../db/types'
import { newRecord } from '../lib/records'
import { resetDb } from '../test/db'
import {
  addExerciseToWorkout,
  deleteWorkout,
  finishWorkout,
  getActiveWorkout,
  getLastFinishedWorkout,
  getWorkoutDetail,
  saveWorkoutAsRoutine,
  startWorkout,
  toPlannedExercises,
} from './workouts'

const at = (iso: string) => vi.setSystemTime(new Date(iso))

/** 最初のセットだけ完了にして終了する */
async function finishWithFirstSetDone(workoutId: string) {
  const d = await getWorkoutDetail(workoutId)
  for (const e of d!.exercises) await db.sets.update(e.sets[0].id, { done: true })
  await finishWorkout(workoutId, {})
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-10-12T10:00:00')
  await resetDb()
})
afterEach(() => vi.useRealTimers())

describe('startWorkout', () => {
  it('予定メニューの重量・回数でセットを作る', async () => {
    const plan = newRecord<PlannedWorkout>({
      date: '2026-10-12',
      title: '胸の日',
      source: 'manual',
      exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }],
    })
    const id = await startWorkout({ date: '2026-10-12', plan })
    const d = await getWorkoutDetail(id)
    expect(d?.workout).toMatchObject({ title: '胸の日', plannedWorkoutId: plan.id })
    expect(d?.exercises[0].workoutExercise.restSec).toBe(90)
    expect(d?.exercises[0].sets.map((s) => [s.weight, s.reps, s.done])).toEqual([
      [60, 8, false],
      [60, 8, false],
    ])
  })

  it('予定のセットが空の種目は前回の記録を入れる', async () => {
    const first = await startWorkout({ date: '2026-10-10', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 80, reps: 5 }] }] })
    await finishWithFirstSetDone(first)
    at('2026-10-12T11:00:00')
    const second = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [] }] })
    const d = await getWorkoutDetail(second)
    expect(d?.exercises[0].sets.map((s) => [s.weight, s.reps])).toEqual([[80, 5]])
  })

  it('前回も予定もなければ初期値を入れる', async () => {
    const id = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-pull-up', restSec: 120, sets: [] }] })
    const d = await getWorkoutDetail(id)
    expect(d?.exercises[0].sets.map((s) => s.reps)).toEqual([10, 10, 10])
  })

  it('トレーニング中なら新しく作らず、そのトレーニングを返す', async () => {
    const first = await startWorkout({ date: '2026-10-12' })
    expect(await startWorkout({ date: '2026-10-12', title: '別' })).toBe(first)
    expect(await db.workouts.count()).toBe(1)
  })

  it('同時に2回呼んでも1つしか作らない', async () => {
    const ex = [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }]
    const [a, b] = await Promise.all([
      startWorkout({ date: '2026-10-12', exercises: ex }),
      startWorkout({ date: '2026-10-12', exercises: ex }),
    ])
    expect(a).toBe(b)
    expect(await db.workouts.count()).toBe(1)
    expect(await db.sets.count()).toBe(1)
  })
})

describe('getActiveWorkout / getLastFinishedWorkout', () => {
  it('終了していないトレーニングを返す', async () => {
    const id = await startWorkout({ date: '2026-10-12' })
    expect((await getActiveWorkout())?.id).toBe(id)
    await finishWorkout(id, { condition: 4, satisfaction: 5, note: '良かった' })
    expect(await getActiveWorkout()).toBeUndefined()
    expect(await getLastFinishedWorkout()).toMatchObject({ id, condition: 4, satisfaction: 5, note: '良かった' })
  })

  it('削除したトレーニングは出てこない', async () => {
    const id = await startWorkout({ date: '2026-10-12' })
    await deleteWorkout(id)
    expect(await getActiveWorkout()).toBeUndefined()
    expect(await getWorkoutDetail(id)).toBeUndefined()
  })
})

describe('deleteWorkout', () => {
  it('種目とセットも削除扱いになる', async () => {
    const id = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    await deleteWorkout(id)
    const wes = await db.workoutExercises.where('workoutId').equals(id).toArray()
    const sets = await db.sets.where('workoutId').equals(id).toArray()
    expect(wes.length).toBe(1)
    expect(sets.length).toBe(1)
    expect([...wes, ...sets].every((r) => r.deleted)).toBe(true)
  })
})

describe('addExerciseToWorkout', () => {
  it('削除済みのトレーニングや種目には追加できない', async () => {
    const id = await startWorkout({ date: '2026-10-12' })
    await db.exercises.update('ex-side-raise', { deleted: true })
    await expect(addExerciseToWorkout(id, 'ex-side-raise')).rejects.toThrow()
    await deleteWorkout(id)
    await expect(addExerciseToWorkout(id, 'ex-bench-press')).rejects.toThrow()
  })

  it('末尾に追加し、種目の標準の休憩時間を使う', async () => {
    const id = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [] }] })
    await addExerciseToWorkout(id, 'ex-side-raise')
    const d = await getWorkoutDetail(id)
    expect(d?.exercises.map((e) => e.exercise.name)).toEqual(['ベンチプレス', 'サイドレイズ'])
    expect(d?.exercises[1].workoutExercise.restSec).toBe(60)
  })
})

describe('toPlannedExercises / saveWorkoutAsRoutine', () => {
  it('完了したセットの値でメニューを作る', async () => {
    const id = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] })
    await finishWithFirstSetDone(id)
    const d = await getWorkoutDetail(id)
    expect(toPlannedExercises(d!)).toEqual([{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }])
    const routine = await saveWorkoutAsRoutine(id, '胸の日')
    expect(routine.exercises).toEqual(toPlannedExercises(d!))
  })
})
