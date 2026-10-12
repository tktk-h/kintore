import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { addSet, deleteSet, moveExercise, removeExerciseFromWorkout, setDone, updateExerciseNote, updateSet } from './workoutEdits'
import { getWorkoutDetail, startWorkout } from './workouts'

beforeEach(resetDb)

async function setup() {
  const id = await startWorkout({
    date: '2026-10-12',
    exercises: [
      { exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] },
      { exerciseId: 'ex-side-raise', restSec: 60, sets: [{ weight: 8, reps: 15 }] },
    ],
  })
  return { id, detail: (await getWorkoutDetail(id))! }
}

describe('workoutEdits', () => {
  it('セットの値を変更できる', async () => {
    const { id, detail } = await setup()
    await updateSet(detail.exercises[0].sets[0].id, { reps: 9 })
    expect((await getWorkoutDetail(id))!.exercises[0].sets[0]).toMatchObject({ weight: 60, reps: 9 })
  })

  it('完了にすると完了時刻が入り、戻すと消える', async () => {
    const { id, detail } = await setup()
    const setId = detail.exercises[0].sets[0].id
    await setDone(setId, true)
    expect((await getWorkoutDetail(id))!.exercises[0].sets[0]).toMatchObject({ done: true, doneAt: expect.any(Number) })
    await setDone(setId, false)
    expect((await getWorkoutDetail(id))!.exercises[0].sets[0].doneAt).toBeUndefined()
  })

  it('セット追加は最後のセットの値をコピーする', async () => {
    const { id, detail } = await setup()
    await addSet(detail.exercises[0].workoutExercise.id)
    const sets = (await getWorkoutDetail(id))!.exercises[0].sets
    expect(sets.map((s) => [s.order, s.weight, s.reps, s.done])).toEqual([
      [0, 60, 8, false],
      [1, 60, 8, false],
    ])
  })

  it('セットを削除できる', async () => {
    const { id, detail } = await setup()
    await deleteSet(detail.exercises[0].sets[0].id)
    expect((await getWorkoutDetail(id))!.exercises[0].sets).toEqual([])
  })

  it('種目を並べ替え・削除できる', async () => {
    const { id, detail } = await setup()
    await moveExercise(detail.exercises[1].workoutExercise.id, -1)
    expect((await getWorkoutDetail(id))!.exercises.map((e) => e.exercise.name)).toEqual(['サイドレイズ', 'ベンチプレス'])
    await removeExerciseFromWorkout(detail.exercises[1].workoutExercise.id)
    expect((await getWorkoutDetail(id))!.exercises.map((e) => e.exercise.name)).toEqual(['ベンチプレス'])
  })

  it('種目ごとのきつさとメモを保存できる', async () => {
    const { id, detail } = await setup()
    await updateExerciseNote(detail.exercises[0].workoutExercise.id, { effort: 4, note: '肩が少し痛い' })
    expect((await getWorkoutDetail(id))!.exercises[0].workoutExercise).toMatchObject({ effort: 4, note: '肩が少し痛い' })
  })
})
