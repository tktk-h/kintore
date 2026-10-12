import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { FACES, NUMBERS, RatingPicker } from '../../components/RatingPicker'
import type { Rating } from '../../db/types'
import type { FinishResult } from '../../repo/workouts'

interface Props {
  onCancel: () => void
  onSubmit: (result: FinishResult) => void
}

export function FinishDialog({ onCancel, onSubmit }: Props) {
  const [condition, setCondition] = useState<Rating>()
  const [satisfaction, setSatisfaction] = useState<Rating>()
  const [note, setNote] = useState('')
  return (
    <Dialog title="トレーニング終了" onClose={onCancel}>
      <div className="field">
        今日の調子
        <RatingPicker label="調子" symbols={FACES} value={condition} onChange={setCondition} />
      </div>
      <div className="field">
        満足度
        <RatingPicker label="満足度" symbols={NUMBERS} value={satisfaction} onChange={setSatisfaction} />
      </div>
      <label className="field">
        メモ
        <textarea rows={3} value={note} placeholder="例：睡眠不足で重く感じた" onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => onSubmit({ condition, satisfaction, note: note.trim() || undefined })}
      >
        終了する
      </button>
    </Dialog>
  )
}
