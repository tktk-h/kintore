import type { CoachAdjust } from '../../api/_lib/schema'
import type { Exercise } from '../db/types'
import { loadStepFor, roundToStep, type LoadDecision } from './load'
import type { ProposalExercise } from './types'

/**
 * 前の案の種目1つ（AIに previousProposal として渡し、チャットで頼まれた変更のもとにする）。
 * 前の案＝反映していない一番新しいメニュー案、なければ今週・来週のAIの予定
 */
export interface PreviousExercise {
  date: string
  slot?: string
  exerciseId: string
  sets: number
  reps: number
  weight?: number
}

/** 重さを上げるとき、この重さ以上なら刻み幅2つ分上げる */
export const BIG_STEP_FROM_KG = 60
/** セット数の範囲（頼まれて増減するとき） */
export const ADJUST_SETS: readonly [number, number] = [1, 6]
/** 回数の増減の幅。回数の幅（repRange）をこの分だけ広げた中に収める */
export const ADJUST_REPS = 2

/** 前の案から同じ種目を探す：同じ日付・枠・種目、なければ同じ日付・種目 */
export function findPrevious(
  list: PreviousExercise[] | undefined, date: string, slot: string, exerciseId: string,
): PreviousExercise | undefined {
  if (!list) return undefined
  return list.find((p) => p.date === date && p.slot === slot && p.exerciseId === exerciseId)
    ?? list.find((p) => p.date === date && p.exerciseId === exerciseId)
}

const kg = (n: number) => `${Number(n.toFixed(3))}kg`
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

export interface ApplyAdjustArgs {
  /** decideLoad の重さ・回数を入れた種目（withLoad のあと） */
  x: ProposalExercise
  ex: Pick<Exercise, 'equipment' | 'logType'>
  decision: LoadDecision
  previous: PreviousExercise | undefined
  adjust?: CoachAdjust
  /** 設定の重量の刻み幅・ダンベルの刻み幅 */
  step: number
  dumbbellStep?: number
}

/**
 * チャットで頼まれた変更（AIの adjust）を入れ、前の案より重さが下がらないようにする。
 *
 * 頼まれた変更は、前の案の同じ種目（findPrevious）の値から、なければ decideLoad の値から変える：
 * - 重さ up：刻み幅1つ（その重さが60kg以上なら2つ）上げる。down：刻み幅1つ下げる（刻み幅1つより下にしない）。
 *   刻み幅は器具ごと（ダンベルはダンベルの刻み幅）。理由は「リクエストで+2.5kg」
 * - 回数 ±2（回数の幅を上下2回ずつ広げた中に収める。時間の種目は変えない）
 * - セット数 ±1（1〜6）
 *
 * 前の案より重さを下げない決まり：AIに作り直してもらった案でも、前の案の同じ種目より軽くはしない
 * （AIは重さを決めないので、作り直しで重さが下がるのは意図しない変化のため）。
 * 例外は、decideLoad が下げると決めたとき（目標回数に届かなかった・きつさ5が続いた：decision.reduced）と、
 * ユーザーが軽くしてと頼んだとき（adjust.load が down）。
 * 頼まれていない回数は、前の案の回数を引き継ぐ（decideLoad が下げたときを除く）。
 */
export function applyAdjust({ x, ex, decision, previous, adjust = {}, step, dumbbellStep }: ApplyAdjustArgs): ProposalExercise {
  const next = { ...x }
  const reasons: string[] = []
  const timed = ex.logType === 'time_distance'
  const s = loadStepFor(ex, { step, dumbbellStep })

  if (next.weight !== undefined) {
    const base = previous?.weight ?? next.weight
    if (adjust.load === 'up') {
      next.weight = roundToStep(base + s * (base >= BIG_STEP_FROM_KG ? 2 : 1), s)
    } else if (adjust.load === 'down') {
      next.weight = Math.max(s, roundToStep(base - s, s))
    } else if (previous?.weight !== undefined && !decision.reduced && next.weight < previous.weight) {
      next.weight = previous.weight
      next.weightReason = '前の案と同じ重さ'
    }
    if (adjust.load) {
      const diff = Number((next.weight - base).toFixed(3))
      if (diff !== 0) reasons.push(`${diff > 0 ? '+' : '-'}${kg(Math.abs(diff))}`)
    }
  }

  if (!timed) {
    if (adjust.reps) {
      const base = previous?.reps ?? next.reps
      const [lo, hi] = next.repRange
      const delta = adjust.reps === 'up' ? ADJUST_REPS : -ADJUST_REPS
      next.reps = clamp(base + delta, Math.max(1, lo - ADJUST_REPS), hi + ADJUST_REPS)
      const d = next.reps - base
      if (d !== 0) reasons.push(`回数${d > 0 ? '+' : ''}${d}`)
    } else if (previous && !decision.reduced) {
      next.reps = previous.reps
    }
  }

  if (adjust.sets) {
    const base = previous?.sets ?? next.sets
    next.sets = clamp(base + (adjust.sets === 'up' ? 1 : -1), ADJUST_SETS[0], ADJUST_SETS[1])
    const d = next.sets - base
    if (d !== 0) reasons.push(d > 0 ? `${d}セット増` : `${-d}セット減`)
  }

  if (reasons.length) next.weightReason = `リクエストで${reasons.join('・')}`
  return next
}
