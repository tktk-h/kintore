import type { CoachChatTurn, CoachRequest } from '../../api/_lib/schema'
import {
  EQUIPMENT_LABELS, MOVEMENT_PATTERN_LABELS, type ChatMessage, type Equipment, type EquipmentAccess, type Exercise,
  type MovementPattern, type PlannedWorkout, type Profile, type Rating, type SetValues,
} from '../db/types'
import { addDays, todayKey } from '../lib/dates'
import { SPLIT_LABELS } from './split'
import type { Skeleton } from './types'

/** 依頼の種類：来週のメニュー／今週の見直し（今日以降）／普通のチャット（提案するかはAIが決める） */
export type CoachIntent = 'next_week' | 'this_week' | 'chat'

/** 記録の要約に使う1回分のトレーニング */
export interface HistoryWorkout {
  date: string
  title?: string
  /** その日の調子 */
  condition?: Rating
  exercises: { exerciseId: string; sets: SetValues[]; effort?: Rating }[]
}

export interface CoachHistory {
  workouts: HistoryWorkout[]
  /** 予定があったのに実施しなかった日 */
  missed: { date: string; title: string }[]
}

export interface BuildCoachRequestArgs {
  profile: Profile
  skeleton: Skeleton
  catalog: Exercise[]
  history: CoachHistory
  /** 対象週の既存の予定 */
  existingPlans: PlannedWorkout[]
  /** 前の週のAIの予定で、枠ごとに使った種目（枠ID → 種目ID） */
  previousSlots?: Partial<Record<string, string>>
  /** これまでのチャット（古い順） */
  chat: Pick<ChatMessage, 'role' | 'text'>[]
  userText: string
  intent?: CoachIntent
  /** この日付より前の日は提案しない（今週の見直しで今日を入れる） */
  earliestDate?: string
  /** 記録の要約の基準日（既定は今日） */
  today?: string
}

/** 記録の要約に入れる期間 */
export const HISTORY_DAYS = 28
/** AIに渡すチャットの件数（今回のメッセージを含む） */
export const MAX_CHAT_MESSAGES = 20
/** AIに渡す情報全体の上限（バイト。サーバーの上限 100KB より小さく） */
export const MAX_CONTEXT_BYTES = 60 * 1024

/** 使える器具ごとに、選んでよい種目の器具 */
const ACCESS_EQUIPMENT: Record<EquipmentAccess, Equipment[]> = {
  gym_free: ['barbell', 'dumbbell', 'bodyweight', 'other'],
  gym_machine: ['machine', 'cable', 'bodyweight'],
  home_dumbbell: ['dumbbell', 'bodyweight', 'other'],
  bodyweight: ['bodyweight'],
}

export function allowedEquipment(access: EquipmentAccess[]): Equipment[] {
  const set = new Set<Equipment>(access.flatMap((a) => ACCESS_EQUIPMENT[a] ?? []))
  if (set.size === 0) set.add('bodyweight')
  return [...set]
}

/**
 * ケガや痛む所（自由記入）から、候補から外す動き。言葉が見つかったものだけ外す。
 * 外しきれないものはAIにケガの内容を伝えて避けてもらう。
 */
const INJURY_RULES: { words: string[]; patterns: MovementPattern[]; label: string }[] = [
  { words: ['肩'], patterns: ['vertical_push', 'side_delt'], label: '肩' },
  { words: ['腰'], patterns: ['hinge'], label: '腰' },
  { words: ['膝', 'ひざ', 'ヒザ'], patterns: ['single_leg', 'quad_isolation'], label: '膝' },
  { words: ['肘', 'ひじ', 'ヒジ'], patterns: ['triceps'], label: '肘' },
]

export function injuryExcludedPatterns(injuries: string): MovementPattern[] {
  return [...new Set(INJURY_RULES.filter((r) => r.words.some((w) => injuries.includes(w))).flatMap((r) => r.patterns))]
}

/**
 * 枠の動きに合う種目の候補（削除済みを除き、使える器具とケガで絞る）。
 * 腰を痛めているときはバーベルのスクワット系も外す。
 */
export function candidatesFor(patterns: MovementPattern[], catalog: Exercise[], profile: Profile): Exercise[] {
  const equipment = allowedEquipment(profile.equipment)
  const excluded = injuryExcludedPatterns(profile.injuries)
  const lowBack = INJURY_RULES[1].words.some((w) => profile.injuries.includes(w))
  return catalog.filter((e) =>
    !e.deleted && e.pattern !== undefined && patterns.includes(e.pattern) && !excluded.includes(e.pattern)
    && equipment.includes(e.equipment) && !(lowBack && e.pattern === 'squat' && e.equipment === 'barbell'))
}

export const GOAL_LABELS: Record<Profile['goal'], string> = { hypertrophy: '筋肥大', strength: '筋力アップ', fat_loss: '減量', health: '健康維持' }
export const EXPERIENCE_LABELS: Record<Profile['experience'], string> = { none: '初めて', under_1y: '1年未満', y1_3: '1〜3年', over_3y: '3年以上' }
export const ACCESS_LABELS: Record<EquipmentAccess, string> = {
  gym_free: 'ジムのフリーウェイト', gym_machine: 'ジムのマシン', home_dumbbell: '自宅のダンベル', bodyweight: '自重のみ',
}
const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

export const COACH_SYSTEM_PROMPT = [
  'あなたは筋力トレーニングのコーチです。返事はすべて日本語で、短く分かりやすく書いてください。',
  '週のメニューの骨組み（分割法・日付・各日の枠・枠ごとのセット数・回数・休憩）はアプリが根拠のあるルールで決めています。あなたの役割は、枠ごとに種目を1つ選び、骨組みの範囲内で調整し、理由を説明することです。',
  '守るルール：',
  '- 種目は、その枠の候補（slots[].candidates の id）からだけ選ぶ。候補が空の枠は入れない。',
  '- 重さを伸ばしていけるように、前の週にその枠で使った種目（slots[].previous）を続ける。変えるのは、伸びが止まったとき、本人が頼んだとき、ケガや器具の事情があるときだけ。',
  '- ケガや痛む所に負担がかかる種目は避ける。',
  '- 骨組みの日付・枠・セット数・回数・休憩を守る。セット数は1種目2〜4（軽めの週は半分）、1日の合計は「1セット約3分」で1回の時間に収める。',
  '- 部位ごとの週のセット数は目標（主に使う部位1、補助0.5で数える）に収める。同じ部位の日の間は48時間以上あける。',
  '- 重さはアプリが計算するので、決めなくてよい。',
  '- 分割法の変更を頼まれたら、message で受け付けたことを伝える（アプリが組み直す）。',
  '- proposal の date は YYYY-MM-DD、slot は骨組みの枠のID、exerciseId は候補のID をそのまま使う。',
  '- reasons には、この構成にした理由を短く書く。message にはチャットに出す返事を書く。',
].join('\n')

function intentText(intent: CoachIntent, earliestDate: string | undefined): string {
  const from = earliestDate ? `${earliestDate} 以降の日付だけで` : ''
  switch (intent) {
    case 'next_week':
      return '対象週のメニュー案（proposal）を必ず返してください。'
    case 'this_week':
      return `今週の残りの日について、${from}メニュー案（proposal）を必ず返してください。`
    case 'chat':
      return `メニューを作る・直す必要があるときだけ proposal を返してください（日付は${from || '対象週の中で'}）。質問や相談だけなら message だけで答えてください。`
  }
}

function formatSet(s: SetValues): string {
  if (s.durationSec !== undefined || s.distanceKm !== undefined) {
    return [s.durationSec !== undefined ? `${Math.round(s.durationSec / 60)}分` : '', s.distanceKm !== undefined ? `${s.distanceKm}km` : '']
      .filter(Boolean).join('・')
  }
  if (s.weight) return `${s.weight}kg×${s.reps ?? 0}`
  return `${s.reps ?? 0}回`
}

const byteLength = (s: string) => new TextEncoder().encode(s).length
export const requestBytes = (r: CoachRequest) => byteLength(JSON.stringify(r))

/**
 * AIに渡す情報を組み立てる（設計書「AIに渡す情報」）。
 * - system：役割と守るルール
 * - context：プロフィール、骨組み、枠ごとの候補と前の週の種目、直近4週間の記録の要約、対象週の既存の予定（JSON）
 * - messages：直近のチャット（今回のメッセージを含めて最大20件）
 * 全体が上限を超えるときは、古い記録 → 古いチャットの順に減らす。
 */
export function buildCoachRequest(args: BuildCoachRequestArgs): CoachRequest {
  const { profile, skeleton, catalog, existingPlans, previousSlots = {}, userText, intent = 'chat', earliestDate } = args
  const today = args.today ?? todayKey()
  const since = addDays(today, -HISTORY_DAYS)
  const names = new Map(catalog.map((e) => [e.id, e.name]))
  const name = (id: string) => names.get(id) ?? id

  // 枠ごとの候補（同じIDの枠は1つにまとめる）
  const slotIds: string[] = []
  const slotPatterns = new Map<string, MovementPattern[]>()
  for (const d of skeleton.days) {
    for (const s of d.slots) {
      if (!slotPatterns.has(s.slot)) { slotIds.push(s.slot); slotPatterns.set(s.slot, s.patterns) }
    }
  }
  const slots = slotIds.map((id) => {
    const patterns = slotPatterns.get(id)!
    const prev = previousSlots[id]
    return {
      slot: id,
      movement: patterns.map((p) => MOVEMENT_PATTERN_LABELS[p]).join('か'),
      candidates: candidatesFor(patterns, catalog, profile).map((e) => ({ id: e.id, name: e.name, equipment: EQUIPMENT_LABELS[e.equipment] })),
      ...(prev ? { previous: { id: prev, name: name(prev) } } : {}),
    }
  })

  let workouts = args.history.workouts
    .filter((w) => w.date >= since && w.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((w) => ({
      date: w.date,
      ...(w.title ? { title: w.title } : {}),
      ...(w.condition ? { condition: w.condition } : {}),
      exercises: w.exercises.map((x) => ({
        name: name(x.exerciseId),
        id: x.exerciseId,
        sets: x.sets.map(formatSet).join(', '),
        ...(x.effort ? { effort: x.effort } : {}),
      })),
    }))
  const missed = args.history.missed.filter((m) => m.date >= since && m.date <= today)

  const weekEnd = addDays(skeleton.weekStart, 6)
  const plans = existingPlans
    .filter((p) => !p.deleted && p.date >= skeleton.weekStart && p.date <= weekEnd)
    .map((p) => ({ date: p.date, title: p.title, source: p.source, exercises: p.exercises.map((x) => name(x.exerciseId)) }))

  const makeContext = () => JSON.stringify({
    today,
    request: intentText(intent, earliestDate),
    profile: {
      goal: GOAL_LABELS[profile.goal],
      experience: EXPERIENCE_LABELS[profile.experience],
      daysPerWeek: profile.daysPerWeek,
      minutesPerSession: profile.minutesPerSession,
      weekdays: profile.weekdays.map((w) => WEEKDAY_LABELS[w]),
      equipment: profile.equipment.map((a) => ACCESS_LABELS[a]),
      injuries: profile.injuries || 'なし',
    },
    skeleton: {
      split: skeleton.split,
      splitLabel: SPLIT_LABELS[skeleton.split],
      weekStart: skeleton.weekStart,
      weeklySetTarget: skeleton.weeklySetTarget,
      deload: skeleton.deload,
      notes: skeleton.notes,
      ...(skeleton.done ? { done: skeleton.done } : {}),
      days: skeleton.days.map((d) => ({
        date: d.date,
        title: d.title,
        slots: d.slots.map((s) => ({ slot: s.slot, sets: s.sets, repRange: s.repRange, restSec: s.restSec })),
      })),
    },
    slots,
    history: { note: '直近4週間。effort はきつさ（1楽〜5限界）、condition はその日の調子（1〜5）', workouts, missed },
    existingPlans: plans,
  })

  const turns: CoachChatTurn[] = args.chat
    .filter((m) => m.text.trim() !== '')
    .map((m) => ({ role: m.role, text: m.text }))
  let messages: CoachChatTurn[] = [...turns.slice(-(MAX_CHAT_MESSAGES - 1)), { role: 'user', text: userText }]
  // Gemini は最初の発言がユーザーである必要がある
  while (messages.length > 1 && messages[0].role !== 'user') messages = messages.slice(1)

  let request: CoachRequest = { system: COACH_SYSTEM_PROMPT, context: makeContext(), messages }
  while (requestBytes(request) > MAX_CONTEXT_BYTES) {
    if (workouts.length > 0) workouts = workouts.slice(1)
    else if (messages.length > 1) {
      messages = messages.slice(1)
      while (messages.length > 1 && messages[0].role !== 'user') messages = messages.slice(1)
    } else break
    request = { system: COACH_SYSTEM_PROMPT, context: makeContext(), messages }
  }
  return request
}
