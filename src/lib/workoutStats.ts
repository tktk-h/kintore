import type { LogType, SetValues } from '../db/types'

export type DoneSet = SetValues & { done: boolean }

export function setVolume(logType: LogType, s: SetValues): number {
  return logType === 'weight_reps' ? (s.weight ?? 0) * (s.reps ?? 0) : 0
}

export function totalVolume(entries: { logType: LogType; sets: DoneSet[] }[]): number {
  return entries.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.done).reduce((acc, s) => acc + setVolume(e.logType, s), 0),
    0,
  )
}

/** 自己ベストの比較に使う値。時間・距離の種目は距離があれば距離、なければ時間で比べる */
export function bestValue(logType: LogType, sets: SetValues[]): number | undefined {
  let values: (number | undefined)[]
  if (logType === 'weight_reps') values = sets.map((s) => ((s.reps ?? 0) >= 1 ? s.weight : undefined))
  else if (logType === 'reps') values = sets.map((s) => s.reps)
  else if (sets.some((s) => (s.distanceKm ?? 0) > 0)) values = sets.map((s) => s.distanceKm)
  else values = sets.map((s) => s.durationSec)
  const nums = values.filter((v): v is number => v !== undefined && v > 0)
  return nums.length ? Math.max(...nums) : undefined
}

export function isPersonalRecord(logType: LogType, current: SetValues[], history: SetValues[]): boolean {
  const now = bestValue(logType, current)
  const before = bestValue(logType, history)
  return now !== undefined && before !== undefined && now > before
}

export function formatSeconds(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export function formatSet(logType: LogType, s: SetValues): string {
  if (logType === 'weight_reps') return `${s.weight ?? 0}kg × ${s.reps ?? 0}`
  if (logType === 'reps') {
    const w = s.weight ?? 0
    const extra = w > 0 ? ` (+${w}kg)` : w < 0 ? ` (補助${-w}kg)` : ''
    return `${s.reps ?? 0}回${extra}`
  }
  const parts: string[] = []
  if (s.distanceKm) parts.push(`${s.distanceKm}km`)
  if (s.durationSec) parts.push(formatSeconds(s.durationSec))
  return parts.join(' ') || '-'
}

export function formatSets(logType: LogType, sets: SetValues[]): string {
  if (sets.length === 0) return ''
  if (logType === 'weight_reps') {
    const w = sets[0].weight ?? 0
    if (sets.every((s) => (s.weight ?? 0) === w)) return `${w}kg × ${sets.map((s) => s.reps ?? 0).join(', ')}`
  }
  return sets.map((s) => formatSet(logType, s)).join(', ')
}

/** 終わったセットを1行に詰める。例：「60kg × 8・8・7」「60kg×8・62.5kg×6」「10・10・8回」「1:00・0:45」 */
export function formatSetsCompact(logType: LogType, sets: SetValues[]): string {
  if (sets.length === 0) return ''
  const sameWeight = sets.every((s) => (s.weight ?? 0) === (sets[0].weight ?? 0))
  if (logType === 'weight_reps') {
    if (sameWeight) return `${sets[0].weight ?? 0}kg × ${sets.map((s) => s.reps ?? 0).join('・')}`
    return sets.map((s) => `${s.weight ?? 0}kg×${s.reps ?? 0}`).join('・')
  }
  if (logType === 'reps' && sameWeight) {
    const w = sets[0].weight ?? 0
    const extra = w > 0 ? ` (+${w}kg)` : w < 0 ? ` (補助${-w}kg)` : ''
    return `${sets.map((s) => s.reps ?? 0).join('・')}回${extra}`
  }
  return sets.map((s) => formatSet(logType, s)).join('・')
}
