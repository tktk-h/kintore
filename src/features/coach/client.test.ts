import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PASSCODE_HEADER, type CoachRequest } from '../../../api/_lib/schema'
import { CoachError, sendToCoach } from './client'

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

  it('ネットワークの失敗は offline', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    expect(await kindOf(sendToCoach(body, 'pass'))).toBe('offline')
  })

  it('合言葉が未設定なら送らずに unauthorized', async () => {
    expect(await kindOf(sendToCoach(body, ''))).toBe('unauthorized')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
