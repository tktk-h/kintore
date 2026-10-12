import { useLiveQuery } from 'dexie-react-hooks'
import { Flag, Pause, Play, Plus, Save, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useSafeAction, useToast } from '../../components/Toast'
import { PageHeader } from '../../components/PageHeader'
import { DEFAULT_SETTINGS } from '../../db/types'
import { formatDateJa } from '../../lib/dates'
import { getSettings } from '../../repo/settings'
import {
  addExerciseToWorkout,
  deleteWorkout,
  finishWorkout,
  getWorkoutDetail,
  pauseWorkout,
  resumeWorkout,
  saveWorkoutAsRoutine,
} from '../../repo/workouts'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { useRestTimer } from '../timer/RestTimerContext'
import { RestTimerDisplay } from '../timer/RestTimerDisplay'
import { ExerciseBlock } from './ExerciseBlock'
import { FinishDialog } from './FinishDialog'

export function WorkoutPage() {
  const { id = '' } = useParams()
  const detail = useLiveQuery(() => getWorkoutDetail(id).then((d) => d ?? null), [id])
  const settings = useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
  const timer = useRestTimer()
  const run = useSafeAction()
  const toast = useToast()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)

  if (detail === undefined) return <div className="page"><PageHeader backTo="/" title="読み込み中…" /></div>
  if (detail === null) return <div className="page"><PageHeader backTo="/" title="トレーニングが見つかりません" /></div>

  const { workout, exercises } = detail
  const active = workout.finishedAt === undefined
  const paused = active && workout.pausedAt !== undefined

  const pause = async () => {
    if (await run(() => pauseWorkout(workout.id))) timer.pause()
  }
  const resume = async () => {
    if (await run(() => resumeWorkout(workout.id))) timer.resume()
  }

  const saveAsRoutine = async () => {
    const name = window.prompt('マイメニューの名前', workout.title ?? '')
    if (name?.trim() && (await run(() => saveWorkoutAsRoutine(workout.id, name.trim())))) toast('マイメニューに保存しました')
  }

  return (
    <div className="page">
      <PageHeader backTo="/" eyebrow={formatDateJa(workout.date)} title={workout.title ?? 'トレーニング'} />
      {active && (
        <div className="workout-status">
          {paused ? (
            <span className="eyebrow badge-paused">
              <Pause aria-hidden="true" />
              一時停止中
            </span>
          ) : (
            <span className="eyebrow live-label">
              <span className="live-dot" aria-hidden="true" />
              トレーニング中
            </span>
          )}
          <button type="button" className="btn btn-sm" onClick={paused ? resume : pause}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? '再開' : '一時停止'}
          </button>
        </div>
      )}
      <RestTimerDisplay variant={active ? 'big' : 'bar'} />
      {exercises.map((e, i) => (
        <ExerciseBlock
          key={e.workoutExercise.id}
          entry={e}
          before={workout.startedAt}
          settings={settings}
          isFirst={i === 0}
          isLast={i === exercises.length - 1}
          onSetDone={(done) => {
            if (!done || !active) return
            // 一時停止中にセットを記録したら、トレーニングを再開したとみなす
            if (paused) void run(() => resumeWorkout(workout.id))
            timer.start(e.workoutExercise.restSec)
          }}
        />
      ))}
      <button type="button" className="btn btn-add btn-block" aria-label="＋ 種目を追加" onClick={() => setPicking(true)}>
        <Plus aria-hidden="true" />
        種目を追加
      </button>
      {active ? (
        <button type="button" className="btn btn-primary btn-block btn-big" onClick={() => setFinishing(true)}>
          <Flag aria-hidden="true" />
          トレーニング終了
        </button>
      ) : (
        <button type="button" className="btn btn-block" onClick={saveAsRoutine}>
          <Save aria-hidden="true" />
          マイメニューとして保存
        </button>
      )}
      <button
        type="button"
        className="btn btn-danger btn-block"
        onClick={async () => {
          const message = active ? 'このトレーニングを取り消しますか？記録したセットも消えます' : 'このトレーニングを削除しますか？'
          if (window.confirm(message) && (await run(() => deleteWorkout(workout.id)))) {
            // 終了済みのトレーニングを消すときは、別のトレーニングの休憩タイマーかもしれないので止めない
            if (active) timer.skip()
            navigate('/')
          }
        }}
      >
        {active ? <X aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
        {active ? 'キャンセル（記録を取り消す）' : 'このトレーニングを削除'}
      </button>
      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={async (exercise) => {
            setPicking(false)
            await run(() => addExerciseToWorkout(workout.id, exercise.id))
          }}
        />
      )}
      {finishing && (
        <FinishDialog
          onCancel={() => setFinishing(false)}
          onSubmit={async (result) => {
            if (await run(() => finishWorkout(workout.id, result))) {
              timer.skip()
              navigate('/')
            }
          }}
        />
      )}
    </div>
  )
}
