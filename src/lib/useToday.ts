import { useEffect, useState } from 'react'
import { todayKey } from './dates'

/**
 * 今日の日付キー。ホーム画面のアプリは閉じずに翌朝また開かれることがあるので、
 * 画面に戻ってきたときに日付を確かめ直す
 */
export function useToday(): string {
  const [today, setToday] = useState(todayKey)
  useEffect(() => {
    const refresh = () => setToday(todayKey())
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [])
  return today
}
