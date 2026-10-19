import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { assignRoutineToDate, deletePlan, editPlannedExercise, getPlanForDate, removePlannedExercise, updatePlannedExercise } from './plans'
import { createRoutine } from './routines'

beforeEach(resetDb)

describe('plans', () => {
  it('マイメニューを日付に割り当てると予定メニューになる', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: [{ exerciseId: 'ex-bench-press', restSec: 120, sets: [{ weight: 60, reps: 8 }] }] })
    await assignRoutineToDate(r.id, '2026-10-13')
    const plan = await getPlanForDate('2026-10-13')
    expect(plan).toMatchObject({ title: '胸の日', source: 'routine', routineId: r.id })
    expect(plan?.exercises[0].sets[0]).toEqual({ weight: 60, reps: 8 })
  })

  it('同じ日に割り当て直すと前の予定を置き換える', async () => {
    const a = await createRoutine({ name: 'A', exercises: [] })
    const b = await createRoutine({ name: 'B', exercises: [] })
    await assignRoutineToDate(a.id, '2026-10-13')
    await assignRoutineToDate(b.id, '2026-10-13')
    expect((await getPlanForDate('2026-10-13'))?.title).toBe('B')
  })

  it('予定を削除できる', async () => {
    const a = await createRoutine({ name: 'A', exercises: [] })
    const plan = await assignRoutineToDate(a.id, '2026-10-13')
    await deletePlan(plan.id)
    expect(await getPlanForDate('2026-10-13')).toBeUndefined()
  })
})

describe('予定の種目を直す', () => {
  const bench = { exerciseId: 'ex-bench-press', restSec: 120, slot: 'upper.1', repRange: [6, 10] as [number, number], sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }

  it('セット数・回数・重さを変えると、同じセットを並べ直す（枠と回数の幅はそのまま）', () => {
    expect(editPlannedExercise(bench, { exerciseId: 'ex-bench-press', sets: 3, reps: 10, weight: 62.5, restSec: 90 })).toEqual({
      ...bench, restSec: 90, sets: [{ weight: 62.5, reps: 10 }, { weight: 62.5, reps: 10 }, { weight: 62.5, reps: 10 }],
    })
  })

  it('セット数・回数・重さが同じならセットはそのまま', () => {
    const mixed = { ...bench, sets: [{ weight: 60, reps: 8 }, { weight: 55, reps: 10 }] }
    expect(editPlannedExercise(mixed, { exerciseId: 'ex-bench-press', sets: 2, reps: 8, weight: 60, restSec: 60 }).sets).toBe(mixed.sets)
  })

  it('予定の種目を書き換えて updatedAt を進める', async () => {
    const r = await createRoutine({ name: 'A', exercises: [bench, { exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 80, reps: 5 }] }] })
    const plan = await assignRoutineToDate(r.id, '2026-10-13')
    const next = editPlannedExercise(plan.exercises[0], { exerciseId: 'ex-dumbbell-press', sets: 1, reps: 12, weight: 20, restSec: 90 })
    await updatePlannedExercise(plan.id, 0, next)
    const saved = (await getPlanForDate('2026-10-13'))!
    expect(saved.exercises[0]).toEqual({ ...bench, exerciseId: 'ex-dumbbell-press', restSec: 90, sets: [{ weight: 20, reps: 12 }] })
    expect(saved.exercises[1].exerciseId).toBe('ex-squat')
    expect(saved.updatedAt).toBeGreaterThanOrEqual(plan.updatedAt)
  })

  it('予定から種目を外せる', async () => {
    const r = await createRoutine({ name: 'A', exercises: [bench, { exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 80, reps: 5 }] }] })
    const plan = await assignRoutineToDate(r.id, '2026-10-13')
    await removePlannedExercise(plan.id, 0)
    expect((await getPlanForDate('2026-10-13'))!.exercises.map((e) => e.exerciseId)).toEqual(['ex-squat'])
  })
})
