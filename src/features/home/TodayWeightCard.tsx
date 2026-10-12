import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Stepper } from '../../components/Stepper'
import { useSafeAction } from '../../components/Toast'
import { getBodyLog, getLatestBodyValues, saveBodyLog } from '../../repo/body'

export function TodayWeightCard({ date }: { date: string }) {
  const log = useLiveQuery(() => getBodyLog(date).then((l) => l ?? null), [date])
  const latest = useLiveQuery(() => getLatestBodyValues(date), [date])
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState<number | null>(null)
  const run = useSafeAction()

  if (log === undefined || latest === undefined) return null

  if (log?.weightKg !== undefined && !editing) {
    return (
      <section className="card row between">
        <span>今日の体重</span>
        <strong>{log.weightKg}kg</strong>
        <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
          修正
        </button>
      </section>
    )
  }

  const value = weight ?? log?.weightKg ?? latest.weightKg ?? 60
  return (
    <section className="card stack">
      <h2>今日の体重</h2>
      <div className="row between">
        <Stepper label="体重" unit="kg" step={0.1} value={value} onChange={setWeight} />
        <button
          type="button"
          className="btn btn-primary"
          onClick={async () => {
            if (await run(() => saveBodyLog(date, { weightKg: value }))) {
              setEditing(false)
              setWeight(null)
            }
          }}
        >
          記録する
        </button>
      </div>
    </section>
  )
}
