import type { Proposal, ProposalExercise } from './types'

/** 前の案と比べた、1種目の変化 */
export type ExerciseChange =
  | { kind: 'same' }
  | { kind: 'changed'; prev: ProposalExercise; fields: ChangedField[] }
  | { kind: 'swapped'; prev: ProposalExercise }
  | { kind: 'new' }

export type ChangedField = 'weight' | 'reps' | 'sets'

export interface ProposalDiff {
  /** 日付 → 今の案の種目と同じ順の変化 */
  days: Record<string, ExerciseChange[]>
  /** 日付 → 外した種目（日ごと外れた日も含む） */
  removed: Record<string, ProposalExercise[]>
  /** 前の案にあって今の案にない日（古い順） */
  removedDays: string[]
  /** 変わった・入れ替え・新・外した種目の数（1種目で何項目変わっても1か所） */
  count: number
}

const FIELDS: ChangedField[] = ['weight', 'reps', 'sets']

/** 種目を結びつける鍵：日付＋枠。枠がなければ日付＋種目ID */
const keyOf = (date: string, x: ProposalExercise) => (x.slot ? `${date}|slot|${x.slot}` : `${date}|ex|${x.exerciseId}`)

/**
 * 前の案（prev）と今の案（next）の違い（設計書「3. 違いの見つけ方」）。
 * 対象の日付が1日も重ならないときは比べない（undefined）。
 */
export function diffProposals(prev: Proposal, next: Proposal): ProposalDiff | undefined {
  const nextDates = new Set(next.days.map((d) => d.date))
  if (!prev.days.some((d) => nextDates.has(d.date))) return undefined

  // 同じ鍵が2つあっても順に結びつけられるよう、鍵ごとに前の種目を並べておく。結びついたものは取り除く
  const pool = new Map<string, ProposalExercise[]>()
  for (const d of prev.days) {
    for (const x of d.exercises) pool.set(keyOf(d.date, x), [...(pool.get(keyOf(d.date, x)) ?? []), x])
  }

  const days: Record<string, ExerciseChange[]> = {}
  let count = 0
  for (const d of next.days) {
    days[d.date] = d.exercises.map((x): ExerciseChange => {
      const p = pool.get(keyOf(d.date, x))?.shift()
      if (!p) { count++; return { kind: 'new' } }
      if (p.exerciseId !== x.exerciseId) { count++; return { kind: 'swapped', prev: p } }
      const fields = FIELDS.filter((f) => p[f] !== x[f])
      if (fields.length === 0) return { kind: 'same' }
      count++
      return { kind: 'changed', prev: p, fields }
    })
  }

  // 結びつかずに残った前の種目が、外した種目
  const removed: Record<string, ProposalExercise[]> = {}
  for (const d of prev.days) {
    const left = d.exercises.filter((x) => pool.get(keyOf(d.date, x))?.includes(x))
    if (left.length > 0) { removed[d.date] = left; count += left.length }
  }
  const removedDays = prev.days.map((d) => d.date).filter((date) => !nextDates.has(date)).sort()
  return { days, removed, removedDays, count }
}
