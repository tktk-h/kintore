import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { PageHeader } from '../../components/PageHeader'
import { Stepper } from '../../components/Stepper'
import { useSafeAction } from '../../components/Toast'
import { ACCESS_LABELS, EXPERIENCE_LABELS, GOAL_LABELS } from '../../coach/context'
import { chooseSplit, effectiveDays, SPLIT_LABELS } from '../../coach/split'
import type { SplitType } from '../../coach/types'
import type { BaselineLift, EquipmentAccess, Experience, Goal, Profile } from '../../db/types'
import { WEEKDAYS } from '../../lib/dates'
import { getProfile, saveProfile } from '../../repo/profile'

/** 今の重量を聞く4種目 */
export const BASELINE_LIFTS: { id: string; name: string }[] = [
  { id: 'ex-bench-press', name: 'ベンチプレス' },
  { id: 'ex-squat', name: 'スクワット' },
  { id: 'ex-deadlift', name: 'デッドリフト' },
  { id: 'ex-overhead-press', name: 'オーバーヘッドプレス' },
]

/** 分割法の選択肢。自動は希望なし（日数と経験から選ぶ） */
const SPLIT_CHOICES: ChipOption<SplitType | undefined>[] = [
  { value: undefined, label: '自動（おすすめ）' },
  { value: 'full_body', label: '全身法' },
  { value: 'upper_lower', label: '上半身・下半身' },
  { value: 'ppl', label: 'PPL' },
  { value: 'ul_ppl', label: '上下＋PPL' },
]

/** 月曜始まりで並べる（値は 0=日〜6=土） */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]

interface ChipOption<T> { value: T; label: string }

function ChipGroup<T>({ label, options, isOn, onToggle }: {
  label: string
  options: ChipOption<T>[]
  isOn: (v: T) => boolean
  onToggle: (v: T) => void
}) {
  return (
    <div className="field">
      {label}
      <div className="chips chips-wrap" role="group" aria-label={label}>
        {options.map((o) => {
          const on = isOn(o.value)
          return (
            <button key={String(o.value)} type="button" className={`chip ${on ? 'selected' : ''}`} aria-pressed={on} onClick={() => onToggle(o.value)}>
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const options = <T extends string>(labels: Record<T, string>): ChipOption<T>[] =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))

type BaselineText = Record<string, { weight: string; reps: string }>

function toBaselineText(baselines: BaselineLift[]): BaselineText {
  return Object.fromEntries(BASELINE_LIFTS.map(({ id }) => {
    const b = baselines.find((x) => x.exerciseId === id)
    return [id, { weight: b ? String(b.weight) : '', reps: b ? String(b.reps) : '' }]
  }))
}

function toBaselines(text: BaselineText): BaselineLift[] {
  return BASELINE_LIFTS.flatMap(({ id }) => {
    const weight = Number(text[id].weight)
    const reps = Math.round(Number(text[id].reps))
    return text[id].weight !== '' && text[id].reps !== '' && weight > 0 && reps > 0 ? [{ exerciseId: id, weight, reps }] : []
  })
}

function ProfileForm({ initial }: { initial: Profile | null }) {
  const navigate = useNavigate()
  const run = useSafeAction()
  const [goal, setGoal] = useState<Goal | undefined>(initial?.goal)
  const [experience, setExperience] = useState<Experience | undefined>(initial?.experience)
  const [daysPerWeek, setDaysPerWeek] = useState(initial?.daysPerWeek ?? 3)
  const [minutes, setMinutes] = useState(initial?.minutesPerSession ?? 60)
  const [weekdays, setWeekdays] = useState<number[]>(initial?.weekdays ?? [])
  const [equipment, setEquipment] = useState<EquipmentAccess[]>(initial?.equipment ?? [])
  const [injuries, setInjuries] = useState(initial?.injuries ?? '')
  const [baselines, setBaselines] = useState<BaselineText>(() => toBaselineText(initial?.baselines ?? []))
  const [preferredSplit, setPreferredSplit] = useState<SplitType | undefined>(initial?.preferredSplit)
  const [error, setError] = useState<string>()
  // 選んだ分割法が今の日数・経験で組めないときは、何で組むかを知らせる
  const actualSplit = preferredSplit && experience ? chooseSplit(daysPerWeek, experience, preferredSplit) : undefined
  const splitNote = preferredSplit && experience && actualSplit !== preferredSplit
    ? `今の条件（週${effectiveDays(daysPerWeek, experience)}日・経験）では${SPLIT_LABELS[preferredSplit]}を組めないため、${SPLIT_LABELS[actualSplit!]}で組みます。`
    : undefined

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const save = async () => {
    const missing = [
      !goal && '目標',
      !experience && '経験',
      weekdays.length === 0 && '行ける曜日',
      equipment.length === 0 && '使える器具',
    ].filter(Boolean)
    if (!goal || !experience || missing.length > 0) {
      setError(`${missing.join('・')}を選んでください。`)
      return
    }
    setError(undefined)
    const ok = await run(() => saveProfile({
      goal, experience, daysPerWeek, minutesPerSession: minutes,
      weekdays: [...weekdays].sort((a, b) => a - b),
      equipment: (Object.keys(ACCESS_LABELS) as EquipmentAccess[]).filter((e) => equipment.includes(e)),
      injuries: injuries.trim(),
      baselines: toBaselines(baselines),
      ...(preferredSplit ? { preferredSplit } : {}),
    }))
    if (ok) navigate('/coach')
  }

  return (
    <div className="page">
      <PageHeader backTo="/coach" eyebrow="AIコーチ" title="プロフィール" />
      <p className="muted">メニュー作りに使います。あとから設定でいつでも変えられます。</p>
      <ChipGroup label="目標" options={options(GOAL_LABELS)} isOn={(v) => v === goal} onToggle={setGoal} />
      <ChipGroup label="経験" options={options(EXPERIENCE_LABELS)} isOn={(v) => v === experience} onToggle={setExperience} />
      <div className="field">
        週の回数
        <Stepper label="週の回数" unit="回" step={1} min={1} max={7} value={daysPerWeek} onChange={setDaysPerWeek} />
      </div>
      <div className="field">
        1回の時間
        <Stepper label="1回の時間" unit="分" step={10} min={10} max={240} value={minutes} onChange={setMinutes} />
      </div>
      <ChipGroup
        label="行ける曜日"
        options={WEEKDAY_ORDER.map((d) => ({ value: d, label: WEEKDAYS[d] }))}
        isOn={(v) => weekdays.includes(v)}
        onToggle={(v) => setWeekdays((w) => toggle(w, v))}
      />
      {weekdays.length > 0 && weekdays.length < Math.min(daysPerWeek, 6) && (
        <p className="muted">行ける曜日が週の回数より少ないので、曜日の数に合わせて組みます。</p>
      )}
      <ChipGroup
        label="分割法"
        options={SPLIT_CHOICES}
        isOn={(v) => v === preferredSplit}
        onToggle={setPreferredSplit}
      />
      {splitNote && <p className="muted">{splitNote}</p>}
      <ChipGroup
        label="使える器具"
        options={options(ACCESS_LABELS)}
        isOn={(v) => equipment.includes(v)}
        onToggle={(v) => setEquipment((e) => toggle(e, v))}
      />
      <label className="field">
        ケガや痛む所
        <textarea rows={2} value={injuries} placeholder="例：右肩が痛い、腰に不安がある（なければ空のまま）" onChange={(e) => setInjuries(e.target.value)} />
      </label>
      <div className="field">
        今の重量（任意）
        <p className="muted">挙げられる重量と回数。記録がある種目は記録を優先します。</p>
        <div className="baseline-list">
          {BASELINE_LIFTS.map(({ id, name }) => (
            <div key={id} className="baseline-row">
              <span className="baseline-name">{name}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                aria-label={`${name}の重量`}
                placeholder="kg"
                value={baselines[id].weight}
                onChange={(e) => setBaselines((b) => ({ ...b, [id]: { ...b[id], weight: e.target.value } }))}
              />
              <span className="baseline-x" aria-hidden="true">×</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                aria-label={`${name}の回数`}
                placeholder="回"
                value={baselines[id].reps}
                onChange={(e) => setBaselines((b) => ({ ...b, [id]: { ...b[id], reps: e.target.value } }))}
              />
            </div>
          ))}
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={save}>
        保存
      </button>
    </div>
  )
}

/** AIコーチのプロフィールの聞き取り・編集（設計書「プロフィールの聞き取り」） */
export function ProfilePage() {
  const profile = useLiveQuery(async () => (await getProfile()) ?? null)
  if (profile === undefined) return <div className="page"><PageHeader backTo="/coach" eyebrow="AIコーチ" title="プロフィール" /></div>
  return <ProfileForm initial={profile} />
}
