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
  vi.spyOn(console, 'log').mockImplementation(() => {})
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

  it('Gemini が 429 で、ほかに試せるモデルもなければ 429「無料枠の1日の上限に達しました…」', async () => {
    fetchMock.mockResolvedValueOnce(gemini(429, { error: { message: 'quota' } }))
    const res = await POST(req())
    expect(res.status).toBe(429)
    expect(await expectNoSecrets(res)).toEqual({ error: '無料枠の1日の上限に達しました。日本時間の夕方ごろにリセットされます' })
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
    expect(sent.generationConfig.responseSchema.properties.requestedSplit.enum).toEqual(['full_body', 'upper_lower', 'ppl', 'ul_ppl'])
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

  describe('混み合っている（503）とき', () => {
    const list = gemini(200, { models: [
      { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
    ] })
    const busy = () => gemini(503, { error: { message: 'The model is overloaded' } })
    beforeEach(() => {
      env.GEMINI_MODEL = 'gemini-3.8-flash'
      env.GEMINI_RETRY_DELAY_MS = '0'
      fetchMock.mockReset()
    })
    afterEach(() => {
      delete env.GEMINI_RETRY_DELAY_MS
    })

    it('少し待って同じモデルでもう一度試す', async () => {
      fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(geminiOk())
      expect((await POST(req())).status).toBe(200)
      expect(String(fetchMock.mock.calls[1][0])).toContain('/models/gemini-3.8-flash:generateContent')
    })

    it('それでも混んでいれば、1つ前の世代の Flash モデルに切り替える', async () => {
      fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(list).mockResolvedValueOnce(geminiOk())
      expect((await POST(req())).status).toBe(200)
      expect(String(fetchMock.mock.calls[3][0])).toContain('/models/gemini-3.5-flash:generateContent')
    })

    it('全部だめなら 503「AIが混み合っています…」', async () => {
      fetchMock.mockResolvedValueOnce(busy()).mockResolvedValueOnce(busy()).mockResolvedValueOnce(list).mockResolvedValue(busy())
      const res = await POST(req())
      expect(res.status).toBe(503)
      expect(await expectNoSecrets(res)).toEqual({ error: 'AIが混み合っています。少し時間をおいて試してください' })
    })
  })

  describe('上限（429）のとき', () => {
    // モデルごとに無料枠の上限が別なので、ほかの Flash モデルで試す（lite は最後の手段）
    const list = () => gemini(200, { models: [
      { name: 'models/gemini-4.2-flash-lite', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-4.2-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-4.1-flash', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-4.2-flash-tts', supportedGenerationMethods: ['generateContent'] },
      { name: 'models/gemini-4.2-pro', supportedGenerationMethods: ['generateContent'] },
    ] })
    const limited = () => gemini(429, { error: { message: 'quota exceeded' } })
    const generatedModels = () => fetchMock.mock.calls.map(([u]) => String(u)).filter((u) => u.includes(':generateContent'))
      .map((u) => /models\/([^:]+):/.exec(u)![1])
    beforeEach(() => fetchMock.mockReset())

    it('ほかの Flash モデルで送り直し、答えたモデルをログに残す', async () => {
      env.GEMINI_MODEL = 'gemini-4.2-flash'
      fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(list()).mockResolvedValueOnce(geminiOk())
      const res = await POST(req())
      expect(res.status).toBe(200)
      expect(generatedModels()).toEqual(['gemini-4.2-flash', 'gemini-4.1-flash'])
      const logged = JSON.stringify((console.log as unknown as ReturnType<typeof vi.fn>).mock.calls)
      expect(logged).toContain('coach: answered by gemini-4.1-flash')
      expect(logged).not.toContain(API_KEY)
    })

    it('Flash モデルが全部上限なら、最後に lite を試す', async () => {
      env.GEMINI_MODEL = 'gemini-4.2-flash-x'
      fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(list())
        .mockResolvedValueOnce(limited()).mockResolvedValueOnce(limited()).mockResolvedValueOnce(geminiOk())
      expect((await POST(req())).status).toBe(200)
      expect(generatedModels()).toEqual(['gemini-4.2-flash-x', 'gemini-4.2-flash', 'gemini-4.1-flash', 'gemini-4.2-flash-lite'])
    })

    it('全部上限なら 429 と、1日の上限の文を返す', async () => {
      env.GEMINI_MODEL = 'gemini-4.2-flash-y'
      fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(list()).mockResolvedValue(limited())
      const res = await POST(req())
      expect(res.status).toBe(429)
      expect(await expectNoSecrets(res)).toEqual({ error: '無料枠の1日の上限に達しました。日本時間の夕方ごろにリセットされます' })
      expect(generatedModels()).toEqual(['gemini-4.2-flash-y', 'gemini-4.2-flash', 'gemini-4.1-flash', 'gemini-4.2-flash-lite'])
    })

    it('通ったモデルは覚えておき、次からは最初からそれを使う', async () => {
      env.GEMINI_MODEL = 'gemini-4.2-flash-z'
      fetchMock.mockResolvedValueOnce(limited()).mockResolvedValueOnce(list()).mockResolvedValueOnce(geminiOk()).mockResolvedValueOnce(geminiOk())
      expect((await POST(req())).status).toBe(200)
      expect((await POST(req())).status).toBe(200)
      expect(generatedModels()).toEqual(['gemini-4.2-flash-z', 'gemini-4.2-flash', 'gemini-4.2-flash'])
    })
  })

  it('答えたモデルをログに残す（キーは出さない）', async () => {
    await POST(req())
    const logged = JSON.stringify((console.log as unknown as ReturnType<typeof vi.fn>).mock.calls)
    expect(logged).toContain('coach: answered by gemini-2.5-flash')
    expect(logged).not.toContain(API_KEY)
  })

  it('関数の実行時間の上限は300秒（Hobby の最大）', () => {
    expect(config).toEqual({ maxDuration: 300 })
  })

  it('Gemini 3 以降のモデルには thinkingBudget ではなく thinkingLevel low を送る', async () => {
    env.GEMINI_MODEL = 'gemini-3-flash'
    await POST(req())
    const sent = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' })
  })

  it('探して見つけたモデルは覚えておき、次からは最初からそれを使う', async () => {
    env.GEMINI_MODEL = 'gemini-gone-flash'
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(gemini(404, { error: { message: 'not found' } }))
      .mockResolvedValueOnce(gemini(200, { models: [{ name: 'models/gemini-7-flash', supportedGenerationMethods: ['generateContent'] }] }))
      .mockResolvedValueOnce(geminiOk())
      .mockResolvedValueOnce(geminiOk())
    expect((await POST(req())).status).toBe(200)
    expect((await POST(req())).status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(String(fetchMock.mock.calls[3][0])).toContain('/models/gemini-7-flash:generateContent')
    const sent = JSON.parse(String((fetchMock.mock.calls[3][1] as RequestInit).body))
    expect(sent.generationConfig.thinkingConfig).toEqual({ thinkingLevel: 'low' })
  })

  it('モデルの既定は gemini-2.5-flash', async () => {
    await POST(req())
    expect(String(fetchMock.mock.calls[0][0])).toContain('/models/gemini-2.5-flash:generateContent')
  })

  it('キーや合言葉の前後の空白・改行は取り除いて使う', async () => {
    env.GEMINI_API_KEY = `  ${API_KEY}\n`
    env.COACH_PASSCODE = `${PASSCODE} \n`
    const res = await POST(req())
    expect(res.status).toBe(200)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe(API_KEY)
  })

  it('Gemini の失敗はステータスと理由をログに残す（キーは伏せる）', async () => {
    fetchMock.mockResolvedValueOnce(gemini(403, { error: { message: `API key ${API_KEY} not valid` } }))
    const res = await POST(req())
    expect(res.status).toBe(502)
    await expectNoSecrets(res)
    const logged = JSON.stringify((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls)
    expect(logged).toContain('403')
    expect(logged).toContain('not valid')
  })

  it('送信自体が失敗したら、その種類をログに残す', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('bad header'))
    expect((await POST(req())).status).toBe(502)
    const logged = JSON.stringify((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls)
    expect(logged).toContain('fetch failed')
    expect(logged).toContain('TypeError')
  })

  it('モデルが見つからない（404）なら、使える Flash モデルを探して送り直す', async () => {
    env.GEMINI_MODEL = 'gemini-old-flash'
    fetchMock.mockReset()
    fetchMock
      .mockResolvedValueOnce(gemini(404, { error: { message: 'models/gemini-old-flash is not found' } }))
      .mockResolvedValueOnce(gemini(200, { models: [
        { name: 'models/gemini-9-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-9-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-9-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-8-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-9-flash-tts', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/text-embedding-9', supportedGenerationMethods: ['embedContent'] },
      ] }))
      .mockResolvedValueOnce(geminiOk())
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000')
    expect(String(fetchMock.mock.calls[2][0])).toContain('/models/gemini-9-flash:generateContent')
  })
})
