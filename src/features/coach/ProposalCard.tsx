import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck, CalendarDays, Check, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { Dialog } from '../../components/Dialog'
import { useSafeAction, useToast } from '../../components/Toast'
import { SPLIT_LABELS } from '../../coach/split'
import { MUSCLE_LABELS, MUSCLES, type ChatMessage, type PlannedWorkout } from '../../db/types'
import { formatDateJa, todayKey } from '../../lib/dates'
import { ALL_PAST_MESSAGE, applicableDays, applyProposal } from '../../repo/applyProposal'
import { listExercises } from '../../repo/exercises'
import { getPlanForDate } from '../../repo/plans'
import { ProposalExerciseSheet } from './ProposalExerciseSheet'
import { exerciseLine } from './proposalFormat'

/** チャットのメニュー案カード（設計書「メニュー案カード」） */
export function ProposalCard({ message }: { message: ChatMessage }) {
  const proposal = message.proposal!
  const exercises = useLiveQuery(listExercises)
  const byId = new Map((exercises ?? []).map((e) => [e.id, e]))
  const run = useSafeAction()
  const toast = useToast()
  const [replacing, setReplacing] = useState<PlannedWorkout[]>()
  const [busy, setBusy] = useState(false)
  /** 詳細を開いている種目（日・種目の番号） */
  const [detail, setDetail] = useState<{ day: number; ex: number }>()
  const applied = message.appliedAt !== undefined
  const splitLabel = SPLIT_LABELS[proposal.split]
  // 過ぎた日は反映しない（すべて過ぎた日なら反映できない）
  const today = todayKey()
  const days = applicableDays(proposal.days, today)
  const pastDates = [...new Set(proposal.days.filter((d) => d.date < today).map((d) => d.date))].sort()
  const allPast = days.length === 0

  const apply = async () => {
    setReplacing(undefined)
    setBusy(true)
    const ok = await run(() => applyProposal(message.id, today), '反映できませんでした')
    setBusy(false)
    if (ok) toast(pastDates.length > 0 ? '今日以降の日だけ予定に反映しました' : '予定に反映しました')
  }

  const onApply = async () => {
    setBusy(true)
    const existing = (await Promise.all(days.map((d) => getPlanForDate(d.date)))).filter((p): p is PlannedWorkout => p !== undefined)
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
      {proposal.days.map((d, di) => (
        <section key={d.date} className="proposal-day" aria-label={`${formatDateJa(d.date)} ${d.title}`}>
          <h3 className="proposal-day-head">
            <span className="num">{formatDateJa(d.date)}</span>
            <span className="proposal-day-title">{d.title}</span>
          </h3>
          <ul className="proposal-exercises">
            {d.exercises.map((x, xi) => {
              const ex = byId.get(x.exerciseId)
              const name = exercises === undefined ? '' : (ex?.name ?? '（見つからない種目）')
              const line = exerciseLine(x, ex)
              return (
                <li key={`${x.slot}-${xi}`}>
                  <button type="button" className="proposal-ex" aria-label={`${name} ${line}`} onClick={() => setDetail({ day: di, ex: xi })}>
                    <span className="proposal-ex-name">{name}</span>
                    <span className="proposal-ex-meta num">{line}</span>
                  </button>
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
        <>
          {allPast ? (
            <p className="muted">{ALL_PAST_MESSAGE}</p>
          ) : (
            pastDates.length > 0 && (
              <p className="muted">
                過ぎた日（{pastDates.map(formatDateJa).join('・')}）は反映しません。今日以降の日だけ反映します。
              </p>
            )
          )}
          <button type="button" className="btn btn-primary btn-block" disabled={busy || allPast} onClick={() => void onApply()}>
            <CalendarCheck aria-hidden="true" />
            反映する
          </button>
        </>
      )}
      {detail && exercises && proposal.days[detail.day]?.exercises[detail.ex] && (
        <ProposalExerciseSheet
          key={`${detail.day}-${detail.ex}`}
          message={message}
          dayIndex={detail.day}
          exIndex={detail.ex}
          catalog={exercises}
          onClose={() => setDetail(undefined)}
        />
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
