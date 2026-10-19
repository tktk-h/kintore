import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { CalendarX2 } from 'lucide-react'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { EmptyState } from '../../components/EmptyState'
import { PageHeader } from '../../components/PageHeader'
import { FACES } from '../../components/RatingPicker'
import { useSafeAction } from '../../components/Toast'
import { db } from '../../db/db'
import { BODY_PART_COLORS } from '../../db/types'
import { formatDateJa } from '../../lib/dates'
import { formatSetsCompact, totalVolume } from '../../lib/workoutStats'
import { getBodyLog } from '../../repo/body'
import { assignRoutineToDate, deletePlan, getPlanForDate } from '../../repo/plans'
import { listRoutines } from '../../repo/routines'
import { getWorkoutDetail, listWorkoutsByDate, workoutDurationMs, type WorkoutDetail } from '../../repo/workouts'
import { PlannedExerciseList } from './PlannedExerciseList'
import { PlannedExerciseSheet } from './PlannedExerciseSheet'

async function loadDay(date: string) {
  const workouts = await listWorkoutsByDate(date)
  const details = (await Promise.all(workouts.map((w) => getWorkoutDetail(w.id)))).filter((d): d is WorkoutDetail => !!d)
  const body = (await getBodyLog(date)) ?? null
  const plan = (await getPlanForDate(date)) ?? null
  const planExercises = plan ? await db.exercises.bulkGet(plan.exercises.map((e) => e.exerciseId)) : []
  return { details, body, plan, planExercises }
}

export function DayDetailPage() {
  const { date = '' } = useParams()
  const data = useLiveQuery(() => loadDay(date), [date])
  const routines = useLiveQuery(listRoutines)
  const [routineId, setRoutineId] = useState('')
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const run = useSafeAction()

  if (!data) return <div className="page"><PageHeader backTo="/" title="読み込み中…" /></div>
  const { details, body, plan, planExercises } = data
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
            <ul className="ex-rows">
              {exercises.map(({ workoutExercise: we, exercise, sets }) => {
                const done = sets.filter((x) => x.done)
                const undoneN = sets.length - done.length
                return (
                  <li key={we.id} className="ex-row-item day-rec">
                    <div className="day-rec-main">
                      <i className="ex-row-dot" style={{ background: BODY_PART_COLORS[exercise.bodyPart] }} aria-hidden="true" />
                      <span className="day-rec-name">{exercise.name}</span>
                      <span className="day-rec-sets num">
                        {done.length > 0 && <span className="day-rec-done">{formatSetsCompact(exercise.logType, done)}</span>}
                        {undoneN > 0 && <span className="day-rec-undone">+{undoneN} 未完了</span>}
                        {we.effort !== undefined && <span className="day-rec-effort">きつさ{we.effort}</span>}
                      </span>
                    </div>
                    {we.note && <p className="day-rec-note">{we.note}</p>}
                  </li>
                )
              })}
            </ul>
            {(workout.condition !== undefined || workout.satisfaction !== undefined || workout.note) && (
              <p className="day-rec-foot">
                {workout.condition !== undefined && <span>調子 {FACES[workout.condition - 1]}</span>}
                {workout.satisfaction !== undefined && <span>満足度 {workout.satisfaction}</span>}
                {workout.note && <span className="day-rec-memo">メモ：{workout.note}</span>}
              </p>
            )}
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
        summary={plan ? `${plan.exercises.length}種目` : undefined}
      >
        {plan ? (
          <>
            <PlannedExerciseList plan={plan} exercises={planExercises} onOpen={setOpenIndex} />
            {openIndex !== null && plan.exercises[openIndex] && (
              <PlannedExerciseSheet plan={plan} index={openIndex} onClose={() => setOpenIndex(null)} />
            )}
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
