import { useLiveQuery } from 'dexie-react-hooks'
import { Check, Pencil, Scale } from 'lucide-react'
import { useState } from 'react'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { Stepper } from '../../components/Stepper'
import { useSafeAction } from '../../components/Toast'
import { getBodyLog, getLatestBodyValues, saveBodyLog } from '../../repo/body'

const TITLE = (
  <>
    <Scale aria-hidden="true" />
    今日の体重
  </>
)

export function TodayWeightCard({ date }: { date: string }) {
  const log = useLiveQuery(() => getBodyLog(date).then((l) => l ?? null), [date])
  const latest = useLiveQuery(() => getLatestBodyValues(date), [date])
  const [editing, setEditing] = useState(false)
  const [weight, setWeight] = useState<number | null>(null)
  const run = useSafeAction()

  if (log === undefined || latest === undefined) return null

  if (log?.weightKg !== undefined && !editing) {
    return (
      <CollapsibleCard storageKey="home.weight" label="今日の体重" title={TITLE} summary={`${log.weightKg}kg`} bodyClassName="weight-card">
        <span className="big-value">
          {log.weightKg}
          <small>kg</small>
        </span>
        <button type="button" className="btn btn-sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden="true" />
          修正
        </button>
      </CollapsibleCard>
    )
  }

  const value = weight ?? log?.weightKg ?? latest.weightKg ?? 60
  return (
    <CollapsibleCard storageKey="home.weight" label="今日の体重" title={TITLE} summary={log?.weightKg !== undefined ? `${log.weightKg}kg` : '未記録'}>
      <div className="row between">
        <Stepper label="体重" unit="kg" step={0.1} value={value} onChange={setWeight} />
        <button
          type="button"
          className="btn"
          onClick={async () => {
            if (await run(() => saveBodyLog(date, { weightKg: value }))) {
              setEditing(false)
              setWeight(null)
            }
          }}
        >
          <Check aria-hidden="true" />
          記録する
        </button>
      </div>
    </CollapsibleCard>
  )
}
