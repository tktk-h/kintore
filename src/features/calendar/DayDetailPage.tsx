import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { FACES } from '../../components/RatingPicker'
import { useSafeAction } from '../../components/Toast'
import { db } from '../../db/db'
import { formatDateJa } from '../../lib/dates'
import { formatSet } from '../../lib/workoutStats'
import { getBodyLog } from '../../repo/body'
import { assignRoutineToDate, deletePlan, getPlanForDate } from '../../repo/plans'
import { listRoutines } from '../../repo/routines'
import { getWorkoutDetail, listWorkoutsByDate, type WorkoutDetail } from '../../repo/workouts'

async function loadDay(date: string) {
  const workouts = await listWorkoutsByDate(date)
  const details = (await Promise.all(workouts.map((w) => getWorkoutDetail(w.id)))).filter((d): d is WorkoutDetail => !!d)
  const body = (await getBodyLog(date)) ?? null
  const plan = (await getPlanForDate(date)) ?? null
  const planNames = plan ? (await db.exercises.bulkGet(plan.exercises.map((e) => e.exerciseId))).map((e) => e?.name ?? '') : []
  return { details, body, plan, planNames }
}

export function DayDetailPage() {
  const { date = '' } = useParams()
  const data = useLiveQuery(() => loadDay(date), [date])
  const routines = useLiveQuery(listRoutines)
  const [routineId, setRoutineId] = useState('')
  const run = useSafeAction()

  if (!data) return <div className="page">読み込み中…</div>
  const { details, body, plan, planNames } = data
  const empty = details.length === 0 && !body && !plan

  return (
    <div className="page">
      <h1>{formatDateJa(date)}</h1>
      {empty && <p className="muted">この日の記録はありません</p>}

      {details.map(({ workout, exercises }) => (
        <section key={workout.id} className="card stack">
          <div className="row between">
            <h2>{workout.title ?? 'トレーニング'}</h2>
            <Link to={`/workout/${workout.id}`}>{workout.finishedAt === undefined ? '続ける' : '編集'}</Link>
          </div>
          {exercises.map(({ workoutExercise: we, exercise, sets }) => (
            <div key={we.id}>
              <strong>{exercise.name}</strong>
              <ul className="list">
                {sets
                  .filter((s) => s.done)
                  .map((s) => (
                    <li key={s.id}>{formatSet(exercise.logType, s)}</li>
                  ))}
              </ul>
              {(we.effort !== undefined || we.note) && (
                <p className="muted">
                  {we.effort !== undefined && `きつさ ${we.effort} `}
                  {we.note}
                </p>
              )}
            </div>
          ))}
          {(workout.condition !== undefined || workout.satisfaction !== undefined) && (
            <p>
              {workout.condition !== undefined && `調子 ${FACES[workout.condition - 1]}　`}
              {workout.satisfaction !== undefined && `満足度 ${workout.satisfaction}`}
            </p>
          )}
          {workout.note && <p className="muted">メモ：{workout.note}</p>}
        </section>
      ))}

      <section className="card stack">
        <div className="row between">
          <h2>体</h2>
          <Link to={`/body?date=${date}`}>{body ? '編集' : '記録する'}</Link>
        </div>
        {body?.weightKg !== undefined && <p>体重 {body.weightKg}kg</p>}
        {body?.bodyFatPct !== undefined && <p>体脂肪率 {body.bodyFatPct}%</p>}
        {body?.photo && <img className="photo" src={body.photo} alt={`${formatDateJa(date)}の写真`} />}
      </section>

      <section className="card stack">
        {plan ? (
          <>
            <h2>予定：{plan.title}</h2>
            <ul className="list">
              {planNames.map((name, i) => (
                <li key={i} className="muted">
                  {name}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-danger" onClick={() => run(() => deletePlan(plan.id))}>
              予定を削除
            </button>
          </>
        ) : (
          <>
            <h2>予定を入れる</h2>
            <label className="field">
              マイメニュー
              <select value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
                <option value="">選んでください</option>
                {routines?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-primary" disabled={!routineId} onClick={() => run(() => assignRoutineToDate(routineId, date))}>
              予定にする
            </button>
          </>
        )}
      </section>
    </div>
  )
}
