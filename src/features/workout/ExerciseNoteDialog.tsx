import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { NUMBERS, RatingPicker } from '../../components/RatingPicker'
import type { Rating, WorkoutExercise } from '../../db/types'

interface Props {
  title: string
  workoutExercise: WorkoutExercise
  onSave: (changes: { effort: Rating | undefined; note: string | undefined }) => void
  onClose: () => void
}

export function ExerciseNoteDialog({ title, workoutExercise, onSave, onClose }: Props) {
  const [effort, setEffort] = useState(workoutExercise.effort)
  const [note, setNote] = useState(workoutExercise.note ?? '')
  return (
    <Dialog title={`${title}のメモ`} onClose={onClose}>
      <div className="field">
        きつさ（1:楽 〜 5:限界）
        <RatingPicker label="きつさ" symbols={NUMBERS} value={effort} onChange={setEffort} />
      </div>
      <label className="field">
        メモ
        <textarea rows={3} value={note} placeholder="例：肩が少し痛んだ、グリップ幅を変えた" onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="button" className="btn btn-primary btn-block" onClick={() => onSave({ effort, note: note.trim() || undefined })}>
        保存
      </button>
    </Dialog>
  )
}
