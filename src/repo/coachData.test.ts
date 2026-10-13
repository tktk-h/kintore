import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import type { PlannedWorkout, Rating, SetRecord, Workout, WorkoutExercise } from '../db/types'
import { newRecord } from '../lib/records'
import { resetDb } from '../test/db'
import { loadCoachInputs } from './coachData'

beforeEach(resetDb)

const TODAY = '2026-10-14' // 水
const NEXT = '2026-10-19'

interface Ex { exerciseId: string; sets: { weight?: number; reps?: number; done?: boolean }[]; effort?: Rating }

async function addWorkout(date: string, exercises: Ex[], opts: { plannedWorkoutId?: string; condition?: Rating; finished?: boolean } = {}) {
  const w = newRecord<Workout>({
    date, startedAt: Date.parse(`${date}T10:00:00`), plannedWorkoutId: opts.plannedWorkoutId, condition: opts.condition,
    ...(opts.finished === false ? {} : { finishedAt: Date.parse(`${date}T11:00:00`) }),
  })
  await db.workouts.add(w)
  for (const [i, x] of exercises.entries()) {
    const we = newRecord<WorkoutExercise>({ workoutId: w.id, exerciseId: x.exerciseId, order: i, restSec: 90, effort: x.effort })
    await db.workoutExercises.add(we)
    await db.sets.bulkAdd(x.sets.map((s, j) => newRecord<SetRecord>({
      workoutId: w.id, workoutExerciseId: we.id, order: j, done: s.done ?? true, weight: s.weight, reps: s.reps,
    })))
  }
  return w
}

async function addPlan(p: Partial<PlannedWorkout> & { date: string }) {
  const plan = newRecord<PlannedWorkout>({ title: '予定', exercises: [], source: 'manual', ...p })
  await db.plannedWorkouts.add(plan)
  return plan
}

describe('loadCoachInputs', () => {
  it('種目ごとの記録：一番重い完了セットの重さと回数、予定の回数、きつさ（新しい順）', async () => {
    const plan = await addPlan({
      date: '2026-10-12', source: 'ai',
      exercises: [{ exerciseId: 'ex-bench-press', restSec: 150, sets: [{ weight: 60, reps: 8 }], slot: 'upper.1', repRange: [6, 10] }],
    })
    await addWorkout('2026-10-12', [{
      exerciseId: 'ex-bench-press', effort: 4,
      sets: [{ weight: 40, reps: 10 }, { weight: 60, reps: 8 }, { weight: 60, reps: 7 }, { weight: 60, reps: 6, done: false }],
    }], { plannedWorkoutId: plan.id, condition: 4 })
    await addWorkout('2026-10-08', [{ exerciseId: 'ex-bench-press', sets: [{ weight: 57.5, reps: 9 }, { weight: 57.5, reps: 10 }] }])

    const r = await loadCoachInputs(NEXT, TODAY)
    expect(r.sessions['ex-bench-press']).toEqual([
      { date: '2026-10-12', weight: 60, repsPerSet: [8, 7], targetReps: 8, effort: 4 },
      { date: '2026-10-08', weight: 57.5, repsPerSet: [9, 10], targetReps: 10 },
    ])
    expect(r.history.workouts[1]).toMatchObject({
      date: '2026-10-12', condition: 4,
      exercises: [{ exerciseId: 'ex-bench-press', effort: 4, sets: [{ weight: 40, reps: 10 }, { weight: 60, reps: 8 }, { weight: 60, reps: 7 }] }],
    })
  })

  it('4週間より前・終わっていない・削除したトレーニングは含めない', async () => {
    await addWorkout('2026-09-15', [{ exerciseId: 'ex-squat', sets: [{ weight: 80, reps: 5 }] }])
    await addWorkout('2026-10-13', [{ exerciseId: 'ex-squat', sets: [{ weight: 80, reps: 5 }] }], { finished: false })
    const del = await addWorkout('2026-10-10', [{ exerciseId: 'ex-squat', sets: [{ weight: 80, reps: 5 }] }])
    await db.workouts.update(del.id, { deleted: true })
    await addWorkout('2026-09-17', [{ exerciseId: 'ex-squat', sets: [{ weight: 85, reps: 5 }] }])
    const r = await loadCoachInputs(NEXT, TODAY)
    expect(r.sessions['ex-squat'].map((s) => s.date)).toEqual(['2026-09-17'])
    expect(r.history.workouts.map((w) => w.date)).toEqual(['2026-09-17'])
  })

  it('予定があったのに実施しなかった日と、対象週の既存の予定', async () => {
    await addPlan({ date: '2026-10-06', title: '実施した' })
    await addWorkout('2026-10-06', [{ exerciseId: 'ex-squat', sets: [{ weight: 80, reps: 5 }] }])
    await addPlan({ date: '2026-10-09', title: 'サボった' })
    await addPlan({ date: TODAY, title: '今日' })
    await addPlan({ date: '2026-10-20', title: '来週' })
    const r = await loadCoachInputs(NEXT, TODAY)
    expect(r.history.missed).toEqual([{ date: '2026-10-09', title: 'サボった' }])
    expect(r.existingPlans.map((p) => p.title)).toEqual(['来週'])
  })

  it('前のAIの週の枠ごとの種目と、きつさによるセット数の増減', async () => {
    const bench = { exerciseId: 'ex-bench-press', restSec: 150, sets: [{ weight: 60, reps: 6 }], slot: 'upper.1', repRange: [6, 10] as [number, number] }
    const row = { exerciseId: 'ex-seated-cable-row', restSec: 150, sets: [{ weight: 50, reps: 6 }], slot: 'upper.2', repRange: [6, 10] as [number, number] }
    const curl = { exerciseId: 'ex-dumbbell-curl', restSec: 75, sets: [{ weight: 10, reps: 10 }], slot: 'upper.6', repRange: [10, 15] as [number, number] }
    // 2週前のAIの週（使われない）
    await addPlan({ date: '2026-10-05', source: 'ai', exercises: [{ ...bench, exerciseId: 'ex-incline-bench-press' }] })
    // 前のAIの週
    await addPlan({ date: '2026-10-12', source: 'ai', exercises: [bench, row, curl] })
    // ベンチ：届かなかった → −1、ロー：楽が3回続いた → +1、カール：記録なし → 0
    await addWorkout('2026-10-12', [
      { exerciseId: 'ex-bench-press', effort: 4, sets: [{ weight: 60, reps: 6 }, { weight: 60, reps: 5 }] },
      { exerciseId: 'ex-seated-cable-row', effort: 2, sets: [{ weight: 50, reps: 10 }, { weight: 50, reps: 10 }] },
    ])
    await addWorkout('2026-10-08', [{ exerciseId: 'ex-seated-cable-row', effort: 1, sets: [{ weight: 45, reps: 10 }] }])
    await addWorkout('2026-10-05', [{ exerciseId: 'ex-seated-cable-row', effort: 2, sets: [{ weight: 40, reps: 10 }] }])

    const r = await loadCoachInputs(NEXT, TODAY)
    expect(r.previousSlots).toEqual({ 'upper.1': 'ex-bench-press', 'upper.2': 'ex-seated-cable-row', 'upper.6': 'ex-dumbbell-curl' })
    expect(r.slotSetDelta).toEqual({ 'upper.1': -1, 'upper.2': 1, 'upper.6': 0 })
  })

  it('時間の種目（プランク）は回数がなくてもセット数を減らさない', async () => {
    const plank = { exerciseId: 'ex-plank', restSec: 45, sets: [{ durationSec: 60 }], slot: 'lower.6', repRange: [10, 15] as [number, number] }
    await addPlan({ date: '2026-10-12', source: 'ai', exercises: [plank] })
    await addWorkout('2026-10-12', [{ exerciseId: 'ex-plank', effort: 3, sets: [{}, {}] }])
    await addWorkout('2026-10-08', [{ exerciseId: 'ex-plank', effort: 3, sets: [{}, {}] }])
    await addWorkout('2026-10-05', [{ exerciseId: 'ex-plank', effort: 3, sets: [{}, {}] }])
    const r = await loadCoachInputs(NEXT, TODAY)
    expect(r.slotSetDelta).toEqual({ 'lower.6': 0 })
  })

  it('最後の軽めの週からの週数（なければ最初のAIの週から、AIの予定がなければ0）', async () => {
    expect((await loadCoachInputs(NEXT, TODAY)).weeksSinceDeload).toBe(0)

    await addPlan({ date: '2026-09-22', source: 'ai' }) // 4週前の週
    await addPlan({ date: '2026-10-13', source: 'ai' })
    await addPlan({ date: '2026-10-21', source: 'ai', deload: true }) // 対象週の予定は数えない
    expect((await loadCoachInputs(NEXT, TODAY)).weeksSinceDeload).toBe(4)

    await addPlan({ date: '2026-10-01', source: 'ai', deload: true }) // 3週前の週
    expect((await loadCoachInputs(NEXT, TODAY)).weeksSinceDeload).toBe(3)
  })

  it('プロフィール・種目一覧・設定・チャットも返す', async () => {
    const r = await loadCoachInputs(NEXT, TODAY)
    expect(r.profile).toBeUndefined()
    expect(r.catalog.length).toBeGreaterThan(50)
    expect(r.settings.weightStep).toBe(2.5)
    expect(r.chat).toEqual([])
  })
})
