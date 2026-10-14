import { describe, expect, it } from 'vitest'
import type { Exercise } from '../db/types'
import { applyAdjust, findPrevious, type PreviousExercise } from './adjust'
import type { LoadDecision } from './load'
import type { ProposalExercise } from './types'

const barbell = { id: 'ex-bench-press', equipment: 'barbell', logType: 'weight_reps' } as Exercise
const dumbbell = { id: 'ex-dumbbell-press', equipment: 'dumbbell', logType: 'weight_reps' } as Exercise
const timed = { id: 'ex-plank', equipment: 'bodyweight', logType: 'time_distance' } as Exercise

const x = (over: Partial<ProposalExercise> = {}): ProposalExercise => ({
  slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps: 6, repRange: [6, 10], restSec: 150, weight: 50, weightReason: '理由', ...over,
})
const decision = (over: Partial<LoadDecision> = {}): LoadDecision => ({ weight: 50, reps: 6, setDelta: 0, reason: '理由', ...over })
const prev = (over: Partial<PreviousExercise> = {}): PreviousExercise => ({
  date: '2026-10-19', slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps: 8, weight: 55, ...over,
})
const steps = { step: 2.5, dumbbellStep: 1 }
const run = (args: Partial<Parameters<typeof applyAdjust>[0]> = {}) =>
  applyAdjust({ x: x(), ex: barbell, decision: decision(), previous: prev(), ...steps, ...args })

describe('applyAdjust：頼まれた変更を前の案の値から入れる', () => {
  it('重さを上げる：前の案から刻み幅1つ（60kg以上は2つ）。理由は「リクエストで+2.5kg」', () => {
    expect(run({ adjust: { load: 'up' } })).toMatchObject({ weight: 57.5, weightReason: 'リクエストで+2.5kg' })
    expect(run({ adjust: { load: 'up' }, previous: prev({ weight: 60 }) })).toMatchObject({ weight: 65, weightReason: 'リクエストで+5kg' })
  })

  it('ダンベルはダンベルの刻み幅で上げ下げする', () => {
    const dx = x({ exerciseId: 'ex-dumbbell-press', weight: 12 })
    const dp = prev({ exerciseId: 'ex-dumbbell-press', weight: 14 })
    expect(applyAdjust({ x: dx, ex: dumbbell, decision: decision({ weight: 12 }), previous: dp, adjust: { load: 'up' }, ...steps }).weight).toBe(15)
    expect(applyAdjust({ x: dx, ex: dumbbell, decision: decision({ weight: 12 }), previous: dp, adjust: { load: 'down' }, ...steps }).weight).toBe(13)
  })

  it('重さを下げる：刻み幅1つ。刻み幅1つより下にはしない', () => {
    expect(run({ adjust: { load: 'down' } })).toMatchObject({ weight: 52.5, weightReason: 'リクエストで-2.5kg' })
    expect(run({ adjust: { load: 'down' }, previous: prev({ weight: 2.5 }) }).weight).toBe(2.5)
  })

  it('前の案がなければ、アプリが決めた重さから変える', () => {
    expect(run({ adjust: { load: 'up' }, previous: undefined }).weight).toBe(52.5)
  })

  it('回数は±2（回数の幅±2の中）、セット数は±1（1〜6）。前の案の値から', () => {
    expect(run({ adjust: { reps: 'up' } }).reps).toBe(10)
    expect(run({ adjust: { reps: 'up' }, previous: prev({ reps: 11 }) }).reps).toBe(12)
    expect(run({ adjust: { reps: 'down' }, previous: prev({ reps: 5 }) }).reps).toBe(4)
    expect(run({ adjust: { sets: 'up' } }).sets).toBe(4)
    expect(run({ adjust: { sets: 'up' }, previous: prev({ sets: 6 }) }).sets).toBe(6)
    expect(run({ adjust: { sets: 'down' }, previous: prev({ sets: 1 }) }).sets).toBe(1)
    expect(run({ adjust: { reps: 'up', sets: 'down' } }).weightReason).toBe('リクエストで回数+2・1セット減')
  })

  it('時間の種目は回数を変えず、重さも入れない', () => {
    const tx = x({ exerciseId: 'ex-plank', weight: undefined, reps: 1 })
    const out = applyAdjust({ x: tx, ex: timed, decision: decision({ weight: undefined }), previous: undefined, adjust: { reps: 'up', load: 'up', sets: 'up' }, ...steps })
    expect(out).toMatchObject({ reps: 1, sets: 4 })
    expect(out.weight).toBeUndefined()
  })

  it('頼まれていなければ、前の案より重さを下げない（前の案の回数を引き継ぐ）', () => {
    expect(run()).toMatchObject({ weight: 55, reps: 8, weightReason: '前の案と同じ重さ' })
    // アプリの重さの方が重いならそのまま
    expect(run({ x: x({ weight: 57.5 }), decision: decision({ weight: 57.5 }) })).toMatchObject({ weight: 57.5, weightReason: '理由' })
  })

  it('届かなかった・きつさ5が続いた（decideLoad が下げた）ときは、前の案より軽くてよい', () => {
    expect(run({ decision: decision({ reduced: true }) })).toMatchObject({ weight: 50, weightReason: '理由' })
  })
})

describe('findPrevious', () => {
  const list = [prev(), prev({ date: '2026-10-22', slot: 'upper.2', weight: 40 })]
  it('同じ日付・枠・種目、なければ同じ日付・種目', () => {
    expect(findPrevious(list, '2026-10-19', 'upper.1', 'ex-bench-press')?.weight).toBe(55)
    expect(findPrevious(list, '2026-10-22', 'upper.9', 'ex-bench-press')?.weight).toBe(40)
    expect(findPrevious(list, '2026-10-20', 'upper.1', 'ex-bench-press')).toBeUndefined()
    expect(findPrevious(undefined, '2026-10-19', 'upper.1', 'ex-bench-press')).toBeUndefined()
  })
})
