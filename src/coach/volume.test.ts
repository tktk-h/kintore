import { describe, expect, it } from 'vitest'
import { seedExercises } from '../db/seedExercises'
import type { SlotPlan } from './types'
import { countMuscleSets, fitToTime, repScheme, weeklySetTarget } from './volume'

describe('repScheme（設計書「3. 量・回数・休憩」）', () => {
  it('筋肥大', () => {
    expect(repScheme('hypertrophy', 'y1_3', true, true)).toEqual({ repRange: [6, 10], restSec: 150 })
    expect(repScheme('hypertrophy', 'y1_3', false, false)).toEqual({ repRange: [10, 15], restSec: 75 })
  })

  it('筋力アップ', () => {
    expect(repScheme('strength', 'over_3y', true, true)).toEqual({ repRange: [3, 6], restSec: 240 })
    expect(repScheme('strength', 'over_3y', true, false)).toEqual({ repRange: [6, 10], restSec: 120 })
    expect(repScheme('strength', 'over_3y', false, false)).toEqual({ repRange: [10, 12], restSec: 75 })
  })

  it('減量・健康維持', () => {
    expect(repScheme('fat_loss', 'y1_3', true, false)).toEqual({ repRange: [8, 12], restSec: 90 })
    expect(repScheme('fat_loss', 'y1_3', false, false)).toEqual({ repRange: [12, 15], restSec: 60 })
    expect(repScheme('health', 'y1_3', true, true)).toEqual({ repRange: [8, 12], restSec: 90 })
  })

  it('初心者は目標に関係なく複数関節8〜12回・単関節10〜15回', () => {
    expect(repScheme('strength', 'none', true, true).repRange).toEqual([8, 12])
    expect(repScheme('hypertrophy', 'under_1y', true, false).repRange).toEqual([8, 12])
    expect(repScheme('fat_loss', 'none', false, false).repRange).toEqual([10, 15])
  })
})

describe('weeklySetTarget', () => {
  it('経験ごとの部位の週のセット数', () => {
    expect(weeklySetTarget('none')).toEqual([8, 12])
    expect(weeklySetTarget('under_1y')).toEqual([8, 12])
    expect(weeklySetTarget('y1_3')).toEqual([10, 16])
    expect(weeklySetTarget('over_3y')).toEqual([12, 20])
  })
})

const slot = (n: number, sets: number): SlotPlan => ({
  slot: `upper.${n}`, patterns: ['horizontal_push'], sets, repRange: [6, 10], restSec: 120, compound: true,
})

describe('fitToTime', () => {
  it('1セット3分で時間に収まるよう後ろの枠から削る（60分→20セットまで）', () => {
    const slots = [1, 2, 3, 4, 5, 6, 7].map((n) => slot(n, 3)) // 21セット
    const fitted = fitToTime(slots, 60)
    expect(fitted.map((s) => s.slot)).toEqual(['upper.1', 'upper.2', 'upper.3', 'upper.4', 'upper.5', 'upper.6'])
    expect(fitted.reduce((a, s) => a + s.sets, 0)).toBeLessThanOrEqual(20)
    expect(slots).toHaveLength(7) // 元の配列は変えない
  })

  it('収まっていればそのまま', () => {
    const slots = [slot(1, 4), slot(2, 4)]
    expect(fitToTime(slots, 60)).toEqual(slots)
  })

  it('1枠だけでも収まらなければセット数を減らす（最低1）', () => {
    expect(fitToTime([slot(1, 4)], 6)).toEqual([slot(1, 2)])
    expect(fitToTime([slot(1, 4)], 1)).toEqual([slot(1, 1)])
  })
})

describe('countMuscleSets', () => {
  const catalog = seedExercises()

  it('主に使う部位1、補助0.5で数える（ベンチ3セット→胸3・三頭1.5・前肩1.5）', () => {
    expect(countMuscleSets([{ exerciseId: 'ex-bench-press', sets: 3 }], catalog)).toEqual({
      chest: 3, triceps: 1.5, front_delt: 1.5,
    })
  })

  it('種目をまたいで足し、有酸素と知らない種目は数えない', () => {
    const r = countMuscleSets([
      { exerciseId: 'ex-bench-press', sets: 3 },
      { exerciseId: 'ex-triceps-pushdown', sets: 2 },
      { exerciseId: 'ex-running', sets: 1 },
      { exerciseId: 'nope', sets: 5 },
    ], catalog)
    expect(r).toEqual({ chest: 3, triceps: 3.5, front_delt: 1.5 })
  })
})
