import type { BodyPart, Equipment, LogType, SetValues, Settings } from '../db/types'
import { weightStepFor } from '../lib/weightStep'
import { Stepper } from './Stepper'

interface Props {
  logType: LogType
  bodyPart: BodyPart
  /** 種目の器具（ダンベルならダンベルの刻み幅で重さを変える） */
  equipment?: Equipment
  values: SetValues
  settings: Settings
  /** 変更した項目だけを渡す */
  onChange: (changes: SetValues) => void
}

/** 記録形式に合わせた入力欄（トレーニング画面とマイメニュー編集で共通） */
export function SetInputs({ logType, bodyPart, equipment, values, settings, onChange }: Props) {
  const weightStep = weightStepFor(settings, equipment)
  if (logType === 'weight_reps') {
    return (
      <>
        <Stepper label="重量" unit="kg" value={values.weight ?? 0} step={weightStep} onChange={(weight) => onChange({ weight })} />
        <Stepper label="回数" unit="回" value={values.reps ?? 0} step={settings.repStep} onChange={(reps) => onChange({ reps })} />
      </>
    )
  }
  if (logType === 'reps') {
    return (
      <>
        <Stepper label="回数" unit="回" value={values.reps ?? 0} step={settings.repStep} onChange={(reps) => onChange({ reps })} />
        <Stepper label="加重" unit="kg" min={-200} value={values.weight ?? 0} step={weightStep} onChange={(weight) => onChange({ weight })} />
      </>
    )
  }
  if (bodyPart === 'cardio') {
    return (
      <>
        <Stepper
          label="時間"
          unit="分"
          value={Math.round((values.durationSec ?? 0) / 60)}
          step={1}
          onChange={(min) => onChange({ durationSec: min * 60 })}
        />
        <Stepper label="距離" unit="km" value={values.distanceKm ?? 0} step={0.1} onChange={(distanceKm) => onChange({ distanceKm })} />
      </>
    )
  }
  return <Stepper label="時間" unit="秒" value={values.durationSec ?? 0} step={15} onChange={(durationSec) => onChange({ durationSec })} />
}
