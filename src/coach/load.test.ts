import { describe, expect, it } from 'vitest'
import type { Rating } from '../db/types'
import { decideLoad, defaultWeightFor, estimate1RM, percentForReps, roundToStep, type PastSession } from './load'

const range: [number, number] = [8, 12]
const step = 2.5
/** 新しい順に並べた記録（日付は1週ずつ前） */
const hist = (...rows: [weight: number, reps: number[], effort?: Rating][]): PastSession[] =>
  rows.map(([weight, repsPerSet, effort], i) => ({
    date: `2026-10-${String(10 - i).padStart(2, '0')}`, weight, repsPerSet, targetReps: 8, effort,
  }))
const decide = (history: PastSession[]) => decideLoad({ history, repRange: range, step, logType: 'weight_reps' })

describe('estimate1RM / percentForReps / roundToStep', () => {
  it('Epley式', () => {
    expect(estimate1RM(100, 5)).toBeCloseTo(116.67, 2)
    expect(estimate1RM(60, 0)).toBe(60)
  })

  it('目標回数に合わせた割合（間は直線で補う）', () => {
    expect(percentForReps(5)).toBeCloseTo(0.87)
    expect(percentForReps(6)).toBeCloseTo(0.85)
    expect(percentForReps(8)).toBeCloseTo(0.8)
    expect(percentForReps(10)).toBeCloseTo(0.75)
    expect(percentForReps(12)).toBeCloseTo(0.7)
    expect(percentForReps(15)).toBeCloseTo(0.65)
    expect(percentForReps(7)).toBeCloseTo(0.825)
    expect(percentForReps(9)).toBeCloseTo(0.775)
    expect(percentForReps(3)).toBeGreaterThan(0.87)
    expect(percentForReps(3)).toBeLessThan(1)
    expect(percentForReps(30)).toBeGreaterThanOrEqual(0.5)
  })

  it('刻み幅で丸める', () => {
    expect(roundToStep(93.33, 2.5)).toBe(92.5)
    expect(roundToStep(19, 2.5)).toBe(20)
    expect(roundToStep(10.3, 0.5)).toBe(10.5)
    expect(roundToStep(10.3, 0)).toBe(10.3)
  })
})

describe('decideLoad（設計書「6. きつさによる調整」）', () => {
  it('楽（1〜2）が2回続いた → 刻み幅2つ分上げ、回数は下限から', () => {
    const d = decide(hist([60, [12, 12, 12], 2], [60, [10, 10, 10], 1]))
    expect(d).toMatchObject({ weight: 65, reps: 8, setDelta: 0 })
  })

  it('楽が3回続いた（上げても楽） → さらに1セット増やす', () => {
    const d = decide(hist([65, [12, 12, 12], 1], [60, [12, 12, 12], 2], [57.5, [12, 12, 12], 2]))
    expect(d).toMatchObject({ weight: 70, reps: 8, setDelta: 1 })
  })

  it('全セットで上限回数に届いた・きつさ3以下 → 刻み幅1つ分上げ、回数は下限から', () => {
    expect(decide(hist([60, [12, 12, 12], 3]))).toMatchObject({ weight: 62.5, reps: 8, setDelta: 0 })
    expect(decide(hist([60, [12, 13, 12], 3], [60, [10, 10, 9], 4]))).toMatchObject({ weight: 62.5, reps: 8 })
  })

  it('届いた・きつさ4 → 据え置き', () => {
    expect(decide(hist([60, [12, 12, 12], 4]))).toMatchObject({ weight: 60, reps: 12, setDelta: 0 })
  })

  it('目標の幅の中だが上限に届いていない → 据え置きで回数を1回増やす', () => {
    expect(decide(hist([60, [10, 9, 9], 3]))).toMatchObject({ weight: 60, reps: 10, setDelta: 0 })
    expect(decide(hist([60, [12, 12, 11], 2]))).toMatchObject({ weight: 60, reps: 12, setDelta: 0 })
  })

  it('届かなかった（下限より少ないセットがある） → 5%下げて丸め、1セット減らす', () => {
    const d = decide(hist([60, [9, 8, 6], 4]))
    expect(d).toMatchObject({ weight: 57.5, reps: 8, setDelta: -1 })
  })

  it('下げても丸めで同じ重さになるときは刻み幅1つ分下げる', () => {
    expect(decide(hist([20, [8, 7, 6], 4]))).toMatchObject({ weight: 17.5, setDelta: -1 })
  })

  it('きつさ5が2回続いた → 5%下げて1セット減らす', () => {
    expect(decide(hist([60, [10, 10, 10], 5], [60, [10, 10, 10], 5]))).toMatchObject({ weight: 57.5, reps: 8, setDelta: -1 })
  })

  it('きつさ5が1回だけ → 据え置き', () => {
    expect(decide(hist([60, [12, 12, 12], 5], [57.5, [12, 12, 12], 3]))).toMatchObject({ weight: 60, setDelta: 0 })
  })

  it('きつさの記録がない → 届けば刻み幅1つ分上げ、届かなければ据え置き', () => {
    expect(decide(hist([60, [12, 12, 12]]))).toMatchObject({ weight: 62.5, reps: 8, setDelta: 0 })
    expect(decide(hist([60, [10, 10, 9]]))).toMatchObject({ weight: 60, reps: 10, setDelta: 0 })
    expect(decide(hist([60, [8, 7, 6]]))).toMatchObject({ weight: 60, reps: 8, setDelta: 0 })
  })

  it('同じ重さで3回続けて届かない → 10%下げる（きつさの記録がなくても）', () => {
    expect(decide(hist([60, [8, 7, 6]], [60, [7, 7, 6]], [60, [8, 6, 6]]))).toMatchObject({ weight: 55, reps: 8, setDelta: -1 })
    expect(decide(hist([60, [8, 7, 6], 4], [60, [7, 7, 6], 4], [60, [8, 6, 6], 5]))).toMatchObject({ weight: 55, setDelta: -1 })
  })

  it('重さが違えば「3回続けて」には数えない', () => {
    expect(decide(hist([60, [8, 7, 6], 4], [62.5, [7, 7, 6], 4], [60, [8, 6, 6], 4]))).toMatchObject({ weight: 57.5 })
  })

  it('記録は日付の新しい順に並べ直して判断する', () => {
    const h = hist([60, [12, 12, 12], 3], [57.5, [6, 6, 6], 5]).reverse()
    expect(decide(h)).toMatchObject({ weight: 62.5 })
  })

  it('すべての判断に理由（日本語）がつく', () => {
    expect(decide(hist([60, [12, 12, 12], 3])).reason).toMatch(/上げ/)
    expect(decide(hist([60, [8, 7, 6], 4])).reason).toMatch(/下げ/)
  })
})

describe('decideLoad（設計書「5. 重さの決め方」）', () => {
  it('記録なし・プロフィールの重量×回数あり → 推定1RM×割合を刻み幅で丸める（100kg×5、目標8回 → 92.5）', () => {
    const d = decideLoad({ history: [], repRange: range, step, baseline: { weight: 100, reps: 5 }, logType: 'weight_reps' })
    expect(d).toMatchObject({ weight: 92.5, reps: 8, setDelta: 0 })
  })

  it('記録も重量×回数もない → 20kg で軽めに試す', () => {
    const d = decideLoad({ history: [], repRange: range, step, logType: 'weight_reps' })
    expect(d).toMatchObject({ weight: 20, reps: 8, setDelta: 0 })
    expect(d.reason).toContain('軽め')
  })

  it('回数のみ・時間の種目は重さを扱わない（回数のみの加重は前回を引き継ぐ）', () => {
    const none = decideLoad({ history: [], repRange: range, step, logType: 'reps' })
    expect(none.weight).toBeUndefined()
    expect(none.reps).toBe(8)
    const reps = decideLoad({ history: hist([10, [12, 12, 12], 3]), repRange: range, step, logType: 'reps' })
    expect(reps.weight).toBe(10)
    expect(reps.reps).toBe(12)
    const bodyweight = decideLoad({ history: hist([0, [10, 9], 3]), repRange: range, step, logType: 'reps' })
    expect(bodyweight.weight).toBeUndefined()
    expect(bodyweight.reps).toBe(10)
    const time = decideLoad({ history: hist([60, [12, 12, 12], 3]), repRange: range, step, logType: 'time_distance' })
    expect(time.weight).toBeUndefined()
  })
})

describe('decideLoad：時間の種目', () => {
  const timed = (history: PastSession[]) => decideLoad({ history, repRange: range, step, logType: 'time_distance' })

  it('回数がないのを「届かなかった」と扱わない（セット数を減らし続けない）', () => {
    const d = timed(hist([0, [0, 0, 0], 3], [0, [0, 0, 0], 3], [0, [0, 0, 0], 3]))
    expect(d.setDelta).toBe(0)
    expect(d.weight).toBeUndefined()
    expect(timed(hist([0, [], undefined])).setDelta).toBe(0)
  })

  it('セット数はきつさだけで決める：限界が2回続けば減らし、楽が3回続けば増やす', () => {
    expect(timed(hist([0, [0], 5], [0, [0], 5])).setDelta).toBe(-1)
    expect(timed(hist([0, [0], 2], [0, [0], 1], [0, [0], 2])).setDelta).toBe(1)
    expect(timed(hist([0, [0], 2], [0, [0], 1])).setDelta).toBe(0)
  })
})

describe('defaultWeightFor（記録も重量×回数もないときの初期値）', () => {
  it('複数関節は20kg、単関節やダンベルは5kg', () => {
    expect(defaultWeightFor({ compound: true, equipment: 'barbell' })).toBe(20)
    expect(defaultWeightFor({ compound: true, equipment: 'machine' })).toBe(20)
    expect(defaultWeightFor({ compound: false, equipment: 'machine' })).toBe(5)
    expect(defaultWeightFor({ compound: true, equipment: 'dumbbell' })).toBe(5)
    expect(defaultWeightFor({ equipment: 'cable' })).toBe(5)
  })

  it('decideLoad に初期値を渡すとその重さで始める', () => {
    const d = decideLoad({ history: [], repRange: range, step, logType: 'weight_reps', defaultWeight: 5 })
    expect(d).toMatchObject({ weight: 5, reps: 8, setDelta: 0 })
    expect(d.reason).toContain('5kg')
  })
})
