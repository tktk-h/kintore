import type { ProposalExercise } from '../../coach/types'
import type { Exercise } from '../../db/types'

/** 休憩時間の表示：90秒、2分、2分30秒 */
export function formatRest(sec: number): string {
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}分` : `${m}分${s}秒`
}

/** 「8×3 ・ 60kg ・ 休憩2分」（回数×セット数） */
export function exerciseLine(x: ProposalExercise, ex: Exercise | undefined): string {
  const parts = [ex?.logType === 'time_distance' ? `${x.sets}セット` : `${x.reps}×${x.sets}`]
  if (x.weight !== undefined && ex?.logType !== 'time_distance') parts.push(`${x.weight}kg`)
  parts.push(`休憩${formatRest(x.restSec)}`)
  return parts.join(' ・ ')
}

/** 重さを Stepper で変えられる種目か（重量×回数で、自重でないもの） */
export const hasWeight = (ex: Exercise | undefined) => ex?.logType === 'weight_reps' && ex.equipment !== 'bodyweight'

/** 行の右側の量：「10×3」（時間の種目は「3セット」） */
export function volumeText(x: ProposalExercise, ex: Exercise | undefined): string {
  return ex?.logType === 'time_distance' ? `${x.sets}セット` : `${x.reps}×${x.sets}`
}

/** 行の右端の重さ：「60kg」（重さがない・自重・時間の種目は undefined） */
export function weightText(x: ProposalExercise, ex: Exercise | undefined): string | undefined {
  if (x.weight === undefined || ex?.logType === 'time_distance' || ex?.equipment === 'bodyweight') return undefined
  return `${x.weight}kg`
}

/** 1日のまとめ：「7種目・約55分」（1セット3分で見積もり、5分単位） */
export function daySummary(exercises: ProposalExercise[]): string {
  return workoutSummary(exercises.length, exercises.reduce((n, x) => n + x.sets, 0))
}

/** 「6種目・約55分」：種目数と合計セット数から（1セット3分で見積もり、5分単位） */
export function workoutSummary(exerciseCount: number, totalSets: number): string {
  const min = Math.round((totalSets * 3) / 5) * 5
  return `${exerciseCount}種目・約${min}分`
}
