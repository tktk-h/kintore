import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck, Check, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { DayGroup } from '../../components/DayGroup'
import { Dialog } from '../../components/Dialog'
import { ExerciseRow, ExerciseRows } from '../../components/ExerciseRow'
import { useSafeAction, useToast } from '../../components/Toast'
import { SPLIT_LABELS } from '../../coach/split'
import { BODY_PART_COLORS, BODY_PART_LABELS, MUSCLE_LABELS, MUSCLES, type ChatMessage, type PlannedWorkout } from '../../db/types'
import { formatDateJa, formatDateShort, todayKey } from '../../lib/dates'
import { ALL_PAST_MESSAGE, applicableDays, applyProposal } from '../../repo/applyProposal'
import { listExercises } from '../../repo/exercises'
import { getPlanForDate } from '../../repo/plans'
import { ProposalExerciseSheet } from './ProposalExerciseSheet'
import { daySummary, exerciseLine, volumeText, weightText } from './proposalFormat'

/** メニュー案の中身（設計書「メニュー案カード」）。案の画面に出す。見出しは画面の見出しが兼ねる */
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
    <section className="card stack proposal-card" aria-label="メニュー案">
      <div className="proposal-strip">
        <p className="proposal-split">
          <span>{splitLabel}</span>
          {proposal.deload && <span className="proposal-badge">軽めの週</span>}
        </p>
        {muscles.length > 0 && (
          <div className="proposal-sets">
            <span className="proposal-sets-label">週のセット数</span>
            <ul className="muscle-sets" aria-label="部位ごとの週のセット数">
              {muscles.map((m) => (
                <li key={m}>
                  {MUSCLE_LABELS[m]} <strong className="num">{proposal.muscleSets[m]}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="proposal-days">
        {proposal.days.map((d, di) => {
          const parts = [...new Set(d.exercises.map((x) => byId.get(x.exerciseId)?.bodyPart).filter((p) => p !== undefined))]
          return (
            <DayGroup
              key={d.date}
              storageKey={`coach.proposal.${message.id}.${d.date}`}
              defaultCollapsed={di > 0}
              date={formatDateShort(d.date)}
              title={d.title}
              tags={parts.map((p) => ({ label: BODY_PART_LABELS[p], color: BODY_PART_COLORS[p] }))}
              summary={daySummary(d.exercises)}
              label={`${formatDateJa(d.date)} ${d.title}`}
            >
              <ExerciseRows>
                {d.exercises.map((x, xi) => {
                  const ex = byId.get(x.exerciseId)
                  const name = exercises === undefined ? '' : (ex?.name ?? '（見つからない種目）')
                  return (
                    <ExerciseRow
                      key={`${x.slot}-${xi}`}
                      name={name}
                      volume={volumeText(x, ex)}
                      weight={weightText(x, ex)}
                      color={ex && BODY_PART_COLORS[ex.bodyPart]}
                      ariaLabel={`${name} ${exerciseLine(x, ex)}`}
                      onClick={() => setDetail({ day: di, ex: xi })}
                    />
                  )
                })}
              </ExerciseRows>
              {d.note && <p className="muted proposal-note">{d.note}</p>}
            </DayGroup>
          )
        })}
      </div>
      {proposal.reasons && <Reasons text={proposal.reasons} />}
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
    </section>
  )
}

/** 理由（長いときは2行に縮めて「続きを読む」） */
function Reasons({ text }: { text: string }) {
  const long = text.length > 50 || text.includes('\n')
  const [open, setOpen] = useState(false)
  return (
    <div className="proposal-reasons">
      <h3 className="proposal-sub">理由</h3>
      <p className={`proposal-text ${long && !open ? 'is-clamped' : ''}`.trim()}>{text}</p>
      {long && (
        <button type="button" className="proposal-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'たたむ' : '続きを読む'}
        </button>
      )}
    </div>
  )
}
