import type { CoachChatTurn, CoachReply, CoachRequest } from '../../../api/_lib/schema'
import { buildCoachRequest, type CoachIntent } from '../../coach/context'
import { decideLoad, defaultWeightFor } from '../../coach/load'
import { toProposal } from '../../coach/response'
import { buildSkeleton } from '../../coach/skeleton'
import type { DoneDay, Proposal, Skeleton } from '../../coach/types'
import { countMuscleSets } from '../../coach/volume'
import { validateProposal } from '../../coach/validate'
import type { ChatMessage, Exercise, Profile } from '../../db/types'
import { addDays, formatDateJa, mondayOf, todayKey } from '../../lib/dates'
import { addChatMessage } from '../../repo/chat'
import { saveProfile } from '../../repo/profile'
import { SPLIT_LABELS } from '../../coach/split'
import { loadCoachInputs, type CoachInputs } from '../../repo/coachData'
import { sendToCoach as defaultSend, type SendToCoach } from './client'

export interface AskCoachOptions {
  /** 来週のメニュー／今週の見直し（今日以降）／普通のチャット */
  intent: CoachIntent
  /** 「今日できなかった」：今日は組まずに明日から組み直す */
  skipToday?: boolean
  /** 基準日（テスト用。既定は今日） */
  today?: string
  /** 呼び出し方（テストで差し替える） */
  send?: SendToCoach
}

export const NO_PROFILE_MESSAGE = '先にプロフィールを入力してください。'

/** 依頼の種類ごとの対象週（月曜）。来週＝次の月曜の週、今週の見直しとチャット＝今週と来週を見る */
function targetWeek(intent: CoachIntent, today: string): string {
  const thisWeek = mondayOf(today)
  return intent === 'this_week' ? thisWeek : addDays(thisWeek, 7)
}

/** 対象週に今日までにもう終えたトレーニング（日付ごと）。48時間ルールと週のセット数に数える */
export function doneDaysOf(inputs: CoachInputs, weekStart: string, today: string): DoneDay[] {
  const byDate = new Map<string, { exerciseId: string; sets: number }[]>()
  for (const w of inputs.history.workouts) {
    if (w.date < weekStart || w.date > today) continue
    const list = byDate.get(w.date) ?? []
    for (const x of w.exercises) list.push({ exerciseId: x.exerciseId, sets: x.sets.length })
    byDate.set(w.date, list)
  }
  const byId = new Map(inputs.catalog.map((e) => [e.id, e]))
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, list]) => ({
    date,
    muscles: [...new Set(list.flatMap((x) => {
      const e = byId.get(x.exerciseId)
      return e && e.pattern !== 'cardio' ? (e.primary ?? []) : []
    }))],
    muscleSets: countMuscleSets(list, inputs.catalog),
  }))
}

/**
 * 今週の見直しで組み始める日：「今日できなかった」か、今日のトレーニングをもう終えていれば明日、そうでなければ今日
 */
function startDate(done: DoneDay[], today: string, skipToday: boolean): string {
  return skipToday || done.some((d) => d.date === today) ? addDays(today, 1) : today
}

/**
 * 骨組みを作る。今週の見直し（from あり）は from 以降の日だけで組み、もう終えた日を数える
 */
function skeletonFor(inputs: CoachInputs, profile: Profile, weekStart: string, thisWeek?: { from: string; done: DoneDay[] }): Skeleton {
  return buildSkeleton({
    profile, weekStart, weeksSinceDeload: inputs.weeksSinceDeload,
    slotSetDelta: inputs.slotSetDelta, slotBaseSets: inputs.slotBaseSets, fatigue: inputs.fatigue,
    ...(thisWeek ? { from: thisWeek.from, done: thisWeek.done } : {}),
  })
}

/**
 * 各種目の重さと回数をアプリが決める（設計書「5. 重さの決め方」「6. きつさによる調整」）。
 * セット数の増減（setDelta）は骨組みの段階で反映済みなので、ここでは重さと回数だけを入れる。
 */
function applyLoads(p: Proposal, inputs: CoachInputs, profile: Profile, catalog: Exercise[]): { proposal: Proposal; notes: string[] } {
  const byId = new Map(catalog.map((e) => [e.id, e]))
  const notes = new Set<string>()
  const days = p.days.map((d) => ({
    ...d,
    exercises: d.exercises.map((x) => {
      const ex = byId.get(x.exerciseId)
      if (!ex) return x
      const baseline = profile.baselines.find((b) => b.exerciseId === x.exerciseId)
      const decision = decideLoad({
        history: inputs.sessions[x.exerciseId] ?? [],
        repRange: x.repRange,
        step: inputs.settings.weightStep,
        baseline: baseline ? { weight: baseline.weight, reps: baseline.reps } : undefined,
        logType: ex.logType,
        startWeight: ex.startWeight,
        defaultWeight: defaultWeightFor(ex),
      })
      if ((inputs.sessions[x.exerciseId] ?? []).length === 0 && !baseline && decision.weight !== undefined) notes.add(decision.reason)
      const next = { ...x }
      if (ex.logType !== 'time_distance') next.reps = decision.reps
      if (decision.weight !== undefined) next.weight = decision.weight
      else delete next.weight
      next.weightReason = decision.reason
      return next
    }),
  }))
  return { proposal: { ...p, days }, notes: notes.size ? ['最初は軽めの重さで試して、きつさを記録してください。'] : [] }
}

/**
 * validateProposal（種目・枠・値の範囲・日付の重複／骨組みの日かどうか・48時間・時間・週のセット数）に加えて、
 * 今週の見直しでは今日より前の日付になっていないかを確かめる
 */
function check(p: Proposal, skeleton: Skeleton, inputs: CoachInputs, profile: Profile, earliest?: string): string[] {
  const issues = validateProposal(p, skeleton, inputs.catalog, profile)
  if (earliest) {
    for (const d of p.days) {
      if (d.date < earliest) issues.push(`${formatDateJa(d.date)}は過ぎた日です。${formatDateJa(earliest)}以降の日にしてください。`)
    }
  }
  return issues
}

interface Finalized { proposal: Proposal; issues: string[]; notes: string[] }

/**
 * 普通のチャットの案は、日付が今週なら今週（今日以降）の骨組みで、そうでなければ来週の骨組みでチェックする
 */
interface FinalizeContext {
  inputs: CoachInputs; profile: Profile; skeleton: Skeleton; intent: CoachIntent; today: string
  /** 今週の見直しで組み始める日 */
  from: string
  thisWeek?: { inputs: CoachInputs; skeleton: Skeleton }
}

function finalize(reply: CoachReply, ctx: FinalizeContext): Finalized | undefined {
  if (!reply.proposal) return undefined
  const thisMonday = mondayOf(ctx.today)
  const forThisWeek = ctx.intent === 'this_week'
    || (ctx.intent === 'chat' && ctx.thisWeek !== undefined && reply.proposal.days.some((d) => d.date < addDays(thisMonday, 7)))
  const { inputs, skeleton } = forThisWeek && ctx.thisWeek ? ctx.thisWeek : ctx
  const earliest = forThisWeek ? ctx.from : undefined
  const base = { ...toProposal(reply.proposal, skeleton, inputs.catalog, ctx.profile), deload: skeleton.deload }
  const { proposal, notes } = applyLoads(base, inputs, ctx.profile, inputs.catalog)
  return { proposal, issues: check(proposal, skeleton, inputs, ctx.profile, earliest), notes }
}

/**
 * AIコーチに相談する（設計書「AIとのやりとり」）。
 * 1. 記録を集めて骨組みを作り、AIに渡す情報を組み立てて送る
 * 2. 返事にメニュー案があれば、重さと回数を計算してチェックする
 * 3. 問題があれば、問題の文をつけて1回だけ作り直してもらう。まだ問題があれば issues に入れる
 * 3'. 分割法の変更を頼まれたら（requestedSplit）、プロフィールに保存し、組み直した骨組みでもう一度案を頼む
 * 4. ユーザーのメッセージとAIの返事（メニュー案つき）を保存する
 * 送る前にユーザーのメッセージを保存するので、失敗しても消えない。同じ文で送り直したときは二重に保存しない。
 * 失敗したときは CoachError（または Error）を投げる。
 */
export async function askCoach(userText: string, opts: AskCoachOptions): Promise<ChatMessage> {
  const { intent } = opts
  const today = opts.today ?? todayKey()
  const send = opts.send ?? defaultSend
  const text = userText.trim()

  const weekStart = targetWeek(intent, today)
  const inputs = await loadCoachInputs(weekStart, today)
  const profile = inputs.profile
  if (!profile) throw new Error(NO_PROFILE_MESSAGE)

  // 送る前にユーザーのメッセージを保存する（前回失敗した同じ文の送り直しなら保存しない）
  const last = inputs.chat.at(-1)
  const isResend = last?.role === 'user' && last.text === text
  const prior = isResend ? inputs.chat.slice(0, -1) : inputs.chat
  if (!isResend) await addChatMessage({ role: 'user', text })

  // 今週の見直しは、今週もう終えた日を数えて、今日（終えていれば明日）以降で組み直す
  const thisMonday = mondayOf(today)
  const thisWeekInputs = intent === 'this_week' ? inputs : intent === 'chat' ? await loadCoachInputs(thisMonday, today) : undefined
  const done = thisWeekInputs ? doneDaysOf(thisWeekInputs, thisMonday, today) : []
  const from = startDate(done, today, opts.skipToday ?? false)
  const earliest = intent === 'this_week' || intent === 'chat' ? from : undefined
  const passcode = inputs.settings.coachPasscode ?? ''

  /** 骨組みと、返事を確かめるための材料 */
  const plan = (p: Profile, planIntent: CoachIntent): FinalizeContext => {
    const skeleton = skeletonFor(inputs, p, weekStart, planIntent === 'this_week' ? { from, done } : undefined)
    // 普通のチャットで今週の案が返ってきたときのために、今週（今日以降）の骨組みも用意する
    const thisWeek = planIntent === 'chat' && thisWeekInputs
      ? { inputs: thisWeekInputs, skeleton: skeletonFor(thisWeekInputs, p, thisMonday, { from, done }) }
      : undefined
    return { inputs, profile: p, skeleton, intent: planIntent, today, from, thisWeek }
  }

  /** 送って、案があれば確かめる。問題があれば1回だけ作り直してもらう */
  const round = async (request: CoachRequest, ctx: FinalizeContext) => {
    let reply = await send(request, passcode)
    let result = finalize(reply, ctx)
    if (result && result.issues.length > 0) {
      const fix: CoachChatTurn[] = [
        ...request.messages,
        { role: 'coach', text: JSON.stringify(reply) },
        { role: 'user', text: `メニュー案に次の問題がありました。直したメニュー案を返してください。\n${result.issues.map((s) => `- ${s}`).join('\n')}` },
      ]
      try {
        const retryReply = await send({ ...request, messages: fix }, passcode)
        const retry = finalize(retryReply, ctx)
        if (retry && retry.issues.length <= result.issues.length) {
          reply = retryReply
          result = retry
        }
      } catch {
        // 作り直しに失敗しても、1回目の案を注意点つきで見せる
      }
    }
    return { reply, result }
  }

  const first = plan(profile, intent)
  const request: CoachRequest = buildCoachRequest({
    profile, skeleton: first.skeleton, catalog: inputs.catalog, history: inputs.history, existingPlans: inputs.existingPlans,
    previousSlots: inputs.previousSlots, chat: prior, userText: text, intent, earliestDate: earliest, today,
  })
  const firstRound = await round(request, first)
  let result = firstRound.result
  const messages = [firstRound.reply.message]

  // 分割法の変更を頼まれた：プロフィールに保存し、組み直した骨組みでもう一度案を頼む
  const requested = firstRound.reply.requestedSplit
  if (requested) {
    const updated: Profile = { ...profile, preferredSplit: requested }
    if (profile.preferredSplit !== requested) {
      const { id: _id, updatedAt: _u, ...rest } = updated
      await saveProfile(rest)
    }
    if (requested !== first.skeleton.split) {
      result = undefined // 古い骨組みの案は出さない
      const againIntent: CoachIntent = intent === 'chat' ? 'next_week' : intent
      const again = plan(updated, againIntent)
      const request2 = buildCoachRequest({
        profile: updated, skeleton: again.skeleton, catalog: inputs.catalog, history: inputs.history,
        existingPlans: inputs.existingPlans, previousSlots: inputs.previousSlots,
        chat: [...prior, { role: 'user', text }, { role: 'coach', text: firstRound.reply.message }],
        userText: `分割法を${SPLIT_LABELS[requested]}に変えて、骨組みを組み直しました。新しい骨組みでメニュー案（proposal）を返してください。`,
        intent: againIntent, earliestDate: againIntent === 'next_week' ? undefined : earliest, today,
      })
      try {
        const second = await round(request2, again)
        messages.push(second.reply.message)
        result = second.result
      } catch {
        const ask = intent === 'this_week' ? '今週を見直して' : '来週のメニューを作って'
        messages.push(`新しい分割法のメニュー案は、もう一度「${ask}」と頼んでください。`)
      }
    }
  }

  const extra = result?.notes ?? []
  const message = [...messages, ...extra].filter(Boolean).join('\n\n')
  const proposal = result ? { ...result.proposal, issues: result.issues } : undefined
  return addChatMessage({ role: 'coach', text: message, ...(proposal ? { proposal } : {}) })
}
