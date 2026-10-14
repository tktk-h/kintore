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

describe('decideLoad：初心者の目安の重さ（種目の startWeight）', () => {
  it('記録 → プロフィールの重量 → 種目の目安の重さ → 初期値 の順で決める', () => {
    const base = { repRange: range, step, logType: 'weight_reps' as const, defaultWeight: 5 }
    expect(decideLoad({ ...base, history: [], startWeight: 20 }).weight).toBe(20)
    expect(decideLoad({ ...base, history: [], startWeight: 20, baseline: { weight: 100, reps: 5 } }).weight).toBe(92.5)
    expect(decideLoad({ ...base, history: hist([40, [12, 12, 12], 3]), startWeight: 20 }).weight).toBe(42.5)
    expect(decideLoad({ ...base, history: [] }).weight).toBe(5)
  })

  it('目安の重さも刻み幅で丸める（ダンベル 6kg・刻み幅 2.5 → 5kg、刻み幅 1 → 6kg）', () => {
    expect(decideLoad({ history: [], repRange: range, step: 2.5, logType: 'weight_reps', startWeight: 6 }).weight).toBe(5)
    expect(decideLoad({ history: [], repRange: range, step: 1, logType: 'weight_reps', startWeight: 6 }).weight).toBe(6)
    expect(decideLoad({ history: [], repRange: range, step: 2.5, logType: 'weight_reps', startWeight: 7.5 }).weight).toBe(7.5)
  })

  it('丸めて0になるときは刻み幅1つ分にする', () => {
    expect(decideLoad({ history: [], repRange: range, step: 5, logType: 'weight_reps', startWeight: 2 }).weight).toBe(5)
  })

  it('回数のみ・時間の種目には使わない', () => {
    expect(decideLoad({ history: [], repRange: range, step, logType: 'reps', startWeight: 10 }).weight).toBeUndefined()
    expect(decideLoad({ history: [], repRange: range, step, logType: 'time_distance', startWeight: 10 }).weight).toBeUndefined()
  })
})

describe('decideLoad：目標回数は回数の幅に収める', () => {
  it('初めての種目（記録なし）は、重量×回数があってもなくても幅の下限から（ダブルプログレッションの始まり）', () => {
    for (const repRange of [[8, 12], [10, 15], [6, 10], [3, 6]] as [number, number][]) {
      const none = decideLoad({ history: [], repRange, step, logType: 'weight_reps', defaultWeight: 5 })
      expect(none.reps).toBe(repRange[0])
      const base = decideLoad({ history: [], repRange, step, logType: 'weight_reps', baseline: { weight: 60, reps: 10 } })
      expect(base.reps).toBe(repRange[0])
      expect(decideLoad({ history: [], repRange, step, logType: 'reps' }).reps).toBe(repRange[0])
    }
  })

  it('前回が別の幅で行われていても、次回の回数は今の幅に収める', () => {
    // 前回は単関節の幅（10〜15回）で10回 → 今の幅 8〜12 の中で1回増やして11回（上限12を超えない）
    expect(decideLoad({ history: hist([20, [10, 10]]), repRange: [8, 12], step, logType: 'weight_reps' }).reps).toBe(11)
    // 前回13・12回（上限以上）→ 届いたので重さを上げて下限から
    expect(decideLoad({ history: hist([20, [13, 12], 3]), repRange: [8, 12], step, logType: 'weight_reps' })).toMatchObject({ weight: 22.5, reps: 8 })
    // 前回14・11回で今の幅は 6〜10：幅の中ではないが、回数は上限10を超えない
    for (const effort of [undefined, 3, 4] as (Rating | undefined)[]) {
      const d = decideLoad({ history: hist([20, [14, 11], effort]), repRange: [6, 10], step, logType: 'weight_reps' })
      expect(d.reps).toBeGreaterThanOrEqual(6)
      expect(d.reps).toBeLessThanOrEqual(10)
    }
    // 前回6回で今の幅は 10〜15：下限を下回らない
    const low = decideLoad({ history: hist([20, [6, 6], 3]), repRange: [10, 15], step, logType: 'weight_reps' })
    expect(low.reps).toBe(10)
    const reps = decideLoad({ history: hist([0, [20, 18], 3]), repRange: [8, 12], step, logType: 'reps' })
    expect(reps.reps).toBe(12)
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
  it('バーベル・マシン・ケーブルの複数関節は20kg、ダンベルの複数関節は10kg、単関節は5kg、自重はなし', () => {
    expect(defaultWeightFor({ compound: true, equipment: 'barbell', logType: 'weight_reps' })).toBe(20)
    expect(defaultWeightFor({ compound: true, equipment: 'machine', logType: 'weight_reps' })).toBe(20)
    expect(defaultWeightFor({ compound: true, equipment: 'cable', logType: 'weight_reps' })).toBe(20)
    expect(defaultWeightFor({ compound: true, equipment: 'dumbbell', logType: 'weight_reps' })).toBe(10)
    expect(defaultWeightFor({ compound: false, equipment: 'machine', logType: 'weight_reps' })).toBe(5)
    expect(defaultWeightFor({ compound: false, equipment: 'dumbbell', logType: 'weight_reps' })).toBe(5)
    expect(defaultWeightFor({ compound: false, equipment: 'barbell', logType: 'weight_reps' })).toBe(5)
    expect(defaultWeightFor({ equipment: 'cable', logType: 'weight_reps' })).toBe(5)
    expect(defaultWeightFor({ compound: true, equipment: 'bodyweight', logType: 'weight_reps' })).toBeNull()
    expect(defaultWeightFor({ compound: true, equipment: 'bodyweight', logType: 'reps' })).toBeNull()
    expect(defaultWeightFor({ compound: false, equipment: 'other', logType: 'reps' })).toBeNull()
  })

  it('初期値が null（自重など）なら重さを入れず、回数は下限から', () => {
    const d = decideLoad({ history: [], repRange: range, step, logType: 'weight_reps', defaultWeight: null })
    expect(d.weight).toBeUndefined()
    expect(d.reps).toBe(8)
  })

  it('decideLoad に初期値を渡すとその重さで始める', () => {
    const d = decideLoad({ history: [], repRange: range, step, logType: 'weight_reps', defaultWeight: 5 })
    expect(d).toMatchObject({ weight: 5, reps: 8, setDelta: 0 })
    expect(d.reason).toContain('5kg')
  })
})

describe('decideLoad：重さはいつも刻み幅の倍数（ベンチプレス 69kg の不具合）', () => {
  const isMultiple = (w: number, s: number) => Math.abs(w / s - Math.round(w / s)) < 1e-9

  it('前回の重さが刻み幅に乗っていない（66.5kg を入力した）とき、上げても 69kg ではなく刻み幅にそろえる', () => {
    const up = decide(hist([66.5, [12, 12, 12], 3]))
    expect(up.weight).toBe(70)
    const hold = decide(hist([69, [10, 9, 9], 3]))
    expect(hold.weight).toBe(70)
    const reps = decideLoad({ history: hist([6, [12, 12, 12], 3]), repRange: range, step, logType: 'reps' })
    expect(reps.weight).toBe(5)
  })

  it('プロフィールの重量から計算した重さも刻み幅の倍数（80×5、75×8、筋肥大の初心者・上級者）', () => {
    // 筋肥大：初心者の複数関節 8〜12、上級者のメイン 6〜10、単関節 10〜15
    for (const repRange of [[8, 12], [6, 10], [10, 15]] as [number, number][]) {
      for (const baseline of [{ weight: 80, reps: 5 }, { weight: 75, reps: 8 }, { weight: 69, reps: 7 }, { weight: 61.3, reps: 11 }]) {
        const d = decideLoad({ history: [], repRange, step, baseline, logType: 'weight_reps' })
        expect(isMultiple(d.weight!, step), `${baseline.weight}x${baseline.reps} ${repRange} -> ${d.weight}`).toBe(true)
      }
    }
  })

  it('刻み幅が正しくない（0・未設定）ときは 2.5kg で丸める', () => {
    expect(decideLoad({ history: hist([66.5, [12, 12, 12], 3]), repRange: range, step: 0, logType: 'weight_reps' }).weight).toBe(70)
    expect(decideLoad({ history: [], repRange: range, step: Number.NaN, baseline: { weight: 80, reps: 5 }, logType: 'weight_reps' }).weight).toBe(75)
  })

  it('どんな記録・プロフィール・刻み幅でも、重さは刻み幅の倍数（網羅）', () => {
    const efforts: (Rating | undefined)[] = [undefined, 1, 2, 3, 4, 5]
    const weights = [17, 20, 33.3, 52.5, 66.5, 69, 71.25, 100.1]
    const repsSets = [[12, 12, 12], [10, 9, 9], [8, 7, 6], [5, 5]]
    for (const s of [0.5, 1, 1.25, 2.5, 5]) {
      for (const w of weights) {
        for (const e of efforts) {
          for (const r of repsSets) {
            for (const h of [hist([w, r, e]), hist([w, r, e], [w, r, e]), hist([w, r, e], [w, r, e], [w, r, e])]) {
              const d = decideLoad({ history: h, repRange: range, step: s, logType: 'weight_reps' })
              expect(isMultiple(d.weight!, s), `${w} ${r} ${e} step ${s} -> ${d.weight}`).toBe(true)
            }
          }
        }
        const b = decideLoad({ history: [], repRange: [6, 10], step: s, baseline: { weight: w, reps: 7 }, logType: 'weight_reps' })
        expect(isMultiple(b.weight!, s)).toBe(true)
        const def = decideLoad({ history: [], repRange: range, step: s, logType: 'weight_reps', defaultWeight: w })
        expect(isMultiple(def.weight!, s)).toBe(true)
      }
    }
  })
})
