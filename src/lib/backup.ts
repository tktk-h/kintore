import { db } from '../db/db'
import { backfillSeedMetadata } from '../db/seedExercises'
import type { Exercise } from '../db/types'
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
  'profile',
  'chatMessages',
] as const
type TableName = (typeof TABLES)[number]
/** 後から追加した表。古いバックアップにはないことがある */
const OPTIONAL_TABLES: readonly TableName[] = ['profile', 'chatMessages']

type Row = Record<string, unknown>
const isObject = (v: unknown): v is Row => typeof v === 'object' && v !== null
const str = (v: unknown) => typeof v === 'string'
const num = (v: unknown) => typeof v === 'number'
const bool = (v: unknown) => typeof v === 'boolean'
const plannedList = (v: unknown) =>
  Array.isArray(v) &&
  v.every((e) => isObject(e) && str(e.exerciseId) && num(e.restSec) && Array.isArray(e.sets))

/** 表ごとの最低限の形（deleted は settings 以外すべてに必要） */
const CHECKS: Record<TableName, (r: Row) => boolean> = {
  exercises: (r) => bool(r.deleted) && str(r.name) && str(r.bodyPart) && str(r.logType),
  routines: (r) => bool(r.deleted) && plannedList(r.exercises),
  plannedWorkouts: (r) => bool(r.deleted) && str(r.date) && plannedList(r.exercises),
  workouts: (r) => bool(r.deleted) && str(r.date) && num(r.startedAt),
  workoutExercises: (r) =>
    bool(r.deleted) && str(r.workoutId) && str(r.exerciseId) && num(r.order) && num(r.restSec),
  sets: (r) =>
    bool(r.deleted) && str(r.workoutId) && str(r.workoutExerciseId) && num(r.order) && bool(r.done),
  bodyLogs: (r) => bool(r.deleted) && str(r.date),
  settings: (r) => r.id === 'app' && num(r.weightStep) && num(r.repStep) && (r.dumbbellStep === undefined || num(r.dumbbellStep)),
  profile: (r) =>
    r.id === 'me' && str(r.goal) && str(r.experience) && num(r.daysPerWeek) && num(r.minutesPerSession) &&
    Array.isArray(r.weekdays) && r.weekdays.every(num) &&
    Array.isArray(r.equipment) && r.equipment.every(str) &&
    str(r.injuries) &&
    Array.isArray(r.baselines) &&
    r.baselines.every((b) => isObject(b) && str(b.exerciseId) && num(b.weight) && num(b.reps)),
  chatMessages: (r) =>
    bool(r.deleted) && (r.role === 'user' || r.role === 'coach') && str(r.text) && num(r.createdAt),
}

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
  if (file && file.app === 'kintore' && file.version !== 1) {
    throw new Error('新しいバージョンのアプリで作られたバックアップです')
  }
  if (!file || file.app !== 'kintore' || typeof file.data !== 'object' || file.data === null) {
    throw new Error('このアプリのバックアップファイルではありません')
  }
  const data = { ...(file.data as Record<string, unknown>) }
  for (const t of TABLES) {
    // フェーズ1b より前のバックアップには、プロフィールとチャットの表がない（空として扱う）
    if (data[t] === undefined && OPTIONAL_TABLES.includes(t)) data[t] = []
    const rows = data[t]
    const ok = Array.isArray(rows) && rows.every((r) => isObject(r) && typeof r.id === 'string' && CHECKS[t](r))
    if (!ok) throw new Error(`バックアップファイルが壊れています（${t}）`)
  }
  return { ...(file as BackupFile), data: data as BackupFile['data'] }
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
      // 古いバックアップの定番種目には動きの種類や初心者の目安の重さがないので書き足す（DB の version 2・3 と同じ）
      await db.exercises.toCollection().modify((e: Exercise) => {
        backfillSeedMetadata(e)
      })
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
    try {
      await navigator.share({ files: [file] })
      return
    } catch (e) {
      const name = (e as { name?: unknown } | null)?.name
      // 共有シートを閉じただけなら失敗ではない
      if (name === 'AbortError') return
      // 書き出しに時間がかかってタップ扱いが切れたときなどはダウンロードにする
      if (name !== 'NotAllowedError') throw e
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
