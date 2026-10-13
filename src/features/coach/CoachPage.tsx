import { useLiveQuery } from 'dexie-react-hooks'
import { KeyRound, RotateCw, Send, Sparkles, UserRound } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '../../components/EmptyState'
import type { CoachIntent } from '../../coach/context'
import { useOnline } from '../../lib/useOnline'
import { listChatMessages } from '../../repo/chat'
import { getProfile } from '../../repo/profile'
import { getSettings } from '../../repo/settings'
import { CoachError, COACH_ERROR_MESSAGES, sendToCoach, type CoachErrorKind, type SendToCoach } from './client'
import { askCoach } from './coachService'
import { ProposalCard } from './ProposalCard'

/** よく使う依頼のボタン */
export const QUICK_ASKS: { text: string; intent: CoachIntent; skipToday?: boolean }[] = [
  { text: '来週のメニューを作って', intent: 'next_week' },
  { text: '今日できなかった', intent: 'this_week', skipToday: true },
  { text: '今週を見直して', intent: 'this_week' },
]

interface Failure { text: string; intent: CoachIntent; skipToday?: boolean; message: string; kind?: CoachErrorKind }

function errorOf(e: unknown): { message: string; kind?: CoachErrorKind } {
  if (e instanceof CoachError) return { message: e.message || COACH_ERROR_MESSAGES[e.kind], kind: e.kind }
  return { message: e instanceof Error && e.message ? e.message : '送信できませんでした。もう一度送ってください。' }
}

interface Props {
  /** AIの呼び出し方（テストで差し替える） */
  send?: SendToCoach
}

/** AIコーチのチャット画面（設計書「AIコーチ画面」）。タブのルートなので戻るボタンはない */
export function CoachPage({ send = sendToCoach }: Props) {
  const profile = useLiveQuery(async () => (await getProfile()) ?? null)
  const passcode = useLiveQuery(async () => (await getSettings()).coachPasscode ?? '')
  const messages = useLiveQuery(listChatMessages)
  const online = useOnline()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<Failure>()
  const endRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLFormElement>(null)

  // 入力欄の高さを測って CSS の --composer-h に入れる（最後のメッセージが隠れないように下をあける）
  useEffect(() => {
    const el = composerRef.current
    if (!el) return
    const root = document.documentElement
    const update = () => {
      const h = el.getBoundingClientRect().height
      if (h > 0) root.style.setProperty('--composer-h', `${Math.ceil(h)}px`)
    }
    update()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update)
    observer?.observe(el)
    return () => {
      observer?.disconnect()
      root.style.removeProperty('--composer-h')
    }
  }, [])

  const loaded = profile !== undefined && passcode !== undefined
  const ready = !!profile && !!passcode
  const canSend = ready && online && !sending

  // 新しいメッセージが来たら一番下へ
  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages?.length, sending, failure])

  const ask = async (body: string, intent: CoachIntent, skipToday?: boolean) => {
    const t = body.trim()
    if (!t || sending) return
    setSending(true)
    setFailure(undefined)
    try {
      await askCoach(t, { intent, send, skipToday })
      // 入力欄の文を送ったときだけ入力欄を空にする（失敗したときは残して送り直せるようにする）
      setText((cur) => (cur.trim() === t ? '' : cur))
    } catch (e) {
      setFailure({ text: t, intent, skipToday, ...errorOf(e) })
    } finally {
      setSending(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (canSend) void ask(text, 'chat')
  }

  return (
    <div className="page coach-page">
      <header className="page-header">
        <h1>AIコーチ</h1>
        {profile && (
          <Link className="icon-btn" to="/coach/profile" aria-label="プロフィール">
            <UserRound aria-hidden="true" />
          </Link>
        )}
      </header>

      {loaded && profile === null && (
        <section className="card hero stack" aria-label="プロフィールの入力">
          <h2 className="card-title">
            <UserRound aria-hidden="true" />
            はじめにプロフィールを教えてください
          </h2>
          <p className="muted">目標・経験・行ける曜日・使える器具をもとに、1週間分のメニューを組みます。</p>
          <Link className="btn btn-primary btn-block" to="/coach/profile">
            プロフィールを入力する
          </Link>
        </section>
      )}

      {loaded && profile && !passcode && (
        <section className="card stack" aria-label="合言葉の設定">
          <h2 className="card-title">
            <KeyRound aria-hidden="true" />
            合言葉が未設定です
          </h2>
          <p className="muted">AIコーチを使うには、設定で合言葉を入れてください。</p>
          <Link className="btn btn-block" to="/settings">
            設定を開く
          </Link>
        </section>
      )}

      {ready && messages?.length === 0 && !sending && (
        <EmptyState icon={Sparkles}>
          <p>下のボタンから「来週のメニューを作って」と頼むと、1週間分のメニュー案を作ります。フォームや重さの相談もできます。</p>
        </EmptyState>
      )}

      <ol className="chat-list" aria-label="チャット">
        {messages?.map((m) => (
          <li key={m.id} className={`chat-item ${m.role}`}>
            {m.text && <p className={`bubble ${m.role}`}>{m.text}</p>}
            {m.role === 'coach' && m.proposal && <ProposalCard message={m} />}
          </li>
        ))}
        {sending && (
          <li className="chat-item coach">
            <p className="bubble coach thinking" role="status">
              <span className="live-dot" aria-hidden="true" />
              考え中…
            </p>
          </li>
        )}
      </ol>

      {failure && !sending && (
        <div className="card warning stack-sm" role="alert">
          <p>{failure.message}</p>
          <div className="row">
            <button type="button" className="btn btn-sm" disabled={!canSend} onClick={() => void ask(failure.text, failure.intent, failure.skipToday)}>
              <RotateCw aria-hidden="true" />
              もう一度送る
            </button>
            {failure.kind === 'unauthorized' && (
              <Link className="btn btn-sm btn-ghost" to="/settings">
                設定を開く
              </Link>
            )}
          </div>
        </div>
      )}
      <div ref={endRef} className="chat-end" />

      <form ref={composerRef} className="coach-composer" onSubmit={submit}>
        {!online && <p className="composer-note">オフラインのため送信できません。電波のよい所で送ってください。</p>}
        <div className="chips coach-quick" role="group" aria-label="よく使う依頼">
          {QUICK_ASKS.map((q) => (
            <button key={q.text} type="button" className="chip" disabled={!canSend} onClick={() => void ask(q.text, q.intent, q.skipToday)}>
              {q.text}
            </button>
          ))}
        </div>
        <div className="composer-row">
          <input
            type="text"
            aria-label="メッセージ"
            placeholder="AIコーチに相談する"
            enterKeyHint="send"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" className="composer-send" aria-label="送信" disabled={!canSend || !text.trim()}>
            <Send aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  )
}
