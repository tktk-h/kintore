/**
 * Gemini の呼び出し。別のAIに乗り換えるときはこのファイルだけ替える。
 */
import { COACH_REPLY_SCHEMA, parseCoachReply, type CoachChatTurn, type CoachReply } from './schema.js'

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * Gemini の呼び出しの失敗。kind で返し方を決める。
 * detail はログ用の短い理由（キーは伏せてある。アプリには返さない）
 */
export class GeminiError extends Error {
  constructor(public kind: 'rate_limited' | 'busy' | 'upstream' | 'invalid', public status?: number, public detail?: string) {
    super(kind === 'rate_limited' ? 'rate limited' : kind === 'busy' ? 'model busy' : kind === 'invalid' ? 'invalid reply' : `upstream error${status ? ` ${status}` : ''}`)
    this.name = 'GeminiError'
  }
}

export interface CallGeminiArgs {
  apiKey: string
  model: string
  system: string
  context: string
  messages: CoachChatTurn[]
  /**
   * 考える量（トークン）。返事を速くするため既定は少なめ。undefined なら送らない（モデルの既定）。
   * 対応していないモデルで 400 になったときは、外して1回だけ送り直す。
   */
  thinkingBudget?: number
  /** 混み合っているときに送り直すまで待つ時間（ミリ秒）。既定 2000 */
  retryDelayMs?: number
}

/** 既定の考える量。メニューは骨組みが決まっているので多くは要らない */
export const DEFAULT_THINKING_BUDGET = 1024

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  usageMetadata?: { promptTokenCount?: number; thoughtsTokenCount?: number; candidatesTokenCount?: number }
}

interface ModelList {
  models?: { name?: string; supportedGenerationMethods?: string[] }[]
}

/** ログに出す前に、キーを伏せて短くする */
function redact(text: string, apiKey: string): string {
  const masked = apiKey ? text.split(apiKey).join('***') : text
  return masked.length > 200 ? `${masked.slice(0, 200)}…` : masked
}

/** Gemini のエラー本文から理由（error.message）を取り出す */
async function errorDetail(res: Response, apiKey: string): Promise<string | undefined> {
  try {
    const data = (await res.json()) as { error?: { message?: unknown } }
    return typeof data.error?.message === 'string' ? redact(data.error.message, apiKey) : undefined
  } catch {
    return undefined
  }
}

/** バージョン番号を取り出す（例：gemini-2.5-flash → 2.5）。比べるのに使う */
function versionOf(name: string): number {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(name)
  return m ? Number(m[1]) : 0
}

/**
 * 使えるモデルの中から、メニュー作りに向いた Flash モデルを新しい順に並べる。
 * lite・音声・画像・試験版などは除く
 */
export function flashModels(list: ModelList): string[] {
  return flashFamily(list, false)
}

/**
 * 上限（429）のときに試す順：Flash モデル（新しい順）、そのあと最後の手段として Flash-Lite モデル（新しい順）。
 * モデルごとに無料枠の1日の上限が別なので、ほかのモデルなら通ることがある
 */
export function rateLimitFallbacks(list: ModelList): string[] {
  return [...flashFamily(list, false), ...flashFamily(list, true)]
}

function flashFamily(list: ModelList, lite: boolean): string[] {
  const names = (list.models ?? [])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => (m.name ?? '').replace(/^models\//, ''))
    .filter((n) => /flash/.test(n) && /lite/.test(n) === lite && !/(tts|audio|image|live|exp|thinking|embedding)/.test(n))
  return names.sort((a, b) => versionOf(b) - versionOf(a) || a.length - b.length)
}

/** いちばん新しい Flash モデル */
export function pickFlashModel(list: ModelList): string | undefined {
  return flashModels(list)[0]
}

/** 見つからなかったモデル名 → 代わりに見つけたモデル名。同じ関数のインスタンスが続く間は探し直さない */
const resolvedModels = new Map<string, string>()

/** 混み合っている・一時的な不調のステータス（時間をおけば通ることが多い） */
const isBusy = (status: number) => status === 503 || status === 504

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function callGemini(args: CallGeminiArgs): Promise<CoachReply> {
  const { apiKey } = args
  const delay = args.retryDelayMs ?? 2000
  const started = Date.now()
  const callsBefore = generateCalls
  let model = resolvedModels.get(args.model) ?? args.model
  let res = await generate(args, model)

  // モデルが見つからない（提供が終わった・名前が違う）なら、使える Flash モデルを探して1回だけ送り直す
  if (res.status === 404) {
    const found = (await listFlashModels(apiKey))[0]
    if (found && found !== model) {
      resolvedModels.set(args.model, found)
      console.error(`coach: model ${args.model} not found, using ${found}`)
      model = found
      res = await generate(args, model)
    }
  }

  // 混み合っているときは、少し待って同じモデルでもう一度、それでもだめなら1つ前の世代の Flash モデルで試す
  if (isBusy(res.status)) {
    console.error(`coach: model ${model} busy (${res.status}), retrying`)
    await sleep(delay)
    res = await generate(args, model)
  }
  if (isBusy(res.status)) {
    const list = await listFlashModels(apiKey)
    const older = list.slice(list.indexOf(model) + 1)[0] ?? list.find((m) => m !== model)
    if (older) {
      console.error(`coach: model ${model} still busy, trying ${older}`)
      await sleep(delay)
      model = older
      res = await generate(args, model)
    }
  }

  // 上限（429）なら、ほかの Flash モデル（最後に Flash-Lite）を順に試す。モデルごとに無料枠の上限が別なため。
  // 通ったモデルは覚えておき、同じインスタンスの次の呼び出しでは最初からそれを使う
  if (res.status === 429) {
    const tried = new Set([args.model, model])
    const candidates = rateLimitFallbacks(await listModels(apiKey)).filter((m) => !tried.has(m))
    for (const next of candidates) {
      console.error(`coach: model ${model} rate limited, trying ${next}`)
      model = next
      res = await generate(args, model)
      if (res.status !== 429 && !isBusy(res.status)) break
    }
    if (res.ok) resolvedModels.set(args.model, model)
  }

  if (isBusy(res.status)) throw new GeminiError('busy', res.status, await errorDetail(res, apiKey))
  if (res.status === 429) throw new GeminiError('rate_limited', 429, await errorDetail(res, apiKey))
  if (!res.ok) throw new GeminiError('upstream', res.status, await errorDetail(res, apiKey))

  let data: GeminiResponse
  try {
    data = (await res.json()) as GeminiResponse
  } catch {
    throw new GeminiError('invalid', undefined, 'response is not JSON')
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!text) throw new GeminiError('invalid', undefined, 'empty reply')
  try {
    const reply = parseCoachReply(text)
    // どのモデルが、何秒・何回の呼び出し・何トークンで答えたかを残す（切り替えと遅さの確認用。キー・本文は出さない）
    const u = data.usageMetadata ?? {}
    console.log(`coach: answered by ${model} in ${Date.now() - started}ms (calls ${generateCalls - callsBefore}, prompt ${u.promptTokenCount ?? '?'}, thoughts ${u.thoughtsTokenCount ?? 0}, output ${u.candidatesTokenCount ?? '?'})`)
    return reply
  } catch {
    throw new GeminiError('invalid', undefined, 'reply does not match the schema')
  }
}

/**
 * 考える量の指定。Gemini 2 系までは thinkingBudget（トークン数）、3 系からは thinkingLevel で指定する。
 * 3 系は指定しないと一番多く考える（high）ので遅い。メニュー作りは骨組みが決まっているので low で足りる
 */
export function thinkingConfigFor(model: string, budget: number | undefined): Record<string, unknown> {
  return /gemini-[12][.-]/.test(model) ? { thinkingBudget: budget } : { thinkingLevel: 'low' }
}

/** generateContent を送った回数（ログで1回の依頼に何回送ったかを数える） */
let generateCalls = 0

/** generateContent を送る。thinkingConfig に対応していないモデルで 400 なら、外して1回だけ送り直す */
export async function generate({ apiKey, system, context, messages, thinkingBudget }: CallGeminiArgs, model: string): Promise<Response> {
  const url = `${API_BASE}/models/${encodeURIComponent(model)}:generateContent`
  const makeBody = (withThinking: boolean) => ({
    systemInstruction: { parts: [{ text: system }, { text: `参考情報（JSON）：\n${context}` }] },
    contents: messages.map((m) => ({ role: m.role === 'coach' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: COACH_REPLY_SCHEMA,
      temperature: 0.4,
      ...(withThinking ? { thinkingConfig: thinkingConfigFor(model, thinkingBudget) } : {}),
    },
  })
  const post = async (withThinking: boolean) => {
    generateCalls++
    const started = Date.now()
    const res = await send(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body: JSON.stringify(makeBody(withThinking)) })
    console.log(`coach: ${model} ${res.status} in ${Date.now() - started}ms`)
    return res
  }
  const withThinking = thinkingBudget !== undefined
  const res = await post(withThinking)
  return res.status === 400 && withThinking ? post(false) : res
}

/** fetch の失敗（通信・ヘッダーの形など）は、種類だけを持った GeminiError にする（メッセージにはキーが入りうる） */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (e) {
    const name = e instanceof Error ? e.name : typeof e
    throw new GeminiError('upstream', undefined, `fetch failed (${name})`)
  }
}

/** 使えるモデルの一覧。取れなければ空 */
export async function listModels(apiKey: string): Promise<ModelList> {
  const res = await send(`${API_BASE}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } })
  if (!res.ok) return {}
  try {
    return (await res.json()) as ModelList
  } catch {
    return {}
  }
}

/** 使えるモデルの一覧から Flash モデルを新しい順に取る。取れなければ空 */
async function listFlashModels(apiKey: string): Promise<string[]> {
  return flashModels(await listModels(apiKey))
}
