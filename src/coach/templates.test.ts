import { describe, expect, it } from 'vitest'
import type { DayType } from './types'
import { DAY_TITLES, daySlots, dayTypeMuscles } from './templates'

const patterns = (dayType: DayType, variant = 0) => daySlots(dayType, variant).map((s) => s.patterns)
const overlaps = (a: DayType, b: DayType) => dayTypeMuscles(a).some((m) => dayTypeMuscles(b).includes(m))

describe('daySlots（設計書「2. 日ごとの枠」）', () => {
  it('全身：日替わりの枠は1日おきに入れ替わる', () => {
    expect(patterns('full', 0)).toEqual([
      ['squat'], ['horizontal_push'], ['horizontal_pull'], ['hinge'], ['vertical_push'], ['biceps', 'triceps'],
    ])
    expect(patterns('full', 1)).toEqual([
      ['squat'], ['horizontal_push'], ['horizontal_pull'], ['hinge'], ['vertical_pull'], ['core'],
    ])
    expect(patterns('full', 2)).toEqual(patterns('full', 0))
  })

  it('上半身', () => {
    expect(patterns('upper')).toEqual([
      ['horizontal_push'], ['horizontal_pull'], ['vertical_push'], ['vertical_pull'], ['side_delt'], ['biceps'], ['triceps'],
    ])
  })

  it('下半身と脚は同じ並び', () => {
    const expected = [['squat'], ['hinge'], ['single_leg', 'quad_isolation'], ['hamstring'], ['calf'], ['core']]
    expect(patterns('lower')).toEqual(expected)
    expect(patterns('legs')).toEqual(expected)
  })

  it('プッシュ・プル', () => {
    expect(patterns('push')).toEqual([['horizontal_push'], ['vertical_push'], ['chest_isolation'], ['side_delt'], ['triceps']])
    expect(patterns('pull')).toEqual([['vertical_pull'], ['horizontal_pull'], ['rear_delt'], ['biceps'], ['biceps']])
  })

  it('枠のIDは「日の種類.番号」で、複数関節の枠が先に来る', () => {
    const slots = daySlots('upper', 0)
    expect(slots.map((s) => s.slot)).toEqual(['upper.1', 'upper.2', 'upper.3', 'upper.4', 'upper.5', 'upper.6', 'upper.7'])
    expect(slots.map((s) => s.compound)).toEqual([true, true, true, true, false, false, false])
    expect(daySlots('legs', 0)[0].slot).toBe('legs.1')
  })

  it('日のタイトル', () => {
    expect(DAY_TITLES.upper).toBe('上半身')
    expect(DAY_TITLES.full).toBe('全身')
    expect(DAY_TITLES.legs).toBe('脚')
  })
})

describe('dayTypeMuscles', () => {
  it('連続してよい組み合わせは部位が重ならない', () => {
    expect(overlaps('upper', 'lower')).toBe(false)
    expect(overlaps('push', 'pull')).toBe(false)
    expect(overlaps('pull', 'legs')).toBe(false)
    expect(overlaps('legs', 'push')).toBe(false)
  })

  it('同じ部位を含む組み合わせは重なる', () => {
    expect(overlaps('upper', 'pull')).toBe(true)
    expect(overlaps('upper', 'push')).toBe(true)
    expect(overlaps('lower', 'legs')).toBe(true)
    expect(overlaps('full', 'full')).toBe(true)
    expect(overlaps('full', 'push')).toBe(true)
  })
})
