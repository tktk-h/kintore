import { useLiveQuery } from 'dexie-react-hooks'
import type { ReactNode } from 'react'
import { Stepper } from '../../components/Stepper'
import { LIMITS } from '../../coach/validate'
import { DEFAULT_SETTINGS, EQUIPMENT_LABELS, type Exercise } from '../../db/types'
import { weightStepFor } from '../../lib/weightStep'
import { getSettings } from '../../repo/settings'
import { hasWeight } from './proposalFormat'

export interface EditValues {
  sets: number
  reps?: number
  weight?: number
  restSec: number
}

const clampInt = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, Math.round(v)))

/**
 * 種目のセット数・回数・重さ・休憩を直すステッパー（メニュー案と予定の種目のシートで使う）。
 * 回数は時間・距離の種目では出さない。重さは重さを使う種目だけ
 */
export function ExerciseEditFields({ exercise: ex, values, onChange, children }: {
  exercise: Exercise | undefined
  values: EditValues
  onChange: (patch: Partial<EditValues>) => void
  children?: ReactNode
}) {
  const settings = useLiveQuery(getSettings)
  return (
    <div className="ex-edit">
      <div className="ex-edit-row">
        <span>セット数</span>
        <Stepper label="セット数" unit="セット" step={1} min={LIMITS.sets[0]} max={LIMITS.sets[1]} value={values.sets}
          onChange={(v) => onChange({ sets: clampInt(v, LIMITS.sets) })} />
      </div>
      {ex?.logType !== 'time_distance' && (
        <div className="ex-edit-row">
          <span>回数</span>
          <Stepper label="回数" unit="回" step={1} min={LIMITS.reps[0]} max={LIMITS.reps[1]} value={values.reps ?? LIMITS.reps[0]}
            onChange={(v) => onChange({ reps: clampInt(v, LIMITS.reps) })} />
        </div>
      )}
      {hasWeight(ex) && (
        <div className="ex-edit-row">
          <span>重さ</span>
          <Stepper label="重さ" unit="kg" step={weightStepFor(settings ?? DEFAULT_SETTINGS, ex?.equipment)} value={values.weight ?? 0}
            onChange={(weight) => onChange({ weight })} />
        </div>
      )}
      <div className="ex-edit-row">
        <span>休憩</span>
        <Stepper label="休憩" unit="秒" step={15} min={LIMITS.restSec[0]} max={LIMITS.restSec[1]} value={values.restSec}
          onChange={(v) => onChange({ restSec: clampInt(v, LIMITS.restSec) })} />
      </div>
      {children}
    </div>
  )
}

/** 入れ替える種目の候補の一覧 */
export function SwapCandidateList({ candidates, onPick }: { candidates: Exercise[]; onPick: (ex: Exercise) => void }) {
  if (candidates.length === 0) return <p className="muted">入れ替えられる種目がありません。</p>
  return (
    <ul className="list" aria-label="入れ替える種目">
      {candidates.map((c) => (
        <li key={c.id}>
          <button type="button" className="item" onClick={() => onPick(c)}>
            <span>{c.name}</span>
            <span className="item-meta">{EQUIPMENT_LABELS[c.equipment]}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
