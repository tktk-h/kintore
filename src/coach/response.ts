import type { Exercise } from '../db/types'
import type { CoachReplyProposal, ReplySplit } from '../../api/_lib/schema'
import type { Proposal, Skeleton, SplitType } from './types'
import { countMuscleSets } from './volume'

export { parseCoachReply, PARSE_ERROR_MESSAGE } from '../../api/_lib/schema'
export type { CoachReply, CoachReplyProposal } from '../../api/_lib/schema'

// サーバーと共有する分割法の一覧が、アプリの型とずれていないことを確かめる
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const splitTypesMatch: Same<ReplySplit, SplitType> = true
void splitTypesMatch

/**
 * AIのメニュー案をアプリのメニュー案にする（重さはまだ入れない）。
 * 回数の幅は骨組みの枠から取る（同じ日の同じ枠、なければ同じIDの枠、どちらもなければ AI の回数だけ）。
 */
export function toProposal(p: CoachReplyProposal, skeleton: Skeleton, catalog: Exercise[]): Proposal {
  const slotOf = (date: string, slot: string) =>
    skeleton.days.find((d) => d.date === date)?.slots.find((s) => s.slot === slot)
    ?? skeleton.days.flatMap((d) => d.slots).find((s) => s.slot === slot)
  const days = p.days.map((d) => ({
    date: d.date,
    title: d.title,
    ...(d.note ? { note: d.note } : {}),
    exercises: d.exercises.map((x) => ({
      slot: x.slot,
      exerciseId: x.exerciseId,
      sets: x.sets,
      reps: x.reps,
      restSec: x.restSec,
      repRange: slotOf(d.date, x.slot)?.repRange ?? ([x.reps, x.reps] as [number, number]),
    })),
  }))
  return {
    split: p.split,
    days,
    reasons: p.reasons,
    issues: [],
    muscleSets: countMuscleSets(days.flatMap((d) => d.exercises), catalog),
  }
}
