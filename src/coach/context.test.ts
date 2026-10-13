import { describe, expect, it } from 'vitest'
import { seedExercises } from '../db/seedExercises'
import type { PlannedWorkout, Profile } from '../db/types'
import {
  buildCoachRequest, candidatesFor, MAX_CHAT_MESSAGES, MAX_CONTEXT_BYTES, requestBytes, type BuildCoachRequestArgs,
  type HistoryWorkout,
} from './context'
import { buildSkeleton } from './skeleton'

const catalog = seedExercises()
const profile = (p: Partial<Profile> = {}): Profile => ({
  id: 'me', goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60,
  weekdays: [1, 2, 4, 5], equipment: ['gym_free', 'gym_machine'], injuries: '', baselines: [], updatedAt: 0, ...p,
})
const TODAY = '2026-10-14'
const NEXT = '2026-10-19'

const args = (over: Partial<BuildCoachRequestArgs> = {}): BuildCoachRequestArgs => {
  const pr = over.profile ?? profile()
  return {
    profile: pr,
    skeleton: buildSkeleton({ profile: pr, weekStart: NEXT, weeksSinceDeload: 1 }),
    catalog,
    history: { workouts: [], missed: [] },
    existingPlans: [],
    chat: [],
    userText: '来週のメニューを作って',
    today: TODAY,
    ...over,
  }
}
const ctx = (over: Partial<BuildCoachRequestArgs> = {}) => JSON.parse(buildCoachRequest(args(over)).context)
const workout = (date: string): HistoryWorkout => ({
  date, condition: 3, exercises: [{ exerciseId: 'ex-bench-press', sets: [{ weight: 60, reps: 10 }, { weight: 60, reps: 9 }], effort: 3 }],
})

describe('candidatesFor', () => {
  it('使える器具で絞る：自重のみならバーベル・マシンの種目は候補にない', () => {
    const c = candidatesFor(['horizontal_push', 'squat'], catalog, profile({ equipment: ['bodyweight'] }))
    expect(c.length).toBeGreaterThan(0)
    expect(c.every((e) => e.equipment === 'bodyweight')).toBe(true)
    expect(c.map((e) => e.id)).not.toContain('ex-bench-press')
  })

  it('ケガで絞る：肩を痛めていれば上に押す種目と横肩の種目を外す', () => {
    const p = profile({ injuries: '右肩が痛い' })
    expect(candidatesFor(['vertical_push'], catalog, p)).toEqual([])
    expect(candidatesFor(['side_delt'], catalog, p)).toEqual([])
    expect(candidatesFor(['horizontal_push'], catalog, p).length).toBeGreaterThan(0)
  })

  it('ケガで絞る：腰ならヒンジ系とバーベルのスクワットを外す', () => {
    const p = profile({ injuries: '腰痛あり' })
    expect(candidatesFor(['hinge'], catalog, p)).toEqual([])
    const squats = candidatesFor(['squat'], catalog, p)
    expect(squats.length).toBeGreaterThan(0)
    expect(squats.some((e) => e.equipment === 'barbell')).toBe(false)
  })

  it('削除済みの種目は候補にない', () => {
    const cat = catalog.map((e) => (e.id === 'ex-bench-press' ? { ...e, deleted: true } : e))
    expect(candidatesFor(['horizontal_push'], cat, profile()).map((e) => e.id)).not.toContain('ex-bench-press')
  })
})

describe('buildCoachRequest', () => {
  it('軽めの週なら、そのことと理由を伝える', () => {
    const sk = buildSkeleton({ profile: profile(), weekStart: NEXT, weeksSinceDeload: 2, fatigue: 'condition' })
    const c = ctx({ skeleton: sk })
    expect(c.skeleton.deload).toBe(true)
    expect(c.skeleton.deloadReason).toContain('調子')
    expect(c.request).toContain('軽めの週')
    expect(c.request).toContain('調子')
    expect(buildCoachRequest(args()).system).toContain('deloadReason')
  })

  it('system はルールを日本語で伝える', () => {
    const r = buildCoachRequest(args())
    expect(r.system).toContain('候補')
    expect(r.system).toContain('前の週')
    expect(r.system).toContain('ケガ')
    expect(r.system).toContain('日本語')
  })

  it('context にプロフィール・骨組み・枠ごとの候補と前の週の種目が入る', () => {
    const c = ctx({ previousSlots: { 'upper.1': 'ex-bench-press' } })
    expect(c.profile.goal).toBe('筋肥大')
    expect(c.skeleton.split).toBe('upper_lower')
    expect(c.skeleton.days).toHaveLength(4)
    const upper1 = c.slots.find((s: { slot: string }) => s.slot === 'upper.1')
    expect(upper1.previous).toEqual({ id: 'ex-bench-press', name: 'ベンチプレス' })
    expect(upper1.candidates.map((x: { id: string }) => x.id)).toContain('ex-bench-press')
    // 同じIDの枠は1つにまとめる
    expect(c.slots.filter((s: { slot: string }) => s.slot === 'upper.1')).toHaveLength(1)
  })

  it('自重のみなら、候補にバーベルの種目がない', () => {
    const c = ctx({ profile: profile({ equipment: ['bodyweight'] }) })
    const ids = c.slots.flatMap((s: { candidates: { id: string }[] }) => s.candidates.map((x) => x.id))
    const barbell = new Set(catalog.filter((e) => e.equipment === 'barbell').map((e) => e.id))
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.some((id: string) => barbell.has(id))).toBe(false)
  })

  it('記録の要約は直近4週間だけ（それより前と未来は含まない）', () => {
    const c = ctx({
      history: {
        workouts: [workout('2026-09-15'), workout('2026-09-16'), workout('2026-10-01'), workout('2026-10-20')],
        missed: [{ date: '2026-09-01', title: '古い' }, { date: '2026-10-08', title: '上半身' }],
      },
    })
    expect(c.history.workouts.map((w: { date: string }) => w.date)).toEqual(['2026-09-16', '2026-10-01'])
    expect(c.history.workouts[0].exercises[0]).toMatchObject({ name: 'ベンチプレス', sets: '60kg×10, 60kg×9', effort: 3 })
    expect(c.history.missed).toEqual([{ date: '2026-10-08', title: '上半身' }])
  })

  it('対象週の既存の予定が入る', () => {
    const plan = {
      id: 'p', createdAt: 0, updatedAt: 0, deleted: false, date: '2026-10-20', title: '脚の日', source: 'manual',
      exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [] }],
    } satisfies PlannedWorkout
    const c = ctx({ existingPlans: [plan, { ...plan, id: 'q', date: '2026-10-05' }, { ...plan, id: 'r', deleted: true }] })
    expect(c.existingPlans).toEqual([{ date: '2026-10-20', title: '脚の日', source: 'manual', exercises: ['スクワット'] }])
  })

  it('チャットは今回のメッセージを含めて最大20件、最初はユーザーの発言', () => {
    const chat = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? 'coach' : 'user') as 'user' | 'coach', text: `m${i}` }))
    const r = buildCoachRequest(args({ chat }))
    expect(r.messages.length).toBeLessThanOrEqual(MAX_CHAT_MESSAGES)
    expect(r.messages[0].role).toBe('user')
    expect(r.messages.at(-1)).toEqual({ role: 'user', text: '来週のメニューを作って' })
    expect(r.messages.at(-2)).toEqual({ role: 'coach', text: 'm29' })
  })

  it('依頼の種類と日付の制限を伝える', () => {
    expect(ctx({ intent: 'next_week' }).request).toContain('必ず')
    expect(ctx({ intent: 'this_week', earliestDate: TODAY }).request).toContain(TODAY)
    expect(ctx({ intent: 'chat' }).request).toContain('必要があるときだけ')
  })

  it('全体のサイズが上限以下（古い記録から減らす）', () => {
    const many = Array.from({ length: 28 }, (_, i) => ({
      ...workout(`2026-09-${String(17 + (i % 13)).padStart(2, '0')}`),
      exercises: Array.from({ length: 12 }, () => ({
        exerciseId: 'ex-bench-press', sets: Array.from({ length: 10 }, () => ({ weight: 100, reps: 10 })), effort: 3 as const,
      })),
    }))
    const chat = Array.from({ length: 19 }, () => ({ role: 'user' as const, text: 'あ'.repeat(1500) }))
    const r = buildCoachRequest(args({ history: { workouts: many, missed: [] }, chat }))
    expect(requestBytes(r)).toBeLessThanOrEqual(MAX_CONTEXT_BYTES)
    expect(r.messages.at(-1)?.text).toBe('来週のメニューを作って')
  })
})
