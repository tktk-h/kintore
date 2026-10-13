import { describe, expect, it } from 'vitest'
import { seedExercises } from '../db/seedExercises'
import type { MovementPattern, Profile } from '../db/types'
import { buildSkeleton } from './skeleton'
import type { Proposal, Skeleton } from './types'
import { validateProposal } from './validate'

const catalog = seedExercises()
const profile = (p: Partial<Profile> = {}): Profile => ({
  id: 'me', goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60,
  weekdays: [1, 2, 4, 5], equipment: ['gym_free', 'gym_machine'], injuries: '', baselines: [], updatedAt: 0, ...p,
})

const PICK: Partial<Record<MovementPattern, string>> = {
  horizontal_push: 'ex-bench-press', horizontal_pull: 'ex-seated-cable-row', vertical_push: 'ex-dumbbell-shoulder-press',
  vertical_pull: 'ex-lat-pulldown', side_delt: 'ex-side-raise', biceps: 'ex-dumbbell-curl', triceps: 'ex-triceps-pushdown',
  squat: 'ex-squat', hinge: 'ex-romanian-deadlift', single_leg: 'ex-bulgarian-split-squat', hamstring: 'ex-leg-curl',
  calf: 'ex-calf-raise', core: 'ex-crunch',
}

/** 骨組みどおりに種目を入れた正しい案 */
function proposalFor(s: Skeleton): Proposal {
  return {
    split: s.split,
    reasons: '',
    issues: [],
    muscleSets: {},
    days: s.days.map((d) => ({
      date: d.date,
      title: d.title,
      exercises: d.slots.map((x) => ({
        slot: x.slot, exerciseId: PICK[x.patterns[0]]!, sets: x.sets, reps: x.repRange[0], repRange: x.repRange, restSec: x.restSec,
      })),
    })),
  }
}

const skeleton = buildSkeleton({ profile: profile(), weekStart: '2026-10-12', weeksSinceDeload: 1 })
const valid = () => proposalFor(skeleton)
const check = (p: Proposal, s: Skeleton = skeleton, pr: Profile = profile()) => validateProposal(p, s, catalog, pr)

describe('validateProposal（設計書「メニュー案のチェック」）', () => {
  it('骨組みどおりの正しい案は問題なし', () => {
    expect(skeleton.days.map((d) => d.date)).toEqual(['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-16'])
    expect(check(valid())).toEqual([])
  })

  it('候補にない種目ID', () => {
    const p = valid()
    p.days[0].exercises[5].exerciseId = 'ex-nope' // 二頭の枠（抜けても週のセット数は足りる）
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('候補にない')
  })

  it('削除された種目も候補にない', () => {
    const p = valid()
    const cat = catalog.map((e) => (e.id === 'ex-side-raise' ? { ...e, deleted: true } : e))
    const issues = validateProposal(p, skeleton, cat, profile())
    expect(issues.length).toBeGreaterThanOrEqual(1)
    expect(issues.every((i) => i.includes('候補にない'))).toBe(true)
  })

  it('枠の動きに合わない種目', () => {
    const p = valid()
    p.days[0].exercises[0].exerciseId = 'ex-chest-press' // 水平に押す（合う）
    p.days[0].exercises[4].exerciseId = 'ex-rear-raise' // 横肩の枠に後ろ肩
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('合いません')
    expect(issues[0]).toContain('リアレイズ')
  })

  it('骨組みにない枠', () => {
    const p = valid()
    p.days[0].exercises[0].slot = 'push.9'
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('push.9')
  })

  it('セット数は1〜10', () => {
    for (const sets of [0, 11]) {
      const p = valid()
      p.days[0].exercises[5].sets = sets
      const issues = check(p, skeleton, profile({ minutesPerSession: 300 }))
      expect(issues, String(sets)).toHaveLength(1)
      expect(issues[0]).toContain('セット')
    }
  })

  it('回数は1〜30', () => {
    for (const reps of [0, 31]) {
      const p = valid()
      p.days[0].exercises[0].reps = reps
      const issues = check(p)
      expect(issues, String(reps)).toHaveLength(1)
      expect(issues[0]).toContain('回数')
    }
  })

  it('休憩は0〜300秒', () => {
    const p = valid()
    p.days[0].exercises[0].restSec = 301
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('休憩')
  })

  it('対象週の外の日付', () => {
    const p = valid()
    p.days[3].date = '2026-10-19' // 次の週の月曜
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('対象の週')
  })

  it('行けない曜日', () => {
    const p = valid()
    p.days[3].date = '2026-10-17' // 土曜
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('行ける曜日')
  })

  it('同じ部位の日の間が48時間未満', () => {
    const p = valid()
    p.days[3].date = '2026-10-14' // 下半身を火・水に連続させる
    const issues = check(p, skeleton, profile({ weekdays: [1, 2, 3, 4, 5] }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('48時間')
  })

  it('1日の合計時間が1回の時間を超える', () => {
    const p = valid()
    p.days[0].exercises.push({ ...p.days[0].exercises[6] }) // 上半身の日に三頭をもう1種目
    p.days[0].exercises[7].sets = 4
    const total = p.days[0].exercises.reduce((a, x) => a + x.sets, 0)
    expect(total * 3).toBeGreaterThan(60)
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('分')
  })

  it('部位ごとの週のセット数が上限の1.5倍を超える', () => {
    const p = valid()
    p.days[0].exercises[4].sets = 10 // 横肩
    p.days[2].exercises[4].sets = 10
    // 目標 10〜14 → 21 を超えると多すぎ（横肩 10＋10＋上に押す枠の補助）
    const issues = check(p, { ...skeleton, weeklySetTarget: [10, 14] }, profile({ minutesPerSession: 300 }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('横肩')
    expect(issues[0]).toContain('多すぎ')
  })

  it('部位ごとの週のセット数が下限の半分未満', () => {
    const p = valid()
    for (const i of [0, 2]) p.days[i].exercises = p.days[i].exercises.filter((x) => x.slot !== 'upper.1') // 胸の枠を抜く
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('胸')
    expect(issues[0]).toContain('少な')
  })

  it('有酸素の種目は部位のセット数に数えない', () => {
    const p = valid()
    p.days[1].exercises.push({ slot: 'lower.6', exerciseId: 'ex-running', sets: 1, reps: 1, repRange: [1, 1], restSec: 0 })
    const issues = check(p, skeleton, profile({ minutesPerSession: 300 }))
    expect(issues.some((i) => i.includes('多すぎ') || i.includes('少な'))).toBe(false)
  })

  it('軽めの週は下限のチェックをしない', () => {
    const deload = buildSkeleton({ profile: profile(), weekStart: '2026-10-12', weeksSinceDeload: 6 })
    expect(deload.deload).toBe(true)
    expect(check(proposalFor(deload), deload)).toEqual([])
  })
})
