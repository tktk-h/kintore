import { useLiveQuery } from 'dexie-react-hooks'
import { Dialog } from '../../components/Dialog'
import { MOVEMENT_PATTERN_LABELS, MUSCLE_LABELS, type Exercise, type Muscle, type PlannedExercise } from '../../db/types'
import { formatDateJa } from '../../lib/dates'
import { formatSet, formatSets } from '../../lib/workoutStats'
import { getLastRecord } from '../../repo/history'
import { formatRest } from '../coach/proposalFormat'

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

interface Props {
  planned: PlannedExercise
  exercise: Exercise | undefined
  onClose: () => void
}

/** カレンダーの予定の種目を押したときの詳細（見るだけ） */
export function PlannedExerciseSheet({ planned, exercise: ex, onClose }: Props) {
  const last = useLiveQuery(async () => (await getLastRecord(planned.exerciseId)) ?? null, [planned.exerciseId])
  return (
    <Dialog title={ex?.name ?? '種目'} onClose={onClose}>
      <dl className="ex-detail">
        <div>
          <dt>予定</dt>
          <dd className="num">{plannedLine(planned, ex)}</dd>
        </div>
        {planned.repRange && (
          <div>
            <dt>回数の目安</dt>
            <dd className="num">
              {planned.repRange[0]}〜{planned.repRange[1]}回
            </dd>
          </div>
        )}
        {ex && setsDiffer(planned) && (
          <div>
            <dt>セットごと</dt>
            <dd className="num">{planned.sets.map((s) => formatSet(ex.logType, s)).join(', ')}</dd>
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
    </Dialog>
  )
}
