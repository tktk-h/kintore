import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowDown, ArrowUp, NotebookPen, Plus, Timer, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { CollapsibleCard } from '../../components/CollapsibleCard'
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
import { EffortPrompt } from './EffortPrompt'
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
  // 最後のセットにチェックしたら「きつさは？」を出す（すでにきつさがあれば出さない）
  const [askEffort, setAskEffort] = useState(false)

  return (
    <CollapsibleCard
      storageKey={`workout.exercise.${we.id}`}
      title={exercise.name}
      titleClassName="exercise-title"
      className="exercise-card"
      bodyClassName=""
      ariaLabel={exercise.name}
      summary={`${sets.filter((s) => s.done).length}/${sets.length}セット`}
      actionsWhenCollapsed={false}
      actions={
        <>
          <button type="button" className="icon-btn" aria-label={`${exercise.name}のメモ`} onClick={() => setNoteOpen(true)}>
            <NotebookPen aria-hidden="true" />
          </button>
          {!isFirst && (
            <button type="button" className="icon-btn" aria-label={`${exercise.name}を上へ`} onClick={() => run(() => moveExercise(we.id, -1))}>
              <ArrowUp aria-hidden="true" />
            </button>
          )}
          {!isLast && (
            <button type="button" className="icon-btn" aria-label={`${exercise.name}を下へ`} onClick={() => run(() => moveExercise(we.id, 1))}>
              <ArrowDown aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="icon-btn danger"
            aria-label={`${exercise.name}を削除`}
            onClick={() => {
              if (window.confirm(`${exercise.name}を削除しますか？`)) void run(() => removeExerciseFromWorkout(we.id))
            }}
          >
            <Trash2 aria-hidden="true" />
          </button>
        </>
      }
    >
      <p className="exercise-meta">
        <Timer aria-hidden="true" />
        <span>
          休憩 {we.restSec}秒{previous && previous.length > 0 && ` ／ 前回 ${formatSets(exercise.logType, previous)}`}
        </span>
      </p>
      {(we.effort !== undefined || we.note) && (
        <p className="exercise-note">
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
            if (!done) setAskEffort(false)
            void run(async () => {
              // 速く続けてチェックしても判定がずれないよう、保存後のDBの状態で判断する
              if ((await setDone(s.id, done)) && done) setAskEffort(true)
            })
            onSetDone(done)
          }}
          onDelete={() => {
            if (window.confirm(`${i + 1}セット目を削除しますか？`)) void run(() => deleteSet(s.id))
          }}
        />
      ))}
      {askEffort && we.effort === undefined && (
        <EffortPrompt
          onDismiss={() => setAskEffort(false)}
          onPick={async (effort) => {
            if (await run(() => updateExerciseNote(we.id, { effort, note: we.note }))) setAskEffort(false)
          }}
        />
      )}
      <button type="button" className="btn btn-add" aria-label="＋ セット追加" onClick={() => run(() => addSet(we.id))}>
        <Plus aria-hidden="true" />
        セット追加
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
    </CollapsibleCard>
  )
}
