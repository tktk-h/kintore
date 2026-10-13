import { parseCoachReply, PASSCODE_HEADER, type CoachReply, type CoachRequest } from '../../../api/_lib/schema'

export type CoachErrorKind = 'offline' | 'unauthorized' | 'rate_limited' | 'server' | 'invalid'

export const COACH_ERROR_MESSAGES: Record<CoachErrorKind, string> = {
  offline: '通信できません。電波のよい所でもう一度送ってください。',
  unauthorized: '合言葉が違うか、設定されていません。設定で合言葉を確認してください。',
  rate_limited: '今日は上限に達しました。時間をおいて試してください。',
  server: 'サーバーでエラーが起きました。時間をおいて試してください。',
  invalid: 'AIの返事を読み取れませんでした。もう一度送ってください。',
}

/** AIコーチの呼び出しの失敗。kind で画面の出し分けをする */
export class CoachError extends Error {
  constructor(public kind: CoachErrorKind, message = COACH_ERROR_MESSAGES[kind]) {
    super(message)
    this.name = 'CoachError'
  }
}

/** オンラインなのに送れなかったとき（サーバーに届かない・送る内容を送れないなど） */
export const COACH_SEND_FAILED_MESSAGE = 'サーバーに送れませんでした。時間をおいてもう一度送ってください。続くときは設定の合言葉も確かめてください。'

export const COACH_ENDPOINT = '/api/coach'

export type SendToCoach = (body: CoachRequest, passcode: string) => Promise<CoachReply>

/** /api/coach を呼ぶ。失敗は CoachError（offline / unauthorized / rate_limited / server / invalid）で投げる */
export const sendToCoach: SendToCoach = async (body, passcode) => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CoachError('offline')
  if (!passcode) throw new CoachError('unauthorized')
  let res: Response
  try {
    res = await fetch(COACH_ENDPOINT, {
      method: 'POST',
      // ヘッダーには Latin-1 しか入らないので、日本語の合言葉も送れるように URL エンコードする
      headers: { 'content-type': 'application/json', [PASSCODE_HEADER]: encodeURIComponent(passcode) },
      body: JSON.stringify(body),
    })
  } catch {
    // 送っている間に電波が切れたときだけオフライン扱い。オンラインなのに失敗したのは別の理由として出す
    if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new CoachError('offline')
    throw new CoachError('server', COACH_SEND_FAILED_MESSAGE)
  }
  if (res.status === 401) throw new CoachError('unauthorized')
  if (res.status === 429) throw new CoachError('rate_limited')
  if (!res.ok) {
    // サーバーが日本語の理由を返していればそれを出す
    let message: string | undefined
    try {
      const data = (await res.json()) as { error?: unknown }
      if (typeof data.error === 'string' && data.error) message = data.error
    } catch {
      // 本文がなくてもよい
    }
    throw new CoachError('server', message)
  }
  let data: unknown
  try {
    data = await res.json()
  } catch {
    throw new CoachError('invalid')
  }
  try {
    return parseCoachReply(data)
  } catch {
    throw new CoachError('invalid')
  }
}
