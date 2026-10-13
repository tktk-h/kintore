/**
 * AIコーチの返事の形と、/api/coach に送る本文の形。
 * サーバー（Vercel 関数）とブラウザ（src/）の両方から import するので、他のファイルに依存しない。
 */

export const SPLIT_TYPES = ['full_body', 'upper_lower', 'ppl', 'ul_ppl'] as const
export type ReplySplit = (typeof SPLIT_TYPES)[number]

export interface CoachReplyExercise {
  /** 骨組みの枠のID（例：'upper.1'） */
  slot: string
  exerciseId: string
  sets: number
  reps: number
  restSec: number
}

export interface CoachReplyDay {
  /** YYYY-MM-DD */
  date: string
  title: string
  exercises: CoachReplyExercise[]
  note?: string
}

export interface CoachReplyProposal {
  split: ReplySplit
  days: CoachReplyDay[]
  /** この構成にした理由 */
  reasons: string
}

export interface CoachReply {
  /** チャットに表示する文章 */
  message: string
  proposal?: CoachReplyProposal
}

export interface CoachChatTurn {
  role: 'user' | 'coach'
  text: string
}

/** ブラウザから /api/coach に送る本文（合言葉はヘッダー PASSCODE_HEADER で送る） */
export interface CoachRequest {
  /** 役割と守るルール */
  system: string
  /** プロフィール・骨組み・候補・記録の要約など */
  context: string
  /** 古い順。最後がユーザーの今回のメッセージ */
  messages: CoachChatTurn[]
}

/** 合言葉のヘッダー。値は encodeURIComponent したもの（日本語でも送れるように） */
export const PASSCODE_HEADER = 'x-coach-passcode'
/** 1回のリクエストの上限（バイト） */
export const MAX_REQUEST_BYTES = 100 * 1024

/**
 * Gemini の構造化出力に渡す responseSchema（OpenAPI のサブセット：type / properties / items / required / enum / description）
 */
export const COACH_REPLY_SCHEMA = {
  type: 'OBJECT',
  properties: {
    message: { type: 'STRING', description: 'チャットに表示する日本語の文章' },
    proposal: {
      type: 'OBJECT',
      description: 'メニュー案。提案するときだけ入れる',
      properties: {
        split: { type: 'STRING', enum: [...SPLIT_TYPES], description: '分割法（骨組みと同じもの）' },
        days: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              date: { type: 'STRING', description: 'YYYY-MM-DD' },
              title: { type: 'STRING' },
              exercises: {
                type: 'ARRAY',
                items: {
                  type: 'OBJECT',
                  properties: {
                    slot: { type: 'STRING', description: '骨組みの枠のID' },
                    exerciseId: { type: 'STRING', description: '枠の候補の種目ID' },
                    sets: { type: 'INTEGER' },
                    reps: { type: 'INTEGER' },
                    restSec: { type: 'INTEGER' },
                  },
                  required: ['slot', 'exerciseId', 'sets', 'reps', 'restSec'],
                },
              },
              note: { type: 'STRING' },
            },
            required: ['date', 'title', 'exercises'],
          },
        },
        reasons: { type: 'STRING', description: 'この構成にした理由（短く）' },
      },
      required: ['split', 'days', 'reasons'],
    },
  },
  required: ['message'],
} as const

export const PARSE_ERROR_MESSAGE = 'AIの返事を読み取れませんでした'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function fail(): never {
  throw new Error(PARSE_ERROR_MESSAGE)
}

function parseExercise(v: unknown): CoachReplyExercise {
  if (!isObject(v) || !isStr(v.slot) || !isStr(v.exerciseId) || !isNum(v.sets) || !isNum(v.reps) || !isNum(v.restSec)) fail()
  return { slot: v.slot, exerciseId: v.exerciseId, sets: v.sets, reps: v.reps, restSec: v.restSec }
}

function parseDay(v: unknown): CoachReplyDay {
  if (!isObject(v) || !isStr(v.date) || !DATE_RE.test(v.date) || !isStr(v.title) || !Array.isArray(v.exercises)) fail()
  if (v.note !== undefined && v.note !== null && !isStr(v.note)) fail()
  const day: CoachReplyDay = { date: v.date, title: v.title, exercises: v.exercises.map(parseExercise) }
  if (isStr(v.note) && v.note) day.note = v.note
  return day
}

function parseProposal(v: unknown): CoachReplyProposal {
  if (!isObject(v) || !isStr(v.split) || !(SPLIT_TYPES as readonly string[]).includes(v.split)) fail()
  if (!Array.isArray(v.days) || !isStr(v.reasons)) fail()
  return { split: v.split as ReplySplit, days: v.days.map(parseDay), reasons: v.reasons }
}

/**
 * AIの返事（JSON の文字列か、読み取り済みの値）を CoachReply にする。
 * 形が違えば Error('AIの返事を読み取れませんでした')。余分な項目は捨てる。
 */
export function parseCoachReply(raw: unknown): CoachReply {
  let v = raw
  if (isStr(v)) {
    try {
      v = JSON.parse(v)
    } catch {
      fail()
    }
  }
  if (!isObject(v) || !isStr(v.message)) fail()
  const reply: CoachReply = { message: v.message }
  if (v.proposal !== undefined && v.proposal !== null) reply.proposal = parseProposal(v.proposal)
  return reply
}

/** /api/coach に送る本文の形を確かめる（サーバー用）。違えば undefined */
export function parseCoachRequest(raw: unknown): CoachRequest | undefined {
  if (!isObject(raw) || !isStr(raw.system) || !isStr(raw.context) || !Array.isArray(raw.messages)) return undefined
  const messages: CoachChatTurn[] = []
  for (const m of raw.messages) {
    if (!isObject(m) || (m.role !== 'user' && m.role !== 'coach') || !isStr(m.text)) return undefined
    messages.push({ role: m.role, text: m.text })
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== 'user') return undefined
  return { system: raw.system, context: raw.context, messages }
}
