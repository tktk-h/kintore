import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { db } from './db'

beforeEach(resetDb)

describe('db', () => {
  it('初回に定番種目を50種目以上入れる', async () => {
    expect(await db.exercises.count()).toBeGreaterThanOrEqual(50)
  })

  it('定番種目は固定IDを持つ', async () => {
    const bench = await db.exercises.get('ex-bench-press')
    expect(bench).toMatchObject({ name: 'ベンチプレス', bodyPart: 'chest', logType: 'weight_reps', custom: false, deleted: false })
  })

  it('3種類の記録形式がすべて含まれる', async () => {
    const all = await db.exercises.toArray()
    expect(new Set(all.map((e) => e.logType))).toEqual(new Set(['weight_reps', 'reps', 'time_distance']))
  })
})
