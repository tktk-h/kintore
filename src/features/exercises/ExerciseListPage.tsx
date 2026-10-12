import { Link } from 'react-router'
import { BODY_PART_LABELS, EQUIPMENT_LABELS } from '../../db/types'
import { useExerciseFilter } from './ExerciseFilter'

export function ExerciseListPage() {
  const { results, controls } = useExerciseFilter()
  return (
    <div className="page">
      <header className="page-header">
        <h1>種目</h1>
        <Link className="btn btn-primary" to="/exercises/new">
          ＋ 追加
        </Link>
      </header>
      {controls}
      <ul className="list">
        {results.map((e) => (
          <li key={e.id}>
            <Link className="item" to={`/exercises/${e.id}`}>
              {e.name}
              <span className="muted">
                {BODY_PART_LABELS[e.bodyPart]}・{EQUIPMENT_LABELS[e.equipment]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
