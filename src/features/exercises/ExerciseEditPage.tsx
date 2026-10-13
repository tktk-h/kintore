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
  MOVEMENT_PATTERN_LABELS,
  MOVEMENT_PATTERNS,
  MUSCLE_LABELS,
  MUSCLES,
  type BodyPart,
  type Equipment,
  type LogType,
  type MovementPattern,
  type Muscle,
} from '../../db/types'
import { PageHeader } from '../../components/PageHeader'
import { createExercise, getExercise, updateExercise, type ExerciseInput } from '../../repo/exercises'

const EMPTY: ExerciseInput = { name: '', bodyPart: 'chest', equipment: 'barbell', logType: 'weight_reps', defaultRestSec: 90 }

export function ExerciseEditPage() {
  const { id } = useParams()
  const existing = useLiveQuery(() => (id ? getExercise(id).then((e) => e ?? null) : Promise.resolve(null)), [id])
  if (existing === undefined) return <div className="page"><PageHeader backTo="/routines?tab=exercises" title="読み込み中…" /></div>
  if (id && existing === null) return <div className="page"><PageHeader backTo="/routines?tab=exercises" title="種目が見つかりません" /></div>
  return <ExerciseForm key={id ?? 'new'} id={id} initial={existing ?? EMPTY} />
}

/** 部位をチップで複数選ぶ */
function MuscleChips({ label, value, onToggle }: { label: string; value: Muscle[]; onToggle: (m: Muscle) => void }) {
  return (
    <div className="field">
      {label}
      <div className="chips chips-wrap" role="group" aria-label={label}>
        {MUSCLES.map((m) => {
          const on = value.includes(m)
          return (
            <button key={m} type="button" className={`chip ${on ? 'selected' : ''}`} aria-pressed={on} onClick={() => onToggle(m)}>
              {MUSCLE_LABELS[m]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ExerciseForm({ id, initial }: { id?: string; initial: ExerciseInput }) {
  const [form, setForm] = useState<ExerciseInput>({
    name: initial.name,
    bodyPart: initial.bodyPart,
    equipment: initial.equipment,
    logType: initial.logType,
    defaultRestSec: initial.defaultRestSec,
    pattern: initial.pattern,
    primary: initial.primary ?? [],
    secondary: initial.secondary ?? [],
    compound: initial.compound,
  })
  const navigate = useNavigate()
  const run = useSafeAction()
  const set = (changes: Partial<ExerciseInput>) => setForm((f) => ({ ...f, ...changes }))
  const primary = form.primary ?? []
  const secondary = form.secondary ?? []

  /** 主と補助の両方には入れない（片方で選ぶともう片方から外す） */
  const toggleMuscle = (kind: 'primary' | 'secondary', m: Muscle) => {
    const mine = kind === 'primary' ? primary : secondary
    const other = kind === 'primary' ? secondary : primary
    const nextMine = mine.includes(m) ? mine.filter((x) => x !== m) : [...mine, m]
    const nextOther = other.filter((x) => x !== m)
    set(kind === 'primary' ? { primary: nextMine, secondary: nextOther } : { secondary: nextMine, primary: nextOther })
  }

  const save = async () => {
    const input: ExerciseInput = {
      ...form,
      name: form.name.trim(),
      // 選んでいない項目は「情報なし」として保存する
      primary: primary.length > 0 ? primary : undefined,
      secondary: form.pattern || primary.length > 0 || secondary.length > 0 ? secondary : undefined,
    }
    const ok = await run(() => (id ? updateExercise(id, input) : createExercise(input)))
    if (ok) navigate('/routines?tab=exercises')
  }

  return (
    <div className="page">
      <PageHeader backTo="/routines?tab=exercises" title={id ? '種目を編集' : '種目を追加'} />
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
      <label className="field">
        動きの種類
        <select
          value={form.pattern ?? ''}
          onChange={(e) => set({ pattern: e.target.value ? (e.target.value as MovementPattern) : undefined })}
        >
          <option value="">未設定</option>
          {MOVEMENT_PATTERNS.map((p) => (
            <option key={p} value={p}>
              {MOVEMENT_PATTERN_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <MuscleChips label="主に使う部位" value={primary} onToggle={(m) => toggleMuscle('primary', m)} />
      <MuscleChips label="補助で使う部位" value={secondary} onToggle={(m) => toggleMuscle('secondary', m)} />
      <label className="field">
        複数関節
        <select
          value={form.compound === undefined ? '' : form.compound ? 'yes' : 'no'}
          onChange={(e) => set({ compound: e.target.value === '' ? undefined : e.target.value === 'yes' })}
        >
          <option value="">未設定</option>
          <option value="yes">複数関節</option>
          <option value="no">単関節</option>
        </select>
      </label>
      <button type="button" className="btn btn-primary btn-block" disabled={!form.name.trim()} onClick={save}>
        保存
      </button>
    </div>
  )
}
