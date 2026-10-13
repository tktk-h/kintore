import { describe, expect, it } from 'vitest'
import { seedExercises } from '../db/seedExercises'
import type { Profile } from '../db/types'
import { buildSkeleton } from './skeleton'
import { parseCoachReply, toProposal } from './response'

const valid = {
  message: '来週のメニューです',
  proposal: {
    split: 'upper_lower',
    days: [{
      date: '2026-10-19', title: '上半身', note: 'メモ',
      exercises: [{ slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps: 8, restSec: 150 }],
    }],
    reasons: '前の週と同じ種目を続けます',
  },
}

describe('parseCoachReply', () => {
  it('正しい形（JSON 文字列でも値でもよい）', () => {
    expect(parseCoachReply(valid)).toEqual(valid)
    expect(parseCoachReply(JSON.stringify(valid))).toEqual(valid)
  })

  it('message のみ', () => {
    expect(parseCoachReply({ message: 'こんにちは' })).toEqual({ message: 'こんにちは' })
    expect(parseCoachReply({ message: 'こんにちは', proposal: null })).toEqual({ message: 'こんにちは' })
  })

  it('余分な項目は捨てる', () => {
    expect(parseCoachReply({ message: 'a', extra: 1 })).toEqual({ message: 'a' })
  })

  it('proposal の型違いは読み取れない', () => {
    const bad = (patch: (v: typeof valid) => unknown) => () => parseCoachReply(patch(structuredClone(valid)))
    expect(bad((v) => ({ ...v, proposal: { ...v.proposal, split: 'bro' } }))).toThrow('AIの返事を読み取れませんでした')
    expect(bad((v) => ({ ...v, proposal: { ...v.proposal, days: 'x' } }))).toThrow('AIの返事を読み取れませんでした')
    expect(bad((v) => { v.proposal.days[0].exercises[0].sets = '3' as unknown as number; return v })).toThrow('AIの返事を読み取れませんでした')
    expect(bad((v) => { v.proposal.days[0].date = '10/19'; return v })).toThrow('AIの返事を読み取れませんでした')
    expect(bad((v) => ({ ...v, proposal: { ...v.proposal, reasons: undefined } }))).toThrow('AIの返事を読み取れませんでした')
  })

  it('message がない・JSON でない文字列は読み取れない', () => {
    expect(() => parseCoachReply({ proposal: valid.proposal })).toThrow('AIの返事を読み取れませんでした')
    expect(() => parseCoachReply('これはJSONではありません')).toThrow('AIの返事を読み取れませんでした')
    expect(() => parseCoachReply(null)).toThrow('AIの返事を読み取れませんでした')
    expect(() => parseCoachReply([valid])).toThrow('AIの返事を読み取れませんでした')
  })
})

describe('toProposal', () => {
  it('回数の幅を骨組みの枠から取り、部位ごとのセット数を数える', () => {
    const profile: Profile = {
      id: 'me', goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60,
      weekdays: [1, 2, 4, 5], equipment: ['gym_free'], injuries: '', baselines: [], updatedAt: 0,
    }
    const skeleton = buildSkeleton({ profile, weekStart: '2026-10-19', weeksSinceDeload: 1 })
    const reply = parseCoachReply(valid)
    const p = toProposal(reply.proposal!, skeleton, seedExercises())
    expect(p.split).toBe('upper_lower')
    expect(p.issues).toEqual([])
    expect(p.days[0].note).toBe('メモ')
    expect(p.days[0].exercises[0]).toMatchObject({ slot: 'upper.1', repRange: [6, 10], sets: 3, reps: 8 })
    expect(p.muscleSets.chest).toBe(3)
    expect(p.muscleSets.triceps).toBe(1.5)
  })

  it('分割法はAIの言い分ではなく、アプリの骨組みのものにする', () => {
    const profile: Profile = {
      id: 'me', goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60,
      weekdays: [1, 2, 4, 5], equipment: ['gym_free'], injuries: '', baselines: [], updatedAt: 0,
    }
    const skeleton = buildSkeleton({ profile, weekStart: '2026-10-19', weeksSinceDeload: 1 })
    const reply = parseCoachReply({ ...valid, proposal: { ...valid.proposal, split: 'ppl' } })
    expect(toProposal(reply.proposal!, skeleton, seedExercises()).split).toBe('upper_lower')
  })
})
