import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { assignRoutineToDate, deletePlan, getPlanForDate } from './plans'
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
