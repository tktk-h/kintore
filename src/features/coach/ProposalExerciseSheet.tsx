import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Stepper } from '../../components/Stepper'
import { useSafeAction, useToast } from '../../components/Toast'
import { MANUAL_WEIGHT_REASON, recheckProposal, replaceExercise, swapCandidates, swapExercise } from '../../coach/edit'
import type { ProposalExercise } from '../../coach/types'
import { LIMITS } from '../../coach/validate'
import { EQUIPMENT_LABELS, MOVEMENT_PATTERN_LABELS, MUSCLE_LABELS, type ChatMessage, type Exercise, type Muscle } from '../../db/types'
import { formatDateJa, mondayOf, todayKey } from '../../lib/dates'
import { formatSets } from '../../lib/workoutStats'
import { updateProposal } from '../../repo/chat'
import { loadCoachInputs, type CoachInputs } from '../../repo/coachData'
import { getLastRecord } from '../../repo/history'
import { getProfile } from '../../repo/profile'
import { getSettings } from '../../repo/settings'
import { exerciseLine, formatRest, hasWeight } from './proposalFormat'

interface Props {
  message: ChatMessage
  dayIndex: number
  exIndex: number
  /** 削除済みを除いた種目一覧 */
  catalog: Exercise[]
  onClose: () => void
}

const muscles = (list: Muscle[] | undefined) => (list?.length ? list.map((m) => MUSCLE_LABELS[m]).join('・') : 'なし')
const clampInt = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)))

/**
 * メニュー案の種目の詳細と、反映前に直すシート（設計書「メニュー案カード」）。
 * 詳細：動きの種類・部位・前回の記録・この重さにした理由。
 * 直す：セット数・回数・重さ・休憩、同じ枠のほかの種目への入れ替え。「保存」で案を置き換え、チェックし直す。
 * 反映済みの案は詳細だけ（直せない）。
 */
export function ProposalExerciseSheet({ message, dayIndex, exIndex, catalog, onClose }: Props) {
  const proposal = message.proposal!
  const day = proposal.days[dayIndex]
  const original = day.exercises[exIndex]
  const readOnly = message.appliedAt !== undefined
  const run = useSafeAction()
  const toast = useToast()
  const [draft, setDraft] = useState<ProposalExercise>(original)
  const [swapping, setSwapping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [inputs, setInputs] = useState<CoachInputs>()
  const settings = useLiveQuery(getSettings)
  const last = useLiveQuery(async () => (await getLastRecord(draft.exerciseId)) ?? null, [draft.exerciseId])
  const byId = new Map(catalog.map((e) => [e.id, e]))
  const ex = byId.get(draft.exerciseId)
  const name = ex?.name ?? '（見つからない種目）'

  // 入れ替えたときの重さの計算に使う記録・プロフィール（直せるときだけ読む）
  useEffect(() => {
    if (readOnly) return
    let alive = true
    const today = todayKey()
    loadCoachInputs(mondayOf(today), today).then((i) => alive && setInputs(i), () => {})
    return () => {
      alive = false
    }
  }, [readOnly])

  const set = (patch: Partial<ProposalExercise>) => setDraft((d) => ({ ...d, ...patch }))
  const profile = inputs?.profile
  const candidates = swapping && profile ? swapCandidates(proposal, day, draft, catalog, profile) : []

  const swap = (next: Exercise) => {
    if (!inputs || !profile) return
    setDraft((d) => swapExercise(proposal, day, d, next, profile, { sessions: inputs.sessions, profile, step: inputs.settings.weightStep }))
    setSwapping(false)
  }

  const save = async () => {
    setSaving(true)
    const ok = await run(async () => {
      const next = recheckProposal(replaceExercise(proposal, dayIndex, exIndex, draft, catalog), catalog, profile ?? (await getProfile()))
      await updateProposal(message.id, next)
    })
    setSaving(false)
    if (ok) {
      toast('メニュー案を保存しました')
      onClose()
    }
  }

  return (
    <Dialog title={name} onClose={onClose}>
      <dl className="ex-detail">
        <div>
          <dt>動きの種類</dt>
          <dd>{ex?.pattern ? MOVEMENT_PATTERN_LABELS[ex.pattern] : '—'}</dd>
        </div>
        <div>
          <dt>主に使う部位</dt>
          <dd>{muscles(ex?.primary)}</dd>
        </div>
        <div>
          <dt>補助で使う部位</dt>
          <dd>{muscles(ex?.secondary)}</dd>
        </div>
        <div>
          <dt>前回の記録</dt>
          <dd className="num">{last === undefined ? '' : last && ex ? `${formatDateJa(last.date)} ${formatSets(ex.logType, last.sets)}` : '記録なし'}</dd>
        </div>
        {draft.weightReason && (
          <div>
            <dt>この重さにした理由</dt>
            <dd>{draft.weightReason}</dd>
          </div>
        )}
        {readOnly && (
          <div>
            <dt>メニュー</dt>
            <dd className="num">{exerciseLine(draft, ex)}</dd>
          </div>
        )}
      </dl>

      {readOnly ? (
        <p className="muted">反映済みのメニュー案なので、ここでは直せません。</p>
      ) : (
        <>
          <div className="ex-edit">
            <div className="ex-edit-row">
              <span>セット数</span>
              <Stepper label="セット数" unit="セット" step={1} min={LIMITS.sets[0]} max={LIMITS.sets[1]} value={draft.sets}
                onChange={(v) => set({ sets: clampInt(v, LIMITS.sets) })} />
            </div>
            {ex?.logType !== 'time_distance' && (
              <div className="ex-edit-row">
                <span>回数</span>
                <Stepper label="回数" unit="回" step={1} min={LIMITS.reps[0]} max={LIMITS.reps[1]} value={draft.reps}
                  onChange={(v) => set({ reps: clampInt(v, LIMITS.reps) })} />
              </div>
            )}
            {hasWeight(ex) && (
              <div className="ex-edit-row">
                <span>重さ</span>
                <Stepper label="重さ" unit="kg" step={settings?.weightStep ?? 2.5} value={draft.weight ?? 0}
                  onChange={(weight) => set({ weight, weightReason: MANUAL_WEIGHT_REASON })} />
              </div>
            )}
            <div className="ex-edit-row">
              <span>休憩</span>
              <Stepper label="休憩" unit="秒" step={15} min={LIMITS.restSec[0]} max={LIMITS.restSec[1]} value={draft.restSec}
                onChange={(v) => set({ restSec: clampInt(v, LIMITS.restSec) })} />
            </div>
            <p className="muted num">回数の目安 {draft.repRange[0]}〜{draft.repRange[1]}回 ・ 休憩{formatRest(draft.restSec)}</p>
          </div>

          <button type="button" className="btn btn-block" aria-expanded={swapping} disabled={!profile} onClick={() => setSwapping((s) => !s)}>
            <ArrowLeftRight aria-hidden="true" />
            種目を入れ替える
          </button>
          {swapping && (
            candidates.length === 0 ? (
              <p className="muted">入れ替えられる種目がありません。</p>
            ) : (
              <ul className="list" aria-label="入れ替える種目">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button type="button" className="item" onClick={() => swap(c)}>
                      <span>{c.name}</span>
                      <span className="item-meta">{EQUIPMENT_LABELS[c.equipment]}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}

          <button type="button" className="btn btn-primary btn-block" disabled={saving} onClick={() => void save()}>
            <Check aria-hidden="true" />
            保存
          </button>
        </>
      )}
    </Dialog>
  )
}
