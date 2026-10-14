import type { Muscle, Profile } from '../db/types'
import { addDays, formatDateJa, mondayOf } from '../lib/dates'
import { chooseSplit, dayTypeSequence, effectiveDays, scheduleDays, SPLIT_LABELS } from './split'
import { DAY_TITLES, dayTypeMuscles, daySlots } from './templates'
import type { DayPlan, DayType, DoneDay, Skeleton, SlotPlan, SplitType } from './types'
import {
  estimateMuscleSets, fitToTime, isBeginner, isSmallSlot, LARGE_MUSCLES, maxSetsFor, MIN_SLOT_SETS, muscleSetTarget,
  PATTERN_MUSCLES, repScheme, SMALL_MUSCLES, slotMaxSets, startSets, weeklySetTarget,
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

type MuscleSets = Partial<Record<Muscle, number>>
type Target = [number, number]

/** 部位ごとの上限の1.25倍（ふくらはぎ・腹は小さい目標の上限から） */
const capOf = (target: Target, m: Muscle) => muscleSetTarget(target, m)[1] * OVERSHOOT

/** 1セット足したとき、どの部位も上限の1.25倍を超えないか */
function fitsCap(est: MuscleSets, s: SlotPlan, target: Target): boolean {
  const pm = slotMuscles(s)
  return pm.primary.every((m) => (est[m] ?? 0) + 1 <= capOf(target, m))
    && pm.secondary.every((m) => (est[m] ?? 0) + 0.5 <= capOf(target, m))
}

/** 骨組みの見積もりに、もう終えた日のセット数を足す */
function withDone(est: MuscleSets, done: MuscleSets): MuscleSets {
  const out = { ...est }
  for (const [m, v] of Object.entries(done) as [Muscle, number][]) out[m] = (out[m] ?? 0) + v
  return out
}

/** セットを足す部位の順：大きい部位 → ほかの部位 → ふくらはぎ・腹 */
const tier = (m: Muscle) => (LARGE_MUSCLES.includes(m) ? 0 : SMALL_MUSCLES.includes(m) ? 2 : 1)
/** 減らすときに先に見る枠：ふくらはぎ・腹 → 単関節 → 複数関節 */
const trimRank = (s: SlotPlan) => (isSmallSlot(s) ? 0 : s.compound ? 2 : 1)

/**
 * 上限の1.25倍を超えた部位を減らす（複数関節の枠を3セットから始めると、お尻・背中などが重なって超えることがある）。
 * 超えた量が多い部位から、その部位を主に使う枠を1セットずつ減らす（2セットより下にはしない）。
 * 減らす枠は、ふくらはぎ・腹 → 単関節 → 複数関節の順、同じならセット数が多い枠・日の中で後ろの枠・後ろの日
 * （同じ日ばかり減らさない）。
 * ほかの部位を下限より下げてしまう枠は、ほかに減らせる枠がないときだけ使う。
 */
function trimOverCap(days: DayPlan[], target: Target, done: MuscleSets) {
  const all = days.flatMap((d, day) => d.slots.map((s, i) => ({ s, i, day })))
  for (;;) {
    const est = withDone(estimateMuscleSets(all.map((x) => x.s)), done)
    const over = TRAINED_MUSCLES
      .filter((m) => (est[m] ?? 0) > capOf(target, m))
      .sort((a, b) => (est[b] ?? 0) / capOf(target, b) - (est[a] ?? 0) / capOf(target, a))
    let trimmed = false
    for (const m of over) {
      const hurts = (s: SlotPlan) => slotMuscles(s).primary.some((x) => x !== m && (est[x] ?? 0) - 1 < muscleSetTarget(target, x)[0])
      const pick = all
        .filter(({ s }) => slotMuscles(s).primary.includes(m) && s.sets > MIN_SLOT_SETS)
        .sort((a, b) => Number(hurts(a.s)) - Number(hurts(b.s)) || trimRank(a.s) - trimRank(b.s)
          || b.s.sets - a.s.sets || b.i - a.i || b.day - a.day)[0]
      if (pick) { pick.s.sets--; trimmed = true; break }
    }
    if (!trimmed) return
  }
}

/**
 * 枠ごとのセット数を足す（設計書「3. 量・回数・休憩」）。
 * 週のセット数が下限に届かない部位を、大きい部位 → ほかの部位 → ふくらはぎ・腹 の順（同じなら足りない割合が大きい順）に見て、
 * その部位を主に使う枠（複数関節の枠を優先、次にセット数が少ない枠、同じなら先の枠）に1セット足す。
 * ただし枠は4セット（ふくらはぎ・腹は3セット）まで、単関節の枠はその日の複数関節の枠のセット数（一番多いもの）まで、
 * 1日は時間内、どの部位も上限の1.25倍まで。足せなくなるまで繰り返す。
 * ふくらはぎ・腹は小さい目標（半分）で数える。
 */
function distributeSets(days: DayPlan[], target: Target, dayMax: number, done: MuscleSets) {
  const all = days.flatMap((d) => d.slots.map((s, i) => ({ s, day: d, i })))
  const dayTotal = (d: DayPlan) => d.slots.reduce((a, s) => a + s.sets, 0)
  /** 単関節の枠を足しても、その日の複数関節の枠（一番多いもの）より多くならないか */
  const belowCompound = (s: SlotPlan, d: DayPlan) => {
    const compound = d.slots.filter((x) => x.compound).map((x) => x.sets)
    return s.compound || compound.length === 0 || s.sets < Math.max(...compound)
  }
  for (;;) {
    const est = withDone(estimateMuscleSets(days.flatMap((d) => d.slots)), done)
    const min = (m: Muscle) => muscleSetTarget(target, m)[0]
    const short = TRAINED_MUSCLES
      .filter((m) => (est[m] ?? 0) < min(m))
      .sort((a, b) => tier(a) - tier(b) || (est[a] ?? 0) / min(a) - (est[b] ?? 0) / min(b))
    let added = false
    for (const m of short) {
      const pick = all
        .filter(({ s, day }) => slotMuscles(s).primary.includes(m) && s.sets < slotMaxSets(s)
          && dayTotal(day) < dayMax && belowCompound(s, day) && fitsCap(est, s, target))
        .sort((a, b) => Number(b.s.compound) - Number(a.s.compound) || a.s.sets - b.s.sets
          || a.day.date.localeCompare(b.day.date) || a.i - b.i)[0]
      if (pick) { pick.s.sets++; added = true; break }
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
 * 1セット増減する（2〜4の範囲、ふくらはぎ・腹は2〜3。増やすのは1日の時間と週の上限の1.25倍に収まるときだけ）。
 */
function applySetDelta(
  days: DayPlan[], delta: BuildSkeletonArgs['slotSetDelta'], base: BuildSkeletonArgs['slotBaseSets'],
  target: Target, dayMax: number, done: MuscleSets,
) {
  if (!delta && !base) return
  for (const day of days) {
    for (const s of day.slots) {
      const d = delta?.[s.slot] ?? 0
      const prev = base?.[s.slot]
      const want = Math.min(slotMaxSets(s), Math.max(MIN_SLOT_SETS, (prev ?? s.sets) + d))
      while (s.sets > want) s.sets--
      while (s.sets < want) {
        const total = day.slots.reduce((a, x) => a + x.sets, 0)
        const est = withDone(estimateMuscleSets(days.flatMap((x) => x.slots)), done)
        if (total >= dayMax || !fitsCap(est, s, target)) break
        s.sets++
      }
    }
  }
}

/**
 * 1週間分の骨組み（分割法・日付ごとの日の種類・枠・セット数・回数・休憩）を作る。
 * 設計書「メニューの決め方 1〜3・7」。
 * 順番：分割法 → 日の並び（48時間ルール） → 枠（複数関節3・単関節2セット） → 時間に収める
 * → 上限を超えた部位を減らす → 足りない部位に足す
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
      sets: startSets(t),
      ...repScheme(goal, experience, t.compound, i === 0),
      compound: t.compound,
    }))
    return { date, dayType, title: DAY_TITLES[dayType], slots: fitToTime(slots, profile.minutesPerSession, { beginner: isBeginner(experience) }) }
  })

  trimOverCap(days, target, doneSets)
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
