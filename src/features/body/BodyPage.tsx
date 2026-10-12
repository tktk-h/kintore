import { useLiveQuery } from 'dexie-react-hooks'
import { Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { CollapsibleCard } from '../../components/CollapsibleCard'
import { Stepper } from '../../components/Stepper'
import { useSafeAction, useToast } from '../../components/Toast'
import { PageHeader } from '../../components/PageHeader'
import type { BodyLog } from '../../db/types'
import { formatDateJa, todayKey } from '../../lib/dates'
import { resizeImage } from '../../lib/image'
import { getBodyLog, getLatestBodyValues, saveBodyLog } from '../../repo/body'
import { PhotoCompare } from './PhotoCompare'

export function BodyPage() {
  const [params] = useSearchParams()
  const date = params.get('date') ?? todayKey()
  const log = useLiveQuery(() => getBodyLog(date).then((l) => l ?? null), [date])
  const latest = useLiveQuery(() => getLatestBodyValues(date), [date])

  return (
    <div className="page">
      <PageHeader backTo={params.has('date') ? '/' : undefined} eyebrow={formatDateJa(date)} title="体の記録" />
      {log !== undefined && latest !== undefined && (
        <BodyForm key={`${date}-${log?.id ?? 'new'}`} date={date} log={log} latest={latest} />
      )}
      <PhotoCompare />
    </div>
  )
}

interface FormProps {
  date: string
  log: BodyLog | null
  latest: { weightKg?: number; bodyFatPct?: number }
}

function BodyForm({ date, log, latest }: FormProps) {
  const [weight, setWeight] = useState(log?.weightKg ?? latest.weightKg ?? 60)
  const initialFat = log?.bodyFatPct ?? latest.bodyFatPct
  const [fat, setFat] = useState<number | undefined>(initialFat)
  const [photo, setPhoto] = useState(log?.photo)
  const run = useSafeAction()
  const toast = useToast()

  const onPhoto = async (file: File | undefined) => {
    if (!file) return
    let resized = ''
    if (await run(async () => (resized = await resizeImage(file)), '写真を読み込めませんでした')) setPhoto(resized)
  }

  const save = async () => {
    if (await run(() => saveBodyLog(date, { weightKg: weight, bodyFatPct: fat, photo }))) toast('保存しました')
  }

  return (
    <CollapsibleCard storageKey="body.form" title="体重・体脂肪率・写真" summary={`${weight}kg`}>
      <div className="row between">
        <span className="row-label">体重</span>
        <Stepper label="体重" unit="kg" step={0.1} value={weight} onChange={setWeight} />
      </div>
      <div className="row between">
        <span className="row-label">体脂肪率</span>
        {fat === undefined ? (
          <button type="button" className="btn btn-sm" aria-label="＋ 体脂肪率を追加" onClick={() => setFat(15)}>
            <Plus aria-hidden="true" />
            体脂肪率を追加
          </button>
        ) : (
          <div className="row">
            <Stepper label="体脂肪率" unit="%" step={0.1} value={fat} onChange={setFat} />
            <button type="button" className="icon-btn" aria-label="体脂肪率を外す" onClick={() => setFat(undefined)}>
              <X aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <label className="field">
        写真（任意）
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            void onPhoto(e.target.files?.[0])
            // 同じ写真を選び直しても onChange が来るように空にしておく
            e.target.value = ''
          }}
        />
      </label>
      {photo && (
        <>
          <img className="photo" src={photo} alt="体の写真" />
          <button type="button" className="btn btn-danger" onClick={() => setPhoto(undefined)}>
            <Trash2 aria-hidden="true" />
            写真を外す
          </button>
        </>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={save}>
        保存
      </button>
    </CollapsibleCard>
  )
}
