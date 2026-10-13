import type { LogType, Rating } from '../db/types'

/** その種目の過去1回分の記録 */
export interface PastSession {
  date: string
  /** その日の作業セットの重さ */
  weight: number
  repsPerSet: number[]
  /** その日の目標回数（記録用。判断には次回の回数の幅 repRange を使う） */
  targetReps: number
  effort?: Rating
}

export interface LoadDecision {
  /** 重さを扱わない種目は undefined */
  weight?: number
  /** 次回の目標回数 */
  reps: number
  /**
   * 来週のセット数の増減（AIに伝える）。適用する側で 2〜4セット・週の上限の範囲に収める
   * （設計書「6. きつさによる調整」：減らすときは2セットより下にしない）
   */
  setDelta: -1 | 0 | 1
  reason: string
}

/** 記録もプロフィールの重量もないときの初期値（設計書「5. 重さの決め方」3） */
export const DEFAULT_WEIGHT = 20

/** 推定1RM（Epley式：重量×(1＋回数÷30)） */
export function estimate1RM(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

/** 目標回数ごとの1RMに対する割合（設計書「5. 重さの決め方」2） */
const PERCENT_TABLE: [reps: number, pct: number][] = [[5, 0.87], [6, 0.85], [8, 0.8], [10, 0.75], [12, 0.7], [15, 0.65]]

/** 表の間は直線で補い、表の外は端の傾きで延ばす（1回で100%、最低50%） */
export function percentForReps(reps: number): number {
  const t = PERCENT_TABLE
  let i = t.findIndex(([r]) => r >= reps)
  if (i <= 0) i = i === 0 ? 1 : t.length - 1
  const [r0, p0] = t[i - 1]
  const [r1, p1] = t[i]
  const p = p0 + ((p1 - p0) * (reps - r0)) / (r1 - r0)
  return Math.min(1, Math.max(0.5, p))
}

/** 刻み幅で丸める（一番近い刻み） */
export function roundToStep(weight: number, step: number): number {
  if (!(step > 0)) return weight
  return Number((Math.round(weight / step) * step).toFixed(3))
}

const add = (w: number, x: number) => Number((w + x).toFixed(3))

/** 割合で下げて丸める。丸めで同じ重さに戻るときは刻み幅1つ分下げる */
function reduce(weight: number, pct: number, step: number): number {
  const r = roundToStep(weight * (1 - pct), step)
  return Math.max(0, r < weight ? r : add(weight, -step))
}

type Outcome = 'reached' | 'in_range' | 'missed'
/** 全セットで上限に届いた＝reached、下限より少ないセットがある＝missed（ダブルプログレッション） */
function outcome(s: PastSession, [low, high]: [number, number]): Outcome {
  if (s.repsPerSet.length === 0 || s.repsPerSet.some((r) => r < low)) return 'missed'
  return s.repsPerSet.every((r) => r >= high) ? 'reached' : 'in_range'
}

const isEasy = (s?: PastSession) => s?.effort !== undefined && s.effort <= 2

/**
 * 次回の重さ・回数・セット数の増減を決める。
 *
 * 記録がないとき（設計書「5. 重さの決め方」）：
 * - プロフィールの「重量×回数」があれば 推定1RM × 目標回数（幅の下限）の割合 を刻み幅で丸める
 * - なければ 20kg で軽めに試す
 *
 * 記録があるとき（設計書「6. きつさによる調整」の表。直近2回の流れで、上から順に判断）：
 * 1. 同じ重さで3回続けて届かなかった → 10%下げる、1セット減らす
 * 2. きつさの記録がない → 届けば刻み幅1つ分上げる、届かなければ据え置き
 * 3. 届かなかった（下限より少ないセットがある） → 5%下げる（丸めで同じなら刻み幅1つ）、1セット減らす
 * 4. きつさ5が2回続いた → 同上
 * 5. 楽（1〜2）が2回続いた → 刻み幅2つ分上げる（さらに3回目も楽なら1セット増やす）
 * 6. 全セットで上限回数に届いた・きつさ3以下 → 刻み幅1つ分上げる
 * 7. 届いた・きつさ4〜5 → 据え置き
 * 8. 幅の中（上限に届いていない） → 据え置きで回数を1回増やす
 * 重さを上げたら回数は下限から再スタートする。
 * 回数のみの種目は重さを扱わず、加重（前回の重さが0以外）なら前回の値を引き継ぐ。時間の種目は重さなし。
 */
export function decideLoad(args: {
  history: PastSession[]
  repRange: [number, number]
  step: number
  baseline?: { weight: number; reps: number }
  logType: LogType
}): LoadDecision {
  const { repRange, step, baseline, logType } = args
  const [low, high] = repRange
  const history = [...args.history].sort((a, b) => b.date.localeCompare(a.date))
  const [last, prev, prev2] = history

  if (!last) {
    if (logType !== 'weight_reps') return { reps: low, setDelta: 0, reason: '初めての種目なので、目標回数の下限から始めます。' }
    if (baseline) {
      const weight = roundToStep(estimate1RM(baseline.weight, baseline.reps) * percentForReps(low), step)
      return { weight, reps: low, setDelta: 0, reason: `今の重量（${baseline.weight}kg×${baseline.reps}回）から、${low}回できる重さを計算しました。` }
    }
    return {
      weight: DEFAULT_WEIGHT, reps: low, setDelta: 0,
      reason: `記録がないので、最初は軽めの重さ（${DEFAULT_WEIGHT}kg）で試して、きつさを記録してください。`,
    }
  }

  if (logType === 'time_distance') return timedDecision(last, prev, prev2, low)
  const d = progress(last, prev, prev2, repRange, step)
  if (logType === 'reps') {
    // 重さで調整しないので、回数を下限に戻さずに伸ばしていく
    const reps = outcome(last, repRange) === 'reached' ? high : Math.min(high, Math.max(low, Math.min(...last.repsPerSet) + 1))
    return { weight: last.weight ? last.weight : undefined, reps, setDelta: d.setDelta, reason: d.reason }
  }
  return d
}

/**
 * 時間の種目は回数の記録がないので、回数による判断（届いた・届かなかった）はしない。
 * セット数はきつさだけで決める：限界（5）が2回続けば1セット減らし、楽（1〜2）が3回続けば1セット増やす。
 */
function timedDecision(last: PastSession, prev: PastSession | undefined, prev2: PastSession | undefined, low: number): LoadDecision {
  if (last.effort === 5 && prev?.effort === 5) {
    return { reps: low, setDelta: -1, reason: '限界のきつさが2回続いたので、1セット減らします。' }
  }
  if (isEasy(last) && isEasy(prev) && isEasy(prev2)) {
    return { reps: low, setDelta: 1, reason: '楽な状態が続いているので、1セット増やします。' }
  }
  return { reps: low, setDelta: 0, reason: '時間の種目なので、前回と同じ内容で続けます。' }
}

function progress(
  last: PastSession, prev: PastSession | undefined, prev2: PastSession | undefined, repRange: [number, number], step: number,
): Required<Pick<LoadDecision, 'weight'>> & LoadDecision {
  const [low, high] = repRange
  const w = last.weight
  const o = outcome(last, repRange)
  const nextReps = Math.min(high, Math.max(low, Math.min(...last.repsPerSet) + 1))
  const hold = (reason: string) => ({ weight: w, reps: o === 'reached' ? high : nextReps, setDelta: 0 as const, reason })
  const up = (steps: number, reason: string, setDelta: 0 | 1 = 0) => ({ weight: add(w, step * steps), reps: low, setDelta, reason })

  if (prev && prev2 && [last, prev, prev2].every((s) => s.weight === w && outcome(s, repRange) === 'missed')) {
    return { weight: reduce(w, 0.1, step), reps: low, setDelta: -1, reason: '同じ重さで3回続けて目標回数に届かなかったので、10%下げてやり直します。' }
  }
  if (last.effort === undefined) {
    return o === 'reached'
      ? up(1, '前回は全セットで目標回数に届いたので、重さを1段階上げます。')
      : hold('前回は目標回数に届かなかったので、同じ重さでもう一度挑戦します。')
  }
  if (o === 'missed') {
    return { weight: reduce(w, 0.05, step), reps: low, setDelta: -1, reason: '前回は目標回数に届かなかったので、重さを約5%下げて1セット減らします。' }
  }
  if (last.effort === 5 && prev?.effort === 5) {
    return { weight: reduce(w, 0.05, step), reps: low, setDelta: -1, reason: '限界のきつさが2回続いたので、重さを約5%下げて1セット減らします。' }
  }
  if (isEasy(last) && isEasy(prev)) {
    return isEasy(prev2)
      ? up(2, '上げても楽な状態が続いているので、重さを2段階上げて1セット増やします。', 1)
      : up(2, '楽な状態が2回続いたので、重さを2段階上げます。')
  }
  if (o === 'reached') {
    return last.effort <= 3
      ? up(1, '前回は全セットで目標回数に届いたので、重さを1段階上げます。')
      : hold('目標回数には届きましたが、きつかったので同じ重さを続けます。')
  }
  return hold('同じ重さで、回数を1回ずつ増やしていきます。')
}
