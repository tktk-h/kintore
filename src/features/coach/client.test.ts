import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PASSCODE_HEADER, type CoachRequest } from '../../../api/_lib/schema'
import { COACH_SEND_FAILED_MESSAGE, CoachError, sendToCoach } from './client'

const body: CoachRequest = { system: 's', context: '{}', messages: [{ role: 'user', text: 'こんにちは' }] }
const json = (status: number, data: unknown) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn(async () => json(200, { message: 'やあ' }))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p
    return 'ok'
  } catch (e) {
    expect(e).toBeInstanceOf(CoachError)
    return (e as CoachError).kind
  }
}

describe('sendToCoach', () => {
  it('成功すると CoachReply を返し、合言葉はヘッダーで送る', async () => {
    expect(await sendToCoach(body, 'pass')).toEqual({ message: 'やあ' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/coach')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>)[PASSCODE_HEADER]).toBe('pass')
    expect(JSON.parse(String(init.body))).toEqual(body)
  })

  it('ステータスごとに分類する', async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: '合言葉が違います' }))
    expect(await kindOf(sendToCoach(body, 'pass'))).toBe('unauthorized')
    fetchMock.mockResolvedValueOnce(json(429, { error: '上限' }))
    expect(await kindOf(sendToCoach(body, 'pass'))).toBe('rate_limited')
    for (const status of [400, 413, 500, 502]) {
      fetchMock.mockResolvedValueOnce(json(status, { error: 'サーバーの設定が足りません' }))
      expect(await kindOf(sendToCoach(body, 'pass')), String(status)).toBe('server')
    }
  })

  it('サーバーの理由があればそれをメッセージにする', async () => {
    fetchMock.mockResolvedValueOnce(json(500, { error: 'サーバーの設定が足りません' }))
    await expect(sendToCoach(body, 'pass')).rejects.toThrow('サーバーの設定が足りません')
    fetchMock.mockResolvedValueOnce(new Response('oops', { status: 502 }))
    await expect(sendToCoach(body, 'pass')).rejects.toThrow('サーバーでエラーが起きました')
  })

  it('返事の形が違えば invalid', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { nope: 1 }))
    expect(await kindOf(sendToCoach(body, 'pass'))).toBe('invalid')
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }))
    expect(await kindOf(sendToCoach(body, 'pass'))).toBe('invalid')
  })

  it('オフラインなら送らずに offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    expect(await kindOf(sendToCoach(body, 'pass'))).toBe('offline')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('送っている間にオフラインになった失敗は offline', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    fetchMock.mockImplementationOnce(async () => {
      onLine.mockReturnValue(false)
      throw new TypeError('Failed to fetch')
    })
    expect(await kindOf(sendToCoach(body, 'pass'))).toBe('offline')
  })

  it('オンラインなのに送れなかったときは offline ではなく server（理由が分かる文）', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const err = await sendToCoach(body, 'pass').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CoachError)
    expect((err as CoachError).kind).toBe('server')
    expect((err as CoachError).message).toBe(COACH_SEND_FAILED_MESSAGE)
  })

  it('日本語の合言葉はURLエンコードしてヘッダーで送る', async () => {
    await sendToCoach(body, 'ひみつの合言葉')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const sent = (init.headers as Record<string, string>)[PASSCODE_HEADER]
    expect(sent).toBe(encodeURIComponent('ひみつの合言葉'))
    // ヘッダーに入れられる文字だけになっている
    expect(() => new Headers({ [PASSCODE_HEADER]: sent })).not.toThrow()
  })

  it('合言葉が未設定なら送らずに unauthorized', async () => {
    expect(await kindOf(sendToCoach(body, ''))).toBe('unauthorized')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
