import type { Exercise, Profile } from '../db/types'
import type { CoachReplyProposal, ReplySplit } from '../../api/_lib/schema'
import type { Proposal, Skeleton, SlotPlan, SplitType } from './types'
import { countMuscleSets, repScheme } from './volume'

export { parseCoachReply, PARSE_ERROR_MESSAGE } from '../../api/_lib/schema'
export type { CoachReply, CoachReplyProposal } from '../../api/_lib/schema'

// サーバーと共有する分割法の一覧が、アプリの型とずれていないことを確かめる
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const splitTypesMatch: Same<ReplySplit, SplitType> = true
void splitTypesMatch

/**
 * AIのメニュー案をアプリのメニュー案にする（重さはまだ入れない）。
 * 回数の幅と休憩は、選んだ種目が複数関節かどうか（種目の compound）で repScheme から決め直す
 * （複数関節の枠に単関節の種目が入っても単関節の回数・休憩にする）。メインになるのは、骨組みの日の最初の枠に
 * 複数関節の種目を入れたときだけ。枠は同じ日の同じ枠、なければ同じIDの枠から探す。
 * 種目が候補にないときは枠の値、枠もなければ AI の回数・休憩をそのまま使う。
 * 分割法はアプリが決めた骨組みのものにする（AIが違う分割法を名乗っても表示しない）。
 */
/** 骨組みの枠（同じ日の同じ枠、なければ同じIDの枠）と、その日の最初の枠かどうか */
export function slotPlanOf(skeleton: Skeleton, date: string, slotId: string): { plan: SlotPlan; first: boolean } | undefined {
  const day = skeleton.days.find((d) => d.date === date)
  const i = day?.slots.findIndex((s) => s.slot === slotId) ?? -1
  if (day && i >= 0) return { plan: day.slots[i], first: i === 0 }
  for (const d of skeleton.days) {
    const j = d.slots.findIndex((s) => s.slot === slotId)
    if (j >= 0) return { plan: d.slots[j], first: j === 0 }
  }
  return undefined
}

/**
 * 選んだ種目の回数の幅と休憩（toProposal と、メニュー案の種目の入れ替えで使う）。
 * 枠と種目があれば repScheme（メインは日の最初の枠の複数関節だけ）、枠だけなら枠の値、
 * 骨組みがなければ種目の複数関節かどうかで repScheme（メインにはしない）、どれもなければ fallback
 */
export function schemeFor(
  skeleton: Skeleton | undefined, date: string, slotId: string, ex: Exercise | undefined,
  profile: Pick<Profile, 'goal' | 'experience'>, fallback: { repRange: [number, number]; restSec: number },
): { repRange: [number, number]; restSec: number } {
  const slot = skeleton ? slotPlanOf(skeleton, date, slotId) : undefined
  if (slot && ex) {
    const compound = ex.compound ?? slot.plan.compound
    return repScheme(profile.goal, profile.experience, compound, compound && slot.first)
  }
  if (slot) return { repRange: slot.plan.repRange, restSec: slot.plan.restSec }
  if (!skeleton && ex) return repScheme(profile.goal, profile.experience, ex.compound ?? false, false)
  return fallback
}

export function toProposal(
  p: CoachReplyProposal, skeleton: Skeleton, catalog: Exercise[], profile: Pick<Profile, 'goal' | 'experience'>,
): Proposal {
  const byId = new Map(catalog.map((e) => [e.id, e]))
  const scheme = (date: string, slotId: string, exerciseId: string, reps: number, restSec: number) =>
    schemeFor(skeleton, date, slotId, byId.get(exerciseId), profile, { repRange: [reps, reps], restSec })
  const days = p.days.map((d) => ({
    date: d.date,
    title: d.title,
    ...(d.note ? { note: d.note } : {}),
    exercises: d.exercises.map((x) => {
      const { repRange, restSec } = scheme(d.date, x.slot, x.exerciseId, x.reps, x.restSec)
      return {
        slot: x.slot,
        exerciseId: x.exerciseId,
        sets: x.sets,
        reps: x.reps,
        restSec,
        repRange: [repRange[0], repRange[1]] as [number, number],
      }
    }),
  }))
  return {
    split: skeleton.split,
    days,
    reasons: p.reasons,
    issues: [],
    muscleSets: countMuscleSets(days.flatMap((d) => d.exercises), catalog),
  }
}
