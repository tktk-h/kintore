import type { Exercise, MovementPattern, Profile } from '../db/types'
import { candidatesFor } from './context'
import { decideExerciseLoad, withLoad, type LoadInputs } from './load'
import { schemeFor, slotPlanOf } from './response'
import type { Proposal, ProposalDay, ProposalExercise } from './types'
import { checkProposal } from './validate'
import { countMuscleSets } from './volume'

/** 手で変えた重さの理由 */
export const MANUAL_WEIGHT_REASON = '自分で変えた重さ'

/**
 * 案の dayIndex 日目の exIndex 番目の種目を next に置き換える。部位ごとの週のセット数は数え直す
 * （AIの案と同じく、案の種目だけで数える）
 */
export function replaceExercise(p: Proposal, dayIndex: number, exIndex: number, next: ProposalExercise, catalog: Exercise[]): Proposal {
  const days: ProposalDay[] = p.days.map((d, i) =>
    i === dayIndex ? { ...d, exercises: d.exercises.map((x, j) => (j === exIndex ? next : x)) } : d)
  return { ...p, days, muscleSets: countMuscleSets(days.flatMap((d) => d.exercises), catalog) }
}

/**
 * 直した案をチェックし直して issues を入れ替える（AIの案と同じチェック：validateProposal と組み始める日）。
 * 骨組みを残していない古い案はチェックできないので、注意点はそのままにする
 */
export function recheckProposal(p: Proposal, catalog: Exercise[], profile: Profile | undefined): Proposal {
  if (!p.skeleton || !profile) return p
  return { ...p, issues: checkProposal(p, p.skeleton, catalog, profile, p.earliest) }
}

/** 入れ替えに使う動き：骨組みの枠の動き。骨組みがなければ今の種目の動き */
export function swapPatterns(p: Proposal, day: ProposalDay, x: ProposalExercise, catalog: Exercise[]): MovementPattern[] {
  const slot = p.skeleton ? slotPlanOf(p.skeleton, day.date, x.slot) : undefined
  if (slot) return slot.plan.patterns
  const pattern = catalog.find((e) => e.id === x.exerciseId)?.pattern
  return pattern ? [pattern] : []
}

/** 同じ枠に入れられるほかの種目（使える器具とケガで絞る。今の種目は除く） */
export function swapCandidates(p: Proposal, day: ProposalDay, x: ProposalExercise, catalog: Exercise[], profile: Profile): Exercise[] {
  return candidatesFor(swapPatterns(p, day, x, catalog), catalog, profile).filter((e) => e.id !== x.exerciseId)
}

/**
 * 種目を入れ替える：回数の幅と休憩は選んだ種目で repScheme から決め直し、重さと回数は decideLoad で決め直す。
 * セット数と枠はそのまま
 */
export function swapExercise(
  p: Proposal, day: ProposalDay, x: ProposalExercise, ex: Exercise, profile: Profile, load: LoadInputs,
): ProposalExercise {
  const { repRange, restSec } = schemeFor(p.skeleton, day.date, x.slot, ex, profile, { repRange: x.repRange, restSec: x.restSec })
  const next: ProposalExercise = { ...x, exerciseId: ex.id, repRange: [repRange[0], repRange[1]], restSec }
  return withLoad(next, ex, decideExerciseLoad(ex, next.repRange, load))
}

/**
 * 予定の種目と同じ動きのほかの種目（削除済みと今の種目は除く）。
 * プロフィールがあれば使える器具とケガで絞る
 */
export function sameMovementCandidates(ex: Exercise, catalog: Exercise[], profile: Profile | undefined): Exercise[] {
  if (!ex.pattern) return []
  const list = profile ? candidatesFor([ex.pattern], catalog, profile) : catalog.filter((e) => !e.deleted && e.pattern === ex.pattern)
  return list.filter((e) => e.id !== ex.id)
}
