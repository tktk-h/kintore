import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarCheck, Check, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { DayGroup } from '../../components/DayGroup'
import { Dialog } from '../../components/Dialog'
import { ExerciseRow, ExerciseRows, type RowChange } from '../../components/ExerciseRow'
import { useSafeAction, useToast } from '../../components/Toast'
import type { ExerciseChange, ProposalDiff } from '../../coach/diff'
import { SPLIT_LABELS } from '../../coach/split'
import type { ProposalExercise } from '../../coach/types'
import { BODY_PART_COLORS, BODY_PART_LABELS, MUSCLE_LABELS, MUSCLES, type ChatMessage, type Exercise, type PlannedWorkout } from '../../db/types'
import { formatDateJa, formatDateShort, todayKey } from '../../lib/dates'
import { ALL_PAST_MESSAGE, applicableDays, applyProposal } from '../../repo/applyProposal'
import { listExercises } from '../../repo/exercises'
import { getPlanForDate } from '../../repo/plans'
import { ProposalExerciseSheet } from './ProposalExerciseSheet'
import { daySummary, formatRest, volumeText, weightText } from './proposalFormat'

interface Props {
  message: ChatMessage
  /** 比べる前の案の番号（案1なら undefined）。diff がなければ対象の週が違って比べていない */
  prevNo?: number
  /** 前の案との違い（設計書「2. 案の画面」の前の案との違い） */
  diff?: ProposalDiff
}

/** メニュー案の中身（設計書「メニュー案カード」）。案の画面に出す。見出しは画面の見出しが兼ねる */
export function ProposalCard({ message, prevNo, diff }: Props) {
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

  const nameOf = (id: string) => (exercises === undefined ? '' : (byId.get(id)?.name ?? '（見つからない種目）'))
  const muscles = MUSCLES.filter((m) => (proposal.muscleSets[m] ?? 0) > 0)

  return (
    <section className="card stack proposal-card" aria-label="メニュー案">
      {prevNo !== undefined && (
        <p className="proposal-legend">{diff ? `オレンジ＝案${prevNo}から変わった所` : '前の案と対象の週が違うので比べていません'}</p>
      )}
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
                  const name = nameOf(x.exerciseId)
                  const change = rowChange(diff?.days[d.date]?.[xi], ex, nameOf)
                  return (
                    <ExerciseRow
                      key={`${x.slot}-${xi}`}
                      name={name}
                      volume={volumeText(x, ex)}
                      weight={weightText(x, ex)}
                      color={ex && BODY_PART_COLORS[ex.bodyPart]}
                      ariaLabel={rowLabel(name, x, ex, change)}
                      change={change}
                      onClick={() => setDetail({ day: di, ex: xi })}
                    />
                  )
                })}
              </ExerciseRows>
              {diff?.removed[d.date] && <RemovedList items={diff.removed[d.date]} nameOf={nameOf} byId={byId} />}
              {d.note && <p className="muted proposal-note">{d.note}</p>}
            </DayGroup>
          )
        })}
      </div>
      {diff && diff.removedDays.length > 0 && (
        <div className="proposal-removed-days">
          <h3 className="proposal-sub">外した日</h3>
          <ul className="proposal-removed" aria-label="外した日">
            {diff.removedDays.map((date) => (
              <li key={date}>
                <span className="num">{formatDateJa(date)}</span>：{(diff.removed[date] ?? []).map((x) => nameOf(x.exerciseId)).join('・')}
              </li>
            ))}
          </ul>
        </div>
      )}
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

type Change = RowChange & { label?: string }

/** 前の案との違いを、行に出す印と前の値にする */
function rowChange(c: ExerciseChange | undefined, ex: Exercise | undefined, nameOf: (id: string) => string): Change | undefined {
  if (!c || c.kind === 'same') return undefined
  if (c.kind === 'new') return { badge: '新', label: '新' }
  if (c.kind === 'swapped') return { badge: '入れ替え', label: `入れ替え（前 ${nameOf(c.prev.exerciseId)}）` }
  return {
    volumeFrom: c.fields.includes('reps') || c.fields.includes('sets') ? volumeText(c.prev, ex) : undefined,
    weightFrom: c.fields.includes('weight') ? (weightText(c.prev, ex) ?? 'なし') : undefined,
  }
}

/** 行の読み上げ名：「ベンチプレス 10×3 前 8×3 ・ 60kg ・ 休憩2分30秒 入れ替え（前 …）」 */
function rowLabel(name: string, x: ProposalExercise, ex: Exercise | undefined, c?: Change): string {
  const parts = [`${volumeText(x, ex)}${c?.volumeFrom ? ` 前 ${c.volumeFrom}` : ''}`]
  const w = weightText(x, ex)
  if (w) parts.push(`${w}${c?.weightFrom ? ` 前 ${c.weightFrom}` : ''}`)
  parts.push(`休憩${formatRest(x.restSec)}`)
  return [name, parts.join(' ・ '), c?.label].filter(Boolean).join(' ')
}

/** その日の外した種目（薄く、取り消し線で並べる） */
function RemovedList({ items, nameOf, byId }: { items: ProposalExercise[]; nameOf: (id: string) => string; byId: Map<string, Exercise> }) {
  return (
    <ul className="proposal-removed" aria-label="外した種目">
      {items.map((x, i) => (
        <li key={`${x.slot}-${i}`}>
          {nameOf(x.exerciseId)} <span className="num">{volumeText(x, byId.get(x.exerciseId))}</span>
        </li>
      ))}
    </ul>
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
