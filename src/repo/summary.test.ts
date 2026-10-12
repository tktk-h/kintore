import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDb } from '../test/db'
import { summarizeWorkout } from './summary'
import { setDone } from './workoutEdits'
import { finishWorkout, getWorkoutDetail, pauseWorkout, resumeWorkout, startWorkout } from './workouts'

const at = (iso: string) => vi.setSystemTime(new Date(iso))

async function doWorkout(date: string, weight: number, reps: number) {
  const id = await startWorkout({ date, exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight, reps }] }] })
  const d = await getWorkoutDetail(id)
  await setDone(d!.exercises[0].sets[0].id, true)
  return id
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetDb()
})
afterEach(() => vi.useRealTimers())

describe('summarizeWorkout', () => {
  it('時間・総重量・自己ベストを出す', async () => {
    at('2026-10-10T10:00:00')
    await finishWorkout(await doWorkout('2026-10-10', 60, 8), {})
    at('2026-10-12T10:00:00')
    const id = await doWorkout('2026-10-12', 62.5, 5)
    at('2026-10-12T10:45:00')
    await finishWorkout(id, {})
    const summary = await summarizeWorkout((await getWorkoutDetail(id))!)
    expect(summary).toEqual({ durationMs: 45 * 60000, volume: 312.5, doneSets: 1, personalRecords: ['ベンチプレス'] })
  })

  it('初めての種目は自己ベストにしない', async () => {
    at('2026-10-12T10:00:00')
    const id = await doWorkout('2026-10-12', 60, 8)
    expect((await summarizeWorkout((await getWorkoutDetail(id))!)).personalRecords).toEqual([])
  })
})

describe('summarizeWorkout（一時停止）', () => {
  it('一時停止した時間を引く', async () => {
    at('2026-10-12T10:00:00')
    const id = await doWorkout('2026-10-12', 60, 8)
    at('2026-10-12T10:10:00')
    await pauseWorkout(id)
    at('2026-10-12T10:25:00')
    await resumeWorkout(id)
    at('2026-10-12T10:45:00')
    await finishWorkout(id, {})
    expect((await summarizeWorkout((await getWorkoutDetail(id))!)).durationMs).toBe(30 * 60000)
  })
})
