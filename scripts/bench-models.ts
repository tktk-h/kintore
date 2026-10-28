/**
 * Gemini のモデルごとの返事の速さを測る（手元のPCで動かす。アプリには入らない）。
 * 本番と同じ形の「来週のメニューを作って」を、使える Flash / Flash-Lite モデルに1回ずつ同時に送る。
 *
 * 使い方（PowerShell）：
 *   $env:GEMINI_API_KEY = "（自分のキー）"; npm run bench:models
 * キーはログにも結果にも出さない。
 */
import { DEFAULT_THINKING_BUDGET, generate, listModels, rateLimitFallbacks } from '../api/_lib/gemini'
import { parseCoachReply } from '../api/_lib/schema'
import { buildCoachRequest } from '../src/coach/context'
import { buildSkeleton } from '../src/coach/skeleton'
import { seedExercises } from '../src/db/seedExercises'
import type { Profile } from '../src/db/types'
import { addDays, mondayOf, todayKey } from '../src/lib/dates'

// @types/node を入れていないので、使う分だけ型を書く
declare const process: { env: Record<string, string | undefined>; exitCode?: number }

/** 1つのモデルを待つ上限（Vercel 関数の上限と同じ） */
const TIMEOUT_MS = 300_000

// 本番の依頼に近い形：週4回・60分・ジム、記録なし
const profile: Profile = {
  id: 'me', goal: 'hypertrophy', experience: 'y1_3', daysPerWeek: 4, minutesPerSession: 60,
  weekdays: [1, 2, 4, 5], equipment: ['gym_free', 'gym_machine'], injuries: '', baselines: [], updatedAt: 0,
}
const today = todayKey()
const skeleton = buildSkeleton({ profile, weekStart: addDays(mondayOf(today), 7), weeksSinceDeload: 1 })
const request = buildCoachRequest({
  profile, skeleton, catalog: seedExercises(), history: { workouts: [], missed: [] }, existingPlans: [],
  chat: [], userText: '来週のメニューを作って', intent: 'next_week', today,
})

const seconds = (started: number) => ((Date.now() - started) / 1000).toFixed(1).padStart(6)

async function measure(apiKey: string, model: string, timeout: Promise<'timeout'>): Promise<string> {
  const started = Date.now()
  try {
    const res = await Promise.race([generate({ apiKey, model, thinkingBudget: DEFAULT_THINKING_BUDGET, ...request }, model), timeout])
    if (res === 'timeout') return `${seconds(started)}s  時間切れ`
    if (!res.ok) return `${seconds(started)}s  失敗 ${res.status}`
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
      usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number }
    }
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    let valid = true
    try { parseCoachReply(text) } catch { valid = false }
    const u = data.usageMetadata ?? {}
    return `${seconds(started)}s  成功${valid ? '' : '（形が違う）'}  考えた ${u.thoughtsTokenCount ?? 0} / 出力 ${u.candidatesTokenCount ?? '?'} トークン`
  } catch (e) {
    return `${seconds(started)}s  通信エラー (${e instanceof Error ? e.name : typeof e})`
  }
}

// Windows では通信の直後に process.exit すると Node が落ちるので、exitCode を入れて自然に終わらせる
async function main(apiKey: string | undefined): Promise<number> {
  if (!apiKey) {
    console.error('GEMINI_API_KEY を環境変数に入れてから実行してください')
    return 1
  }
  const models = rateLimitFallbacks(await listModels(apiKey))
  if (models.length === 0) {
    console.error('使えるモデルが見つかりませんでした（キーが違う可能性があります）')
    return 1
  }
  // generate がモデルごとに出すログは、表と重なるので出さない
  console.log = () => {}
  console.info(`${models.length} 個のモデルに同時に送ります（最大 ${TIMEOUT_MS / 1000} 秒待ちます）…`)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), TIMEOUT_MS) })
  const results = await Promise.all(models.map(async (m) => [m, await measure(apiKey, m, timeout)] as const))
  clearTimeout(timer)
  for (const [m, line] of results) console.info(`${m.padEnd(28)} ${line}`)
  return 0
}

process.exitCode = await main(process.env.GEMINI_API_KEY?.trim())
