import { useRef, useState } from 'react'

interface Props {
  label: string
  value: number
  step: number
  min?: number
  unit?: string
  onChange: (value: number) => void
}

const round = (v: number) => Math.round(v * 100) / 100

/**
 * 表示する値は自分でも持つ（保存が終わるのを待たずに連打しても増えるように）。
 * value が外から変わったときだけ、それに合わせ直す。
 * 連打は再描画を待たずに届くことがあるので、最新の値は ref からも読む
 */
export function Stepper({ label, value: propValue, step, min = 0, unit, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(propValue)
  const [seen, setSeen] = useState(propValue)
  const latest = useRef(propValue)
  if (propValue !== seen) {
    setSeen(propValue)
    setValue(propValue)
    latest.current = propValue
  }
  const change = (v: number) => {
    latest.current = v
    setValue(v)
    onChange(v)
  }
  return (
    <div className="stepper">
      <button type="button" aria-label={`${label}を減らす`} onClick={() => change(Math.max(min, round(latest.current - step)))}>
        −
      </button>
      {editing ? (
        <input
          type="number"
          inputMode="decimal"
          aria-label={label}
          defaultValue={value}
          autoFocus
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (e.target.value !== '' && !Number.isNaN(v)) change(Math.max(min, round(v)))
            setEditing(false)
          }}
        />
      ) : (
        <button type="button" className="stepper-value" aria-label={`${label} ${value}${unit ?? ''}`} onClick={() => setEditing(true)}>
          {value}
          {unit && <small>{unit}</small>}
        </button>
      )}
      <button type="button" aria-label={`${label}を増やす`} onClick={() => change(round(latest.current + step))}>
        ＋
      </button>
    </div>
  )
}
