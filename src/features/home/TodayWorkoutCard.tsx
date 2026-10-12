import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useSafeAction } from '../../components/Toast'
import { db } from '../../db/db'
import { formatDuration } from '../../lib/dates'
import { getPlanForDate } from '../../repo/plans'
import { summarizeWorkout } from '../../repo/summary'
import {
  getActiveWorkout,
  getLastFinishedWorkout,
  getWorkoutDetail,
  listWorkoutsByDate,
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
    return (
      <section className="card stack">
        <h2>トレーニング中：{activeDetail.workout.title ?? 'トレーニング'}</h2>
        <p className="muted">
          {doneCount}/{total}種目
        </p>
        <button type="button" className="btn btn-primary btn-block btn-big" onClick={() => navigate(`/workout/${activeDetail.workout.id}`)}>
          続ける
        </button>
      </section>
    )
  }

  return (
    <section className="card stack">
      <h2>今日のトレーニング</h2>
      {summary && (
        <div className="stack">
          <p>
            お疲れさまでした！ {formatDuration(summary.durationMs)}・{summary.doneSets}セット
          </p>
          <p>総重量 {summary.volume.toLocaleString()}kg</p>
          {summary.personalRecords.length > 0 && <p>🏆 自己ベスト：{summary.personalRecords.join('、')}</p>}
        </div>
      )}
      {plan && (
        <>
          <p>
            <strong>{plan.title}</strong>
          </p>
          <ul className="list">
            {planNames.map((name, i) => (
              <li key={i} className="muted">
                {name}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary btn-block btn-big" onClick={() => start(() => ({ date, plan }))}>
            今日のトレーニングを始める
          </button>
        </>
      )}
      {!plan && (
        <>
          {last && (
            <button type="button" className={`btn btn-block ${summary ? '' : 'btn-primary'}`} onClick={startFromLast}>
              前回の「{last.title ?? 'トレーニング'}」で始める
            </button>
          )}
          <button type="button" className="btn btn-block" onClick={() => setPickingRoutine(true)}>
            マイメニューから選ぶ
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => start(() => ({ date }))}>
            空から始める
          </button>
        </>
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
