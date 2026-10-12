import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useSafeAction, useToast } from '../../components/Toast'
import { DEFAULT_SETTINGS, type PlannedExercise, type Routine } from '../../db/types'
import { todayKey } from '../../lib/dates'
import { listExercises } from '../../repo/exercises'
import { suggestSets } from '../../repo/history'
import { assignRoutineToDate } from '../../repo/plans'
import { createRoutine, deleteRoutine, getRoutine, updateRoutine } from '../../repo/routines'
import { getSettings } from '../../repo/settings'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { PlannedExerciseEditor } from './PlannedExerciseEditor'

export function RoutineEditPage() {
  const { id } = useParams()
  const routine = useLiveQuery(() => (id ? getRoutine(id).then((r) => r ?? null) : Promise.resolve(null)), [id])
  if (routine === undefined) return <div className="page">読み込み中…</div>
  return <RoutineForm key={id ?? 'new'} routine={routine} />
}

function RoutineForm({ routine }: { routine: Routine | null }) {
  const [name, setName] = useState(routine?.name ?? '')
  const [exercises, setExercises] = useState<PlannedExercise[]>(routine?.exercises ?? [])
  const [picking, setPicking] = useState(false)
  const [assignDate, setAssignDate] = useState(todayKey())
  const all = useLiveQuery(listExercises)
  const settings = useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
  const navigate = useNavigate()
  const run = useSafeAction()
  const toast = useToast()
  const byId = new Map(all?.map((e) => [e.id, e]))

  const input = () => ({ name: name.trim(), exercises })
  const save = async () => {
    const ok = await run(() => (routine ? updateRoutine(routine.id, input()) : createRoutine(input())))
    if (ok) navigate('/routines')
  }
  const move = (index: number, direction: -1 | 1) =>
    setExercises((list) => {
      const next = [...list]
      const target = index + direction
      if (target < 0 || target >= next.length) return list
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  return (
    <div className="page">
      <h1>{routine ? 'マイメニューを編集' : 'マイメニューを作成'}</h1>
      <label className="field">
        名前
        <input type="text" value={name} placeholder="例：胸の日" onChange={(e) => setName(e.target.value)} />
      </label>
      {exercises.map((pe, i) => {
        const exercise = byId.get(pe.exerciseId)
        if (!exercise) return null
        return (
          <PlannedExerciseEditor
            key={`${pe.exerciseId}-${i}`}
            value={pe}
            exercise={exercise}
            settings={settings}
            isFirst={i === 0}
            isLast={i === exercises.length - 1}
            onChange={(v) => setExercises((list) => list.map((x, j) => (j === i ? v : x)))}
            onMove={(d) => move(i, d)}
            onRemove={() => setExercises((list) => list.filter((_, j) => j !== i))}
          />
        )
      })}
      <button type="button" className="btn btn-block" onClick={() => setPicking(true)}>
        ＋ 種目を追加
      </button>
      <button type="button" className="btn btn-primary btn-block" disabled={!name.trim()} onClick={save}>
        保存
      </button>

      {routine && (
        <section className="card stack">
          <h2>日付に割り当てる</h2>
          <input type="date" aria-label="割り当てる日" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
          <button
            type="button"
            className="btn"
            disabled={!assignDate || !name.trim()}
            onClick={async () => {
              const ok = await run(async () => {
                await updateRoutine(routine.id, input())
                await assignRoutineToDate(routine.id, assignDate)
              })
              if (ok) toast('予定に入れました')
            }}
          >
            この日の予定にする
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              if (window.confirm(`「${routine.name}」を削除しますか？`) && (await run(() => deleteRoutine(routine.id)))) navigate('/routines')
            }}
          >
            このマイメニューを削除
          </button>
        </section>
      )}

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={async (exercise) => {
            setPicking(false)
            await run(async () => {
              const sets = await suggestSets(exercise)
              setExercises((list) => [...list, { exerciseId: exercise.id, restSec: exercise.defaultRestSec, sets }])
            }, '種目を追加できませんでした')
          }}
        />
      )}
    </div>
  )
}
