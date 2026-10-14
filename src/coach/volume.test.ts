import { describe, expect, it } from 'vitest'
import { seedExercises } from '../db/seedExercises'
import type { SlotPlan } from './types'
import { countMuscleSets, fitToTime, muscleSetTarget, repScheme, slotMaxSets, startSets, weeklySetTarget } from './volume'

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

describe('muscleSetTarget / slotMaxSets / startSets', () => {
  it('ふくらはぎ・腹は週のセット数の目標を半分（切り上げ）にする', () => {
    expect(muscleSetTarget([8, 12], 'calves')).toEqual([4, 6])
    expect(muscleSetTarget([10, 16], 'abs')).toEqual([5, 8])
    expect(muscleSetTarget([12, 20], 'calves')).toEqual([6, 10])
    expect(muscleSetTarget([8, 12], 'chest')).toEqual([8, 12])
    expect(muscleSetTarget([8, 12], 'side_delt')).toEqual([8, 12])
  })

  it('ふくらはぎ・腹の枠は3セットまで、ほかは4セットまで。はじめは複数関節3・単関節2', () => {
    expect(slotMaxSets({ patterns: ['calf'] })).toBe(3)
    expect(slotMaxSets({ patterns: ['core'] })).toBe(3)
    expect(slotMaxSets({ patterns: ['side_delt'] })).toBe(4)
    expect(slotMaxSets({ patterns: ['squat'] })).toBe(4)
    expect(startSets({ compound: true })).toBe(3)
    expect(startSets({ compound: false })).toBe(2)
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

  it('単関節・ふくらはぎ・腹のセット数を先に減らし、それでも足りなければ枠を削る', () => {
    const iso = (n: number, sets: number, pattern: SlotPlan['patterns'][number]): SlotPlan =>
      ({ ...slot(n, sets), patterns: [pattern], compound: false, repRange: [10, 15] })
    // 3+3+4+3+3 = 16 > 15（45分）→ まず腹の枠を3→2
    const fitted = fitToTime([slot(1, 3), slot(2, 3), iso(3, 4, 'side_delt'), iso(4, 3, 'core'), iso(5, 3, 'biceps')], 45)
    expect(fitted.map((s) => s.sets)).toEqual([3, 3, 4, 2, 3])
  })

  it('初心者は、枠を削る前に複数関節を2セットまで減らす（経験者は3セットのまま枠を削る）', () => {
    const slots = [1, 2, 3, 4].map((n) => slot(n, 3)) // 12セット
    expect(fitToTime(slots, 30, { beginner: true }).map((s) => s.sets)).toEqual([3, 3, 2, 2])
    expect(fitToTime(slots, 30).map((s) => s.sets)).toEqual([3, 3, 3])
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
