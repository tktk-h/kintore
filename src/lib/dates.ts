const pad = (n: number) => String(n).padStart(2, '0')

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function todayKey(): string {
  return toDateKey(new Date())
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function formatDateJa(key: string): string {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1}月${d.getDate()}日(${WEEKDAYS[d.getDay()]})`
}

/** 短い日付：10/19(月) */
export function formatDateShort(key: string): string {
  const d = parseDateKey(key)
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS[d.getDay()]})`
}

/** month は 0〜11。月の外側のマスは null */
export function monthGrid(year: number, month: number): (string | null)[][] {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateKey(new Date(year, month, d)))
  while (cells.length % 7 !== 0) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export function monthRange(year: number, month: number): [string, string] {
  return [toDateKey(new Date(year, month, 1)), toDateKey(new Date(year, month + 1, 0))]
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000)
  return min >= 60 ? `${Math.floor(min / 60)}時間${min % 60}分` : `${min}分`
}

export function addDays(key: string, n: number): string {
  const d = parseDateKey(key)
  d.setDate(d.getDate() + n)
  return toDateKey(d)
}

/** b − a の日数（夏時間があっても日付の差で数える） */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

/** その週の月曜の日付（週は月曜始まり） */
export function mondayOf(key: string): string {
  const day = parseDateKey(key).getDay()
  return addDays(key, -((day + 6) % 7))
}
