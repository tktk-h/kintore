import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useSafeAction } from '../../components/Toast'
import type { Settings } from '../../db/types'
import { formatSets } from '../../lib/workoutStats'
import { getPreviousSets } from '../../repo/history'
import {
  addSet,
  deleteSet,
  moveExercise,
  removeExerciseFromWorkout,
  setDone,
  updateExerciseNote,
  updateSet,
} from '../../repo/workoutEdits'
import type { WorkoutExerciseDetail } from '../../repo/workouts'
import { ExerciseNoteDialog } from './ExerciseNoteDialog'
import { SetRow } from './SetRow'

interface Props {
  entry: WorkoutExerciseDetail
  /** この時刻より前の記録を「前回」とする */
  before: number
  settings: Settings
  isFirst: boolean
  isLast: boolean
  onSetDone: (done: boolean) => void
}

export function ExerciseBlock({ entry, before, settings, isFirst, isLast, onSetDone }: Props) {
  const { workoutExercise: we, exercise, sets } = entry
  const previous = useLiveQuery(() => getPreviousSets(exercise.id, before), [exercise.id, before])
  const run = useSafeAction()
  const [noteOpen, setNoteOpen] = useState(false)

  return (
    <section className="card" aria-label={exercise.name}>
      <div className="exercise-head">
        <h2>{exercise.name}</h2>
        <button type="button" className="icon-btn" aria-label={`${exercise.name}のメモ`} onClick={() => setNoteOpen(true)}>
          📝
        </button>
        {!isFirst && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を上へ`} onClick={() => run(() => moveExercise(we.id, -1))}>
            ↑
          </button>
        )}
        {!isLast && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を下へ`} onClick={() => run(() => moveExercise(we.id, 1))}>
            ↓
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={`${exercise.name}を削除`}
          onClick={() => {
            if (window.confirm(`${exercise.name}を削除しますか？`)) void run(() => removeExerciseFromWorkout(we.id))
          }}
        >
          🗑
        </button>
      </div>
      <p className="muted">
        休憩 {we.restSec}秒{previous && previous.length > 0 && ` ／ 前回 ${formatSets(exercise.logType, previous)}`}
      </p>
      {(we.effort !== undefined || we.note) && (
        <p className="muted">
          {we.effort !== undefined && `きつさ ${we.effort} `}
          {we.note}
        </p>
      )}
      {sets.map((s, i) => (
        <SetRow
          key={s.id}
          index={i}
          set={s}
          exercise={exercise}
          settings={settings}
          onChange={(changes) => void run(() => updateSet(s.id, changes))}
          onToggle={(done) => {
            void run(() => setDone(s.id, done))
            onSetDone(done)
          }}
          onDelete={() => {
            if (window.confirm(`${i + 1}セット目を削除しますか？`)) void run(() => deleteSet(s.id))
          }}
        />
      ))}
      <button type="button" className="btn btn-ghost" onClick={() => run(() => addSet(we.id))}>
        ＋ セット追加
      </button>
      {noteOpen && (
        <ExerciseNoteDialog
          title={exercise.name}
          workoutExercise={we}
          onClose={() => setNoteOpen(false)}
          onSave={async (changes) => {
            if (await run(() => updateExerciseNote(we.id, changes))) setNoteOpen(false)
          }}
        />
      )}
    </section>
  )
}
