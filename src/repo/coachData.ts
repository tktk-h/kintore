import type { CoachHistory, HistoryWorkout } from '../coach/context'
import { HISTORY_DAYS } from '../coach/context'
import { decideLoad, type PastSession } from '../coach/load'
import { db } from '../db/db'
import type { ChatMessage, Exercise, PlannedWorkout, Profile, SetRecord, Settings, Workout } from '../db/types'
import { addDays, daysBetween, mondayOf, todayKey } from '../lib/dates'
import { valuesOf } from '../lib/setValues'
import { listChatMessages } from './chat'
import { listExercises } from './exercises'
import { getProfile } from './profile'
import { getSettings } from './settings'

export interface CoachInputs {
  profile?: Profile
  /** 削除済みを除いた種目一覧 */
  catalog: Exercise[]
  settings: Settings
  /** 種目ごとの直近4週間の記録（重さの計算・きつさによる調整に使う） */
  sessions: Record<string, PastSession[]>
  /** AIに渡す記録の要約 */
  history: CoachHistory
  /** 対象週の既存の予定 */
  existingPlans: PlannedWorkout[]
  /** 前のAIの週の、枠ごとの種目（枠ID → 種目ID） */
  previousSlots: Partial<Record<string, string>>
  /** 前のAIの週の枠ごとの、きつさによるセット数の増減 */
  slotSetDelta: Partial<Record<string, -1 | 0 | 1>>
  /** 前回の軽めの週から何週たったか */
  weeksSinceDeload: number
  chat: ChatMessage[]
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order
const weeksBetween = (from: string, to: string) => Math.max(0, Math.floor(daysBetween(mondayOf(from), mondayOf(to)) / 7))

/**
 * 1回分の記録を PastSession にする。
 * weight は完了セットの一番重い重さ、repsPerSet はその重さで行った完了セットの回数（ウォームアップを除くため）。
 * targetReps は予定から始めたなら予定の回数、なければ一番多い回数。
 */
function toSession(date: string, sets: SetRecord[], plannedReps: number | undefined, effort: PastSession['effort']): PastSession {
  const top = Math.max(...sets.map((s) => s.weight ?? 0))
  const working = sets.filter((s) => (s.weight ?? 0) === top)
  const repsPerSet = working.map((s) => s.reps ?? 0)
  const session: PastSession = { date, weight: top, repsPerSet, targetReps: plannedReps ?? Math.max(...repsPerSet) }
  if (effort !== undefined) session.effort = effort
  return session
}

/** 前のAIの週（対象週より前で一番新しいAIの予定がある週）の予定 */
function lastAiWeek(aiPlans: PlannedWorkout[], weekStart: string): PlannedWorkout[] {
  const before = aiPlans.filter((p) => p.date < weekStart)
  if (before.length === 0) return []
  const latest = mondayOf(before.reduce((a, p) => (p.date > a ? p.date : a), before[0].date))
  return before.filter((p) => mondayOf(p.date) === latest).sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * 骨組みとAIへの依頼に必要な記録をDBから集める（設計書「AIに渡す情報」）。
 * @param weekStart 対象週（その週の月曜にそろえる）
 * @param today 記録の要約の基準日
 */
export async function loadCoachInputs(weekStart: string, today = todayKey()): Promise<CoachInputs> {
  const monday = mondayOf(weekStart)
  const weekEnd = addDays(monday, 6)
  const since = addDays(today, -HISTORY_DAYS)
  const [profile, catalog, settings, chat] = await Promise.all([getProfile(), listExercises(), getSettings(), listChatMessages()])
  const allCatalog = await db.exercises.toArray()
  const exById = new Map(allCatalog.map((e) => [e.id, e]))

  // 直近4週間の終了したトレーニング
  const workouts: Workout[] = (await db.workouts.where('date').between(since, today, true, true).toArray())
    .filter((w) => !w.deleted && w.finishedAt !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date) || a.startedAt - b.startedAt)
  const planIds = [...new Set(workouts.map((w) => w.plannedWorkoutId).filter((id): id is string => !!id))]
  const sourcePlans = new Map((await db.plannedWorkouts.bulkGet(planIds)).filter((p) => p).map((p) => [p!.id, p!]))

  const sessions: Record<string, PastSession[]> = {}
  const historyWorkouts: HistoryWorkout[] = []
  for (const w of workouts) {
    const wes = (await db.workoutExercises.where('workoutId').equals(w.id).toArray()).filter((we) => !we.deleted).sort(byOrder)
    const sets = (await db.sets.where('workoutId').equals(w.id).toArray()).filter((s) => !s.deleted && s.done).sort(byOrder)
    const plan = w.plannedWorkoutId ? sourcePlans.get(w.plannedWorkoutId) : undefined
    const entry: HistoryWorkout = { date: w.date, exercises: [] }
    if (w.title) entry.title = w.title
    if (w.condition) entry.condition = w.condition
    for (const we of wes) {
      const done = sets.filter((s) => s.workoutExerciseId === we.id)
      if (done.length === 0) continue
      entry.exercises.push({ exerciseId: we.exerciseId, sets: done.map(valuesOf), ...(we.effort ? { effort: we.effort } : {}) })
      const plannedReps = plan?.exercises.find((pe) => pe.exerciseId === we.exerciseId)?.sets.find((s) => s.reps !== undefined)?.reps
      ;(sessions[we.exerciseId] ??= []).push(toSession(w.date, done, plannedReps, we.effort))
    }
    if (entry.exercises.length) historyWorkouts.push(entry)
  }
  for (const list of Object.values(sessions)) list.sort((a, b) => b.date.localeCompare(a.date))

  const plans = (await db.plannedWorkouts.toArray()).filter((p) => !p.deleted)
  // 予定があったのに実施しなかった日（今日はまだ終わっていないので含めない）
  const doneDates = new Set(workouts.map((w) => w.date))
  const missed = plans
    .filter((p) => p.date >= since && p.date < today && !doneDates.has(p.date))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => ({ date: p.date, title: p.title }))
  const existingPlans = plans.filter((p) => p.date >= monday && p.date <= weekEnd).sort((a, b) => a.date.localeCompare(b.date))

  // 前のAIの週の枠ごとの種目と、きつさによるセット数の増減（同じ枠が複数日あれば後の日を使う）
  const aiPlans = plans.filter((p) => p.source === 'ai')
  const previousSlots: Partial<Record<string, string>> = {}
  const slotSetDelta: Partial<Record<string, -1 | 0 | 1>> = {}
  for (const p of lastAiWeek(aiPlans, monday)) {
    for (const pe of p.exercises) {
      if (!pe.slot) continue
      previousSlots[pe.slot] = pe.exerciseId
      const ex = exById.get(pe.exerciseId)
      const history = sessions[pe.exerciseId] ?? []
      if (!ex || history.length === 0) { slotSetDelta[pe.slot] = 0; continue }
      const reps = pe.sets.find((s) => s.reps !== undefined)?.reps ?? 10
      const d = decideLoad({ history, repRange: pe.repRange ?? [reps, reps], step: settings.weightStep, logType: ex.logType })
      slotSetDelta[pe.slot] = d.setDelta
    }
  }

  // 前回の軽めの週からの週数（なければ最初のAIの週から。AIの予定がなければ0）。対象週より前の予定だけで数える
  const aiBefore = aiPlans.filter((p) => p.date < monday)
  const deloads = aiBefore.filter((p) => p.deload).map((p) => p.date).sort()
  const firstAi = aiBefore.map((p) => p.date).sort()[0]
  const weeksSinceDeload = deloads.length ? weeksBetween(deloads[deloads.length - 1], monday) : firstAi ? weeksBetween(firstAi, monday) : 0

  return {
    profile, catalog, settings, sessions,
    history: { workouts: historyWorkouts, missed },
    existingPlans, previousSlots, slotSetDelta, weeksSinceDeload, chat,
  }
}
