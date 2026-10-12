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
    <section className="card stack" aria-label={exercise.name}>
      <div className="exercise-head">
        <h2>{exercise.name}</h2>
        {!isFirst && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を上へ`} onClick={() => onMove(-1)}>
            ↑
          </button>
        )}
        {!isLast && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を下へ`} onClick={() => onMove(1)}>
            ↓
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={`${exercise.name}を削除`} onClick={onRemove}>
          🗑
        </button>
      </div>
      <div className="row">
        <span className="muted">休憩</span>
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
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onChange({ ...value, sets: [...value.sets, { ...(value.sets[value.sets.length - 1] ?? {}) }] })}
      >
        ＋ セット追加
      </button>
    </section>
  )
}
