import { useLiveQuery } from 'dexie-react-hooks'
import { Images } from 'lucide-react'
import { useState } from 'react'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { EmptyState } from '../../components/EmptyState'
import { formatDateJa } from '../../lib/dates'
import { listPhotoLogs } from '../../repo/body'

export function PhotoCompare() {
  const logs = useLiveQuery(listPhotoLogs)
  const [left, setLeft] = useState<string>()
  const [right, setRight] = useState<string>()
  if (!logs) return null
  if (logs.length < 2) {
    return (
      <CollapsibleCard storageKey="body.photos" title="写真の比較" titleClassName="" bodyClassName="">
        <EmptyState icon={Images}>
          <p>写真が2枚以上になると比較できます</p>
        </EmptyState>
      </CollapsibleCard>
    )
  }
  const leftLog = logs.find((l) => l.date === left) ?? logs[0]
  const rightLog = logs.find((l) => l.date === right) ?? logs[logs.length - 1]
  const picker = (label: string, value: string, onChange: (v: string) => void) => (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {logs.map((l) => (
        <option key={l.id} value={l.date}>
          {formatDateJa(l.date)}
        </option>
      ))}
    </select>
  )
  return (
    <CollapsibleCard storageKey="body.photos" title="写真の比較" titleClassName="">
      <div className="photos">
        {picker('左の写真', leftLog.date, setLeft)}
        {picker('右の写真', rightLog.date, setRight)}
        <img src={leftLog.photo} alt={`${formatDateJa(leftLog.date)}の写真`} />
        <img src={rightLog.photo} alt={`${formatDateJa(rightLog.date)}の写真`} />
      </div>
    </CollapsibleCard>
  )
}
