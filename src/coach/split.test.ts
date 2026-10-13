import { describe, expect, it } from 'vitest'
import { daysBetween } from '../lib/dates'
import { chooseSplit, dayTypeSequence, effectiveDays, scheduleDays } from './split'

const MON = '2026-10-12'
// 曜日は 0=日〜6=土
const [SU, MO, TU, WE, TH, FR, SA] = [0, 1, 2, 3, 4, 5, 6]

describe('chooseSplit（設計書「1. 分割法」）', () => {
  it('週の日数で分割法を選ぶ', () => {
    expect(chooseSplit(1, 'y1_3')).toBe('full_body')
    expect(chooseSplit(2, 'y1_3')).toBe('full_body')
    expect(chooseSplit(3, 'y1_3')).toBe('full_body')
    expect(chooseSplit(4, 'y1_3')).toBe('upper_lower')
    expect(chooseSplit(5, 'y1_3')).toBe('ul_ppl')
    expect(chooseSplit(6, 'y1_3')).toBe('ppl')
    expect(chooseSplit(7, 'over_3y')).toBe('ppl')
  })

  it('3日で経験1年以上ならPPLの希望を聞く', () => {
    expect(chooseSplit(3, 'y1_3', 'ppl')).toBe('ppl')
    expect(chooseSplit(3, 'under_1y', 'ppl')).toBe('full_body')
  })

  it('初心者は日数が多くても上半身・下半身（4日）に抑える', () => {
    expect(chooseSplit(6, 'none')).toBe('upper_lower')
    expect(chooseSplit(5, 'under_1y')).toBe('upper_lower')
  })

  it('組めない希望は使わない', () => {
    expect(chooseSplit(2, 'over_3y', 'ul_ppl')).toBe('full_body')
    expect(chooseSplit(2, 'over_3y', 'upper_lower')).toBe('upper_lower')
    expect(chooseSplit(4, 'y1_3', 'full_body')).toBe('full_body')
  })
})

describe('effectiveDays', () => {
  it('7日は6日として扱い、初心者は最大4日', () => {
    expect(effectiveDays(7, 'y1_3')).toBe(6)
    expect(effectiveDays(6, 'none')).toBe(4)
    expect(effectiveDays(5, 'under_1y')).toBe(4)
    expect(effectiveDays(3, 'none')).toBe(3)
    expect(effectiveDays(0, 'none')).toBe(1)
  })
})

describe('dayTypeSequence', () => {
  it('分割法ごとの日の種類の並び', () => {
    expect(dayTypeSequence('full_body', 3)).toEqual(['full', 'full', 'full'])
    expect(dayTypeSequence('upper_lower', 4)).toEqual(['upper', 'lower', 'upper', 'lower'])
    expect(dayTypeSequence('ppl', 6)).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs'])
    expect(dayTypeSequence('ul_ppl', 5)).toEqual(['upper', 'lower', 'push', 'pull', 'legs'])
  })
})

describe('scheduleDays', () => {
  it('全身×3・月〜金 → 月・水・金', () => {
    const r = scheduleDays('full_body', [MO, TU, WE, TH, FR], MON, 3)
    expect(r.days).toEqual([
      { date: '2026-10-12', dayType: 'full' },
      { date: '2026-10-14', dayType: 'full' },
      { date: '2026-10-16', dayType: 'full' },
    ])
    expect(r.notes).toEqual([])
  })

  it('上下×2・月火木金 → 上・下・上・下', () => {
    const r = scheduleDays('upper_lower', [FR, MO, TH, TU], MON, 4)
    expect(r.days).toEqual([
      { date: '2026-10-12', dayType: 'upper' },
      { date: '2026-10-13', dayType: 'lower' },
      { date: '2026-10-15', dayType: 'upper' },
      { date: '2026-10-16', dayType: 'lower' },
    ])
    expect(r.notes).toEqual([])
  })

  it('PPL×2・月〜土 → 押・引・脚・押・引・脚', () => {
    const r = scheduleDays('ppl', [MO, TU, WE, TH, FR, SA], MON, 6)
    expect(r.days.map((d) => d.dayType)).toEqual(['push', 'pull', 'legs', 'push', 'pull', 'legs'])
    expect(r.days.map((d) => d.date)).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17',
    ])
  })

  it('日曜は週の最後の日', () => {
    const r = scheduleDays('full_body', [SU, MO], MON, 2)
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-18'])
  })

  it('48時間あけられないときは日数を減らして理由を返す（全身×3・月火水 → 2日）', () => {
    const r = scheduleDays('full_body', [MO, TU, WE], MON, 3)
    expect(r.days).toEqual([
      { date: '2026-10-12', dayType: 'full' },
      { date: '2026-10-14', dayType: 'full' },
    ])
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0]).toContain('48時間')
    expect(r.notes[0]).toContain('2日')
  })

  it('行ける曜日が足りないときは日数を減らして理由を返す', () => {
    const r = scheduleDays('upper_lower', [MO, TH], MON, 4)
    expect(r.days).toEqual([
      { date: '2026-10-12', dayType: 'upper' },
      { date: '2026-10-15', dayType: 'lower' },
    ])
    expect(r.notes).toHaveLength(1)
    expect(r.notes[0]).toContain('行ける曜日')
  })

  it('間隔に余裕があれば、なるべく間をあける', () => {
    const r = scheduleDays('full_body', [MO, TU, WE, TH, FR], MON, 2)
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-15'])
  })

  it('間隔が同じなら、連続する日の組が少ない並びを選ぶ（毎日行ける・上下×4 → 月〜木にしない）', () => {
    const r = scheduleDays('upper_lower', [SU, MO, TU, WE, TH, FR, SA], MON, 4)
    const offsets = r.days.map((d) => daysBetween(MON, d.date))
    expect(offsets).not.toEqual([0, 1, 2, 3])
    const gaps = offsets.map((o, i) => (i + 1 < offsets.length ? offsets[i + 1] : offsets[0] + 7) - o)
    expect(gaps.filter((g) => g === 1)).toHaveLength(1)
    expect(r.days.map((d) => d.dayType)).toEqual(['upper', 'lower', 'upper', 'lower'])
  })

  it('from より前の日は選ばない', () => {
    const r = scheduleDays('upper_lower', [MO, TU, TH, FR], MON, 2, { from: '2026-10-15', types: ['upper', 'lower'] })
    expect(r.days).toEqual([
      { date: '2026-10-15', dayType: 'upper' },
      { date: '2026-10-16', dayType: 'lower' },
    ])
  })

  it('もう終えた日（fixed）と同じ部位の日は48時間あける', () => {
    // 水曜に上半身を終えた → 木曜に上半身は入れられない（下半身なら入れられる）
    const r = scheduleDays('upper_lower', [TH, FR, SA], MON, 2, {
      from: '2026-10-15', types: ['upper', 'lower'], fixed: [{ date: '2026-10-14', muscles: ['chest', 'back'] }],
    })
    expect(r.days.find((d) => d.date === '2026-10-15')?.dayType).not.toBe('upper')
    expect(r.days.map((d) => d.dayType)).toEqual(['upper', 'lower'])
    expect(r.days.find((d) => d.dayType === 'upper')!.date >= '2026-10-16').toBe(true)
  })

  it('残りの日数が0なら空で理由を返す', () => {
    const r = scheduleDays('upper_lower', [MO, TU], MON, 0, { types: [] })
    expect(r.days).toEqual([])
    expect(r.notes.join()).toContain('終え')
  })

  it('行ける曜日がなければ空で理由を返す', () => {
    const r = scheduleDays('full_body', [], MON, 3)
    expect(r.days).toEqual([])
    expect(r.notes).toHaveLength(1)
  })
})
