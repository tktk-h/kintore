import { SetInputs } from '../../components/SetInputs'
import type { Exercise, SetRecord, SetValues, Settings } from '../../db/types'

interface Props {
  index: number
  set: SetRecord
  exercise: Exercise
  settings: Settings
  onChange: (changes: SetValues) => void
  onToggle: (done: boolean) => void
  onDelete: () => void
}

export function SetRow({ index, set, exercise, settings, onChange, onToggle, onDelete }: Props) {
  const no = index + 1
  return (
    <div className={`set-row ${set.done ? 'done' : ''}`}>
      <span className="set-no">{no}</span>
      <SetInputs logType={exercise.logType} bodyPart={exercise.bodyPart} values={set} settings={settings} onChange={onChange} />
      <input
        type="checkbox"
        className="set-check"
        aria-label={`${no}セット目 完了`}
        checked={set.done}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <button type="button" className="icon-btn" aria-label={`${no}セット目を削除`} onClick={onDelete}>
        ×
      </button>
    </div>
  )
}
