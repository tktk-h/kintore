import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import { resetDb } from '../test/db'
import { getPreviousSets } from './history'
import { finishWorkout, getWorkoutDetail, startWorkout } from './workouts'

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

describe('getPreviousSets', () => {
  it('指定時刻より前に終わった直近のトレーニングの、完了セットだけを返す', async () => {
    at('2026-10-08T10:00:00')
    const a = await startWorkout({ date: '2026-10-08', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 70, reps: 5 }] }] })
    await finishWithFirstSetDone(a)
    at('2026-10-12T09:00:00')
    const b = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 80, reps: 5 }, { weight: 80, reps: 3 }] }] })
    await finishWithFirstSetDone(b)
    at('2026-10-12T12:00:00')
    expect((await getPreviousSets('ex-squat')).map((s) => s.weight)).toEqual([80])
    expect((await getPreviousSets('ex-squat', new Date('2026-10-10').getTime())).map((s) => s.weight)).toEqual([70])
  })

  it('終了していないトレーニングは前回に含めない', async () => {
    await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 80, reps: 5 }] }] })
    at('2026-10-12T12:00:00')
    expect(await getPreviousSets('ex-squat')).toEqual([])
  })
})
