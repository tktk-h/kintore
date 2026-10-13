import type { CoachChatTurn, CoachReply, CoachRequest } from '../../../api/_lib/schema'
import { buildCoachRequest, type CoachIntent } from '../../coach/context'
import { decideLoad, defaultWeightFor } from '../../coach/load'
import { toProposal } from '../../coach/response'
import { buildSkeleton } from '../../coach/skeleton'
import type { Proposal, Skeleton } from '../../coach/types'
import { validateProposal } from '../../coach/validate'
import type { ChatMessage, Exercise, Profile } from '../../db/types'
import { addDays, formatDateJa, mondayOf, todayKey } from '../../lib/dates'
import { addChatMessage } from '../../repo/chat'
import { loadCoachInputs, type CoachInputs } from '../../repo/coachData'
import { sendToCoach as defaultSend, type SendToCoach } from './client'

export interface AskCoachOptions {
  /** 来週のメニュー／今週の見直し（今日以降）／普通のチャット */
  intent: CoachIntent
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

/** 骨組みを作る。今週の見直しは今日以降の日だけにする */
function skeletonFor(inputs: CoachInputs, profile: Profile, weekStart: string, earliest?: string): Skeleton {
  const s = buildSkeleton({ profile, weekStart, weeksSinceDeload: inputs.weeksSinceDeload, slotSetDelta: inputs.slotSetDelta })
  return earliest ? { ...s, days: s.days.filter((d) => d.date >= earliest) } : s
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
        defaultWeight: defaultWeightFor(ex),
      })
      if ((inputs.sessions[x.exerciseId] ?? []).length === 0 && !baseline && ex.logType === 'weight_reps') notes.add(decision.reason)
      const next = { ...x }
      if (ex.logType !== 'time_distance') next.reps = decision.reps
      if (decision.weight !== undefined) next.weight = decision.weight
      else delete next.weight
      return next
    }),
  }))
  return { proposal: { ...p, days }, notes: notes.size ? ['最初は軽めの重さで試して、きつさを記録してください。'] : [] }
}

/** validateProposal に加えて、今日より前の日付と、骨組みにない日付を確かめる */
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
function finalize(reply: CoachReply, ctx: {
  inputs: CoachInputs; profile: Profile; skeleton: Skeleton; intent: CoachIntent; today: string
  thisWeek?: { inputs: CoachInputs; skeleton: Skeleton }
}): Finalized | undefined {
  if (!reply.proposal) return undefined
  const thisMonday = mondayOf(ctx.today)
  const forThisWeek = ctx.intent === 'this_week'
    || (ctx.intent === 'chat' && ctx.thisWeek !== undefined && reply.proposal.days.some((d) => d.date < addDays(thisMonday, 7)))
  const { inputs, skeleton } = forThisWeek && ctx.thisWeek ? ctx.thisWeek : ctx
  const earliest = forThisWeek ? ctx.today : undefined
  const base = { ...toProposal(reply.proposal, skeleton, inputs.catalog), deload: skeleton.deload }
  const { proposal, notes } = applyLoads(base, inputs, ctx.profile, inputs.catalog)
  return { proposal, issues: check(proposal, skeleton, inputs, ctx.profile, earliest), notes }
}

/**
 * AIコーチに相談する（設計書「AIとのやりとり」）。
 * 1. 記録を集めて骨組みを作り、AIに渡す情報を組み立てて送る
 * 2. 返事にメニュー案があれば、重さと回数を計算してチェックする
 * 3. 問題があれば、問題の文をつけて1回だけ作り直してもらう。まだ問題があれば issues に入れる
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

  const earliest = intent === 'this_week' || intent === 'chat' ? today : undefined
  const skeleton = skeletonFor(inputs, profile, weekStart, intent === 'this_week' ? today : undefined)
  // 普通のチャットで今週の案が返ってきたときのために、今週（今日以降）の骨組みも用意する
  const thisWeek = intent === 'chat'
    ? await (async () => {
      const i = await loadCoachInputs(mondayOf(today), today)
      return { inputs: i, skeleton: skeletonFor(i, profile, mondayOf(today), today) }
    })()
    : undefined

  const request: CoachRequest = buildCoachRequest({
    profile, skeleton, catalog: inputs.catalog, history: inputs.history, existingPlans: inputs.existingPlans,
    previousSlots: inputs.previousSlots, chat: prior, userText: text, intent, earliestDate: earliest, today,
  })
  const passcode = inputs.settings.coachPasscode ?? ''
  const ctx = { inputs, profile, skeleton, intent, today, thisWeek }

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

  const extra = result?.notes ?? []
  const message = [reply.message, ...extra].filter(Boolean).join('\n\n')
  const proposal = result ? { ...result.proposal, issues: result.issues } : undefined
  return addChatMessage({ role: 'coach', text: message, ...(proposal ? { proposal } : {}) })
}
