import { describe, expect, it } from 'vitest'
import { bestValue, formatSeconds, formatSet, formatSets, isPersonalRecord, totalVolume } from './workoutStats'

describe('totalVolume', () => {
  it('完了したセットの 重量×回数 を合計する', () => {
    expect(
      totalVolume([
        { logType: 'weight_reps', sets: [{ weight: 60, reps: 8, done: true }, { weight: 60, reps: 8, done: false }] },
        { logType: 'reps', sets: [{ reps: 10, done: true }] },
      ]),
    ).toBe(480)
  })
})

describe('bestValue', () => {
  it('重量×回数は1回以上挙げた最大重量', () => {
    expect(bestValue('weight_reps', [{ weight: 60, reps: 8 }, { weight: 70, reps: 0 }, { weight: 65, reps: 3 }])).toBe(65)
  })
  it('回数のみは最大回数', () => {
    expect(bestValue('reps', [{ reps: 8 }, { reps: 12 }])).toBe(12)
  })
  it('時間・距離は距離があれば最大距離、なければ最大時間', () => {
    expect(bestValue('time_distance', [{ durationSec: 1800, distanceKm: 5 }, { distanceKm: 6 }])).toBe(6)
    expect(bestValue('time_distance', [{ durationSec: 45 }, { durationSec: 60 }])).toBe(60)
  })
  it('セットがなければ undefined', () => {
    expect(bestValue('weight_reps', [])).toBeUndefined()
  })
})

describe('isPersonalRecord', () => {
  it('過去の最高を超えたら true', () => {
    expect(isPersonalRecord('weight_reps', [{ weight: 62.5, reps: 5 }], [{ weight: 60, reps: 8 }])).toBe(true)
  })
  it('同じなら false', () => {
    expect(isPersonalRecord('weight_reps', [{ weight: 60, reps: 5 }], [{ weight: 60, reps: 8 }])).toBe(false)
  })
  it('過去の記録がなければ false（初回は自己ベスト扱いしない）', () => {
    expect(isPersonalRecord('weight_reps', [{ weight: 60, reps: 8 }], [])).toBe(false)
  })
})

describe('format', () => {
  it('formatSeconds は m:ss', () => {
    expect(formatSeconds(90)).toBe('1:30')
    expect(formatSeconds(5)).toBe('0:05')
  })
  it('formatSet は記録形式ごとに表示する', () => {
    expect(formatSet('weight_reps', { weight: 60, reps: 8 })).toBe('60kg × 8')
    expect(formatSet('reps', { reps: 10 })).toBe('10回')
    expect(formatSet('reps', { reps: 8, weight: 10 })).toBe('8回 (+10kg)')
    expect(formatSet('reps', { reps: 8, weight: -20 })).toBe('8回 (補助20kg)')
    expect(formatSet('time_distance', { durationSec: 1800, distanceKm: 5 })).toBe('5km 30:00')
  })
  it('formatSets は同じ重量ならまとめる', () => {
    expect(formatSets('weight_reps', [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 7 }])).toBe('60kg × 8, 8, 7')
    expect(formatSets('weight_reps', [{ weight: 60, reps: 8 }, { weight: 65, reps: 5 }])).toBe('60kg × 8, 65kg × 5')
  })
})
