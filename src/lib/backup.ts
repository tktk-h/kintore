import { db } from '../db/db'
import { toDateKey } from './dates'

const TABLES = [
  'exercises',
  'routines',
  'plannedWorkouts',
  'workouts',
  'workoutExercises',
  'sets',
  'bodyLogs',
  'settings',
] as const
type TableName = (typeof TABLES)[number]

export interface BackupFile {
  app: 'kintore'
  version: 1
  exportedAt: number
  data: Record<TableName, unknown[]>
}

export async function exportBackup(): Promise<BackupFile> {
  const data = {} as Record<TableName, unknown[]>
  for (const t of TABLES) data[t] = await db.table(t).toArray()
  return { app: 'kintore', version: 1, exportedAt: Date.now(), data }
}

/** 形式を確認する。おかしければ Error を投げる（DBには触らない） */
export function parseBackup(text: string): BackupFile {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('バックアップファイルを読み込めませんでした')
  }
  const file = parsed as Partial<BackupFile> | null
  if (!file || file.app !== 'kintore' || file.version !== 1 || typeof file.data !== 'object' || file.data === null) {
    throw new Error('このアプリのバックアップファイルではありません')
  }
  for (const t of TABLES) {
    const rows = (file.data as Record<string, unknown>)[t]
    const ok =
      Array.isArray(rows) &&
      rows.every((r) => typeof r === 'object' && r !== null && typeof (r as { id?: unknown }).id === 'string')
    if (!ok) throw new Error(`バックアップファイルが壊れています（${t}）`)
  }
  return file as BackupFile
}

/** 今のデータをすべて消して、バックアップの内容に置き換える */
export async function importBackup(file: BackupFile): Promise<void> {
  await db.transaction(
    'rw',
    TABLES.map((t) => db.table(t)),
    async () => {
      for (const t of TABLES) {
        await db.table(t).clear()
        await db.table(t).bulkAdd(file.data[t])
      }
    },
  )
}

/** ファイルを文字列として読む（Blob.text() はテスト環境の jsdom にないので FileReader を使う） */
export function readFileText(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('ファイルを読めませんでした'))
    reader.readAsText(file)
  })
}

export function backupFileName(now = new Date()): string {
  return `kintore-backup-${toDateKey(now)}.json`
}

/** iPhone では共有シート（「ファイルに保存」を選べる）、それ以外はダウンロード */
export async function shareOrDownload(name: string, text: string): Promise<void> {
  const file = new File([text], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] })
    return
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
