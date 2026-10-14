import { describe, expect, it } from 'vitest'
import { seedExercises } from '../db/seedExercises'
import type { MovementPattern, Profile } from '../db/types'
import { buildSkeleton } from './skeleton'
import type { Proposal, Skeleton } from './types'
import { checkProposalIssues, validateProposal } from './validate'

const catalog = seedExercises()
const profile = (p: Partial<Profile> = {}): Profile => ({
  id: 'me', goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60,
  weekdays: [1, 2, 4, 5], equipment: ['gym_free', 'gym_machine'], injuries: '', baselines: [], updatedAt: 0, ...p,
})

const PICK: Partial<Record<MovementPattern, string>> = {
  horizontal_push: 'ex-bench-press', horizontal_pull: 'ex-seated-cable-row', vertical_push: 'ex-dumbbell-shoulder-press',
  vertical_pull: 'ex-lat-pulldown', chest_isolation: 'ex-pec-deck', side_delt: 'ex-side-raise', biceps: 'ex-dumbbell-curl', triceps: 'ex-triceps-pushdown',
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

  it('候補にない種目ID（IDは見せずに「◯日の◯つ目の種目」で示す）', () => {
    const p = valid()
    p.days[0].exercises[6].exerciseId = 'ex-nope' // 二頭の枠（抜けても週のセット数は足りる）
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('候補にない')
    expect(issues[0]).toContain('10月12日(月)の7つ目の種目')
    expect(issues[0]).not.toContain('ex-nope')
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
    p.days[0].exercises[5].exerciseId = 'ex-rear-raise' // 横肩の枠に後ろ肩
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('合いません')
    expect(issues[0]).toContain('リアレイズ')
    expect(issues[0]).toContain('横肩')
    expect(issues[0]).not.toContain('upper.6')
  })

  it('骨組みにない枠', () => {
    const p = valid()
    p.days[0].exercises[0].slot = 'push.9'
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('骨組みにありません')
    expect(issues[0]).toContain('ベンチプレス')
    expect(issues[0]).not.toContain('push.9')
  })

  it('セット数は1〜10', () => {
    for (const sets of [0, 11]) {
      const p = valid()
      p.days[0].exercises[6].sets = sets
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
    expect(issues.filter((i) => i.includes('対象の週'))).toHaveLength(1)
  })

  it('行けない曜日', () => {
    const p = valid()
    p.days[3].date = '2026-10-17' // 土曜
    const issues = check(p)
    expect(issues.filter((i) => i.includes('行ける曜日'))).toHaveLength(1)
  })

  it('同じ部位の日の間が48時間未満', () => {
    const p = valid()
    p.days[3].date = '2026-10-14' // 下半身を火・水に連続させる
    const issues = check(p, skeleton, profile({ weekdays: [1, 2, 3, 4, 5] }))
    expect(issues.filter((i) => i.includes('48時間'))).toHaveLength(1)
  })

  it('1日の合計時間が1回の時間を超える', () => {
    const p = valid()
    p.days[0].exercises.push({ ...p.days[0].exercises[7] }) // 上半身の日に三頭をもう1種目
    p.days[0].exercises[8].sets = 4
    const total = p.days[0].exercises.reduce((a, x) => a + x.sets, 0)
    expect(total * 3).toBeGreaterThan(60)
    const issues = check(p)
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('分')
  })

  it('部位ごとの週のセット数が上限の1.5倍を超える', () => {
    const p = valid()
    p.days[0].exercises[5].sets = 10 // 横肩
    p.days[2].exercises[5].sets = 10
    // 目標 10〜14 → 21 を超えると多すぎ（横肩 10＋10＋上に押す枠の補助）
    const issues = check(p, { ...skeleton, weeklySetTarget: [10, 14] }, profile({ minutesPerSession: 300 }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('横肩')
    expect(issues[0]).toContain('多すぎ')
  })

  it('ふくらはぎ・腹は小さい目標（半分）で数える', () => {
    const p = valid()
    for (const i of [1, 3]) p.days[i].exercises.find((x) => x.slot === 'lower.5')!.sets = 7
    // 1〜3年の小さい目標 5〜8 → 12 を超えると多すぎ（ふつうの目標なら 24 まで）
    const issues = check(p, skeleton, profile({ minutesPerSession: 300 }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toContain('ふくらはぎ')
    expect(issues[0]).toContain('目標5〜8')
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

  it('同じ日付が2回ある', () => {
    const p = valid()
    p.days.push({ ...p.days[3], exercises: [p.days[3].exercises[4]] }) // 金曜をもう1つ（ふくらはぎだけ）
    const issues = check(p, skeleton, profile({ minutesPerSession: 300 }))
    expect(issues.filter((i) => i.includes('2回'))).toHaveLength(1)
    expect(issues.join()).toContain('10月16日(金)')
  })

  it('骨組みにない日付（行ける曜日でも）', () => {
    const p = valid()
    const pr = profile({ weekdays: [1, 2, 3, 4, 5] })
    p.days.push({ date: '2026-10-14', title: '追加', exercises: [p.days[0].exercises[6]] })
    const issues = check(p, skeleton, pr)
    expect(issues.filter((i) => i.includes('骨組みの日ではありません'))).toHaveLength(1)
  })

  it('骨組みの日が抜けている', () => {
    const p = valid()
    p.days = p.days.filter((d) => d.date !== '2026-10-16')
    const issues = check(p)
    expect(issues.filter((i) => i.includes('10月16日(金)') && i.includes('抜けて'))).toHaveLength(1)
  })

  it('今週もう終えた日も、48時間と週のセット数に数える', () => {
    const p = valid()
    // 日曜(10/11)ではなく、同じ週の木曜の上半身の前日(水)に胸を終えたことにする
    const s = { ...skeleton, done: [{ date: '2026-10-14', muscles: ['chest' as const] }], doneMuscleSets: { chest: 30 } }
    const issues = check(p, s)
    expect(issues.some((i) => i.includes('10月14日(水)') && i.includes('48時間'))).toBe(true)
    expect(issues.some((i) => i.includes('胸') && i.includes('多すぎ'))).toBe(true)
  })

  it('軽めの週は下限のチェックをしない', () => {
    const deload = buildSkeleton({ profile: profile(), weekStart: '2026-10-12', weeksSinceDeload: 6 })
    expect(deload.deload).toBe(true)
    expect(check(proposalFor(deload), deload)).toEqual([])
  })
})

describe('checkProposalIssues：作り直しを頼むほどの問題（serious）かどうか', () => {
  const issuesOf = (p: Proposal, earliest?: string) => checkProposalIssues(p, skeleton, catalog, profile(), earliest)

  it('候補にない種目・日付の間違い・セット数と回数の範囲外は serious', () => {
    const p = valid()
    p.days[0].exercises[6].exerciseId = 'ex-nope'
    p.days[1].exercises[0].sets = 12
    p.days[1].exercises[1].reps = 40
    p.days[2].date = '2026-10-20' // 対象週の外（10月15日の日も抜ける）
    const issues = issuesOf(p)
    expect(issues.length).toBeGreaterThanOrEqual(5)
    for (const i of issues.filter((x) => /候補にない|セット数（12）|回数（40）|対象の週|抜けています/.test(x.text))) {
      expect(i.serious, i.text).toBe(true)
    }
    expect(issues.filter((x) => x.serious).length).toBeGreaterThanOrEqual(5)
  })

  it('同じ日付が2回・骨組みの日でない・過ぎた日も serious', () => {
    const p = valid()
    p.days[1].date = p.days[0].date
    expect(issuesOf(p).find((x) => x.text.includes('2回入って'))?.serious).toBe(true)
    const past = issuesOf(valid(), '2026-10-14')
    expect(past.filter((x) => x.text.includes('過ぎた日')).every((x) => x.serious)).toBe(true)
    expect(past.some((x) => x.text.includes('過ぎた日'))).toBe(true)
  })

  it('1日の時間・週のセット数の外れは軽い問題（作り直しは頼まない）', () => {
    const p = valid()
    p.days[0].exercises[0].sets = 10
    p.days[0].exercises[1].sets = 10
    const issues = issuesOf(p)
    expect(issues.some((x) => x.text.includes('1回の時間'))).toBe(true)
    expect(issues.every((x) => !x.serious)).toBe(true)
  })
})

describe('枠に合わない種目は serious', () => {
  it('胸の枠に脚の種目・骨組みにない枠は作り直しを頼む。48時間の問題は軽いまま', () => {
    const p = valid()
    p.days[0].exercises[0].exerciseId = 'ex-squat' // 水平に押す枠にスクワット
    p.days[0].exercises[1].slot = 'nope.1'
    const issues = checkProposalIssues(p, skeleton, catalog, profile())
    expect(issues.find((x) => x.text.includes('枠の動き'))?.serious).toBe(true)
    expect(issues.find((x) => x.text.includes('骨組みにありません'))?.serious).toBe(true)
    for (const x of issues.filter((i) => i.text.includes('48時間'))) expect(x.serious).toBe(false)
  })
})
