import { ChevronDown, ChevronUp, Plus, Timer, Trash2, X } from 'lucide-react'
import { SetInputs } from '../../components/SetInputs'
import { Stepper } from '../../components/Stepper'
import type { Exercise, PlannedExercise, Settings } from '../../db/types'

interface Props {
  value: PlannedExercise
  exercise: Exercise
  settings: Settings
  isFirst: boolean
  isLast: boolean
  onChange: (value: PlannedExercise) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

export function PlannedExerciseEditor({ value, exercise, settings, isFirst, isLast, onChange, onMove, onRemove }: Props) {
  const updateSet = (index: number, changes: Partial<PlannedExercise['sets'][number]>) =>
    onChange({ ...value, sets: value.sets.map((s, i) => (i === index ? { ...s, ...changes } : s)) })
  return (
    <section className="card exercise-card" aria-label={exercise.name}>
      <div className="exercise-head">
        <h2>{exercise.name}</h2>
        {!isFirst && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を上へ`} onClick={() => onMove(-1)}>
            <ChevronUp aria-hidden="true" />
          </button>
        )}
        {!isLast && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を下へ`} onClick={() => onMove(1)}>
            <ChevronDown aria-hidden="true" />
          </button>
        )}
        <button type="button" className="icon-btn danger" aria-label={`${exercise.name}を削除`} onClick={onRemove}>
          <Trash2 aria-hidden="true" />
        </button>
      </div>
      <div className="rest-row">
        <span className="exercise-meta">
          <Timer aria-hidden="true" />
          休憩
        </span>
        <Stepper label="休憩時間" unit="秒" step={15} value={value.restSec} onChange={(restSec) => onChange({ ...value, restSec })} />
      </div>
      {value.sets.map((s, i) => (
        <div key={i} className="set-row">
          <span className="set-no">{i + 1}</span>
          <SetInputs logType={exercise.logType} bodyPart={exercise.bodyPart} values={s} settings={settings} onChange={(c) => updateSet(i, c)} />
          <button
            type="button"
            className="icon-btn"
            aria-label={`${i + 1}セット目を削除`}
            onClick={() => onChange({ ...value, sets: value.sets.filter((_, j) => j !== i) })}
          >
            <X aria-hidden="true" />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-add"
        aria-label="＋ セット追加"
        onClick={() => onChange({ ...value, sets: [...value.sets, { ...(value.sets[value.sets.length - 1] ?? {}) }] })}
      >
        <Plus aria-hidden="true" />
        セット追加
      </button>
    </section>
  )
}
