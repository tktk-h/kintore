import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, Check, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { useSafeAction, useToast } from '../../components/Toast'
import { sameMovementCandidates } from '../../coach/edit'
import { db } from '../../db/db'
import { MOVEMENT_PATTERN_LABELS, MUSCLE_LABELS, type Exercise, type Muscle, type PlannedExercise, type PlannedWorkout } from '../../db/types'
import { formatDateJa } from '../../lib/dates'
import { formatSet, formatSets } from '../../lib/workoutStats'
import { getLastRecord } from '../../repo/history'
import { editPlannedExercise, plannedValues, removePlannedExercise, updatePlannedExercise, type PlannedValues } from '../../repo/plans'
import { getProfile } from '../../repo/profile'
import { listWorkoutsByDate } from '../../repo/workouts'
import { ExerciseEditFields, SwapCandidateList } from '../coach/ExerciseEditFields'
import { formatRest, hasWeight } from '../coach/proposalFormat'

const muscles = (list: Muscle[] | undefined) => (list?.length ? list.map((m) => MUSCLE_LABELS[m]).join('・') : 'なし')

/** 予定の種目の1行の要約：「10×3 ・ 60kg ・ 休憩2分」（回数×セット数） */
export function plannedLine(pe: PlannedExercise, ex: Exercise | undefined): string {
  const first = pe.sets[0]
  const parts: string[] = []
  if (ex?.logType === 'time_distance' || first?.reps === undefined) parts.push(`${pe.sets.length}セット`)
  else parts.push(`${first.reps}×${pe.sets.length}`)
  if (first?.weight !== undefined && first.weight !== 0 && ex?.logType === 'weight_reps') parts.push(`${first.weight}kg`)
  parts.push(`休憩${formatRest(pe.restSec)}`)
  return parts.join(' ・ ')
}

/** セットごとに重さや回数が違うか */
const setsDiffer = (pe: PlannedExercise) =>
  pe.sets.some((s) => s.weight !== pe.sets[0]?.weight || s.reps !== pe.sets[0]?.reps || s.durationSec !== pe.sets[0]?.durationSec)

async function loadSheet(plan: PlannedWorkout) {
  const catalog = await db.exercises.toArray()
  const profile = await getProfile()
  const started = (await listWorkoutsByDate(plan.date)).some((w) => w.plannedWorkoutId === plan.id)
  return { catalog, profile, started }
}

interface Props {
  plan: PlannedWorkout
  index: number
  onClose: () => void
}

/**
 * 予定の種目を押したときの詳細と、始める前に直すシート。
 * 直す：セット数・回数・重さ・休憩、同じ動きのほかの種目への入れ替え、予定から外す。
 * その予定のトレーニングをもう始めていたら見るだけ
 */
export function PlannedExerciseSheet({ plan, index, onClose }: Props) {
  const planned = plan.exercises[index]
  const data = useLiveQuery(() => loadSheet(plan), [plan])
  const run = useSafeAction()
  const toast = useToast()
  const [draft, setDraft] = useState<PlannedValues>(() => plannedValues(planned))
  const [swapping, setSwapping] = useState(false)
  const [saving, setSaving] = useState(false)
  const last = useLiveQuery(async () => (await getLastRecord(draft.exerciseId)) ?? null, [draft.exerciseId])
  const ex = data?.catalog.find((e) => e.id === draft.exerciseId)
  const preview = editPlannedExercise(planned, draft)
  const editable = data !== undefined && !data.started
  const candidates = swapping && data && ex ? sameMovementCandidates(ex, data.catalog, data.profile) : []

  const swap = (next: Exercise) => {
    setDraft((d) => ({ ...d, exerciseId: next.id, weight: hasWeight(next) ? (d.weight ?? next.startWeight ?? 0) : undefined }))
    setSwapping(false)
  }

  const save = async () => {
    setSaving(true)
    const ok = await run(() => updatePlannedExercise(plan.id, index, preview))
    setSaving(false)
    if (ok) {
      toast('予定を保存しました')
      onClose()
    }
  }

  const remove = async () => {
    if (!window.confirm('この種目を予定から外しますか？')) return
    if (await run(() => removePlannedExercise(plan.id, index))) {
      toast('予定から外しました')
      onClose()
    }
  }

  return (
    <Dialog title={ex?.name ?? '種目'} onClose={onClose}>
      <dl className="ex-detail">
        <div>
          <dt>予定</dt>
          <dd className="num">{plannedLine(preview, ex)}</dd>
        </div>
        {planned.repRange && (
          <div>
            <dt>回数の目安</dt>
            <dd className="num">
              {planned.repRange[0]}〜{planned.repRange[1]}回
            </dd>
          </div>
        )}
        {ex && setsDiffer(preview) && (
          <div>
            <dt>セットごと</dt>
            <dd className="num">{preview.sets.map((s) => formatSet(ex.logType, s)).join(', ')}</dd>
          </div>
        )}
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
      </dl>

      {data?.started && <p className="muted">始めたトレーニングはトレーニング画面で変えられます</p>}
      {editable && (
        <>
          <ExerciseEditFields exercise={ex} values={draft} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />

          <button type="button" className="btn btn-block" aria-expanded={swapping} disabled={!ex} onClick={() => setSwapping((s) => !s)}>
            <ArrowLeftRight aria-hidden="true" />
            種目を入れ替える
          </button>
          {swapping && <SwapCandidateList candidates={candidates} onPick={swap} />}

          <button type="button" className="btn btn-primary btn-block" disabled={saving} onClick={() => void save()}>
            <Check aria-hidden="true" />
            保存
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => void remove()}>
            <Trash2 aria-hidden="true" />
            この種目を予定から外す
          </button>
        </>
      )}
    </Dialog>
  )
}
