import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { createExercise, filterExercises, getExercise, listExercises, updateExercise } from './exercises'

beforeEach(resetDb)

describe('exercises', () => {
  it('部位の順に並べる', async () => {
    const list = await listExercises()
    expect(list[0].bodyPart).toBe('chest')
    expect(list[list.length - 1].bodyPart).toBe('cardio')
  })

  it('自分で種目を追加・編集できる', async () => {
    const e = await createExercise({ name: 'スミスマシンスクワット', bodyPart: 'legs', equipment: 'machine', logType: 'weight_reps', defaultRestSec: 120 })
    expect(e.custom).toBe(true)
    await updateExercise(e.id, { name: 'スミススクワット', bodyPart: 'legs', equipment: 'machine', logType: 'weight_reps', defaultRestSec: 90 })
    expect(await getExercise(e.id)).toMatchObject({ name: 'スミススクワット', defaultRestSec: 90 })
  })

  it('ひらがなでもカタカナの種目名を検索できる', async () => {
    const list = await listExercises()
    expect(filterExercises(list, 'べんち').map((e) => e.name)).toContain('ベンチプレス')
  })

  it('部位で絞り込める', async () => {
    const list = await listExercises()
    const legs = filterExercises(list, '', 'legs')
    expect(legs.length).toBeGreaterThan(0)
    expect(legs.every((e) => e.bodyPart === 'legs')).toBe(true)
  })
})
