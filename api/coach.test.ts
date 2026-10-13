// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config, GET, MESSAGES, POST } from './coach.js'
import { MAX_REQUEST_BYTES, PASSCODE_HEADER, type CoachRequest } from './_lib/schema.js'
import { sendToCoach } from '../src/features/coach/client'

const API_KEY = 'test-api-key-SECRET123'
const PASSCODE = 'pass-SECRET456'

const body: CoachRequest = { system: 'ルール', context: '{}', messages: [{ role: 'user', text: '来週のメニューを作って' }] }
const reply = {
  message: '来週のメニューです',
  proposal: {
    split: 'upper_lower', reasons: '理由',
    days: [{ date: '2026-10-19', title: '上半身', exercises: [{ slot: 'upper.1', exerciseId: 'ex-bench-press', sets: 3, reps: 8, restSec: 150 }] }],
  },
}

const req = (opts: { method?: string; passcode?: string | null; body?: string } = {}) => {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const pass = opts.passcode === undefined ? PASSCODE : opts.passcode
  if (pass !== null) headers[PASSCODE_HEADER] = pass
  const method = opts.method ?? 'POST'
  return new Request('https://example.test/api/coach', {
    method, headers, body: method === 'GET' ? undefined : (opts.body ?? JSON.stringify(body)),
  })
}
const gemini = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
const geminiOk = (r: unknown = reply) => gemini(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(r) }] } }] })

// @types/node を入れていないので、使う分だけ型を書く
declare const process: { env: Record<string, string | undefined> }

let fetchMock: ReturnType<typeof vi.fn>
const env = process.env

beforeEach(() => {
  env.GEMINI_API_KEY = API_KEY
  env.COACH_PASSCODE = PASSCODE
  delete env.GEMINI_MODEL
  fetchMock = vi.fn(async () => geminiOk())
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete env.GEMINI_API_KEY
  delete env.COACH_PASSCODE
})

/** レスポンス・ログにキーや合言葉が出ていない */
async function expectNoSecrets(res: Response): Promise<unknown> {
  const text = await res.text()
  expect(text).not.toContain(API_KEY)
  expect(text).not.toContain(PASSCODE)
  const logged = JSON.stringify((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls)
  expect(logged).not.toContain(API_KEY)
  expect(logged).not.toContain(PASSCODE)
  return JSON.parse(text)
}

describe('POST /api/coach', () => {
  it('POST 以外は 405', async () => {
    const res = await GET(req({ method: 'GET' }))
    expect(res.status).toBe(405)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('本文が 100KB を超えると 413', async () => {
    const big = JSON.stringify({ ...body, context: 'x'.repeat(MAX_REQUEST_BYTES) })
    const res = await POST(req({ body: big }))
    expect(res.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('合言葉がない・違うと 401', async () => {
    for (const passcode of [null, '', 'wrong', `${PASSCODE}x`]) {
      const res = await POST(req({ passcode }))
      expect(res.status, String(passcode)).toBe(401)
      expect(await res.json()).toEqual({ error: MESSAGES.unauthorized })
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('合言葉はURLエンコードされたものを戻して比べる。戻せない形なら 401', async () => {
    env.COACH_PASSCODE = 'ひみつ 合言葉'
    expect((await POST(req({ passcode: encodeURIComponent('ひみつ 合言葉') }))).status).toBe(200)
    expect((await POST(req({ passcode: encodeURIComponent('ひみつ') }))).status).toBe(401)
    expect((await POST(req({ passcode: '%E3%81' }))).status).toBe(401)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('アプリから日本語の合言葉で送ると、サーバーが受け付ける（通しで確かめる）', async () => {
    env.COACH_PASSCODE = 'ひみつの合言葉'
    const gem = fetchMock
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url) === '/api/coach') return POST(new Request('https://example.test/api/coach', init))
      return (gem as unknown as typeof fetch)(url, init)
    }))
    expect(await sendToCoach(body, 'ひみつの合言葉')).toEqual(reply)
    await expect(sendToCoach(body, 'ちがう')).rejects.toMatchObject({ kind: 'unauthorized' })
  })

  it('GEMINI_API_KEY がないと 500「サーバーの設定が足りません」', async () => {
    delete env.GEMINI_API_KEY
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'サーバーの設定が足りません' })
  })

  it('COACH_PASSCODE がないと 500（誰でも使えるようにはしない）', async () => {
    delete env.COACH_PASSCODE
    const res = await POST(req())
    expect(res.status).toBe(500)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('本文の形が違うと 400', async () => {
    expect((await POST(req({ body: 'not json' }))).status).toBe(400)
    expect((await POST(req({ body: JSON.stringify({ system: 'a' }) }))).status).toBe(400)
  })

  it('Gemini が 429 なら 429「今日は上限に達しました…」', async () => {
    fetchMock.mockResolvedValueOnce(gemini(429, { error: { message: 'quota' } }))
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(await expectNoSecrets(res)).toEqual({ error: '今日は上限に達しました。時間をおいて試してください' })
  })

  it('Gemini がそれ以外で失敗したら 502', async () => {
    fetchMock.mockResolvedValueOnce(gemini(500, { error: { message: `bad key ${API_KEY}` } }))
    const res = await POST(req())
    expect(res.status).toBe(502)
    await expectNoSecrets(res)

    fetchMock.mockRejectedValueOnce(new Error('network'))
    expect((await POST(req())).status).toBe(502)

    fetchMock.mockResolvedValueOnce(gemini(200, { candidates: [{ content: { parts: [{ text: 'JSONではない' }] } }] }))
    const bad = await POST(req())
    expect(bad.status).toBe(502)
    expect(await bad.json()).toEqual({ error: 'AIの返事を読み取れませんでした' })
  })

  it('成功すると 200 で CoachReply を返す', async () => {
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await expectNoSecrets(res)).toEqual(reply)
  })

  it('Gemini には決まった形で送る（キーはヘッダーで、URL には入れない）', async () => {
    env.GEMINI_MODEL = 'gemini-test'
    await POST(req())
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-test:generateContent')
    expect(url).not.toContain(API_KEY)
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(API_KEY)
    const sent = JSON.parse(String(init.body))
    expect(sent.systemInstruction.parts[0].text).toBe('ルール')
    expect(sent.contents).toEqual([{ role: 'user', parts: [{ text: '来週のメニューを作って' }] }])
    expect(sent.generationConfig).toMatchObject({ responseMimeType: 'application/json', temperature: 0.4 })
    expect(sent.generationConfig.responseSchema.required).toEqual(['message'])
    expect(JSON.stringify(sent)).not.toContain(PASSCODE)
  })

  it('考える量を抑えて速く返す（thinkingBudget 1024、GEMINI_THINKING_BUDGET で変えられる）', async () => {
    await POST(req())
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body)).generationConfig.thinkingConfig).toEqual({ thinkingBudget: 1024 })
    env.GEMINI_THINKING_BUDGET = 'off'
    await POST(req())
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body)).generationConfig.thinkingConfig).toBeUndefined()
    delete env.GEMINI_THINKING_BUDGET
  })

  it('モデルが thinkingConfig に対応せず 400 なら、外して1回だけ送り直す', async () => {
    fetchMock.mockResolvedValueOnce(gemini(400, { error: { message: 'thinking is not supported' } }))
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body)).generationConfig.thinkingConfig).toBeUndefined()
  })

  it('関数の実行時間の上限は60秒', () => {
    expect(config).toEqual({ maxDuration: 60 })
  })

  it('モデルの既定は gemini-2.5-flash', async () => {
    await POST(req())
    expect(String(fetchMock.mock.calls[0][0])).toContain('/models/gemini-2.5-flash:generateContent')
  })
})
