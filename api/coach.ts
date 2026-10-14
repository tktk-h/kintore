/**
 * POST /api/coach（Vercel 関数・Node.js runtime・Web 標準のハンドラー）
 * 合言葉を照合し、本文の大きさを確かめてから Gemini を中継する。
 * APIキーと合言葉は、レスポンスにもログにも出さない。
 */
import { callGemini, DEFAULT_GEMINI_MODEL, DEFAULT_THINKING_BUDGET, GeminiError } from './_lib/gemini.js'
import { MAX_REQUEST_BYTES, parseCoachRequest, PASSCODE_HEADER } from './_lib/schema.js'

// @types/node を入れていないので、使う分だけ型を書く
declare const process: { env: Record<string, string | undefined> }

/** Vercel 関数の設定：AIの返事を待つので実行時間の上限を60秒にする */
export const config = { maxDuration: 300 }

/** GEMINI_RETRY_DELAY_MS：混み合っているときに送り直すまで待つ時間（ミリ秒）。なければ既定 */
function retryDelayMs(): number | undefined {
  const n = Number(process.env.GEMINI_RETRY_DELAY_MS?.trim())
  return process.env.GEMINI_RETRY_DELAY_MS && Number.isFinite(n) && n >= 0 ? n : undefined
}

/** GEMINI_THINKING_BUDGET：数（0以上）ならその値、'off' なら送らない、なければ既定 */
function thinkingBudget(): number | undefined {
  const raw = process.env.GEMINI_THINKING_BUDGET?.trim()
  if (!raw) return DEFAULT_THINKING_BUDGET
  if (raw === 'off') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_THINKING_BUDGET
}

export const MESSAGES = {
  method: 'POST で送ってください',
  tooLarge: '送る内容が大きすぎます',
  unauthorized: '合言葉が違います',
  config: 'サーバーの設定が足りません',
  badRequest: '送る内容の形が違います',
  rateLimited: '無料枠の1日の上限に達しました。日本時間の夕方ごろにリセットされます',
  upstream: 'AIの呼び出しに失敗しました。時間をおいて試してください',
  busy: 'AIが混み合っています。少し時間をおいて試してください',
  invalid: 'AIの返事を読み取れませんでした',
} as const

const error = (status: number, message: string, headers?: Record<string, string>) =>
  Response.json({ error: message }, { status, headers })

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

/** 一定時間で比べる（長さの違いも漏らさないよう、ハッシュにしてから比べる） */
async function samePasscode(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256(given), sha256(expected)])
  // どちらも 32 バイト。途中で抜けずに全バイトの差を集める
  let diff = a.length ^ b.length
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ (b[i] ?? 0)
  return diff === 0
}

/** URLエンコードされた合言葉を戻す。ない・戻せない形なら空 */
function decodePasscode(header: string | null): string {
  if (!header) return ''
  try {
    return decodeURIComponent(header)
  } catch {
    return ''
  }
}

export async function handleCoach(request: Request): Promise<Response> {
  if (request.method !== 'POST') return error(405, MESSAGES.method, { allow: 'POST' })

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_REQUEST_BYTES) return error(413, MESSAGES.tooLarge)
  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) return error(413, MESSAGES.tooLarge)

  // 貼り付けたときに前後の空白・改行が入りやすいので取り除く
  const expected = process.env.COACH_PASSCODE?.trim()
  if (!expected) return error(500, MESSAGES.config)
  // ヘッダーには Latin-1 しか入らないので、アプリは合言葉を encodeURIComponent して送る
  const given = decodePasscode(request.headers.get(PASSCODE_HEADER))
  if (!given || !(await samePasscode(given, expected))) return error(401, MESSAGES.unauthorized)

  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return error(500, MESSAGES.config)

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return error(400, MESSAGES.badRequest)
  }
  const req = parseCoachRequest(body)
  if (!req) return error(400, MESSAGES.badRequest)

  try {
    const reply = await callGemini({
      apiKey, model: process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL, thinkingBudget: thinkingBudget(), retryDelayMs: retryDelayMs(), ...req,
    })
    return Response.json(reply)
  } catch (e) {
    if (e instanceof GeminiError) {
      // 状態と理由を記録する（理由のキーは伏せてある。合言葉・本文は出さない）
      console.error(`coach: gemini ${e.kind}${e.status ? ` ${e.status}` : ''}${e.detail ? ` - ${e.detail}` : ''}`)
      if (e.kind === 'rate_limited') return error(429, MESSAGES.rateLimited)
      if (e.kind === 'busy') return error(503, MESSAGES.busy)
      return error(502, e.kind === 'invalid' ? MESSAGES.invalid : MESSAGES.upstream)
    }
    console.error('coach: unexpected error')
    return error(502, MESSAGES.upstream)
  }
}

export async function POST(request: Request): Promise<Response> {
  return handleCoach(request)
}

/** POST 以外は 405 */
export const GET = handleCoach
export const PUT = handleCoach
export const PATCH = handleCoach
export const DELETE = handleCoach
