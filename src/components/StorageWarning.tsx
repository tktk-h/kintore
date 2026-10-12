import { useEffect, useState } from 'react'

/** 保存容量の8割を超えたら知らせる（写真が増えたとき用） */
export function StorageWarning() {
  const [ratio, setRatio] = useState(0)
  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then(({ usage = 0, quota = 0 }) => setRatio(quota ? usage / quota : 0))
      .catch(() => {})
  }, [])
  if (ratio < 0.8) return null
  return (
    <section className="card warning" role="status">
      保存容量が残り少なくなっています（{Math.round(ratio * 100)}%使用）。設定からバックアップを書き出し、古い写真を整理してください。
    </section>
  )
}
