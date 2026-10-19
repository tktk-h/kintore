import { describe, expect, it } from 'vitest'
import { seedExercises } from '../db/seedExercises'
import type { MovementPattern, Profile } from '../db/types'
import { recheckProposal, replaceExercise, sameMovementCandidates, swapCandidates, swapExercise, swapPatterns } from './edit'
import { buildSkeleton } from './skeleton'
import type { Proposal, Skeleton } from './types'

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

function proposalFor(s: Skeleton): Proposal {
  return {
    split: s.split, reasons: '', issues: [], muscleSets: {}, skeleton: s,
    days: s.days.map((d) => ({
      date: d.date, title: d.title,
      exercises: d.slots.map((x) => ({
        slot: x.slot, exerciseId: PICK[x.patterns[0]]!, sets: x.sets, reps: x.repRange[0], repRange: x.repRange, restSec: x.restSec,
      })),
    })),
  }
}

const skeleton = buildSkeleton({ profile: profile(), weekStart: '2026-10-12', weeksSinceDeload: 1 })
const load = { sessions: {}, profile: profile(), step: 2.5 }

describe('メニュー案の種目を直す', () => {
  it('置き換えると部位ごとの週のセット数を数え直す', () => {
    const p = proposalFor(skeleton)
    const bench = p.days[0].exercises[0]
    const before = replaceExercise(p, 0, 0, bench, catalog).muscleSets.chest!
    const after = replaceExercise(p, 0, 0, { ...bench, sets: bench.sets + 2 }, catalog)
    expect(after.muscleSets.chest).toBe(before + 2)
    expect(after.days[0].exercises[0].sets).toBe(bench.sets + 2)
    // もとの案は変えない
    expect(p.days[0].exercises[0].sets).toBe(bench.sets)
  })

  it('チェックし直す：値の範囲外は注意点になり、直すと消える', () => {
    const p = proposalFor(skeleton)
    const bench = p.days[0].exercises[0]
    const bad = recheckProposal(replaceExercise(p, 0, 0, { ...bench, restSec: 400 }, catalog), catalog, profile())
    expect(bad.issues.join()).toContain('休憩')
    const ok = recheckProposal(replaceExercise(bad, 0, 0, { ...bench, restSec: 120 }, catalog), catalog, profile())
    expect(ok.issues).toEqual([])
  })

  it('組み始める日より前の日付は注意点になる', () => {
    const p = { ...proposalFor(skeleton), earliest: '2026-10-13' }
    expect(recheckProposal(p, catalog, profile()).issues.join()).toContain('過ぎた日')
  })

  it('骨組みのない古い案は注意点をそのままにする', () => {
    const { skeleton: _s, ...old } = { ...proposalFor(skeleton), issues: ['前の注意点'] }
    expect(recheckProposal(old, catalog, profile()).issues).toEqual(['前の注意点'])
  })
})

describe('種目の入れ替え', () => {
  const p = proposalFor(skeleton)
  const day = p.days[0]
  const bench = day.exercises[0] // upper.1（水平に押す、日の最初の枠）

  it('候補は同じ枠の動きで、使える器具とケガで絞り、今の種目は除く', () => {
    expect(swapPatterns(p, day, bench, catalog)).toEqual(['horizontal_push'])
    const ids = swapCandidates(p, day, bench, catalog, profile()).map((e) => e.id)
    expect(ids).toContain('ex-dumbbell-press')
    expect(ids).toContain('ex-chest-press')
    expect(ids).not.toContain('ex-bench-press')
    expect(ids).not.toContain('ex-pec-deck')
    const home = swapCandidates(p, day, bench, catalog, profile({ equipment: ['home_dumbbell'] })).map((e) => e.id)
    expect(home).toContain('ex-dumbbell-press')
    expect(home).not.toContain('ex-chest-press')
    // 肩を痛めているときは上に押す種目が出ない
    const press = day.exercises.find((x) => x.exerciseId === 'ex-dumbbell-shoulder-press')!
    expect(swapCandidates(p, day, press, catalog, profile({ injuries: '肩が痛い' }))).toEqual([])
  })

  it('骨組みがなければ今の種目の動きで探す', () => {
    const { skeleton: _s, ...old } = p
    expect(swapPatterns(old, day, bench, catalog)).toEqual(['horizontal_push'])
  })

  it('入れ替えると回数・休憩は種目で決め直し、重さは記録→目安の重さで決め直す（セット数はそのまま）', () => {
    const ex = catalog.find((e) => e.id === 'ex-dumbbell-press')!
    const next = swapExercise(p, day, { ...bench, sets: 4 }, ex, profile(), load)
    // 筋肥大・1〜3年・日の最初の枠の複数関節（メイン）：6〜10回・150秒。ダンベルプレスの目安は 10kg
    expect(next).toMatchObject({ exerciseId: 'ex-dumbbell-press', sets: 4, repRange: [6, 10], reps: 6, restSec: 150, weight: 10, slot: bench.slot })
    expect(next.weightReason).toBe('初心者の目安の重さ')

    const fly = catalog.find((e) => e.id === 'ex-cable-crossover')!
    const iso = swapExercise(p, day, bench, fly, profile(), {
      ...load, sessions: { 'ex-cable-crossover': [{ date: '2026-10-05', weight: 10, repsPerSet: [15, 15, 15], targetReps: 10, effort: 3 }] },
    })
    // 単関節：10〜15回・75秒。前回は上限に届いたので +2.5kg
    expect(iso).toMatchObject({ repRange: [10, 15], reps: 10, restSec: 75, weight: 12.5, weightReason: '前回15回×3できたので+2.5kg' })
  })

  it('ダンベルの種目はダンベルの刻み幅で重さを上げる', () => {
    const ex = catalog.find((e) => e.id === 'ex-dumbbell-press')!
    const sessions = { 'ex-dumbbell-press': [{ date: '2026-10-05', weight: 12, repsPerSet: [10, 10, 10], targetReps: 6, effort: 3 as const }] }
    expect(swapExercise(p, day, bench, ex, profile(), { ...load, sessions }).weight).toBe(13)
    expect(swapExercise(p, day, bench, ex, profile(), { ...load, sessions, dumbbellStep: 2 }).weight).toBe(14)
    // ダンベル以外は重量の刻み幅のまま
    const bp = { 'ex-bench-press': [{ date: '2026-10-05', weight: 60, repsPerSet: [10, 10, 10], targetReps: 6, effort: 3 as const }] }
    expect(swapExercise(p, day, bench, catalog.find((e) => e.id === 'ex-bench-press')!, profile(), { ...load, sessions: bp, dumbbellStep: 1 }).weight).toBe(62.5)
  })

  it('自重の種目に入れ替えると重さを消す', () => {
    const dips = catalog.find((e) => e.id === 'ex-dips')!
    const next = swapExercise(p, day, { ...bench, weight: 60 }, dips, profile(), load)
    expect(next.weight).toBeUndefined()
  })
})

describe('予定の種目の入れ替え候補', () => {
  const bench = catalog.find((e) => e.id === 'ex-bench-press')!

  it('プロフィールがなければ同じ動きの種目すべて（今の種目は除く）', () => {
    const list = sameMovementCandidates(bench, catalog, undefined)
    expect(list.length).toBeGreaterThan(0)
    expect(list.every((e) => e.pattern === 'horizontal_push' && e.id !== bench.id)).toBe(true)
    expect(list.map((e) => e.id)).toContain('ex-dumbbell-press')
  })

  it('プロフィールがあれば使える器具で絞る', () => {
    const list = sameMovementCandidates(bench, catalog, profile({ equipment: ['home_dumbbell'] }))
    expect(list.map((e) => e.id)).toContain('ex-dumbbell-press')
    expect(list.every((e) => e.equipment === 'dumbbell' || e.equipment === 'bodyweight' || e.equipment === 'other')).toBe(true)
  })

  it('動きのない種目は候補なし', () => {
    expect(sameMovementCandidates({ ...bench, pattern: undefined }, catalog, undefined)).toEqual([])
  })
})
