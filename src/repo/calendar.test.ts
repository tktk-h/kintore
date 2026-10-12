import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { saveBodyLog } from './body'
import { getMonthInfo } from './calendar'
import { assignRoutineToDate } from './plans'
import { createRoutine } from './routines'
import { startWorkout } from './workouts'

beforeEach(resetDb)

describe('getMonthInfo', () => {
  it('日付ごとに鍛えた部位・予定・体の記録をまとめる', async () => {
    await startWorkout({
      date: '2026-10-12',
      exercises: [
        { exerciseId: 'ex-side-raise', restSec: 60, sets: [] },
        { exerciseId: 'ex-bench-press', restSec: 90, sets: [] },
        { exerciseId: 'ex-dumbbell-press', restSec: 90, sets: [] },
      ],
    })
    const r = await createRoutine({ name: '脚の日', exercises: [] })
    await assignRoutineToDate(r.id, '2026-10-14')
    await saveBodyLog('2026-10-12', { weightKg: 70 })
    await startWorkout({ date: '2026-11-01', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [] }] })

    const info = await getMonthInfo(2026, 9)
    expect(info['2026-10-12']).toEqual({ bodyParts: ['chest', 'shoulders'], hasPlan: false, hasBodyLog: true })
    expect(info['2026-10-14']).toEqual({ bodyParts: [], hasPlan: true, hasBodyLog: false })
    expect(info['2026-11-01']).toBeUndefined()
  })
})
