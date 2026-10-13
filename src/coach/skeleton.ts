import type { Muscle, Profile } from '../db/types'
import { addDays, formatDateJa, mondayOf } from '../lib/dates'
import { chooseSplit, dayTypeSequence, effectiveDays, scheduleDays, SPLIT_LABELS } from './split'
import { DAY_TITLES, dayTypeMuscles, daySlots } from './templates'
import type { DayPlan, DayType, DoneDay, Skeleton, SlotPlan, SplitType } from './types'
import {
  estimateMuscleSets, fitToTime, isBeginner, MAX_SLOT_SETS, maxSetsFor, MIN_SLOT_SETS, PATTERN_MUSCLES, repScheme,
  weeklySetTarget,
} from './volume'

/** デロード（軽めの週）を入れる間隔（設計書「7. デロード」） */
export const DELOAD_EVERY_WEEKS = 6
/** 他の部位を目標に届かせるとき、上限をどこまで超えてよいか */
const OVERSHOOT = 1.25

export type Fatigue = 'effort' | 'condition'

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
  /**
   * 前の週のAIの予定の、枠ごとの実際のセット数。あればその枠はこの数に setDelta を足したもの（2〜4）にする
   * （設計書「6. きつさによる調整」：楽が続けば週ごとに1セットずつ積み上がる）
   */
  slotBaseSets?: Partial<Record<string, number>>
  /**
   * 疲れのサイン（設計書「7. デロード」）。あれば6週たっていなくても軽めの週にする。
   * effort：直近2週間できつさ5の種目が多い／condition：直近2週間で調子の低い日が続く
   */
  fatigue?: Fatigue
  /** 今週の見直し：この日付より前の日は組まない */
  from?: string
  /** 今週の見直し：対象週にもう終えた日。その日数分の日の種類を除き、48時間ルールと週のセット数に数える */
  done?: DoneDay[]
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
type MuscleSets = Partial<Record<Muscle, number>>

/** 骨組みの見積もりに、もう終えた日のセット数を足す */
function withDone(est: MuscleSets, done: MuscleSets): MuscleSets {
  const out = { ...est }
  for (const [m, v] of Object.entries(done) as [Muscle, number][]) out[m] = (out[m] ?? 0) + v
  return out
}

function distributeSets(days: DayPlan[], [min, max]: [number, number], dayMax: number, done: MuscleSets) {
  const cap = max * OVERSHOOT
  const all = days.flatMap((d) => d.slots.map((s) => ({ s, day: d })))
  const dayTotal = (d: DayPlan) => d.slots.reduce((a, s) => a + s.sets, 0)
  for (;;) {
    const est = withDone(estimateMuscleSets(days.flatMap((d) => d.slots)), done)
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

/**
 * もう終えた日の分の日の種類を、分割法の並びから除く。
 * 終えた日ごとに、使った部位が一番重なる日の種類（同じなら先のもの）を1つ除く。
 */
function remainingTypes(types: DayType[], done: DoneDay[]): DayType[] {
  const rest = [...types]
  for (const d of done) {
    if (rest.length === 0) break
    const overlap = (t: DayType) => dayTypeMuscles(t).filter((m) => d.muscles.includes(m)).length
    let best = 0
    rest.forEach((t, i) => { if (overlap(t) > overlap(rest[best])) best = i })
    rest.splice(best, 1)
  }
  return rest
}

/**
 * きつさによるセット数の増減。前の週のその枠のセット数（base）があればそこから、なければ配分した数から
 * 1セット増減する（2〜4の範囲。増やすのは1日の時間と週の上限の1.25倍に収まるときだけ）。
 */
function applySetDelta(
  days: DayPlan[], delta: BuildSkeletonArgs['slotSetDelta'], base: BuildSkeletonArgs['slotBaseSets'],
  [, max]: [number, number], dayMax: number, done: MuscleSets,
) {
  if (!delta && !base) return
  const cap = max * OVERSHOOT
  for (const day of days) {
    for (const s of day.slots) {
      const d = delta?.[s.slot] ?? 0
      const prev = base?.[s.slot]
      const want = Math.min(MAX_SLOT_SETS, Math.max(MIN_SLOT_SETS, (prev ?? s.sets) + d))
      while (s.sets > want) s.sets--
      while (s.sets < want) {
        const total = day.slots.reduce((a, x) => a + x.sets, 0)
        const est = withDone(estimateMuscleSets(days.flatMap((x) => x.slots)), done)
        if (total >= dayMax || !fitsCap(est, s, cap)) break
        s.sets++
      }
    }
  }
}

/**
 * 1週間分の骨組み（分割法・日付ごとの日の種類・枠・セット数・回数・休憩）を作る。
 * 設計書「メニューの決め方 1〜3・7」。
 * 順番：分割法 → 日の並び（48時間ルール） → 枠（2セットずつ） → 時間に収める → セット数を配る
 * → きつさによる増減 → デロード（6週ごと、または疲れのサインがあるとき）なら半分。
 */
export function buildSkeleton({
  profile, weekStart: anyDay, weeksSinceDeload, slotSetDelta, slotBaseSets, from, done: doneArg, fatigue,
}: BuildSkeletonArgs): Skeleton {
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

  // 今週の見直し：対象週にもう終えた日の分だけ、残りの日数と日の種類を減らす
  const weekEnd = addDays(weekStart, 6)
  const done = (doneArg ?? []).filter((d) => d.date >= weekStart && d.date <= weekEnd)
  const doneSets: MuscleSets = {}
  for (const d of done) Object.assign(doneSets, withDone(doneSets, d.muscleSets))
  const remaining = Math.max(0, count - done.length)
  const plan = (s: SplitType) => scheduleDays(s, profile.weekdays, weekStart, remaining, {
    from, types: remainingTypes(dayTypeSequence(s, count), done), fixed: done,
  })
  if (done.length > 0) {
    notes.push(`今週はすでに${done.map((d) => formatDateJa(d.date)).join('・')}に行ったので、残り${remaining}日分で組みました。`)
  }

  let schedule = plan(split)
  const alt = FALLBACK[split]
  if (schedule.days.length < remaining && alt && !profile.preferredSplit) {
    const altSchedule = plan(alt)
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

  distributeSets(days, target, dayMax, doneSets)
  applySetDelta(days, slotSetDelta, slotBaseSets, target, dayMax, doneSets)

  const deloadReason = weeksSinceDeload >= DELOAD_EVERY_WEEKS
    ? `前回の軽めの週から${weeksSinceDeload}週たった`
    : fatigue === 'effort'
      ? '直近2週間で、きつさ5（限界）の種目が半分以上あった'
      : fatigue === 'condition'
        ? '直近2週間で、調子の低い日（2以下）が2回以上あった'
        : undefined
  const deload = deloadReason !== undefined
  if (deload) {
    for (const d of days) for (const s of d.slots) s.sets = Math.max(1, Math.ceil(s.sets / 2))
    notes.push(`${deloadReason}ので、今週は軽めの週（セット数を約半分、重さは据え置き）にしました。`)
  }

  return {
    split, weekStart, days, weeklySetTarget: target, deload, notes,
    ...(deloadReason ? { deloadReason } : {}),
    ...(done.length > 0 ? { done: done.map((d) => ({ date: d.date, muscles: [...d.muscles] })), doneMuscleSets: doneSets } : {}),
  }
}
