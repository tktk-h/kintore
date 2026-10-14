import { describe, expect, it } from 'vitest'
import { seedExercises } from '../db/seedExercises'
import type { Profile } from '../db/types'
import { buildSkeleton } from './skeleton'
import { COACH_REPLY_SCHEMA } from '../../api/_lib/schema'
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
  it('種目の adjust（重さ・回数・セット数を上げる／下げる）を受け取る。知らない値は捨て、空なら入れない', () => {
    const withAdjust = (adjust: unknown) => {
      const v = structuredClone(valid) as unknown as { proposal: { days: { exercises: Record<string, unknown>[] }[] } }
      v.proposal.days[0].exercises[0].adjust = adjust
      return parseCoachReply(v).proposal!.days[0].exercises[0]
    }
    expect(withAdjust({ load: 'up' }).adjust).toEqual({ load: 'up' })
    expect(withAdjust({ load: 'down', reps: 'up', sets: 'down' }).adjust).toEqual({ load: 'down', reps: 'up', sets: 'down' })
    expect(withAdjust({ load: 'more', reps: 'up' }).adjust).toEqual({ reps: 'up' })
    expect(withAdjust({ load: 'more' })).not.toHaveProperty('adjust')
    expect(withAdjust(null)).not.toHaveProperty('adjust')
    expect(withAdjust('up')).not.toHaveProperty('adjust')
  })

  it('responseSchema の種目に adjust（load／reps／sets は up か down）がある', () => {
    const ex = COACH_REPLY_SCHEMA.properties.proposal.properties.days.items.properties.exercises.items
    expect(ex.properties.adjust.properties.load.enum).toEqual(['up', 'down'])
    expect(ex.properties.adjust.properties.reps.enum).toEqual(['up', 'down'])
    expect(ex.properties.adjust.properties.sets.enum).toEqual(['up', 'down'])
    expect(ex.required).not.toContain('adjust')
  })

  it('正しい形（JSON 文字列でも値でもよい）', () => {
    expect(parseCoachReply(valid)).toEqual(valid)
    expect(parseCoachReply(JSON.stringify(valid))).toEqual(valid)
  })

  it('分割法の変更の依頼（requestedSplit）を読み取る。知らない値は捨てる', () => {
    expect(parseCoachReply({ message: '変えます', requestedSplit: 'ppl' })).toEqual({ message: '変えます', requestedSplit: 'ppl' })
    expect(parseCoachReply({ message: '変えます', requestedSplit: 'bro' })).toEqual({ message: '変えます' })
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
    const p = toProposal(reply.proposal!, skeleton, seedExercises(), profile)
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
    expect(toProposal(reply.proposal!, skeleton, seedExercises(), profile).split).toBe('upper_lower')
  })
})

describe('toProposal：回数の幅と休憩は選んだ種目で決める', () => {
  const base: Profile = {
    id: 'me', goal: 'hypertrophy', experience: 'none', daysPerWeek: 4, minutesPerSession: 60,
    weekdays: [1, 2, 4, 5], equipment: ['gym_free', 'gym_machine'], injuries: '', baselines: [], updatedAt: 0,
  }
  const reply = (date: string, exercises: { slot: string; exerciseId: string }[]) => parseCoachReply({
    message: 'ok',
    proposal: {
      split: 'upper_lower', reasons: 'r',
      days: [{ date, title: '下半身', exercises: exercises.map((x) => ({ ...x, sets: 2, reps: 8, restSec: 120 })) }],
    },
  }).proposal!

  it('複数関節の枠に単関節の種目（レッグエクステンション）を入れたら、単関節の回数と休憩にする', () => {
    const skeleton = buildSkeleton({ profile: base, weekStart: '2026-10-19', weeksSinceDeload: 1 })
    const lower = skeleton.days.find((d) => d.dayType === 'lower')!
    expect(lower.slots[2]).toMatchObject({ slot: 'lower.3', compound: true, repRange: [8, 12] })
    const p = toProposal(reply(lower.date, [
      { slot: 'lower.1', exerciseId: 'ex-squat' },
      { slot: 'lower.3', exerciseId: 'ex-leg-extension' },
    ]), skeleton, seedExercises(), base)
    expect(p.days[0].exercises[0]).toMatchObject({ repRange: [8, 12], restSec: 150 })
    expect(p.days[0].exercises[1]).toMatchObject({ repRange: [10, 15], restSec: 75 })
  })

  it('筋力アップ：各日の最初の枠の複数関節の種目はメインの回数、単関節ならメインにしない', () => {
    const profile: Profile = { ...base, goal: 'strength', experience: 'y1_3' }
    const skeleton = buildSkeleton({ profile, weekStart: '2026-10-19', weeksSinceDeload: 1 })
    const lower = skeleton.days.find((d) => d.dayType === 'lower')!
    const main = toProposal(reply(lower.date, [{ slot: 'lower.1', exerciseId: 'ex-squat' }]), skeleton, seedExercises(), profile)
    expect(main.days[0].exercises[0]).toMatchObject({ repRange: [3, 6], restSec: 240 })
    const iso = toProposal(reply(lower.date, [{ slot: 'lower.1', exerciseId: 'ex-leg-extension' }]), skeleton, seedExercises(), profile)
    expect(iso.days[0].exercises[0]).toMatchObject({ repRange: [10, 12], restSec: 75 })
    // 2つ目の枠の複数関節はメインではない
    const second = toProposal(reply(lower.date, [{ slot: 'lower.2', exerciseId: 'ex-romanian-deadlift' }]), skeleton, seedExercises(), profile)
    expect(second.days[0].exercises[0]).toMatchObject({ repRange: [6, 10], restSec: 120 })
  })
})
