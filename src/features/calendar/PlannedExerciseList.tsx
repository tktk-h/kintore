import { ExerciseRow, ExerciseRows } from '../../components/ExerciseRow'
import { BODY_PART_COLORS, BODY_PART_LABELS, type Exercise, type PlannedWorkout } from '../../db/types'
import { workoutSummary } from '../coach/proposalFormat'
import { plannedLine, plannedVolume, plannedWeight } from './PlannedExerciseSheet'

interface Props {
  plan: PlannedWorkout
  /** plan.exercises と同じ順の種目 */
  exercises: (Exercise | undefined)[]
  onOpen: (index: number) => void
}

/** 予定の種目を1行ずつ。上に部位のチップと「6種目・約55分」 */
export function PlannedExerciseList({ plan, exercises, onOpen }: Props) {
  const parts = [...new Set(exercises.map((ex) => ex?.bodyPart).filter((p) => p !== undefined))]
  const totalSets = plan.exercises.reduce((n, pe) => n + pe.sets.length, 0)
  return (
    <div className="planned-list">
      <div className="planned-summary">
        {parts.length > 0 && (
          <span className="day-group-tags">
            {parts.map((p) => (
              <span key={p} className="day-tag" style={{ color: BODY_PART_COLORS[p], borderColor: BODY_PART_COLORS[p] }}>
                {BODY_PART_LABELS[p]}
              </span>
            ))}
          </span>
        )}
        <span className="planned-summary-text num">{workoutSummary(plan.exercises.length, totalSets)}</span>
      </div>
      <ExerciseRows>
        {plan.exercises.map((pe, i) => {
          const ex = exercises[i]
          const name = ex?.name ?? '種目'
          return (
            <ExerciseRow
              key={i}
              name={name}
              volume={plannedVolume(pe, ex)}
              weight={plannedWeight(pe, ex)}
              color={ex && BODY_PART_COLORS[ex.bodyPart]}
              ariaLabel={`${name} ${plannedLine(pe, ex)}`}
              onClick={() => onOpen(i)}
            />
          )
        })}
      </ExerciseRows>
    </div>
  )
}
