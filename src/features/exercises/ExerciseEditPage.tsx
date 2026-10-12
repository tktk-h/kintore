import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Stepper } from '../../components/Stepper'
import { useSafeAction } from '../../components/Toast'
import {
  BODY_PART_LABELS,
  BODY_PARTS,
  EQUIPMENT_LABELS,
  LOG_TYPE_LABELS,
  type BodyPart,
  type Equipment,
  type LogType,
} from '../../db/types'
import { createExercise, getExercise, updateExercise, type ExerciseInput } from '../../repo/exercises'

const EMPTY: ExerciseInput = { name: '', bodyPart: 'chest', equipment: 'barbell', logType: 'weight_reps', defaultRestSec: 90 }

export function ExerciseEditPage() {
  const { id } = useParams()
  const existing = useLiveQuery(() => (id ? getExercise(id).then((e) => e ?? null) : Promise.resolve(null)), [id])
  if (existing === undefined) return <div className="page">読み込み中…</div>
  if (id && existing === null) return <div className="page">種目が見つかりません</div>
  return <ExerciseForm key={id ?? 'new'} id={id} initial={existing ?? EMPTY} />
}

function ExerciseForm({ id, initial }: { id?: string; initial: ExerciseInput }) {
  const [form, setForm] = useState<ExerciseInput>({
    name: initial.name,
    bodyPart: initial.bodyPart,
    equipment: initial.equipment,
    logType: initial.logType,
    defaultRestSec: initial.defaultRestSec,
  })
  const navigate = useNavigate()
  const run = useSafeAction()
  const set = (changes: Partial<ExerciseInput>) => setForm((f) => ({ ...f, ...changes }))

  const save = async () => {
    const input = { ...form, name: form.name.trim() }
    const ok = await run(() => (id ? updateExercise(id, input) : createExercise(input)))
    if (ok) navigate('/exercises')
  }

  return (
    <div className="page">
      <h1>{id ? '種目を編集' : '種目を追加'}</h1>
      <label className="field">
        名前
        <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field">
        部位
        <select value={form.bodyPart} onChange={(e) => set({ bodyPart: e.target.value as BodyPart })}>
          {BODY_PARTS.map((p) => (
            <option key={p} value={p}>
              {BODY_PART_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        器具
        <select value={form.equipment} onChange={(e) => set({ equipment: e.target.value as Equipment })}>
          {Object.entries(EQUIPMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        記録の形式
        <select value={form.logType} onChange={(e) => set({ logType: e.target.value as LogType })}>
          {Object.entries(LOG_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        標準の休憩時間
        <Stepper label="休憩時間" unit="秒" step={15} value={form.defaultRestSec} onChange={(defaultRestSec) => set({ defaultRestSec })} />
      </div>
      <button type="button" className="btn btn-primary btn-block" disabled={!form.name.trim()} onClick={save}>
        保存
      </button>
    </div>
  )
}
