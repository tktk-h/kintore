import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck, CalendarDays, Check, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { Dialog } from '../../components/Dialog'
import { useSafeAction, useToast } from '../../components/Toast'
import { SPLIT_LABELS } from '../../coach/split'
import type { ProposalExercise } from '../../coach/types'
import { MUSCLE_LABELS, MUSCLES, type ChatMessage, type Exercise, type PlannedWorkout } from '../../db/types'
import { formatDateJa } from '../../lib/dates'
import { applyProposal } from '../../repo/applyProposal'
import { listExercises } from '../../repo/exercises'
import { getPlanForDate } from '../../repo/plans'

/** 休憩時間の表示：90秒、2分、2分30秒 */
export function formatRest(sec: number): string {
  if (sec < 60) return `${sec}秒`
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}分` : `${m}分${s}秒`
}

/** 「3×8 ・ 60kg ・ 休憩2分」 */
function exerciseLine(x: ProposalExercise, ex: Exercise | undefined): string {
  const parts = [ex?.logType === 'time_distance' ? `${x.sets}セット` : `${x.sets}×${x.reps}`]
  if (x.weight !== undefined && ex?.logType !== 'time_distance') parts.push(`${x.weight}kg`)
  parts.push(`休憩${formatRest(x.restSec)}`)
  return parts.join(' ・ ')
}

/** チャットのメニュー案カード（設計書「メニュー案カード」） */
export function ProposalCard({ message }: { message: ChatMessage }) {
  const proposal = message.proposal!
  const exercises = useLiveQuery(listExercises)
  const byId = new Map((exercises ?? []).map((e) => [e.id, e]))
  const run = useSafeAction()
  const toast = useToast()
  const [replacing, setReplacing] = useState<PlannedWorkout[]>()
  const [busy, setBusy] = useState(false)
  const applied = message.appliedAt !== undefined
  const splitLabel = SPLIT_LABELS[proposal.split]

  const apply = async () => {
    setReplacing(undefined)
    setBusy(true)
    const ok = await run(() => applyProposal(message.id), '反映できませんでした')
    setBusy(false)
    if (ok) toast('予定に反映しました')
  }

  const onApply = async () => {
    setBusy(true)
    const existing = (await Promise.all(proposal.days.map((d) => getPlanForDate(d.date)))).filter((p): p is PlannedWorkout => p !== undefined)
    setBusy(false)
    if (existing.length > 0) setReplacing(existing)
    else await apply()
  }

  const muscles = MUSCLES.filter((m) => (proposal.muscleSets[m] ?? 0) > 0)

  return (
    <CollapsibleCard
      storageKey={`coach.proposal.${message.id}`}
      label="メニュー案"
      ariaLabel="メニュー案"
      className="proposal-card"
      summary={applied ? '反映済み' : splitLabel}
      title={
        <>
          <CalendarDays aria-hidden="true" />
          メニュー案
        </>
      }
    >
      <p className="proposal-split">
        <span>{splitLabel}</span>
        {proposal.deload && <span className="proposal-badge">軽めの週</span>}
      </p>
      {proposal.days.map((d) => (
        <section key={d.date} className="proposal-day" aria-label={`${formatDateJa(d.date)} ${d.title}`}>
          <h3 className="proposal-day-head">
            <span className="num">{formatDateJa(d.date)}</span>
            <span className="proposal-day-title">{d.title}</span>
          </h3>
          <ul className="proposal-exercises">
            {d.exercises.map((x) => {
              const ex = byId.get(x.exerciseId)
              return (
                <li key={`${x.slot}-${x.exerciseId}`}>
                  <span className="proposal-ex-name">{exercises === undefined ? '' : (ex?.name ?? '（見つからない種目）')}</span>
                  <span className="proposal-ex-meta num">{exerciseLine(x, ex)}</span>
                </li>
              )
            })}
          </ul>
          {d.note && <p className="muted">{d.note}</p>}
        </section>
      ))}
      {muscles.length > 0 && (
        <div className="stack-sm">
          <h3 className="proposal-sub">部位ごとの週のセット数</h3>
          <ul className="muscle-sets">
            {muscles.map((m) => (
              <li key={m}>
                {MUSCLE_LABELS[m]} <strong className="num">{proposal.muscleSets[m]}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
      {proposal.reasons && (
        <div className="stack-sm">
          <h3 className="proposal-sub">理由</h3>
          <p className="proposal-text">{proposal.reasons}</p>
        </div>
      )}
      {proposal.issues.length > 0 && (
        <div className="proposal-issues">
          <h3 className="proposal-sub">
            <TriangleAlert aria-hidden="true" />
            注意点
          </h3>
          <ul>
            {proposal.issues.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {applied ? (
        <div className="row between">
          <p className="done-line">
            <Check aria-hidden="true" />
            反映済み
          </p>
          <Link className="btn btn-sm" to="/">
            <CalendarCheck aria-hidden="true" />
            カレンダーで見る
          </Link>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => void onApply()}>
          <CalendarCheck aria-hidden="true" />
          反映する
        </button>
      )}
      {replacing && (
        <Dialog title="予定を置き換えますか？" onClose={() => setReplacing(undefined)}>
          <p className="muted">次の日にはすでに予定があります。メニュー案で置き換えます。</p>
          <ul className="replace-list">
            {replacing.map((p) => (
              <li key={p.id}>
                <span className="num">{formatDateJa(p.date)}</span>：{p.title}
              </li>
            ))}
          </ul>
          <div className="btn-pair">
            <button type="button" className="btn btn-ghost" onClick={() => setReplacing(undefined)}>
              やめる
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void apply()}>
              置き換えて反映する
            </button>
          </div>
        </Dialog>
      )}
    </CollapsibleCard>
  )
}
