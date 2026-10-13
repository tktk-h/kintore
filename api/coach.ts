/**
 * POST /api/coach（Vercel 関数・Node.js runtime・Web 標準のハンドラー）
 * 合言葉を照合し、本文の大きさを確かめてから Gemini を中継する。
 * APIキーと合言葉は、レスポンスにもログにも出さない。
 */
import { timingSafeEqual } from 'node:crypto'
import { callGemini, DEFAULT_GEMINI_MODEL, GeminiError } from './_lib/gemini'
import { MAX_REQUEST_BYTES, parseCoachRequest, PASSCODE_HEADER } from './_lib/schema'

// @types/node を入れていないので、使う分だけ型を書く
declare const process: { env: Record<string, string | undefined> }

export const MESSAGES = {
  method: 'POST で送ってください',
  tooLarge: '送る内容が大きすぎます',
  unauthorized: '合言葉が違います',
  config: 'サーバーの設定が足りません',
  badRequest: '送る内容の形が違います',
  rateLimited: '今日は上限に達しました。時間をおいて試してください',
  upstream: 'AIの呼び出しに失敗しました。時間をおいて試してください',
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
  return timingSafeEqual(a, b)
}

export async function handleCoach(request: Request): Promise<Response> {
  if (request.method !== 'POST') return error(405, MESSAGES.method, { allow: 'POST' })

  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_REQUEST_BYTES) return error(413, MESSAGES.tooLarge)
  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > MAX_REQUEST_BYTES) return error(413, MESSAGES.tooLarge)

  const expected = process.env.COACH_PASSCODE
  if (!expected) return error(500, MESSAGES.config)
  const given = request.headers.get(PASSCODE_HEADER) ?? ''
  if (!given || !(await samePasscode(given, expected))) return error(401, MESSAGES.unauthorized)

  const apiKey = process.env.GEMINI_API_KEY
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
    const reply = await callGemini({ apiKey, model: process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL, ...req })
    return Response.json(reply)
  } catch (e) {
    if (e instanceof GeminiError) {
      // 状態だけ記録する（キー・合言葉・本文は出さない）
      console.error(`coach: gemini ${e.kind}${e.status ? ` ${e.status}` : ''}`)
      if (e.kind === 'rate_limited') return error(429, MESSAGES.rateLimited)
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
