import { Dialog } from '../../components/Dialog'
import { EQUIPMENT_LABELS, type Exercise } from '../../db/types'
import { useExerciseFilter } from './ExerciseFilter'

interface Props {
  onPick: (exercise: Exercise) => void
  onClose: () => void
}

export function ExercisePicker({ onPick, onClose }: Props) {
  const { results, controls } = useExerciseFilter()
  return (
    <Dialog title="種目を選ぶ" onClose={onClose}>
      {controls}
      <ul className="list">
        {results.map((e) => (
          <li key={e.id}>
            <button type="button" className="item" onClick={() => onPick(e)}>
              {e.name}
              <span className="muted">{EQUIPMENT_LABELS[e.equipment]}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
