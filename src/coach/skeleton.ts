import type { Muscle, Profile } from '../db/types'
import { mondayOf } from '../lib/dates'
import { chooseSplit, effectiveDays, scheduleDays, SPLIT_LABELS } from './split'
import { DAY_TITLES, daySlots } from './templates'
import type { DayPlan, DayType, Skeleton, SlotPlan, SplitType } from './types'
import {
  estimateMuscleSets, fitToTime, isBeginner, MAX_SLOT_SETS, maxSetsFor, MIN_SLOT_SETS, PATTERN_MUSCLES, repScheme,
  weeklySetTarget,
} from './volume'

/** デロード（軽めの週）を入れる間隔（設計書「7. デロード」） */
export const DELOAD_EVERY_WEEKS = 6
/** 他の部位を目標に届かせるとき、上限をどこまで超えてよいか */
const OVERSHOOT = 1.25

export interface BuildSkeletonArgs {
  profile: Profile
  /** 対象週の日付（月曜でなければその週の月曜にそろえる） */
  weekStart: string
  /** 前回のデロードから何週たったか */
  weeksSinceDeload: number
  /**
   * きつさによるセット数の増減（設計書「6. きつさによる調整」の setDelta）。
   * 前の週の枠のID（例：'upper.2'）ごと。同じIDの枠がすべての日で増減する。
   */
  slotSetDelta?: Partial<Record<string, -1 | 0 | 1>>
}

/** 連続する曜日で全身法が組めないときに代わりに使う分割法（設計書「1. 分割法」） */
const FALLBACK: Partial<Record<SplitType, SplitType>> = { full_body: 'upper_lower', ul_ppl: 'ppl' }

/** 骨組みで数える部位（いずれかの動きが主に使う部位） */
const TRAINED_MUSCLES = [...new Set(Object.values(PATTERN_MUSCLES).flatMap((pm) => pm.primary))]

const slotMuscles = (s: SlotPlan) => PATTERN_MUSCLES[s.patterns[0]]

/**
 * 1セット足したとき、どの部位も cap を超えないか
 */
function fitsCap(est: Partial<Record<Muscle, number>>, s: SlotPlan, cap: number): boolean {
  const pm = slotMuscles(s)
  return pm.primary.every((m) => (est[m] ?? 0) + 1 <= cap) && pm.secondary.every((m) => (est[m] ?? 0) + 0.5 <= cap)
}

/**
 * 枠ごとのセット数を決める（設計書「3. 量・回数・休憩」）。
 * 1. すべての枠を2セットから始める
 * 2. 週のセット数が下限に届かない部位を、足りない量が多い順に見て、その部位を主に使う枠
 *    （セット数が少ない枠を優先、同じなら先の枠）に1セット足す。
 *    ただし枠は4セットまで、1日は時間内、どの部位も上限の1.25倍まで。足せなくなるまで繰り返す
 */
function distributeSets(days: DayPlan[], [min, max]: [number, number], dayMax: number) {
  const cap = max * OVERSHOOT
  const all = days.flatMap((d) => d.slots.map((s) => ({ s, day: d })))
  const dayTotal = (d: DayPlan) => d.slots.reduce((a, s) => a + s.sets, 0)
  for (;;) {
    const est = estimateMuscleSets(days.flatMap((d) => d.slots))
    const short = TRAINED_MUSCLES
      .filter((m) => (est[m] ?? 0) < min)
      .sort((a, b) => (est[a] ?? 0) - (est[b] ?? 0))
    let added = false
    for (const m of short) {
      const target = all
        .filter(({ s, day }) => slotMuscles(s).primary.includes(m) && s.sets < MAX_SLOT_SETS
          && dayTotal(day) < dayMax && fitsCap(est, s, cap))
        .sort((a, b) => a.s.sets - b.s.sets)[0]
      if (target) { target.s.sets++; added = true; break }
    }
    if (!added) return
  }
}

function applySetDelta(days: DayPlan[], delta: BuildSkeletonArgs['slotSetDelta'], [, max]: [number, number], dayMax: number) {
  if (!delta) return
  const cap = max * OVERSHOOT
  for (const day of days) {
    for (const s of day.slots) {
      const d = delta[s.slot] ?? 0
      const total = day.slots.reduce((a, x) => a + x.sets, 0)
      const est = estimateMuscleSets(days.flatMap((x) => x.slots))
      if (d > 0 && s.sets < MAX_SLOT_SETS && total < dayMax && fitsCap(est, s, cap)) s.sets++
      if (d < 0 && s.sets > MIN_SLOT_SETS) s.sets--
    }
  }
}

/**
 * 1週間分の骨組み（分割法・日付ごとの日の種類・枠・セット数・回数・休憩）を作る。
 * 設計書「メニューの決め方 1〜3・7」。
 * 順番：分割法 → 日の並び（48時間ルール） → 枠（2セットずつ） → 時間に収める → セット数を配る
 * → きつさによる増減 → デロードなら半分。
 */
export function buildSkeleton({ profile, weekStart: anyDay, weeksSinceDeload, slotSetDelta }: BuildSkeletonArgs): Skeleton {
  const weekStart = mondayOf(anyDay)
  const { experience, goal } = profile
  const notes: string[] = []

  const count = effectiveDays(profile.daysPerWeek, experience)
  if (profile.daysPerWeek >= 7 && count === 6) notes.push('週7日は1日を休みにして、週6日で組みました。')
  if (isBeginner(experience) && profile.daysPerWeek > 4) {
    notes.push('経験が浅いうちは週4日までにしています。ほかの日は休みか軽い有酸素にしましょう。')
  }

  let split = chooseSplit(profile.daysPerWeek, experience, profile.preferredSplit)
  if (profile.preferredSplit && split !== profile.preferredSplit) {
    notes.push(`希望の${SPLIT_LABELS[profile.preferredSplit]}は今の条件（週${count}日・経験）では組めないため、${SPLIT_LABELS[split]}にしました。`)
  }

  let schedule = scheduleDays(split, profile.weekdays, weekStart, count)
  const alt = FALLBACK[split]
  if (schedule.days.length < count && alt && !profile.preferredSplit) {
    const altSchedule = scheduleDays(alt, profile.weekdays, weekStart, count)
    if (altSchedule.days.length > schedule.days.length) {
      notes.push(`行ける曜日が連続しているため、連続する日に違う部位が来る${SPLIT_LABELS[alt]}で組みました。`)
      split = alt
      schedule = altSchedule
    }
  }
  notes.push(...schedule.notes)

  const target = weeklySetTarget(experience)
  const dayMax = maxSetsFor(profile.minutesPerSession)
  const seen: Partial<Record<DayType, number>> = {}
  const days: DayPlan[] = schedule.days.map(({ date, dayType }) => {
    const variant = seen[dayType] ?? 0
    seen[dayType] = variant + 1
    const slots: SlotPlan[] = daySlots(dayType, variant).map((t, i) => ({
      slot: t.slot,
      patterns: t.patterns,
      sets: MIN_SLOT_SETS,
      ...repScheme(goal, experience, t.compound, i === 0),
      compound: t.compound,
    }))
    return { date, dayType, title: DAY_TITLES[dayType], slots: fitToTime(slots, profile.minutesPerSession) }
  })

  distributeSets(days, target, dayMax)
  applySetDelta(days, slotSetDelta, target, dayMax)

  const deload = weeksSinceDeload >= DELOAD_EVERY_WEEKS
  if (deload) {
    for (const d of days) for (const s of d.slots) s.sets = Math.max(1, Math.ceil(s.sets / 2))
    notes.push(`前回の軽めの週から${weeksSinceDeload}週たったので、今週は軽めの週（セット数を約半分、重さは据え置き）にしました。`)
  }

  return { split, weekStart, days, weeklySetTarget: target, deload, notes }
}
