/**
 * Gemini の呼び出し。別のAIに乗り換えるときはこのファイルだけ替える。
 */
import { COACH_REPLY_SCHEMA, parseCoachReply, type CoachChatTurn, type CoachReply } from './schema.js'

export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'

/** Gemini の呼び出しの失敗。kind で返し方を決める（本文やキーは持たない） */
export class GeminiError extends Error {
  constructor(public kind: 'rate_limited' | 'upstream' | 'invalid', public status?: number) {
    super(kind === 'rate_limited' ? 'rate limited' : kind === 'invalid' ? 'invalid reply' : `upstream error${status ? ` ${status}` : ''}`)
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
}

/** 既定の考える量。メニューは骨組みが決まっているので多くは要らない */
export const DEFAULT_THINKING_BUDGET = 1024

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
}

export async function callGemini({ apiKey, model, system, context, messages, thinkingBudget }: CallGeminiArgs): Promise<CoachReply> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  const makeBody = (withThinking: boolean) => ({
    systemInstruction: { parts: [{ text: system }, { text: `参考情報（JSON）：\n${context}` }] },
    contents: messages.map((m) => ({ role: m.role === 'coach' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: COACH_REPLY_SCHEMA,
      temperature: 0.4,
      ...(withThinking ? { thinkingConfig: { thinkingBudget } } : {}),
    },
  })
  const post = async (withThinking: boolean): Promise<Response> => {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(makeBody(withThinking)),
      })
    } catch {
      throw new GeminiError('upstream')
    }
  }
  const withThinking = thinkingBudget !== undefined
  let res = await post(withThinking)
  // thinkingConfig に対応していないモデルなら、外して1回だけ送り直す
  if (res.status === 400 && withThinking) res = await post(false)
  if (res.status === 429) throw new GeminiError('rate_limited', 429)
  if (!res.ok) throw new GeminiError('upstream', res.status)

  let data: GeminiResponse
  try {
    data = (await res.json()) as GeminiResponse
  } catch {
    throw new GeminiError('invalid')
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('')
  if (!text) throw new GeminiError('invalid')
  try {
    return parseCoachReply(text)
  } catch {
    throw new GeminiError('invalid')
  }
}
