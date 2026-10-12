import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { createRoutine, deleteRoutine, getRoutine, listRoutines, updateRoutine } from './routines'

beforeEach(resetDb)

const chest = [{ exerciseId: 'ex-bench-press', restSec: 120, sets: [{ weight: 60, reps: 8 }] }]

describe('routines', () => {
  it('作成・取得・更新できる', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: chest })
    await updateRoutine(r.id, { name: '胸の日A', exercises: chest })
    expect(await getRoutine(r.id)).toMatchObject({ name: '胸の日A', exercises: chest })
  })

  it('削除したものは一覧に出ない', async () => {
    const a = await createRoutine({ name: 'A', exercises: [] })
    await createRoutine({ name: 'B', exercises: [] })
    await deleteRoutine(a.id)
    expect((await listRoutines()).map((r) => r.name)).toEqual(['B'])
    expect(await getRoutine(a.id)).toBeUndefined()
  })
})
