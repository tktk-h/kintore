import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { CalendarX2, Check } from 'lucide-react'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { FACES } from '../../components/RatingPicker'
import { useSafeAction } from '../../components/Toast'
import { db } from '../../db/db'
import { formatDateJa } from '../../lib/dates'
import { formatSet, totalVolume } from '../../lib/workoutStats'
import { getBodyLog } from '../../repo/body'
import { assignRoutineToDate, deletePlan, getPlanForDate } from '../../repo/plans'
import { listRoutines } from '../../repo/routines'
import { getWorkoutDetail, listWorkoutsByDate, workoutDurationMs, type WorkoutDetail } from '../../repo/workouts'

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

  if (!data) return <div className="page"><PageHeader backTo="/" title="読み込み中…" /></div>
  const { details, body, plan, planNames } = data
  const empty = details.length === 0 && !body && !plan

  return (
    <div className="page">
      <PageHeader backTo="/" title={formatDateJa(date)} />
      {empty && (
        <EmptyState icon={CalendarX2}>
          <p>この日の記録はありません</p>
        </EmptyState>
      )}

      {details.map(({ workout, exercises }) => {
        const doneCount = exercises.reduce((n, e) => n + e.sets.filter((x) => x.done).length, 0)
        const volume = totalVolume(exercises.map((e) => ({ logType: e.exercise.logType, sets: e.sets })))
        const minutes = workout.finishedAt !== undefined ? Math.round(workoutDurationMs(workout) / 60000) : undefined
        return (
          <CollapsibleCard
            key={workout.id}
            storageKey={`day.workout.${workout.id}`}
            title={workout.title ?? 'トレーニング'}
            titleClassName=""
            summary={minutes !== undefined ? `${minutes}分・${doneCount}セット` : `${doneCount}セット`}
            actions={<Link to={`/workout/${workout.id}`}>{workout.finishedAt === undefined ? '続ける' : '編集'}</Link>}
          >
            <p className="day-stats">
              {minutes !== undefined && <span>{minutes}分</span>}
              <span>{doneCount}セット</span>
              {volume > 0 && <span>総重量 {volume.toLocaleString('en-US')}kg</span>}
            </p>
            {exercises.map(({ workoutExercise: we, exercise, sets }) => {
              const doneN = sets.filter((x) => x.done).length
              const vol = totalVolume([{ logType: exercise.logType, sets }])
              return (
                <div key={we.id} className="day-exercise">
                  <div className="day-ex-head">
                    <strong>{exercise.name}</strong>
                    <span className="day-ex-sum">
                      {doneN}セット{exercise.logType === 'weight_reps' && vol > 0 && ` ${vol.toLocaleString('en-US')}kg`}
                    </span>
                  </div>
                  <ol className="day-sets">
                    {sets.map((s, i) => (
                      <li key={s.id} className={`day-set${s.done ? '' : ' is-undone'}`}>
                        <span className="day-set-no">{i + 1}</span>
                        <span className="day-set-val">{formatSet(exercise.logType, s)}</span>
                        {s.done ? (
                          <span className="day-set-mark" role="img" aria-label="完了">
                            <Check aria-hidden="true" />
                          </span>
                        ) : (
                          <span className="day-set-todo">未完了</span>
                        )}
                      </li>
                    ))}
                  </ol>
                  {(we.effort !== undefined || we.note) && (
                    <p className="muted">
                      {we.effort !== undefined && `きつさ ${we.effort} `}
                      {we.note}
                    </p>
                  )}
                </div>
              )
            })}
            {(workout.condition !== undefined || workout.satisfaction !== undefined) && (
              <p>
                {workout.condition !== undefined && `調子 ${FACES[workout.condition - 1]}　`}
                {workout.satisfaction !== undefined && `満足度 ${workout.satisfaction}`}
              </p>
            )}
            {workout.note && <p className="muted">メモ：{workout.note}</p>}
          </CollapsibleCard>
        )
      })}

      <CollapsibleCard
        storageKey="day.body"
        title="体"
        titleClassName=""
        summary={body?.weightKg !== undefined ? `${body.weightKg}kg` : undefined}
        actions={<Link to={`/body?date=${date}`}>{body ? '編集' : '記録する'}</Link>}
      >
        {body?.weightKg !== undefined && <p>体重 {body.weightKg}kg</p>}
        {body?.bodyFatPct !== undefined && <p>体脂肪率 {body.bodyFatPct}%</p>}
        {body?.photo && <img className="photo" src={body.photo} alt={`${formatDateJa(date)}の写真`} />}
      </CollapsibleCard>

      <CollapsibleCard
        storageKey="day.plan"
        title={plan ? `予定：${plan.title}` : '予定を入れる'}
        titleClassName=""
        summary={plan ? `${planNames.length}種目` : undefined}
      >
        {plan ? (
          <>
            <ul className="plan-list">
              {planNames.map((name, i) => (
                <li key={i}>
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
      </CollapsibleCard>
    </div>
  )
}
