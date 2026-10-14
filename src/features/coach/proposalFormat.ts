import type { ProposalExercise } from '../../coach/types'
import type { Exercise } from '../../db/types'

/** 休憩時間の表示：90秒、2分、2分30秒 */
export function formatRest(sec: number): string {
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}分` : `${m}分${s}秒`
}

/** 「3×8 ・ 60kg ・ 休憩2分」 */
export function exerciseLine(x: ProposalExercise, ex: Exercise | undefined): string {
  const parts = [ex?.logType === 'time_distance' ? `${x.sets}セット` : `${x.sets}×${x.reps}`]
  if (x.weight !== undefined && ex?.logType !== 'time_distance') parts.push(`${x.weight}kg`)
  parts.push(`休憩${formatRest(x.restSec)}`)
  return parts.join(' ・ ')
}

/** 重さを Stepper で変えられる種目か（重量×回数で、自重でないもの） */
export const hasWeight = (ex: Exercise | undefined) => ex?.logType === 'weight_reps' && ex.equipment !== 'bodyweight'
