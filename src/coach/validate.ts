import { MOVEMENT_PATTERN_LABELS, MUSCLE_LABELS, MUSCLES, type Exercise, type Muscle, type Profile } from '../db/types'
import { addDays, daysBetween, formatDateJa, parseDateKey } from '../lib/dates'
import { MIN_GAP_DAYS } from './split'
import type { Proposal, Skeleton, SlotPlan } from './types'
import { countMuscleSets, estimateMuscleSets, MINUTES_PER_SET } from './volume'

/** 1種目の値の範囲（設計書「メニュー案のチェック」） */
export const LIMITS = { sets: [1, 10], reps: [1, 30], restSec: [0, 300] } as const
/** 週のセット数が「大きく外れた」とみなす境目：下限の半分未満・上限の1.5倍超 */
const UNDER_RATIO = 0.5
const OVER_RATIO = 1.5

const inRange = (v: number, [lo, hi]: readonly [number, number]) => Number.isInteger(v) && v >= lo && v <= hi
const fmt = (n: number) => String(Math.round(n * 10) / 10)

/**
 * AIのメニュー案をチェックし、問題を日本語の文で返す（空なら問題なし）。
 * 設計書「メニュー案のチェック」：
 * - 種目IDが候補（catalog、削除済みを除く）にあり、枠の動きに合っている
 * - セット1〜10、回数1〜30、休憩0〜300秒
 * - 日付が対象週の中で、行ける曜日になっている。同じ日付が2回なく、骨組みの日だけで、骨組みの日が抜けていない
 * - 同じ部位（種目の主に使う部位）の日の間が48時間以上
 * - 1日の合計時間（1セット3分）が1回の時間に収まる
 * 問題の文には種目ID・枠IDを出さない（種目名・動きの名前・「◯日の◯つ目の種目」で示す）。
 * - 部位ごとの週のセット数（主1・補助0.5、有酸素は除く）が目標から大きく外れていない
 *   （上限の1.5倍超は常に、下限の半分未満は骨組みがその部位を下限の半分以上鍛える予定で、軽めの週でないときだけ）
 */
export function validateProposal(proposal: Proposal, skeleton: Skeleton, catalog: Exercise[], profile: Profile): string[] {
  const issues: string[] = []
  const byId = new Map(catalog.filter((e) => !e.deleted).map((e) => [e.id, e]))
  const weekEnd = addDays(skeleton.weekStart, 6)

  const findSlot = (date: string, slotId: string): SlotPlan | undefined =>
    skeleton.days.find((d) => d.date === date)?.slots.find((s) => s.slot === slotId)
    ?? skeleton.days.flatMap((d) => d.slots).find((s) => s.slot === slotId)

  const dayMuscles: { date: string; muscles: Set<Muscle> }[] = []
  const skeletonDates = new Set(skeleton.days.map((d) => d.date))
  const seenDates = new Set<string>()
  const duplicated = new Set<string>()

  for (const day of proposal.days) {
    const label = formatDateJa(day.date)
    const inWeek = day.date >= skeleton.weekStart && day.date <= weekEnd
    if (seenDates.has(day.date)) {
      if (!duplicated.has(day.date)) issues.push(`${label}が2回入っています。1日1つにまとめてください。`)
      duplicated.add(day.date)
    }
    seenDates.add(day.date)
    if (!inWeek) {
      issues.push(`${label}は対象の週（${formatDateJa(skeleton.weekStart)}〜${formatDateJa(weekEnd)}）の外の日付です。`)
    }
    const goodWeekday = profile.weekdays.includes(parseDateKey(day.date).getDay())
    if (!goodWeekday) {
      issues.push(`${label}は行ける曜日ではありません。`)
    }
    if (inWeek && goodWeekday && !skeletonDates.has(day.date)) {
      issues.push(`${label}は骨組みの日ではありません。骨組みの日（${skeleton.days.map((d) => formatDateJa(d.date)).join('・')}）だけにしてください。`)
    }

    const muscles = new Set<Muscle>()
    for (const [i, x] of day.exercises.entries()) {
      const e = byId.get(x.exerciseId)
      const where = e ? `${label}の「${e.name}」` : `${label}の${i + 1}つ目の種目`
      if (!e) {
        issues.push(`${where}は候補にない種目です。`)
      } else {
        const slot = findSlot(day.date, x.slot)
        if (!slot) {
          issues.push(`${where}の枠は骨組みにありません。骨組みの枠から選んでください。`)
        } else if (!e.pattern || !slot.patterns.includes(e.pattern)) {
          const want = slot.patterns.map((p) => MOVEMENT_PATTERN_LABELS[p]).join('か')
          issues.push(`${where}は枠の動き（${want}）に合いません。`)
        }
        if (e.pattern !== 'cardio') for (const m of e.primary ?? []) muscles.add(m)
      }
      if (!inRange(x.sets, LIMITS.sets)) issues.push(`${where}のセット数（${x.sets}）は1〜10にしてください。`)
      if (!inRange(x.reps, LIMITS.reps)) issues.push(`${where}の回数（${x.reps}）は1〜30にしてください。`)
      if (!inRange(x.restSec, LIMITS.restSec)) issues.push(`${where}の休憩（${x.restSec}秒）は0〜300秒にしてください。`)
    }

    const minutes = day.exercises.reduce((a, x) => a + x.sets, 0) * MINUTES_PER_SET
    if (minutes > profile.minutesPerSession) {
      issues.push(`${label}は合計で約${minutes}分かかり、1回の時間（${profile.minutesPerSession}分）を超えています。`)
    }
    dayMuscles.push({ date: day.date, muscles })
  }

  // 同じ部位の日の間は48時間以上
  for (let i = 0; i < dayMuscles.length; i++) {
    for (let j = i + 1; j < dayMuscles.length; j++) {
      const a = dayMuscles[i]
      const b = dayMuscles[j]
      if (a.date === b.date) continue // 同じ日付が2回あるのは上で知らせている
      if (Math.abs(daysBetween(a.date, b.date)) >= MIN_GAP_DAYS) continue
      const shared = MUSCLES.filter((m) => a.muscles.has(m) && b.muscles.has(m))
      if (shared.length === 0) continue
      issues.push(`${formatDateJa(a.date)}と${formatDateJa(b.date)}は同じ部位（${shared.map((m) => MUSCLE_LABELS[m]).join('・')}）を使うのに、間が48時間未満です。`)
    }
  }

  // 骨組みの日が抜けていないか
  for (const d of skeleton.days) {
    if (!seenDates.has(d.date)) issues.push(`${formatDateJa(d.date)}（${d.title}）が抜けています。骨組みのすべての日を入れてください。`)
  }

  // 部位ごとの週のセット数
  const [min, max] = skeleton.weeklySetTarget
  const actual = countMuscleSets(proposal.days.flatMap((d) => d.exercises), catalog)
  const planned = estimateMuscleSets(skeleton.days.flatMap((d) => d.slots))
  for (const m of MUSCLES) {
    const v = actual[m] ?? 0
    if (v > max * OVER_RATIO) {
      issues.push(`${MUSCLE_LABELS[m]}の週のセット数（${fmt(v)}）が多すぎます（目標${min}〜${max}）。`)
    } else if (!skeleton.deload && (planned[m] ?? 0) >= min * UNDER_RATIO && v < min * UNDER_RATIO) {
      issues.push(`${MUSCLE_LABELS[m]}の週のセット数（${fmt(v)}）が少なすぎます（目標${min}〜${max}）。`)
    }
  }

  return issues
}
