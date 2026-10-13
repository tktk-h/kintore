import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { db, SCHEMA_V1 } from './db'
import { seedExercises } from './seedExercises'

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

  it('初回の定番種目には動きの種類が入っている', async () => {
    expect(await db.exercises.get('ex-bench-press')).toMatchObject({ pattern: 'horizontal_push', compound: true })
  })

  it('version 1 のDBを開き直すと、定番種目に情報が足され、既存の記録は残る', async () => {
    db.close()
    await Dexie.delete('kintore')

    // version 1 の形のDBを作る（定番種目は情報なし、名前を変えたもの・自作種目・記録あり）
    const old = new Dexie('kintore')
    old.version(1).stores(SCHEMA_V1)
    await old.open()
    const oldSeeds = seedExercises().map(({ pattern: _p, primary: _pr, secondary: _s, compound: _c, ...rest }) => rest)
    oldSeeds[0] = { ...oldSeeds[0], name: '自分で名前を変えたベンチ' }
    await old.table('exercises').bulkAdd(oldSeeds)
    await old.table('exercises').add({
      id: 'my-ex', name: '自作', bodyPart: 'chest', equipment: 'machine', logType: 'weight_reps',
      defaultRestSec: 60, custom: true, createdAt: 1, updatedAt: 1, deleted: false,
    })
    await old.table('workouts').add({ id: 'w1', date: '2026-10-01', startedAt: 1, createdAt: 1, updatedAt: 1, deleted: false })
    await old.table('settings').put({ id: 'app', weightStep: 5, repStep: 1 })
    expect(await old.table('exercises').get('ex-squat')).not.toHaveProperty('pattern')
    old.close()

    await db.open()
    expect(db.verno).toBe(2)
    expect(await db.exercises.get('ex-squat')).toMatchObject({ pattern: 'squat', primary: ['quads', 'glutes'], compound: true })
    // 名前などの既存の値は変えない
    expect(await db.exercises.get(oldSeeds[0].id)).toMatchObject({ name: '自分で名前を変えたベンチ', pattern: 'horizontal_push' })
    // 自作種目はそのまま
    const mine = await db.exercises.get('my-ex')
    expect(mine).toMatchObject({ name: '自作', custom: true })
    expect(mine).not.toHaveProperty('pattern')
    expect(await db.workouts.get('w1')).toMatchObject({ date: '2026-10-01' })
    expect(await db.settings.get('app')).toMatchObject({ weightStep: 5 })
    expect(await db.exercises.count()).toBe(oldSeeds.length + 1)
    // 新しい表がある
    expect(db.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['profile', 'chatMessages']))
  })
})
