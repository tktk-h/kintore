import { ChevronRight, Plus } from 'lucide-react'
import { Link } from 'react-router'
import { BODY_PART_LABELS, EQUIPMENT_LABELS } from '../../db/types'
import { useExerciseFilter } from './ExerciseFilter'

export function ExerciseListPage() {
  const { results, controls } = useExerciseFilter()
  return (
    <div className="page">
      <header className="page-header">
        <h1>種目</h1>
        <Link className="btn btn-primary btn-sm" to="/exercises/new">
          <Plus aria-hidden="true" />
          追加
        </Link>
      </header>
      {controls}
      <ul className="list">
        {results.map((e) => (
          <li key={e.id}>
            <Link className="item" to={`/exercises/${e.id}`}>
              {e.name}
              <span className="item-meta">
                {BODY_PART_LABELS[e.bodyPart]}・{EQUIPMENT_LABELS[e.equipment]}
                <ChevronRight aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
