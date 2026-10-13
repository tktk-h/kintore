import { describe, expect, it } from 'vitest'
import { seedExercises } from './seedExercises'
import type { Equipment, Exercise, MovementPattern } from './types'

const all = seedExercises()
const byId = (id: string): Exercise => {
  const e = all.find((x) => x.id === id)
  if (!e) throw new Error(`no ${id}`)
  return e
}

describe('seedExercises', () => {
  it('定番種目すべてに動きの種類・部位・複数関節の情報がある', () => {
    for (const e of all) {
      expect(e.pattern, e.id).toBeTypeOf('string')
      expect(e.primary?.length ?? 0, e.id).toBeGreaterThanOrEqual(1)
      expect(Array.isArray(e.secondary), e.id).toBe(true)
      expect(e.compound, e.id).toBeTypeOf('boolean')
    }
  })

  it('主な種目の分類', () => {
    const bench = byId('ex-bench-press')
    expect(bench).toMatchObject({ pattern: 'horizontal_push', primary: ['chest'], compound: true })
    expect(bench.secondary).toEqual(expect.arrayContaining(['triceps', 'front_delt']))

    expect(byId('ex-squat')).toMatchObject({ pattern: 'squat', primary: ['quads', 'glutes'] })

    const rdl = byId('ex-romanian-deadlift')
    expect(rdl.pattern).toBe('hinge')
    expect(rdl.primary).toContain('hamstrings')

    expect(byId('ex-side-raise')).toMatchObject({ pattern: 'side_delt', compound: false })

    const pulldown = byId('ex-lat-pulldown')
    expect(pulldown).toMatchObject({ pattern: 'vertical_pull', primary: ['back'] })
    expect(pulldown.secondary).toContain('biceps')

    expect(byId('ex-plank').pattern).toBe('core')
    expect(byId('ex-running').pattern).toBe('cardio')
  })

  it('日ごとの枠すべてに、ジムのフリーウェイト＋マシンで選べる種目がある', () => {
    // 設計書「メニューの決め方 2. 日ごとの枠」の枠（「AかB」の枠はどちらかの動きでよい）
    const slots: MovementPattern[][] = [
      // 全身
      ['squat'], ['horizontal_push'], ['horizontal_pull'], ['hinge'], ['vertical_push', 'vertical_pull'], ['biceps', 'triceps', 'core'],
      // 上半身
      ['horizontal_push'], ['horizontal_pull'], ['vertical_push'], ['vertical_pull'], ['chest_isolation'], ['side_delt'], ['biceps'], ['triceps'],
      // 下半身・脚
      ['squat'], ['hinge'], ['single_leg', 'quad_isolation'], ['hamstring'], ['calf'], ['core'],
      // プッシュ
      ['horizontal_push'], ['vertical_push'], ['chest_isolation'], ['side_delt'], ['triceps'],
      // プル
      ['vertical_pull'], ['horizontal_pull'], ['rear_delt'], ['biceps'], ['biceps'],
    ]
    // ジムのフリーウェイト＋マシン：バーベル・ダンベル・自重・マシン・ケーブル・その他
    const gym: Equipment[] = ['barbell', 'dumbbell', 'bodyweight', 'machine', 'cable', 'other']
    for (const patterns of slots) {
      const candidates = all.filter((e) => e.pattern && patterns.includes(e.pattern) && gym.includes(e.equipment))
      expect(candidates.length, patterns.join('|')).toBeGreaterThanOrEqual(1)
    }
  })
})
