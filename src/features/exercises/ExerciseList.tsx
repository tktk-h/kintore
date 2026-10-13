import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router'
import { BODY_PART_LABELS, EQUIPMENT_LABELS } from '../../db/types'
import { useExerciseFilter } from './ExerciseFilter'

/** 種目の一覧（「メニュー」画面のタブの中身） */
export function ExerciseList() {
  const { results, controls } = useExerciseFilter()
  return (
    <>
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
    </>
  )
}
