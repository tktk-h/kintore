import { describe, expect, it } from 'vitest'
import type { Profile } from '../db/types'
import { buildSkeleton } from './skeleton'
import type { Skeleton } from './types'
import { estimateMuscleSets, PATTERN_MUSCLES } from './volume'

const MON = '2026-10-12'
const profile = (p: Partial<Profile> = {}): Profile => ({
  id: 'me',
  goal: 'hypertrophy',
  experience: 'y1_3',
  daysPerWeek: 4,
  minutesPerSession: 60,
  weekdays: [1, 2, 4, 5],
  equipment: ['gym_free', 'gym_machine'],
  injuries: '',
  baselines: [],
  updatedAt: 0,
  ...p,
})
const allSlots = (s: Skeleton) => s.days.flatMap((d) => d.slots)
const daySets = (s: Skeleton) => s.days.map((d) => d.slots.reduce((a, x) => a + x.sets, 0))

describe('buildSkeleton', () => {
  it('経験1〜3年・筋肥大・週4日60分 → 上半身・下半身×2', () => {
    const s = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 1 })
    expect(s.split).toBe('upper_lower')
    expect(s.weekStart).toBe(MON)
    expect(s.deload).toBe(false)
    expect(s.weeklySetTarget).toEqual([10, 16])
    expect(s.days.map((d) => [d.date, d.dayType, d.title])).toEqual([
      ['2026-10-12', 'upper', '上半身'],
      ['2026-10-13', 'lower', '下半身'],
      ['2026-10-15', 'upper', '上半身'],
      ['2026-10-16', 'lower', '下半身'],
    ])
    for (const x of allSlots(s)) {
      expect(x.sets, x.slot).toBeGreaterThanOrEqual(2)
      expect(x.sets, x.slot).toBeLessThanOrEqual(4)
    }
    for (const total of daySets(s)) expect(total).toBeLessThanOrEqual(20)
    expect(s.notes).toEqual([])
  })

  it('部位ごとの週のセット数がおおむね目標内（大きな部位は下限の75%以上、すべて上限の1.25倍以下）', () => {
    const s = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 1 })
    const sets = estimateMuscleSets(allSlots(s))
    const [min, max] = s.weeklySetTarget
    for (const m of ['chest', 'back', 'quads', 'hamstrings', 'glutes'] as const) {
      expect(sets[m] ?? 0, m).toBeGreaterThanOrEqual(min * 0.75)
    }
    for (const [m, v] of Object.entries(sets)) expect(v, m).toBeLessThanOrEqual(max * 1.25)
  })

  it('上半身の日に胸の単関節の枠があり、週4日60分で胸が週10セット以上になる', () => {
    const s = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 1 })
    expect(s.days[0].slots.map((x) => x.patterns[0])).toContain('chest_isolation')
    const sets = estimateMuscleSets(allSlots(s))
    expect(sets.chest ?? 0).toBeGreaterThanOrEqual(10)
  })

  it('初心者・全身×3でも目標内', () => {
    const s = buildSkeleton({
      profile: profile({ experience: 'none', daysPerWeek: 3, weekdays: [1, 3, 5] }), weekStart: MON, weeksSinceDeload: 0,
    })
    expect(s.split).toBe('full_body')
    expect(s.days).toHaveLength(3)
    const sets = estimateMuscleSets(allSlots(s))
    for (const m of ['chest', 'back', 'quads', 'hamstrings', 'glutes'] as const) {
      expect(sets[m] ?? 0, m).toBeGreaterThanOrEqual(8)
    }
    for (const [m, v] of Object.entries(sets)) expect(v, m).toBeLessThanOrEqual(15)
  })

  it('回数と休憩は目標と枠で決まる（筋力アップは各日の最初の枠がメイン）', () => {
    const s = buildSkeleton({ profile: profile({ goal: 'strength' }), weekStart: MON, weeksSinceDeload: 1 })
    const upper = s.days[0].slots
    expect(upper[0]).toMatchObject({ slot: 'upper.1', repRange: [3, 6], restSec: 240, compound: true })
    expect(upper[1]).toMatchObject({ slot: 'upper.2', repRange: [6, 10], restSec: 120 })
    expect(upper[4]).toMatchObject({ slot: 'upper.5', repRange: [10, 12], restSec: 75, compound: false })
  })

  it('6週以上デロードしていなければ軽めの週：セット数は約半分（各枠1以上）', () => {
    const normal = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 5 })
    const deload = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 6 })
    expect(normal.deload).toBe(false)
    expect(deload.deload).toBe(true)
    const n = allSlots(normal)
    const d = allSlots(deload)
    expect(d.map((x) => x.slot)).toEqual(n.map((x) => x.slot))
    d.forEach((x, i) => {
      expect(x.sets).toBeGreaterThanOrEqual(1)
      expect(x.sets).toBe(Math.ceil(n[i].sets / 2))
    })
    expect(deload.notes.join()).toContain('軽め')
  })

  it('短い時間なら後ろの枠を削る', () => {
    const s = buildSkeleton({ profile: profile({ minutesPerSession: 30 }), weekStart: MON, weeksSinceDeload: 1 })
    for (const total of daySets(s)) expect(total).toBeLessThanOrEqual(10)
    expect(s.days[0].slots[0].slot).toBe('upper.1')
    expect(s.days[0].slots.length).toBeLessThan(7)
  })

  it('初心者で行ける日が多いときは4日に抑えて理由を返す', () => {
    const s = buildSkeleton({
      profile: profile({ experience: 'none', daysPerWeek: 6, weekdays: [1, 2, 3, 4, 5, 6] }), weekStart: MON, weeksSinceDeload: 0,
    })
    expect(s.split).toBe('upper_lower')
    expect(s.days).toHaveLength(4)
    expect(s.notes.join()).toContain('4日')
  })

  it('全身法で行ける曜日が連続しているときは上半身・下半身にして日数を保つ', () => {
    const s = buildSkeleton({
      profile: profile({ experience: 'none', daysPerWeek: 3, weekdays: [1, 2, 3] }), weekStart: MON, weeksSinceDeload: 0,
    })
    expect(s.split).toBe('upper_lower')
    expect(s.days.map((d) => d.dayType)).toEqual(['upper', 'lower', 'upper'])
    expect(s.notes.join()).toContain('上半身・下半身')
  })

  it('全身法を希望していれば分割法は変えず、日数を減らす', () => {
    const s = buildSkeleton({
      profile: profile({ experience: 'none', daysPerWeek: 3, weekdays: [1, 2, 3], preferredSplit: 'full_body' }),
      weekStart: MON, weeksSinceDeload: 0,
    })
    expect(s.split).toBe('full_body')
    expect(s.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-14'])
    expect(s.notes.join()).toContain('48時間')
  })

  it('希望の分割法が組めないときは理由を返す', () => {
    const s = buildSkeleton({
      profile: profile({ daysPerWeek: 2, weekdays: [1, 4], preferredSplit: 'ppl' }), weekStart: MON, weeksSinceDeload: 0,
    })
    expect(s.split).toBe('full_body')
    expect(s.notes.join()).toContain('希望')
  })

  it('今週の見直し：from 以降だけで組み、終えた日の分の日の種類と週のセット数を差し引く', () => {
    // 月曜に上半身（胸・背中など）を終えた。水曜から組み直す
    const done = [{ date: '2026-10-12', muscles: ['chest' as const, 'back' as const, 'front_delt' as const], muscleSets: { chest: 8, back: 8, front_delt: 4 } }]
    const s = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 1, from: '2026-10-14', done })
    expect(s.days.every((d) => d.date >= '2026-10-14')).toBe(true)
    // 4日のうち1日終えたので残り3日分（下半身・上半身・下半身）。行ける日は木・金の2日
    expect(s.days.map((d) => d.dayType)).toEqual(['lower', 'upper'])
    expect(s.done).toEqual([{ date: '2026-10-12', muscles: ['chest', 'back', 'front_delt'] }])
    expect(s.doneMuscleSets).toEqual({ chest: 8, back: 8, front_delt: 4 })
    // 胸はすでに8セットあるので、残りの上半身の日の胸の枠は増やさない（終えた分と合わせて上限の1.25倍まで）
    const fresh = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 1, from: '2026-10-14' })
    const chestSets = (x: Skeleton) => estimateMuscleSets(allSlots(x)).chest ?? 0
    expect(chestSets(s)).toBeLessThanOrEqual(chestSets(fresh))
    expect(chestSets(s) + 8).toBeLessThanOrEqual(16 * 1.25)
    // 終えた分が多ければ、残りの日の胸の枠を減らす
    const many = buildSkeleton({
      profile: profile(), weekStart: MON, weeksSinceDeload: 1, from: '2026-10-14',
      done: [{ ...done[0], muscleSets: { chest: 16, back: 8, front_delt: 4 } }],
    })
    expect(chestSets(many)).toBeLessThan(chestSets(fresh))
    expect(chestSets(many) + 16).toBeLessThanOrEqual(16 * 1.25)
  })

  it('前の週のその枠の実際のセット数から増減する（楽が続けば上限まで積み上がる）', () => {
    const base = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 1 })
    const get = (sk: Skeleton, slot: string) => allSlots(sk).filter((x) => x.slot === slot)
    expect(get(base, 'lower.4')[0].sets).toBe(2) // 配分だけなら裏ももの単関節は2セット
    const week = (prev: number, delta: -1 | 0 | 1) => buildSkeleton({
      profile: profile(), weekStart: MON, weeksSinceDeload: 1,
      slotBaseSets: { 'lower.4': prev }, slotSetDelta: { 'lower.4': delta },
    })
    // 前の週3セット・楽 → 4セット（配分の2＋1ではない）
    expect(get(week(3, 1), 'lower.4').every((x) => x.sets === 4)).toBe(true)
    // 前の週4セット・楽 → 上限4のまま
    expect(get(week(4, 1), 'lower.4').every((x) => x.sets === 4)).toBe(true)
    // 前の週3セット・そのまま → 3セット
    expect(get(week(3, 0), 'lower.4').every((x) => x.sets === 3)).toBe(true)
    // 前の週2セット・きつい → 下限2のまま
    expect(get(week(2, -1), 'lower.4').every((x) => x.sets === 2)).toBe(true)
  })

  it('疲れのサイン（きつさ5が多い・調子が低い日が続く）があれば、6週たっていなくても軽めの週にして理由を残す', () => {
    const effort = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 2, fatigue: 'effort' })
    expect(effort.deload).toBe(true)
    expect(effort.deloadReason).toContain('きつさ5')
    expect(effort.notes.join()).toContain('きつさ5')
    const condition = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 2, fatigue: 'condition' })
    expect(condition.deload).toBe(true)
    expect(condition.deloadReason).toContain('調子')
    const six = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 6 })
    expect(six.deloadReason).toContain('6週')
    const none = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 2 })
    expect(none.deload).toBe(false)
    expect(none.deloadReason).toBeUndefined()
  })

  it('週の途中の日付を渡しても月曜から始める', () => {
    const s = buildSkeleton({ profile: profile(), weekStart: '2026-10-14', weeksSinceDeload: 1 })
    expect(s.weekStart).toBe(MON)
    expect(s.days[0].date).toBe(MON)
  })

  it('きつさによるセット数の増減（前の週の枠ごと）を2〜4の範囲で反映する', () => {
    const base = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 1 })
    const s = buildSkeleton({
      profile: profile(), weekStart: MON, weeksSinceDeload: 1,
      slotSetDelta: { 'upper.2': -1, 'lower.4': 1 },
    })
    const get = (sk: Skeleton, slot: string) => sk.days[0].slots.concat(sk.days[1].slots).find((x) => x.slot === slot)!
    expect(get(s, 'upper.2').sets).toBe(Math.max(2, get(base, 'upper.2').sets - 1))
    expect(get(s, 'lower.4').sets).toBe(Math.min(4, get(base, 'lower.4').sets + 1))
    for (const x of allSlots(s)) {
      expect(x.sets).toBeGreaterThanOrEqual(2)
      expect(x.sets).toBeLessThanOrEqual(4)
    }
  })

  describe('セット数の配り方（複数関節を優先、ふくらはぎ・腹は少なめ）', () => {
    const beginner = profile({ experience: 'none', goal: 'hypertrophy', daysPerWeek: 4, minutesPerSession: 60, weekdays: [1, 2, 4, 5] })
    const isSmall = (x: { patterns: string[] }) => x.patterns[0] === 'calf' || x.patterns[0] === 'core'
    /** その部位を主に使う枠のセット数（補助は数えない） */
    const direct = (sk: Skeleton, m: 'chest' | 'back') =>
      allSlots(sk).filter((x) => PATTERN_MUSCLES[x.patterns[0]].primary.includes(m)).reduce((a, x) => a + x.sets, 0)

    it('報告された例：初心者・筋肥大・週4日60分 → 上半身の複数関節は3セット、ふくらはぎ・腹は3セット以下、胸・背中は8〜12', () => {
      const s = buildSkeleton({ profile: beginner, weekStart: MON, weeksSinceDeload: 1 })
      expect(s.split).toBe('upper_lower')
      for (const d of s.days.filter((x) => x.dayType === 'upper')) {
        for (const x of d.slots.filter((y) => y.compound)) expect(x.sets, `${d.date} ${x.slot}`).toBe(3)
      }
      for (const x of allSlots(s).filter(isSmall)) expect(x.sets, x.slot).toBeLessThanOrEqual(3)
      const sets = estimateMuscleSets(allSlots(s))
      expect(sets.chest).toBeGreaterThanOrEqual(8)
      expect(sets.chest).toBeLessThanOrEqual(12)
      expect(direct(s, 'back')).toBeGreaterThanOrEqual(8)
      expect(direct(s, 'back')).toBeLessThanOrEqual(12)
      // ヒンジ系の補助（0.5）を足しても上限の1.25倍まで
      expect(sets.back).toBeLessThanOrEqual(12 * 1.25)
      // ふくらはぎ・腹は小さい目標（初心者 4〜6）
      expect(sets.calves).toBeGreaterThanOrEqual(4)
      expect(sets.calves).toBeLessThanOrEqual(6)
      expect(sets.abs).toBeGreaterThanOrEqual(4)
      expect(sets.abs).toBeLessThanOrEqual(6)
      for (const total of daySets(s)) expect(total).toBeLessThanOrEqual(20)
      // 各日、複数関節の枠のセット数は、ふくらはぎ・腹の枠より少なくない
      for (const d of s.days) {
        const minCompound = Math.min(...d.slots.filter((x) => x.compound).map((x) => x.sets))
        for (const x of d.slots.filter(isSmall)) expect(x.sets, x.slot).toBeLessThanOrEqual(minCompound)
      }
    })

    it('複数関節の枠は3セット、単関節の枠は2セットから始める（経験1〜3年・週4日60分）', () => {
      const s = buildSkeleton({ profile: profile(), weekStart: MON, weeksSinceDeload: 1 })
      for (const x of allSlots(s)) {
        if (x.compound) expect(x.sets, x.slot).toBeGreaterThanOrEqual(3)
        else expect(x.sets, x.slot).toBeGreaterThanOrEqual(2)
      }
      for (const x of allSlots(s).filter(isSmall)) expect(x.sets, x.slot).toBeLessThanOrEqual(3)
      const sets = estimateMuscleSets(allSlots(s))
      // 小さい目標（1〜3年 5〜8）
      expect(sets.calves).toBeGreaterThanOrEqual(5)
      expect(sets.calves).toBeLessThanOrEqual(8)
      expect(sets.abs).toBeGreaterThanOrEqual(5)
      expect(sets.abs).toBeLessThanOrEqual(8)
    })

    it('足りない部位にセットを足すときは複数関節の枠を先にする', () => {
      // 3年以上・75分：上半身の日に余裕があり、胸（目標12〜）が足りない
      const s = buildSkeleton({ profile: profile({ experience: 'over_3y', minutesPerSession: 75 }), weekStart: MON, weeksSinceDeload: 1 })
      const upper = s.days[0].slots
      const press = upper.find((x) => x.patterns[0] === 'horizontal_push')!
      const fly = upper.find((x) => x.patterns[0] === 'chest_isolation')!
      expect(press.sets).toBe(4)
      expect(press.sets).toBeGreaterThanOrEqual(fly.sets)
    })

    it('時間が足りないとき、初心者は複数関節を2セットにしてから枠を削る（経験者は枠を削る）', () => {
      const b = buildSkeleton({ profile: { ...beginner, minutesPerSession: 45 }, weekStart: MON, weeksSinceDeload: 1 })
      const e = buildSkeleton({ profile: profile({ minutesPerSession: 45 }), weekStart: MON, weeksSinceDeload: 1 })
      for (const total of [...daySets(b), ...daySets(e)]) expect(total).toBeLessThanOrEqual(15)
      expect(b.days[0].slots.filter((x) => x.compound).every((x) => x.sets === 2)).toBe(true)
      expect(b.days[0].slots.length).toBeGreaterThan(e.days[0].slots.length)
      expect(e.days[0].slots.filter((x) => x.compound).every((x) => x.sets >= 3)).toBe(true)
    })

    it('ふくらはぎ・腹の枠は、きつさで増やしても3セットまで', () => {
      const s = buildSkeleton({
        profile: profile(), weekStart: MON, weeksSinceDeload: 1,
        slotBaseSets: { 'lower.5': 3, 'lower.6': 3 }, slotSetDelta: { 'lower.5': 1, 'lower.6': 1 },
      })
      for (const x of allSlots(s).filter(isSmall)) expect(x.sets, x.slot).toBeLessThanOrEqual(3)
    })
  })
})
