import { describe, expect, it } from 'vitest'
import { diffProposals } from './diff'
import type { Proposal, ProposalExercise } from './types'

const ex = (slot: string, exerciseId: string, o: Partial<ProposalExercise> = {}): ProposalExercise =>
  ({ slot, exerciseId, sets: 3, reps: 8, repRange: [6, 10], restSec: 120, weight: 60, ...o })
const plan = (days: { date: string; exercises: ProposalExercise[] }[]): Proposal =>
  ({ split: 'upper_lower', reasons: '', issues: [], muscleSets: {}, days: days.map((d) => ({ ...d, title: '上半身' })) })

describe('diffProposals', () => {
  it('同じ枠で重さ・回数・セット数が変わったら changed（前の値つき）', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press'), ex('upper.2', 'ex-lat-pulldown')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press', { weight: 62.5 }), ex('upper.2', 'ex-lat-pulldown')] }])
    const d = diffProposals(prev, next)!
    expect(d.days['2026-11-02']).toEqual([
      { kind: 'changed', prev: prev.days[0].exercises[0], fields: ['weight'] },
      { kind: 'same' },
    ])
    expect(d.count).toBe(1)
  })

  it('1種目で重さと回数が両方変わっても1か所', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press', { weight: 62.5, reps: 10, sets: 4 })] }])
    const d = diffProposals(prev, next)!
    expect(d.days['2026-11-02'][0]).toMatchObject({ kind: 'changed', fields: ['weight', 'reps', 'sets'] })
    expect(d.count).toBe(1)
  })

  it('同じ枠で種目が替われば swapped、前にない枠は new、なくなった枠は removed', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press'), ex('upper.3', 'ex-side-raise')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-dumbbell-press'), ex('upper.4', 'ex-dumbbell-curl')] }])
    const d = diffProposals(prev, next)!
    expect(d.days['2026-11-02']).toEqual([{ kind: 'swapped', prev: prev.days[0].exercises[0] }, { kind: 'new' }])
    expect(d.removed['2026-11-02']).toEqual([prev.days[0].exercises[1]])
    expect(d.count).toBe(3)
  })

  it('枠がない種目は種目IDで結びつける', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('', 'ex-plank', { weight: undefined })] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('', 'ex-plank', { weight: undefined, sets: 2 })] }])
    expect(diffProposals(prev, next)!.days['2026-11-02'][0]).toMatchObject({ kind: 'changed', fields: ['sets'] })
  })

  it('同じ枠が2つあっても順に結びつける', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press'), ex('upper.1', 'ex-incline-press')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press'), ex('upper.1', 'ex-incline-press')] }])
    const d = diffProposals(prev, next)!
    expect(d.days['2026-11-02']).toEqual([{ kind: 'same' }, { kind: 'same' }])
    expect(d.count).toBe(0)
  })

  it('日ごとなくなったら removedDays と removed に入る', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press')] }, { date: '2026-11-03', exercises: [ex('lower.1', 'ex-squat')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press')] }])
    const d = diffProposals(prev, next)!
    expect(d.removedDays).toEqual(['2026-11-03'])
    expect(d.removed['2026-11-03']).toEqual(prev.days[1].exercises)
    expect(d.count).toBe(1)
  })

  it('対象の日付が1日も重ならなければ比べない（undefined）', () => {
    const prev = plan([{ date: '2026-10-26', exercises: [ex('upper.1', 'ex-bench-press')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press')] }])
    expect(diffProposals(prev, next)).toBeUndefined()
  })
})
