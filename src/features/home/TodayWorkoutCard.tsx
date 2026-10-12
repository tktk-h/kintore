import { useLiveQuery } from 'dexie-react-hooks'
import { CircleCheck, Flame, ListChecks, Pause, Play, Plus, RotateCcw, Trophy, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useSafeAction } from '../../components/Toast'
import { db } from '../../db/db'
import { formatDuration } from '../../lib/dates'
import { getPlanForDate } from '../../repo/plans'
import { summarizeWorkout } from '../../repo/summary'
import { useRestTimer } from '../timer/RestTimerContext'
import {
  deleteWorkout,
  getActiveWorkout,
  getLastFinishedWorkout,
  getWorkoutDetail,
  listWorkoutsByDate,
  pauseWorkout,
  resumeWorkout,
  startWorkout,
  toPlannedExercises,
  type StartWorkoutOptions,
} from '../../repo/workouts'
import { RoutinePickerDialog } from './RoutinePickerDialog'

async function loadToday(date: string) {
  const active = await getActiveWorkout()
  const activeDetail = active ? await getWorkoutDetail(active.id) : undefined
  const finished = (await listWorkoutsByDate(date)).filter((w) => w.finishedAt !== undefined)
  const lastToday = finished[finished.length - 1]
  const finishedDetail = lastToday ? await getWorkoutDetail(lastToday.id) : undefined
  const summary = finishedDetail ? await summarizeWorkout(finishedDetail) : undefined
  const plan = await getPlanForDate(date)
  const planDone = plan !== undefined && finished.some((w) => w.plannedWorkoutId === plan.id)
  const planNames = plan ? (await db.exercises.bulkGet(plan.exercises.map((e) => e.exerciseId))).map((e) => e?.name ?? '') : []
  const last = await getLastFinishedWorkout()
  return { activeDetail, summary, plan: planDone ? undefined : plan, planNames, last }
}

export function TodayWorkoutCard({ date }: { date: string }) {
  const data = useLiveQuery(() => loadToday(date), [date])
  const [pickingRoutine, setPickingRoutine] = useState(false)
  const navigate = useNavigate()
  const run = useSafeAction()
  const timer = useRestTimer()
  // 開始処理中の連打を無視する
  const starting = useRef(false)

  if (!data) return null
  const { activeDetail, summary, plan, planNames, last } = data

  /** opts を作る処理も含めて1回だけ走らせる */
  const start = async (makeOpts: () => Promise<StartWorkoutOptions | undefined> | StartWorkoutOptions | undefined) => {
    if (starting.current) return
    starting.current = true
    try {
      let id = ''
      const ok = await run(async () => {
        const opts = await makeOpts()
        if (opts) id = await startWorkout(opts)
      }, 'トレーニングを開始できませんでした')
      if (ok && id) navigate(`/workout/${id}`)
    } finally {
      starting.current = false
    }
  }

  const startFromLast = () =>
    start(async () => {
      if (!last) return undefined
      const detail = await getWorkoutDetail(last.id)
      return detail && { date, title: last.title, exercises: toPlannedExercises(detail) }
    })

  if (activeDetail) {
    const total = activeDetail.exercises.length
    const doneCount = activeDetail.exercises.filter((e) => e.sets.length > 0 && e.sets.every((s) => s.done)).length
    const { workout } = activeDetail
    const paused = workout.pausedAt !== undefined
    const togglePause = async () => {
      if (paused) {
        if (await run(() => resumeWorkout(workout.id))) timer.resume()
      } else if (await run(() => pauseWorkout(workout.id))) timer.pause()
    }
    const cancel = async () => {
      if (!window.confirm('このトレーニングを取り消しますか？記録したセットも消えます')) return
      if (await run(() => deleteWorkout(workout.id))) timer.skip()
    }
    return (
      <section className="card hero stack">
        <div className="card-head">
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
          <span className="muted num">
            {doneCount}/{total}種目
          </span>
        </div>
        <h2 className="hero-title">{workout.title ?? 'トレーニング'}</h2>
        <div className="progress" aria-hidden="true">
          <span style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
        </div>
        <button type="button" className="btn btn-primary btn-block btn-big" onClick={() => navigate(`/workout/${workout.id}`)}>
          <Play aria-hidden="true" fill="currentColor" />
          続ける
        </button>
        <div className="btn-pair">
          <button type="button" className="btn" onClick={togglePause}>
            {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
            {paused ? '再開' : '一時停止'}
          </button>
          <button type="button" className="btn btn-danger" onClick={cancel}>
            <X aria-hidden="true" />
            キャンセル
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="card hero stack">
      <div className="card-head">
        <h2 className="card-title">
          <Flame aria-hidden="true" />
          今日のトレーニング
        </h2>
      </div>
      {summary && (
        <div className="stack-sm">
          <p className="done-line">
            <CircleCheck aria-hidden="true" />
            お疲れさまでした！
          </p>
          <div className="stats" aria-hidden="true">
            <div className="stat">
              <span className="stat-label">時間</span>
              <span className="stat-value">
                {Math.round(summary.durationMs / 60000)}
                <small>分</small>
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">セット</span>
              <span className="stat-value">{summary.doneSets}</span>
            </div>
            <div className="stat">
              <span className="stat-label">総重量</span>
              <span className="stat-value">
                {summary.volume.toLocaleString()}
                <small>kg</small>
              </span>
            </div>
          </div>
          <p className="sr-only">
            {formatDuration(summary.durationMs)}・{summary.doneSets}セット
          </p>
          <p className="sr-only">総重量 {summary.volume.toLocaleString()}kg</p>
          {summary.personalRecords.length > 0 && (
            <p className="pr-line">
              <Trophy aria-hidden="true" />
              <span>自己ベスト：{summary.personalRecords.join('、')}</span>
            </p>
          )}
        </div>
      )}
      {plan && (
        <>
          <div className="plan-box">
            <p className="eyebrow">今日の予定</p>
            <p className="plan-title">{plan.title}</p>
            <ul className="plan-list">
              {planNames.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </div>
          <button type="button" className="btn btn-primary btn-block btn-big" onClick={() => start(() => ({ date, plan }))}>
            <Play aria-hidden="true" fill="currentColor" />
            今日のトレーニングを始める
          </button>
        </>
      )}
      {!plan && (
        <div className="stack-sm">
          {last && (
            <button type="button" className={`btn btn-block ${summary ? '' : 'btn-primary btn-big'}`} onClick={startFromLast}>
              {summary ? <RotateCcw aria-hidden="true" /> : <Play aria-hidden="true" fill="currentColor" />}
              前回の「{last.title ?? 'トレーニング'}」で始める
            </button>
          )}
          <button type="button" className="btn btn-block" onClick={() => setPickingRoutine(true)}>
            <ListChecks aria-hidden="true" />
            マイメニューから選ぶ
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => start(() => ({ date }))}>
            <Plus aria-hidden="true" />
            空から始める
          </button>
        </div>
      )}
      {pickingRoutine && (
        <RoutinePickerDialog
          onClose={() => setPickingRoutine(false)}
          onPick={(routine) => {
            setPickingRoutine(false)
            void start(() => ({ date, title: routine.name, exercises: routine.exercises }))
          }}
        />
      )}
    </section>
  )
}
