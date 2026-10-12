# フェーズ1a 記録の基盤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** iPhoneのホーム画面に追加して使える、筋トレ・体の記録PWA（AIなし）を作る。

**Architecture:** React + TypeScript のSPA。データはすべて IndexedDB（Dexie.js）に保存し、画面は `dexie-react-hooks` の `useLiveQuery` でDBを直接購読する（書き込めば画面が自動で更新される）。データ操作は `src/repo/`、純粋な計算は `src/lib/`、画面は `src/features/<機能>/` に分ける。静的ホスティング（GitHub Pages等）で動くよう、ルーターはハッシュ方式を使う。

**Tech Stack:** React 19, TypeScript 5.9, Vite 8, vite-plugin-pwa, Dexie 4 + dexie-react-hooks, React Router 7, Vitest 5 + jsdom + fake-indexeddb + React Testing Library

**設計書:** `docs/superpowers/specs/2026-10-12-phase1a-recording-design.md`

**共通ルール**
- コマンドは作業フォルダ（`筋トレ/`）で実行する
- コミットメッセージの最後には必ず `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` をつける（各タスクの `git commit` は `-m` を2つ使ってこれを入れている）
- 画面に出す文言は日本語、コードの名前は英語
- 削除はすべて `deleted: true` にする論理削除。読むときは必ず `deleted` を除外する

---

## ファイル構成

```
index.html                     PWAのメタタグ
vite.config.ts                 Vite / PWA / Vitest の設定
public/icon.svg                アイコンの元画像（PNGはここから生成）
src/
  main.tsx, App.tsx, index.css
  db/
    types.ts                   データの型と表示名
    db.ts                      Dexie のDB定義（初回に種目を投入）
    seedExercises.ts           定番種目の一覧
  lib/                         DBに触らない純粋な処理
    records.ts                 ID・日時つきレコードの作成
    dates.ts                   日付キー（YYYY-MM-DD）、カレンダー計算
    setValues.ts               セットの値のコピー、初期値
    workoutStats.ts            総重量、自己ベスト、表示用の整形
    restTimer.ts               休憩タイマーの計算と保存
    backup.ts                  バックアップの書き出し・検証・復元
    image.ts                   写真の縮小
  repo/                        DBの読み書き
    settings.ts, exercises.ts, routines.ts, plans.ts
    history.ts                 前回の記録、過去の記録
    workouts.ts                トレーニングの開始・取得・終了
    workoutEdits.ts            セット・種目の編集
    summary.ts                 トレーニングのまとめ（自己ベスト判定）
    body.ts                    体の記録
    calendar.ts                カレンダー用の月ごとの情報
  components/                  画面共通の部品
    Toast.tsx, Dialog.tsx, Stepper.tsx, RatingPicker.tsx, SetInputs.tsx
    BottomNav.tsx, Layout.tsx, StorageWarning.tsx
  features/
    timer/       RestTimerContext.tsx, RestTimerDisplay.tsx, useWakeLock.ts
    exercises/   ExerciseFilter.tsx, ExercisePicker.tsx, ExerciseListPage.tsx, ExerciseEditPage.tsx
    workout/     WorkoutPage.tsx, ExerciseBlock.tsx, SetRow.tsx, ExerciseNoteDialog.tsx, FinishDialog.tsx
    home/        HomePage.tsx, TodayWeightCard.tsx, TodayWorkoutCard.tsx, RoutinePickerDialog.tsx
    calendar/    Calendar.tsx, DayDetailPage.tsx
    body/        BodyPage.tsx, PhotoCompare.tsx
    routines/    RoutineListPage.tsx, RoutineEditPage.tsx, PlannedExerciseEditor.tsx
    settings/    SettingsPage.tsx
  test/
    setup.ts, db.ts, render.tsx
```

テストは対象ファイルと同じフォルダに `*.test.ts(x)` として置く。

---

### Task 1: プロジェクトの土台

**Files:**
- Create: `package.json`, `.gitignore`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`

- [ ] **Step 1: package.json と .gitignore を作る**

`package.json`:
```json
{
  "name": "kintore",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview --host",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`.gitignore`:
```
node_modules
dist
dev-dist
*.local
```

- [ ] **Step 2: パッケージを入れる**

```bash
npm install react@19 react-dom@19 react-router@7 dexie@4 dexie-react-hooks@4
```
```bash
npm install -D vite@8 @vitejs/plugin-react@6 typescript@5.9 @types/react@19 @types/react-dom@19 vitest@5 jsdom @testing-library/react@16 @testing-library/user-event@14 @testing-library/jest-dom@6 fake-indexeddb@6 vite-plugin-pwa@1 @vite-pwa/assets-generator@1
```
Expected: エラーなく終わる。（`vite-plugin-pwa` / `assets-generator` は最新の 2.x / 2.0 でもよい。peer依存のエラーが出たら最新版を入れる）

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: vite.config.ts**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: '筋トレ記録',
        short_name: '筋トレ',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    passWithNoTests: true,
  },
})
```

- [ ] **Step 5: index.html**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="./favicon.ico" />
    <link rel="apple-touch-icon" href="./apple-touch-icon-180x180.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="筋トレ" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="theme-color" content="#0f1115" />
    <title>筋トレ記録</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: 最小のアプリとテスト設定**

`src/main.tsx`:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './index.css'

// 端末の容量が少ないときにブラウザがデータを消さないよう頼む
void navigator.storage?.persist?.()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/App.tsx`（Task 15で置き換える）:
```tsx
export function App() {
  return <h1>筋トレ記録</h1>
}
```

`src/index.css`（Task 13で中身を書く）:
```css
body { margin: 0; }
```

`src/test/setup.ts`:
```ts
import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
  localStorage.clear()
})
```

- [ ] **Step 7: 動くか確認**

Run: `npm test`
Expected: `No test files found` のあと exit 0（passWithNoTests）

Run: `npm run build`
Expected: `dist/` ができ、エラーなし（アイコン未作成の警告は出てよい。Task 23で作る）

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json .gitignore tsconfig.json vite.config.ts index.html src
git commit -m "chore: scaffold React + Vite + PWA project" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 型・レコード作成・日付ユーティリティ

**Files:**
- Create: `src/db/types.ts`, `src/lib/records.ts`, `src/lib/dates.ts`
- Test: `src/lib/records.test.ts`, `src/lib/dates.test.ts`

- [ ] **Step 1: 型を書く（テスト不要の宣言のみ）**

`src/db/types.ts`:
```ts
export type BodyPart = 'chest' | 'back' | 'legs' | 'shoulders' | 'arms' | 'abs' | 'cardio'
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other'
/**
 * weight_reps: 重量×回数
 * reps: 回数のみ（weight は加重ならプラス、補助ならマイナス）
 * time_distance: 時間・距離
 */
export type LogType = 'weight_reps' | 'reps' | 'time_distance'
export type Rating = 1 | 2 | 3 | 4 | 5

/** 同期できるように、すべての記録が持つ項目 */
export interface BaseRecord {
  id: string
  createdAt: number
  updatedAt: number
  deleted: boolean
}

export interface Exercise extends BaseRecord {
  name: string
  bodyPart: BodyPart
  equipment: Equipment
  logType: LogType
  defaultRestSec: number
  custom: boolean
}

export interface SetValues {
  weight?: number
  reps?: number
  durationSec?: number
  distanceKm?: number
}

export interface PlannedExercise {
  exerciseId: string
  restSec: number
  sets: SetValues[]
}

export interface Routine extends BaseRecord {
  name: string
  exercises: PlannedExercise[]
}

/** 1bで 'ai' を追加する */
export type PlanSource = 'routine' | 'manual'

export interface PlannedWorkout extends BaseRecord {
  date: string
  title: string
  exercises: PlannedExercise[]
  source: PlanSource
  routineId?: string
}

export interface Workout extends BaseRecord {
  date: string
  title?: string
  startedAt: number
  finishedAt?: number
  condition?: Rating
  satisfaction?: Rating
  note?: string
  plannedWorkoutId?: string
}

export interface WorkoutExercise extends BaseRecord {
  workoutId: string
  exerciseId: string
  order: number
  restSec: number
  /** きつさ（5段階） */
  effort?: Rating
  note?: string
}

export interface SetRecord extends BaseRecord, SetValues {
  workoutId: string
  workoutExerciseId: string
  order: number
  done: boolean
  doneAt?: number
}

export interface BodyLog extends BaseRecord {
  date: string
  weightKg?: number
  bodyFatPct?: number
  /** 縮小した JPEG の data URL */
  photo?: string
}

export interface Settings {
  id: 'app'
  weightStep: number
  repStep: number
}

export const DEFAULT_SETTINGS: Settings = { id: 'app', weightStep: 2.5, repStep: 1 }

export const BODY_PARTS: BodyPart[] = ['chest', 'back', 'legs', 'shoulders', 'arms', 'abs', 'cardio']

export const BODY_PART_LABELS: Record<BodyPart, string> = {
  chest: '胸',
  back: '背中',
  legs: '脚',
  shoulders: '肩',
  arms: '腕',
  abs: '腹',
  cardio: '有酸素',
}

export const BODY_PART_COLORS: Record<BodyPart, string> = {
  chest: '#ef4444',
  back: '#3b82f6',
  legs: '#22c55e',
  shoulders: '#f59e0b',
  arms: '#a855f7',
  abs: '#14b8a6',
  cardio: '#ec4899',
}

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'バーベル',
  dumbbell: 'ダンベル',
  machine: 'マシン',
  cable: 'ケーブル',
  bodyweight: '自重',
  other: 'その他',
}

export const LOG_TYPE_LABELS: Record<LogType, string> = {
  weight_reps: '重量×回数',
  reps: '回数のみ',
  time_distance: '時間・距離',
}
```

- [ ] **Step 2: 失敗するテストを書く**

`src/lib/records.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { PlannedExercise, Routine } from '../db/types'
import { alive, clonePlannedExercises, newRecord } from './records'

describe('newRecord', () => {
  it('ID・作成日時・更新日時・削除フラグをつける', () => {
    const r = newRecord<Routine>({ name: '胸の日', exercises: [] }, 1000)
    expect(r.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(r.createdAt).toBe(1000)
    expect(r.updatedAt).toBe(1000)
    expect(r.deleted).toBe(false)
    expect(r.name).toBe('胸の日')
  })

  it('毎回ちがうIDを作る', () => {
    const a = newRecord<Routine>({ name: 'a', exercises: [] })
    const b = newRecord<Routine>({ name: 'b', exercises: [] })
    expect(a.id).not.toBe(b.id)
  })
})

describe('alive', () => {
  it('削除済みと undefined を除外する', () => {
    const r = newRecord<Routine>({ name: 'a', exercises: [] })
    expect(alive(r)).toBe(true)
    expect(alive({ ...r, deleted: true })).toBe(false)
    expect(alive(undefined)).toBe(false)
  })
})

describe('clonePlannedExercises', () => {
  it('元のデータと共有しないコピーを作る', () => {
    const original: PlannedExercise[] = [{ exerciseId: 'ex-a', restSec: 60, sets: [{ weight: 60, reps: 8 }] }]
    const copy = clonePlannedExercises(original)
    copy[0].sets[0].weight = 70
    expect(original[0].sets[0].weight).toBe(60)
  })
})
```

`src/lib/dates.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { formatDateJa, formatDuration, monthGrid, monthRange, parseDateKey, toDateKey } from './dates'

describe('dates', () => {
  it('toDateKey はローカル日付を YYYY-MM-DD にする', () => {
    expect(toDateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('parseDateKey は toDateKey の逆', () => {
    expect(toDateKey(parseDateKey('2026-10-12'))).toBe('2026-10-12')
  })

  it('formatDateJa は曜日つきで表示する', () => {
    expect(formatDateJa('2026-10-12')).toBe('10月12日(月)')
  })

  it('monthGrid は日曜始まりの週ごとに並べる', () => {
    const weeks = monthGrid(2026, 9) // 2026年10月（1日は木曜）
    expect(weeks).toHaveLength(5)
    expect(weeks[0]).toEqual([null, null, null, null, '2026-10-01', '2026-10-02', '2026-10-03'])
    expect(weeks[4][6]).toBe('2026-10-31')
  })

  it('monthRange は月の初日と最終日', () => {
    expect(monthRange(2026, 1)).toEqual(['2026-02-01', '2026-02-28'])
  })

  it('formatDuration は分・時間で表示する', () => {
    expect(formatDuration(42 * 60000)).toBe('42分')
    expect(formatDuration(95 * 60000)).toBe('1時間35分')
  })
})
```

- [ ] **Step 3: 失敗を確認**

Run: `npx vitest run src/lib`
Expected: FAIL（`./records` と `./dates` が見つからない）

- [ ] **Step 4: 実装する**

`src/lib/records.ts`:
```ts
import type { BaseRecord, PlannedExercise } from '../db/types'

export type NewFields<T extends BaseRecord> = Omit<T, keyof BaseRecord>

export function newRecord<T extends BaseRecord>(fields: NewFields<T>, now = Date.now()): T {
  return { ...fields, id: crypto.randomUUID(), createdAt: now, updatedAt: now, deleted: false } as T
}

export function alive<T extends BaseRecord>(record: T | undefined): record is T {
  return record !== undefined && !record.deleted
}

export function clonePlannedExercises(list: PlannedExercise[]): PlannedExercise[] {
  return list.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) }))
}
```

`src/lib/dates.ts`:
```ts
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
```

- [ ] **Step 5: 成功を確認**

Run: `npx vitest run src/lib`
Expected: PASS（全テスト）

- [ ] **Step 6: Commit**

```bash
git add src/db/types.ts src/lib
git commit -m "feat: add data types, record and date helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: データベースと定番種目

**Files:**
- Create: `src/db/seedExercises.ts`, `src/db/db.ts`, `src/test/db.ts`
- Test: `src/db/db.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/test/db.ts`:
```ts
import { db } from '../db/db'

/** テストごとにDBを空にして作り直す（定番種目は再投入される） */
export async function resetDb(): Promise<void> {
  await db.delete({ disableAutoOpen: false })
  await db.open()
}
```

`src/db/db.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { db } from './db'

beforeEach(resetDb)

describe('db', () => {
  it('初回に定番種目を50種目以上入れる', async () => {
    expect(await db.exercises.count()).toBeGreaterThanOrEqual(50)
  })

  it('定番種目は固定IDを持つ', async () => {
    const bench = await db.exercises.get('ex-bench-press')
    expect(bench).toMatchObject({ name: 'ベンチプレス', bodyPart: 'chest', logType: 'weight_reps', custom: false, deleted: false })
  })

  it('3種類の記録形式がすべて含まれる', async () => {
    const all = await db.exercises.toArray()
    expect(new Set(all.map((e) => e.logType))).toEqual(new Set(['weight_reps', 'reps', 'time_distance']))
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/db`
Expected: FAIL（`./db` が見つからない）

- [ ] **Step 3: 実装する**

`src/db/seedExercises.ts`:
```ts
import type { BodyPart, Equipment, Exercise, LogType } from './types'

type Row = [id: string, name: string, bodyPart: BodyPart, equipment: Equipment, logType: LogType, restSec: number]

const ROWS: Row[] = [
  // 胸
  ['bench-press', 'ベンチプレス', 'chest', 'barbell', 'weight_reps', 120],
  ['incline-bench-press', 'インクラインベンチプレス', 'chest', 'barbell', 'weight_reps', 120],
  ['dumbbell-press', 'ダンベルプレス', 'chest', 'dumbbell', 'weight_reps', 90],
  ['incline-dumbbell-press', 'インクラインダンベルプレス', 'chest', 'dumbbell', 'weight_reps', 90],
  ['dumbbell-fly', 'ダンベルフライ', 'chest', 'dumbbell', 'weight_reps', 60],
  ['chest-press', 'チェストプレス', 'chest', 'machine', 'weight_reps', 90],
  ['pec-deck', 'ペックデック', 'chest', 'machine', 'weight_reps', 60],
  ['cable-crossover', 'ケーブルクロスオーバー', 'chest', 'cable', 'weight_reps', 60],
  ['dips', 'ディップス', 'chest', 'bodyweight', 'reps', 90],
  ['push-up', '腕立て伏せ', 'chest', 'bodyweight', 'reps', 60],
  // 背中
  ['deadlift', 'デッドリフト', 'back', 'barbell', 'weight_reps', 180],
  ['barbell-row', 'ベントオーバーロウ', 'back', 'barbell', 'weight_reps', 120],
  ['one-arm-dumbbell-row', 'ワンハンドダンベルロウ', 'back', 'dumbbell', 'weight_reps', 90],
  ['lat-pulldown', 'ラットプルダウン', 'back', 'machine', 'weight_reps', 90],
  ['seated-cable-row', 'シーテッドロウ', 'back', 'cable', 'weight_reps', 90],
  ['machine-row', 'マシンロウ', 'back', 'machine', 'weight_reps', 90],
  ['t-bar-row', 'Tバーロウ', 'back', 'barbell', 'weight_reps', 90],
  ['pull-up', '懸垂', 'back', 'bodyweight', 'reps', 120],
  ['chin-up', '逆手懸垂', 'back', 'bodyweight', 'reps', 120],
  ['back-extension', 'バックエクステンション', 'back', 'bodyweight', 'reps', 60],
  // 脚
  ['squat', 'スクワット', 'legs', 'barbell', 'weight_reps', 180],
  ['front-squat', 'フロントスクワット', 'legs', 'barbell', 'weight_reps', 180],
  ['leg-press', 'レッグプレス', 'legs', 'machine', 'weight_reps', 120],
  ['romanian-deadlift', 'ルーマニアンデッドリフト', 'legs', 'barbell', 'weight_reps', 120],
  ['bulgarian-split-squat', 'ブルガリアンスクワット', 'legs', 'dumbbell', 'weight_reps', 90],
  ['lunge', 'ランジ', 'legs', 'dumbbell', 'weight_reps', 90],
  ['leg-extension', 'レッグエクステンション', 'legs', 'machine', 'weight_reps', 60],
  ['leg-curl', 'レッグカール', 'legs', 'machine', 'weight_reps', 60],
  ['hip-thrust', 'ヒップスラスト', 'legs', 'barbell', 'weight_reps', 90],
  ['calf-raise', 'カーフレイズ', 'legs', 'machine', 'weight_reps', 60],
  ['bodyweight-squat', '自重スクワット', 'legs', 'bodyweight', 'reps', 60],
  // 肩
  ['overhead-press', 'オーバーヘッドプレス', 'shoulders', 'barbell', 'weight_reps', 120],
  ['dumbbell-shoulder-press', 'ダンベルショルダープレス', 'shoulders', 'dumbbell', 'weight_reps', 90],
  ['shoulder-press-machine', 'ショルダープレスマシン', 'shoulders', 'machine', 'weight_reps', 90],
  ['side-raise', 'サイドレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60],
  ['rear-raise', 'リアレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60],
  ['front-raise', 'フロントレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60],
  ['face-pull', 'フェイスプル', 'shoulders', 'cable', 'weight_reps', 60],
  ['upright-row', 'アップライトロウ', 'shoulders', 'barbell', 'weight_reps', 60],
  // 腕
  ['barbell-curl', 'バーベルカール', 'arms', 'barbell', 'weight_reps', 60],
  ['dumbbell-curl', 'ダンベルカール', 'arms', 'dumbbell', 'weight_reps', 60],
  ['hammer-curl', 'ハンマーカール', 'arms', 'dumbbell', 'weight_reps', 60],
  ['preacher-curl', 'プリーチャーカール', 'arms', 'barbell', 'weight_reps', 60],
  ['cable-curl', 'ケーブルカール', 'arms', 'cable', 'weight_reps', 60],
  ['triceps-pushdown', 'トライセプスプッシュダウン', 'arms', 'cable', 'weight_reps', 60],
  ['lying-triceps-extension', 'ライイングトライセプスエクステンション', 'arms', 'barbell', 'weight_reps', 60],
  ['overhead-triceps-extension', 'オーバーヘッドトライセプスエクステンション', 'arms', 'dumbbell', 'weight_reps', 60],
  ['close-grip-bench-press', 'ナローベンチプレス', 'arms', 'barbell', 'weight_reps', 90],
  // 腹
  ['crunch', 'クランチ', 'abs', 'bodyweight', 'reps', 45],
  ['leg-raise', 'レッグレイズ', 'abs', 'bodyweight', 'reps', 45],
  ['hanging-leg-raise', 'ハンギングレッグレイズ', 'abs', 'bodyweight', 'reps', 60],
  ['ab-roller', 'アブローラー', 'abs', 'other', 'reps', 60],
  ['cable-crunch', 'ケーブルクランチ', 'abs', 'cable', 'weight_reps', 60],
  ['plank', 'プランク', 'abs', 'bodyweight', 'time_distance', 45],
  ['side-plank', 'サイドプランク', 'abs', 'bodyweight', 'time_distance', 45],
  // 有酸素
  ['running', 'ランニング', 'cardio', 'other', 'time_distance', 0],
  ['treadmill', 'トレッドミル', 'cardio', 'machine', 'time_distance', 0],
  ['walking', 'ウォーキング', 'cardio', 'other', 'time_distance', 0],
  ['exercise-bike', 'エアロバイク', 'cardio', 'machine', 'time_distance', 0],
  ['rowing-machine', 'ローイングマシン', 'cardio', 'machine', 'time_distance', 0],
  ['swimming', '水泳', 'cardio', 'other', 'time_distance', 0],
  ['jump-rope', '縄跳び', 'cardio', 'other', 'time_distance', 60],
  ['hiit', 'HIIT', 'cardio', 'other', 'time_distance', 60],
]

export function seedExercises(): Exercise[] {
  return ROWS.map(([id, name, bodyPart, equipment, logType, defaultRestSec]) => ({
    id: `ex-${id}`,
    name,
    bodyPart,
    equipment,
    logType,
    defaultRestSec,
    custom: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
  }))
}
```

`src/db/db.ts`:
```ts
import Dexie, { type EntityTable } from 'dexie'
import { seedExercises } from './seedExercises'
import type {
  BodyLog,
  Exercise,
  PlannedWorkout,
  Routine,
  SetRecord,
  Settings,
  Workout,
  WorkoutExercise,
} from './types'

export class KintoreDB extends Dexie {
  exercises!: EntityTable<Exercise, 'id'>
  routines!: EntityTable<Routine, 'id'>
  plannedWorkouts!: EntityTable<PlannedWorkout, 'id'>
  workouts!: EntityTable<Workout, 'id'>
  workoutExercises!: EntityTable<WorkoutExercise, 'id'>
  sets!: EntityTable<SetRecord, 'id'>
  bodyLogs!: EntityTable<BodyLog, 'id'>
  settings!: EntityTable<Settings, 'id'>

  constructor() {
    super('kintore')
    this.version(1).stores({
      exercises: 'id, bodyPart, name',
      routines: 'id',
      plannedWorkouts: 'id, date',
      workouts: 'id, date, startedAt',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutId, workoutExerciseId',
      bodyLogs: 'id, date',
      settings: 'id',
    })
    this.on('populate', (tx) => {
      void tx.table('exercises').bulkAdd(seedExercises())
    })
  }
}

export const db = new KintoreDB()
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/db`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db src/test/db.ts
git commit -m "feat: add Dexie database with seeded exercises" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: セットの値と集計・表示

**Files:**
- Create: `src/lib/setValues.ts`, `src/lib/workoutStats.ts`
- Test: `src/lib/setValues.test.ts`, `src/lib/workoutStats.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/setValues.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { defaultSets, valuesOf } from './setValues'

describe('valuesOf', () => {
  it('セットの値だけを取り出す', () => {
    expect(valuesOf({ weight: 60, reps: 8, done: true, id: 'x' } as never)).toEqual({ weight: 60, reps: 8 })
  })
})

describe('defaultSets', () => {
  it('重量×回数は 20kg×10回 を3セット', () => {
    expect(defaultSets('weight_reps', 'chest')).toEqual([
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
      { weight: 20, reps: 10 },
    ])
  })
  it('回数のみは10回を3セット', () => {
    expect(defaultSets('reps', 'back')).toEqual([{ reps: 10 }, { reps: 10 }, { reps: 10 }])
  })
  it('有酸素は30分を1セット、それ以外の時間種目は60秒を3セット', () => {
    expect(defaultSets('time_distance', 'cardio')).toEqual([{ durationSec: 1800 }])
    expect(defaultSets('time_distance', 'abs')).toEqual([{ durationSec: 60 }, { durationSec: 60 }, { durationSec: 60 }])
  })
})
```

`src/lib/workoutStats.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { bestValue, formatSeconds, formatSet, formatSets, isPersonalRecord, totalVolume } from './workoutStats'

describe('totalVolume', () => {
  it('完了したセットの 重量×回数 を合計する', () => {
    expect(
      totalVolume([
        { logType: 'weight_reps', sets: [{ weight: 60, reps: 8, done: true }, { weight: 60, reps: 8, done: false }] },
        { logType: 'reps', sets: [{ reps: 10, done: true }] },
      ]),
    ).toBe(480)
  })
})

describe('bestValue', () => {
  it('重量×回数は1回以上挙げた最大重量', () => {
    expect(bestValue('weight_reps', [{ weight: 60, reps: 8 }, { weight: 70, reps: 0 }, { weight: 65, reps: 3 }])).toBe(65)
  })
  it('回数のみは最大回数', () => {
    expect(bestValue('reps', [{ reps: 8 }, { reps: 12 }])).toBe(12)
  })
  it('時間・距離は距離があれば最大距離、なければ最大時間', () => {
    expect(bestValue('time_distance', [{ durationSec: 1800, distanceKm: 5 }, { distanceKm: 6 }])).toBe(6)
    expect(bestValue('time_distance', [{ durationSec: 45 }, { durationSec: 60 }])).toBe(60)
  })
  it('セットがなければ undefined', () => {
    expect(bestValue('weight_reps', [])).toBeUndefined()
  })
})

describe('isPersonalRecord', () => {
  it('過去の最高を超えたら true', () => {
    expect(isPersonalRecord('weight_reps', [{ weight: 62.5, reps: 5 }], [{ weight: 60, reps: 8 }])).toBe(true)
  })
  it('同じなら false', () => {
    expect(isPersonalRecord('weight_reps', [{ weight: 60, reps: 5 }], [{ weight: 60, reps: 8 }])).toBe(false)
  })
  it('過去の記録がなければ false（初回は自己ベスト扱いしない）', () => {
    expect(isPersonalRecord('weight_reps', [{ weight: 60, reps: 8 }], [])).toBe(false)
  })
})

describe('format', () => {
  it('formatSeconds は m:ss', () => {
    expect(formatSeconds(90)).toBe('1:30')
    expect(formatSeconds(5)).toBe('0:05')
  })
  it('formatSet は記録形式ごとに表示する', () => {
    expect(formatSet('weight_reps', { weight: 60, reps: 8 })).toBe('60kg × 8')
    expect(formatSet('reps', { reps: 10 })).toBe('10回')
    expect(formatSet('reps', { reps: 8, weight: 10 })).toBe('8回 (+10kg)')
    expect(formatSet('reps', { reps: 8, weight: -20 })).toBe('8回 (補助20kg)')
    expect(formatSet('time_distance', { durationSec: 1800, distanceKm: 5 })).toBe('5km 30:00')
  })
  it('formatSets は同じ重量ならまとめる', () => {
    expect(formatSets('weight_reps', [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }, { weight: 60, reps: 7 }])).toBe('60kg × 8, 8, 7')
    expect(formatSets('weight_reps', [{ weight: 60, reps: 8 }, { weight: 65, reps: 5 }])).toBe('60kg × 8, 65kg × 5')
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/setValues.test.ts src/lib/workoutStats.test.ts`
Expected: FAIL（モジュールが見つからない）

- [ ] **Step 3: 実装する**

`src/lib/setValues.ts`:
```ts
import type { BodyPart, LogType, SetValues } from '../db/types'

/** SetRecord などからセットの値だけを取り出す */
export function valuesOf(s: SetValues): SetValues {
  const v: SetValues = {}
  if (s.weight !== undefined) v.weight = s.weight
  if (s.reps !== undefined) v.reps = s.reps
  if (s.durationSec !== undefined) v.durationSec = s.durationSec
  if (s.distanceKm !== undefined) v.distanceKm = s.distanceKm
  return v
}

/** 前回の記録も予定もないときの初期値 */
export function defaultSets(logType: LogType, bodyPart: BodyPart): SetValues[] {
  if (logType === 'time_distance') {
    return bodyPart === 'cardio' ? [{ durationSec: 1800 }] : [{ durationSec: 60 }, { durationSec: 60 }, { durationSec: 60 }]
  }
  if (logType === 'reps') return [{ reps: 10 }, { reps: 10 }, { reps: 10 }]
  return [
    { weight: 20, reps: 10 },
    { weight: 20, reps: 10 },
    { weight: 20, reps: 10 },
  ]
}
```

`src/lib/workoutStats.ts`:
```ts
import type { LogType, SetValues } from '../db/types'

export type DoneSet = SetValues & { done: boolean }

export function setVolume(logType: LogType, s: SetValues): number {
  return logType === 'weight_reps' ? (s.weight ?? 0) * (s.reps ?? 0) : 0
}

export function totalVolume(entries: { logType: LogType; sets: DoneSet[] }[]): number {
  return entries.reduce(
    (sum, e) => sum + e.sets.filter((s) => s.done).reduce((acc, s) => acc + setVolume(e.logType, s), 0),
    0,
  )
}

/** 自己ベストの比較に使う値。時間・距離の種目は距離があれば距離、なければ時間で比べる */
export function bestValue(logType: LogType, sets: SetValues[]): number | undefined {
  let values: (number | undefined)[]
  if (logType === 'weight_reps') values = sets.map((s) => ((s.reps ?? 0) >= 1 ? s.weight : undefined))
  else if (logType === 'reps') values = sets.map((s) => s.reps)
  else if (sets.some((s) => (s.distanceKm ?? 0) > 0)) values = sets.map((s) => s.distanceKm)
  else values = sets.map((s) => s.durationSec)
  const nums = values.filter((v): v is number => v !== undefined && v > 0)
  return nums.length ? Math.max(...nums) : undefined
}

export function isPersonalRecord(logType: LogType, current: SetValues[], history: SetValues[]): boolean {
  const now = bestValue(logType, current)
  const before = bestValue(logType, history)
  return now !== undefined && before !== undefined && now > before
}

export function formatSeconds(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export function formatSet(logType: LogType, s: SetValues): string {
  if (logType === 'weight_reps') return `${s.weight ?? 0}kg × ${s.reps ?? 0}`
  if (logType === 'reps') {
    const w = s.weight ?? 0
    const extra = w > 0 ? ` (+${w}kg)` : w < 0 ? ` (補助${-w}kg)` : ''
    return `${s.reps ?? 0}回${extra}`
  }
  const parts: string[] = []
  if (s.distanceKm) parts.push(`${s.distanceKm}km`)
  if (s.durationSec) parts.push(formatSeconds(s.durationSec))
  return parts.join(' ') || '-'
}

export function formatSets(logType: LogType, sets: SetValues[]): string {
  if (sets.length === 0) return ''
  if (logType === 'weight_reps') {
    const w = sets[0].weight ?? 0
    if (sets.every((s) => (s.weight ?? 0) === w)) return `${w}kg × ${sets.map((s) => s.reps ?? 0).join(', ')}`
  }
  return sets.map((s) => formatSet(logType, s)).join(', ')
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/lib`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat: add set defaults, volume, PR and formatting helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 休憩タイマーの計算

**Files:**
- Create: `src/lib/restTimer.ts`
- Test: `src/lib/restTimer.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/restTimer.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { adjustTimer, loadTimer, remainingSec, saveTimer, startTimer } from './restTimer'

describe('restTimer', () => {
  it('開始直後は設定した秒数が残っている', () => {
    const t = startTimer(90, 1_000_000)
    expect(remainingSec(t, 1_000_000)).toBe(90)
  })

  it('経過時間を引き、端数は切り上げる', () => {
    const t = startTimer(90, 0)
    expect(remainingSec(t, 30_500)).toBe(60)
  })

  it('終了時刻を過ぎたら 0', () => {
    const t = startTimer(60, 0)
    expect(remainingSec(t, 120_000)).toBe(0)
  })

  it('adjustTimer で増減でき、現在より前には戻らない', () => {
    const t = startTimer(60, 0)
    expect(remainingSec(adjustTimer(t, 15, 0), 0)).toBe(75)
    expect(remainingSec(adjustTimer(t, -90, 0), 0)).toBe(0)
  })

  it('保存して読み戻せる（アプリを閉じても残り時間が正しい）', () => {
    const t = startTimer(90, 5000)
    saveTimer(t)
    expect(loadTimer()).toEqual(t)
    saveTimer(null)
    expect(loadTimer()).toBeNull()
  })

  it('壊れたデータは null', () => {
    localStorage.setItem('kintore.restTimer', '{broken')
    expect(loadTimer()).toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/restTimer.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/restTimer.ts`:
```ts
export interface RestTimerState {
  /** 終了予定の時刻（ミリ秒）。時刻で持つので、アプリを閉じても残り時間がずれない */
  endAt: number
  durationSec: number
}

const STORAGE_KEY = 'kintore.restTimer'

export function startTimer(durationSec: number, now: number): RestTimerState {
  return { endAt: now + durationSec * 1000, durationSec }
}

export function remainingSec(state: RestTimerState, now: number): number {
  return Math.max(0, Math.ceil((state.endAt - now) / 1000))
}

export function adjustTimer(state: RestTimerState, deltaSec: number, now: number): RestTimerState {
  return {
    endAt: Math.max(now, state.endAt + deltaSec * 1000),
    durationSec: Math.max(0, state.durationSec + deltaSec),
  }
}

export function saveTimer(state: RestTimerState | null): void {
  try {
    if (state) localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // 保存できなくてもタイマー自体は動く
  }
}

export function loadTimer(): RestTimerState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<RestTimerState>
    return typeof v.endAt === 'number' && typeof v.durationSec === 'number'
      ? { endAt: v.endAt, durationSec: v.durationSec }
      : null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/lib/restTimer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/restTimer.ts src/lib/restTimer.test.ts
git commit -m "feat: add rest timer calculations with persistence" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 設定と種目の読み書き

**Files:**
- Create: `src/repo/settings.ts`, `src/repo/exercises.ts`
- Test: `src/repo/settings.test.ts`, `src/repo/exercises.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/repo/settings.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { getSettings, saveSettings } from './settings'

beforeEach(resetDb)

describe('settings', () => {
  it('未保存なら初期値', async () => {
    expect(await getSettings()).toEqual({ id: 'app', weightStep: 2.5, repStep: 1 })
  })
  it('一部だけ変更できる', async () => {
    await saveSettings({ weightStep: 1.25 })
    expect(await getSettings()).toEqual({ id: 'app', weightStep: 1.25, repStep: 1 })
  })
})
```

`src/repo/exercises.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { createExercise, filterExercises, getExercise, listExercises, updateExercise } from './exercises'

beforeEach(resetDb)

describe('exercises', () => {
  it('部位の順に並べる', async () => {
    const list = await listExercises()
    expect(list[0].bodyPart).toBe('chest')
    expect(list[list.length - 1].bodyPart).toBe('cardio')
  })

  it('自分で種目を追加・編集できる', async () => {
    const e = await createExercise({ name: 'スミスマシンスクワット', bodyPart: 'legs', equipment: 'machine', logType: 'weight_reps', defaultRestSec: 120 })
    expect(e.custom).toBe(true)
    await updateExercise(e.id, { name: 'スミススクワット', bodyPart: 'legs', equipment: 'machine', logType: 'weight_reps', defaultRestSec: 90 })
    expect(await getExercise(e.id)).toMatchObject({ name: 'スミススクワット', defaultRestSec: 90 })
  })

  it('ひらがなでもカタカナの種目名を検索できる', async () => {
    const list = await listExercises()
    expect(filterExercises(list, 'べんち').map((e) => e.name)).toContain('ベンチプレス')
  })

  it('部位で絞り込める', async () => {
    const list = await listExercises()
    const legs = filterExercises(list, '', 'legs')
    expect(legs.length).toBeGreaterThan(0)
    expect(legs.every((e) => e.bodyPart === 'legs')).toBe(true)
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/repo`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/repo/settings.ts`:
```ts
import { db } from '../db/db'
import { DEFAULT_SETTINGS, type Settings } from '../db/types'

export async function getSettings(): Promise<Settings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS
}

export async function saveSettings(changes: Partial<Omit<Settings, 'id'>>): Promise<void> {
  const current = await getSettings()
  await db.settings.put({ ...current, ...changes, id: 'app' })
}
```

`src/repo/exercises.ts`:
```ts
import { db } from '../db/db'
import { BODY_PARTS, type BodyPart, type Exercise } from '../db/types'
import { alive, newRecord } from '../lib/records'

export type ExerciseInput = Pick<Exercise, 'name' | 'bodyPart' | 'equipment' | 'logType' | 'defaultRestSec'>

function compareExercises(a: Exercise, b: Exercise): number {
  const byPart = BODY_PARTS.indexOf(a.bodyPart) - BODY_PARTS.indexOf(b.bodyPart)
  return byPart !== 0 ? byPart : a.name.localeCompare(b.name, 'ja')
}

export async function listExercises(): Promise<Exercise[]> {
  return (await db.exercises.toArray()).filter((e) => !e.deleted).sort(compareExercises)
}

export async function getExercise(id: string): Promise<Exercise | undefined> {
  const e = await db.exercises.get(id)
  return alive(e) ? e : undefined
}

export async function createExercise(input: ExerciseInput): Promise<Exercise> {
  const e = newRecord<Exercise>({ ...input, custom: true })
  await db.exercises.add(e)
  return e
}

export async function updateExercise(id: string, input: ExerciseInput): Promise<void> {
  await db.exercises.update(id, { ...input, updatedAt: Date.now() })
}

/** ひらがなをカタカナにそろえて、どちらで入力しても検索できるようにする */
function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
}

export function filterExercises(list: Exercise[], query: string, bodyPart?: BodyPart): Exercise[] {
  const q = normalize(query)
  return list.filter((e) => (!bodyPart || e.bodyPart === bodyPart) && (!q || normalize(e.name).includes(q)))
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/repo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/repo
git commit -m "feat: add settings and exercise repositories" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: マイメニューと予定メニュー

**Files:**
- Create: `src/repo/routines.ts`, `src/repo/plans.ts`
- Test: `src/repo/routines.test.ts`, `src/repo/plans.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/repo/routines.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { createRoutine, deleteRoutine, getRoutine, listRoutines, updateRoutine } from './routines'

beforeEach(resetDb)

const chest = [{ exerciseId: 'ex-bench-press', restSec: 120, sets: [{ weight: 60, reps: 8 }] }]

describe('routines', () => {
  it('作成・取得・更新できる', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: chest })
    await updateRoutine(r.id, { name: '胸の日A', exercises: chest })
    expect(await getRoutine(r.id)).toMatchObject({ name: '胸の日A', exercises: chest })
  })

  it('削除したものは一覧に出ない', async () => {
    const a = await createRoutine({ name: 'A', exercises: [] })
    await createRoutine({ name: 'B', exercises: [] })
    await deleteRoutine(a.id)
    expect((await listRoutines()).map((r) => r.name)).toEqual(['B'])
    expect(await getRoutine(a.id)).toBeUndefined()
  })
})
```

`src/repo/plans.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { assignRoutineToDate, deletePlan, getPlanForDate } from './plans'
import { createRoutine } from './routines'

beforeEach(resetDb)

describe('plans', () => {
  it('マイメニューを日付に割り当てると予定メニューになる', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: [{ exerciseId: 'ex-bench-press', restSec: 120, sets: [{ weight: 60, reps: 8 }] }] })
    await assignRoutineToDate(r.id, '2026-10-13')
    const plan = await getPlanForDate('2026-10-13')
    expect(plan).toMatchObject({ title: '胸の日', source: 'routine', routineId: r.id })
    expect(plan?.exercises[0].sets[0]).toEqual({ weight: 60, reps: 8 })
  })

  it('同じ日に割り当て直すと前の予定を置き換える', async () => {
    const a = await createRoutine({ name: 'A', exercises: [] })
    const b = await createRoutine({ name: 'B', exercises: [] })
    await assignRoutineToDate(a.id, '2026-10-13')
    await assignRoutineToDate(b.id, '2026-10-13')
    expect((await getPlanForDate('2026-10-13'))?.title).toBe('B')
  })

  it('予定を削除できる', async () => {
    const a = await createRoutine({ name: 'A', exercises: [] })
    const plan = await assignRoutineToDate(a.id, '2026-10-13')
    await deletePlan(plan.id)
    expect(await getPlanForDate('2026-10-13')).toBeUndefined()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/repo/routines.test.ts src/repo/plans.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/repo/routines.ts`:
```ts
import { db } from '../db/db'
import type { Routine } from '../db/types'
import { alive, clonePlannedExercises, newRecord } from '../lib/records'

export type RoutineInput = Pick<Routine, 'name' | 'exercises'>

export async function listRoutines(): Promise<Routine[]> {
  return (await db.routines.toArray()).filter((r) => !r.deleted).sort((a, b) => a.name.localeCompare(b.name, 'ja'))
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  const r = await db.routines.get(id)
  return alive(r) ? r : undefined
}

export async function createRoutine(input: RoutineInput): Promise<Routine> {
  const r = newRecord<Routine>({ name: input.name, exercises: clonePlannedExercises(input.exercises) })
  await db.routines.add(r)
  return r
}

export async function updateRoutine(id: string, input: RoutineInput): Promise<void> {
  await db.routines.update(id, { name: input.name, exercises: clonePlannedExercises(input.exercises), updatedAt: Date.now() })
}

export async function deleteRoutine(id: string): Promise<void> {
  await db.routines.update(id, { deleted: true, updatedAt: Date.now() })
}
```

`src/repo/plans.ts`:
```ts
import { db } from '../db/db'
import type { PlannedWorkout } from '../db/types'
import { clonePlannedExercises, newRecord } from '../lib/records'
import { getRoutine } from './routines'

export async function getPlanForDate(date: string): Promise<PlannedWorkout | undefined> {
  return (await db.plannedWorkouts.where('date').equals(date).toArray()).find((p) => !p.deleted)
}

export async function assignRoutineToDate(routineId: string, date: string): Promise<PlannedWorkout> {
  const routine = await getRoutine(routineId)
  if (!routine) throw new Error('マイメニューが見つかりません')
  return db.transaction('rw', db.plannedWorkouts, async () => {
    const now = Date.now()
    const existing = await db.plannedWorkouts.where('date').equals(date).toArray()
    for (const p of existing) {
      if (!p.deleted) await db.plannedWorkouts.update(p.id, { deleted: true, updatedAt: now })
    }
    const plan = newRecord<PlannedWorkout>(
      { date, title: routine.name, exercises: clonePlannedExercises(routine.exercises), source: 'routine', routineId },
      now,
    )
    await db.plannedWorkouts.add(plan)
    return plan
  })
}

export async function deletePlan(id: string): Promise<void> {
  await db.plannedWorkouts.update(id, { deleted: true, updatedAt: Date.now() })
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/repo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/repo
git commit -m "feat: add routines and planned workouts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: トレーニングの開始・前回の記録

**Files:**
- Create: `src/repo/history.ts`, `src/repo/workouts.ts`
- Test: `src/repo/workouts.test.ts`

テストでは `vi.useFakeTimers({ toFake: ['Date'] })` で時刻だけを固定する（`setTimeout` は本物のまま）。トレーニングの前後関係を `startedAt` で判断するため。

- [ ] **Step 1: 失敗するテストを書く**

`src/repo/workouts.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../db/db'
import type { PlannedWorkout } from '../db/types'
import { newRecord } from '../lib/records'
import { resetDb } from '../test/db'
import { getPreviousSets } from './history'
import {
  addExerciseToWorkout,
  deleteWorkout,
  finishWorkout,
  getActiveWorkout,
  getLastFinishedWorkout,
  getWorkoutDetail,
  saveWorkoutAsRoutine,
  startWorkout,
  toPlannedExercises,
} from './workouts'

const at = (iso: string) => vi.setSystemTime(new Date(iso))

/** 最初のセットだけ完了にして終了する */
async function finishWithFirstSetDone(workoutId: string) {
  const d = await getWorkoutDetail(workoutId)
  for (const e of d!.exercises) await db.sets.update(e.sets[0].id, { done: true })
  await finishWorkout(workoutId, {})
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  at('2026-10-12T10:00:00')
  await resetDb()
})
afterEach(() => vi.useRealTimers())

describe('startWorkout', () => {
  it('予定メニューの重量・回数でセットを作る', async () => {
    const plan = newRecord<PlannedWorkout>({
      date: '2026-10-12',
      title: '胸の日',
      source: 'manual',
      exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }],
    })
    const id = await startWorkout({ date: '2026-10-12', plan })
    const d = await getWorkoutDetail(id)
    expect(d?.workout).toMatchObject({ title: '胸の日', plannedWorkoutId: plan.id })
    expect(d?.exercises[0].workoutExercise.restSec).toBe(90)
    expect(d?.exercises[0].sets.map((s) => [s.weight, s.reps, s.done])).toEqual([
      [60, 8, false],
      [60, 8, false],
    ])
  })

  it('予定のセットが空の種目は前回の記録を入れる', async () => {
    const first = await startWorkout({ date: '2026-10-10', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 80, reps: 5 }] }] })
    await finishWithFirstSetDone(first)
    at('2026-10-12T11:00:00')
    const second = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [] }] })
    const d = await getWorkoutDetail(second)
    expect(d?.exercises[0].sets.map((s) => [s.weight, s.reps])).toEqual([[80, 5]])
  })

  it('前回も予定もなければ初期値を入れる', async () => {
    const id = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-pull-up', restSec: 120, sets: [] }] })
    const d = await getWorkoutDetail(id)
    expect(d?.exercises[0].sets.map((s) => s.reps)).toEqual([10, 10, 10])
  })
})

describe('getActiveWorkout / getLastFinishedWorkout', () => {
  it('終了していないトレーニングを返す', async () => {
    const id = await startWorkout({ date: '2026-10-12' })
    expect((await getActiveWorkout())?.id).toBe(id)
    await finishWorkout(id, { condition: 4, satisfaction: 5, note: '良かった' })
    expect(await getActiveWorkout()).toBeUndefined()
    expect(await getLastFinishedWorkout()).toMatchObject({ id, condition: 4, satisfaction: 5, note: '良かった' })
  })

  it('削除したトレーニングは出てこない', async () => {
    const id = await startWorkout({ date: '2026-10-12' })
    await deleteWorkout(id)
    expect(await getActiveWorkout()).toBeUndefined()
    expect(await getWorkoutDetail(id)).toBeUndefined()
  })
})

describe('addExerciseToWorkout', () => {
  it('末尾に追加し、種目の標準の休憩時間を使う', async () => {
    const id = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [] }] })
    await addExerciseToWorkout(id, 'ex-side-raise')
    const d = await getWorkoutDetail(id)
    expect(d?.exercises.map((e) => e.exercise.name)).toEqual(['ベンチプレス', 'サイドレイズ'])
    expect(d?.exercises[1].workoutExercise.restSec).toBe(60)
  })
})

describe('getPreviousSets', () => {
  it('指定時刻より前に終わった直近のトレーニングの、完了セットだけを返す', async () => {
    at('2026-10-08T10:00:00')
    const a = await startWorkout({ date: '2026-10-08', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 70, reps: 5 }] }] })
    await finishWithFirstSetDone(a)
    at('2026-10-12T09:00:00')
    const b = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 80, reps: 5 }, { weight: 80, reps: 3 }] }] })
    await finishWithFirstSetDone(b)
    at('2026-10-12T12:00:00')
    expect((await getPreviousSets('ex-squat')).map((s) => s.weight)).toEqual([80])
    expect((await getPreviousSets('ex-squat', new Date('2026-10-10').getTime())).map((s) => s.weight)).toEqual([70])
  })

  it('終了していないトレーニングは前回に含めない', async () => {
    await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [{ weight: 80, reps: 5 }] }] })
    at('2026-10-12T12:00:00')
    expect(await getPreviousSets('ex-squat')).toEqual([])
  })
})

describe('toPlannedExercises / saveWorkoutAsRoutine', () => {
  it('完了したセットの値でメニューを作る', async () => {
    const id = await startWorkout({ date: '2026-10-12', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }] })
    await finishWithFirstSetDone(id)
    const d = await getWorkoutDetail(id)
    expect(toPlannedExercises(d!)).toEqual([{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }])
    const routine = await saveWorkoutAsRoutine(id, '胸の日')
    expect(routine.exercises).toEqual(toPlannedExercises(d!))
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/repo/workouts.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/repo/history.ts`:
```ts
import { db } from '../db/db'
import type { Exercise, SetRecord, SetValues } from '../db/types'
import { alive } from '../lib/records'
import { defaultSets, valuesOf } from '../lib/setValues'

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

/** before より前に始まり、終了済みのトレーニングでの、その種目の完了セット（新しい順） */
async function finishedEntries(exerciseId: string, before: number): Promise<{ startedAt: number; sets: SetRecord[] }[]> {
  const wes = (await db.workoutExercises.where('exerciseId').equals(exerciseId).toArray()).filter((we) => !we.deleted)
  const workouts = await db.workouts.bulkGet(wes.map((we) => we.workoutId))
  const entries: { startedAt: number; sets: SetRecord[] }[] = []
  for (let i = 0; i < wes.length; i++) {
    const w = workouts[i]
    if (!alive(w) || w.finishedAt === undefined || w.startedAt >= before) continue
    const sets = (await db.sets.where('workoutExerciseId').equals(wes[i].id).toArray())
      .filter((s) => !s.deleted && s.done)
      .sort(byOrder)
    if (sets.length) entries.push({ startedAt: w.startedAt, sets })
  }
  return entries.sort((a, b) => b.startedAt - a.startedAt)
}

/** 「前回」の記録 */
export async function getPreviousSets(exerciseId: string, before = Date.now()): Promise<SetRecord[]> {
  return (await finishedEntries(exerciseId, before))[0]?.sets ?? []
}

/** 自己ベスト判定用の、過去すべての完了セット */
export async function getHistorySets(exerciseId: string, before: number): Promise<SetRecord[]> {
  return (await finishedEntries(exerciseId, before)).flatMap((e) => e.sets)
}

/** 予定がないときに最初に入れておく値。前回があれば前回、なければ初期値 */
export async function suggestSets(exercise: Exercise, before = Date.now()): Promise<SetValues[]> {
  const previous = await getPreviousSets(exercise.id, before)
  return previous.length ? previous.map(valuesOf) : defaultSets(exercise.logType, exercise.bodyPart)
}
```

`src/repo/workouts.ts`:
```ts
import { db } from '../db/db'
import type {
  Exercise,
  PlannedExercise,
  PlannedWorkout,
  Routine,
  SetRecord,
  SetValues,
  Workout,
  WorkoutExercise,
} from '../db/types'
import { alive, newRecord } from '../lib/records'
import { valuesOf } from '../lib/setValues'
import { suggestSets } from './history'
import { createRoutine } from './routines'

export interface WorkoutExerciseDetail {
  workoutExercise: WorkoutExercise
  exercise: Exercise
  sets: SetRecord[]
}

export interface WorkoutDetail {
  workout: Workout
  exercises: WorkoutExerciseDetail[]
}

export type FinishResult = Pick<Workout, 'condition' | 'satisfaction' | 'note'>

export interface StartWorkoutOptions {
  date: string
  title?: string
  /** 予定メニューから始める場合 */
  plan?: PlannedWorkout
  /** マイメニューや前回のメニューから始める場合。sets が空の種目は前回の値を入れる */
  exercises?: PlannedExercise[]
}

const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

export async function getActiveWorkout(): Promise<Workout | undefined> {
  return (await db.workouts.toArray())
    .filter((w) => !w.deleted && w.finishedAt === undefined)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
}

export async function getLastFinishedWorkout(): Promise<Workout | undefined> {
  return (await db.workouts.toArray())
    .filter((w) => !w.deleted && w.finishedAt !== undefined)
    .sort((a, b) => b.startedAt - a.startedAt)[0]
}

export async function listWorkoutsByDate(date: string): Promise<Workout[]> {
  return (await db.workouts.where('date').equals(date).toArray())
    .filter((w) => !w.deleted)
    .sort((a, b) => a.startedAt - b.startedAt)
}

export async function getWorkoutDetail(id: string): Promise<WorkoutDetail | undefined> {
  const workout = await db.workouts.get(id)
  if (!alive(workout)) return undefined
  const wes = (await db.workoutExercises.where('workoutId').equals(id).toArray()).filter((we) => !we.deleted).sort(byOrder)
  const sets = (await db.sets.where('workoutId').equals(id).toArray()).filter((s) => !s.deleted)
  const exercises = await db.exercises.bulkGet(wes.map((we) => we.exerciseId))
  return {
    workout,
    exercises: wes.flatMap((we, i) => {
      const exercise = exercises[i]
      if (!exercise) return []
      return [{ workoutExercise: we, exercise, sets: sets.filter((s) => s.workoutExerciseId === we.id).sort(byOrder) }]
    }),
  }
}

async function insertExercise(
  workoutId: string,
  exerciseId: string,
  restSec: number,
  order: number,
  values: SetValues[],
  now: number,
): Promise<void> {
  const we = newRecord<WorkoutExercise>({ workoutId, exerciseId, order, restSec }, now)
  await db.workoutExercises.add(we)
  await db.sets.bulkAdd(
    values.map((v, i) =>
      newRecord<SetRecord>({ ...valuesOf(v), workoutId, workoutExerciseId: we.id, order: i, done: false }, now),
    ),
  )
}

export async function startWorkout(opts: StartWorkoutOptions): Promise<string> {
  const now = Date.now()
  const planned = opts.plan ? opts.plan.exercises : (opts.exercises ?? [])
  const workout = newRecord<Workout>(
    { date: opts.date, startedAt: now, title: opts.title ?? opts.plan?.title, plannedWorkoutId: opts.plan?.id },
    now,
  )
  // 読み込みは書き込みのトランザクションの前に済ませる
  const prepared: { pe: PlannedExercise; values: SetValues[] }[] = []
  for (const pe of planned) {
    const exercise = await db.exercises.get(pe.exerciseId)
    if (!exercise) continue
    prepared.push({ pe, values: pe.sets.length ? pe.sets : await suggestSets(exercise, now) })
  }
  await db.transaction('rw', [db.workouts, db.workoutExercises, db.sets], async () => {
    await db.workouts.add(workout)
    for (const [i, { pe, values }] of prepared.entries()) {
      await insertExercise(workout.id, pe.exerciseId, pe.restSec, i, values, now)
    }
  })
  return workout.id
}

export async function addExerciseToWorkout(workoutId: string, exerciseId: string): Promise<void> {
  const exercise = await db.exercises.get(exerciseId)
  const workout = await db.workouts.get(workoutId)
  if (!exercise || !workout) throw new Error('種目またはトレーニングが見つかりません')
  const values = await suggestSets(exercise, workout.startedAt)
  const existing = (await db.workoutExercises.where('workoutId').equals(workoutId).toArray()).filter((we) => !we.deleted)
  const order = existing.length ? Math.max(...existing.map((we) => we.order)) + 1 : 0
  await db.transaction('rw', [db.workoutExercises, db.sets], () =>
    insertExercise(workoutId, exerciseId, exercise.defaultRestSec, order, values, Date.now()),
  )
}

export async function finishWorkout(id: string, result: FinishResult): Promise<void> {
  const now = Date.now()
  await db.workouts.update(id, { ...result, finishedAt: now, updatedAt: now })
}

export async function deleteWorkout(id: string): Promise<void> {
  await db.workouts.update(id, { deleted: true, updatedAt: Date.now() })
}

/** 実施したトレーニングをメニューの形にする（完了セットがあればその値、なければ全セット） */
export function toPlannedExercises(detail: WorkoutDetail): PlannedExercise[] {
  return detail.exercises.map((e) => {
    const done = e.sets.filter((s) => s.done)
    return {
      exerciseId: e.exercise.id,
      restSec: e.workoutExercise.restSec,
      sets: (done.length ? done : e.sets).map(valuesOf),
    }
  })
}

export async function saveWorkoutAsRoutine(workoutId: string, name: string): Promise<Routine> {
  const detail = await getWorkoutDetail(workoutId)
  if (!detail) throw new Error('トレーニングが見つかりません')
  return createRoutine({ name, exercises: toPlannedExercises(detail) })
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/repo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/repo
git commit -m "feat: start workouts from plans and look up previous sets" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: セットの編集とトレーニングのまとめ

**Files:**
- Create: `src/repo/workoutEdits.ts`, `src/repo/summary.ts`
- Test: `src/repo/workoutEdits.test.ts`, `src/repo/summary.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/repo/workoutEdits.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { addSet, deleteSet, moveExercise, removeExerciseFromWorkout, setDone, updateExerciseNote, updateSet } from './workoutEdits'
import { getWorkoutDetail, startWorkout } from './workouts'

beforeEach(resetDb)

async function setup() {
  const id = await startWorkout({
    date: '2026-10-12',
    exercises: [
      { exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] },
      { exerciseId: 'ex-side-raise', restSec: 60, sets: [{ weight: 8, reps: 15 }] },
    ],
  })
  return { id, detail: (await getWorkoutDetail(id))! }
}

describe('workoutEdits', () => {
  it('セットの値を変更できる', async () => {
    const { id, detail } = await setup()
    await updateSet(detail.exercises[0].sets[0].id, { reps: 9 })
    expect((await getWorkoutDetail(id))!.exercises[0].sets[0]).toMatchObject({ weight: 60, reps: 9 })
  })

  it('完了にすると完了時刻が入り、戻すと消える', async () => {
    const { id, detail } = await setup()
    const setId = detail.exercises[0].sets[0].id
    await setDone(setId, true)
    expect((await getWorkoutDetail(id))!.exercises[0].sets[0]).toMatchObject({ done: true, doneAt: expect.any(Number) })
    await setDone(setId, false)
    expect((await getWorkoutDetail(id))!.exercises[0].sets[0].doneAt).toBeUndefined()
  })

  it('セット追加は最後のセットの値をコピーする', async () => {
    const { id, detail } = await setup()
    await addSet(detail.exercises[0].workoutExercise.id)
    const sets = (await getWorkoutDetail(id))!.exercises[0].sets
    expect(sets.map((s) => [s.order, s.weight, s.reps, s.done])).toEqual([
      [0, 60, 8, false],
      [1, 60, 8, false],
    ])
  })

  it('セットを削除できる', async () => {
    const { id, detail } = await setup()
    await deleteSet(detail.exercises[0].sets[0].id)
    expect((await getWorkoutDetail(id))!.exercises[0].sets).toEqual([])
  })

  it('種目を並べ替え・削除できる', async () => {
    const { id, detail } = await setup()
    await moveExercise(detail.exercises[1].workoutExercise.id, -1)
    expect((await getWorkoutDetail(id))!.exercises.map((e) => e.exercise.name)).toEqual(['サイドレイズ', 'ベンチプレス'])
    await removeExerciseFromWorkout(detail.exercises[1].workoutExercise.id)
    expect((await getWorkoutDetail(id))!.exercises.map((e) => e.exercise.name)).toEqual(['ベンチプレス'])
  })

  it('種目ごとのきつさとメモを保存できる', async () => {
    const { id, detail } = await setup()
    await updateExerciseNote(detail.exercises[0].workoutExercise.id, { effort: 4, note: '肩が少し痛い' })
    expect((await getWorkoutDetail(id))!.exercises[0].workoutExercise).toMatchObject({ effort: 4, note: '肩が少し痛い' })
  })
})
```

`src/repo/summary.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDb } from '../test/db'
import { summarizeWorkout } from './summary'
import { setDone } from './workoutEdits'
import { finishWorkout, getWorkoutDetail, startWorkout } from './workouts'

const at = (iso: string) => vi.setSystemTime(new Date(iso))

async function doWorkout(date: string, weight: number, reps: number) {
  const id = await startWorkout({ date, exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight, reps }] }] })
  const d = await getWorkoutDetail(id)
  await setDone(d!.exercises[0].sets[0].id, true)
  return id
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  await resetDb()
})
afterEach(() => vi.useRealTimers())

describe('summarizeWorkout', () => {
  it('時間・総重量・自己ベストを出す', async () => {
    at('2026-10-10T10:00:00')
    await finishWorkout(await doWorkout('2026-10-10', 60, 8), {})
    at('2026-10-12T10:00:00')
    const id = await doWorkout('2026-10-12', 62.5, 5)
    at('2026-10-12T10:45:00')
    await finishWorkout(id, {})
    const summary = await summarizeWorkout((await getWorkoutDetail(id))!)
    expect(summary).toEqual({ durationMs: 45 * 60000, volume: 312.5, doneSets: 1, personalRecords: ['ベンチプレス'] })
  })

  it('初めての種目は自己ベストにしない', async () => {
    at('2026-10-12T10:00:00')
    const id = await doWorkout('2026-10-12', 60, 8)
    expect((await summarizeWorkout((await getWorkoutDetail(id))!)).personalRecords).toEqual([])
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/repo/workoutEdits.test.ts src/repo/summary.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/repo/workoutEdits.ts`:
```ts
import { db } from '../db/db'
import type { Rating, SetRecord, SetValues } from '../db/types'
import { newRecord } from '../lib/records'
import { defaultSets, valuesOf } from '../lib/setValues'

const touch = () => ({ updatedAt: Date.now() })
const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

export async function updateSet(id: string, values: SetValues): Promise<void> {
  await db.sets.update(id, { ...values, ...touch() })
}

export async function setDone(id: string, done: boolean): Promise<void> {
  await db.sets.update(id, { done, doneAt: done ? Date.now() : undefined, ...touch() })
}

export async function addSet(workoutExerciseId: string): Promise<void> {
  const we = await db.workoutExercises.get(workoutExerciseId)
  if (!we) throw new Error('種目が見つかりません')
  const sets = (await db.sets.where('workoutExerciseId').equals(workoutExerciseId).toArray())
    .filter((s) => !s.deleted)
    .sort(byOrder)
  const last = sets[sets.length - 1]
  let values: SetValues
  if (last) {
    values = valuesOf(last)
  } else {
    const exercise = await db.exercises.get(we.exerciseId)
    values = exercise ? defaultSets(exercise.logType, exercise.bodyPart)[0] : {}
  }
  await db.sets.add(
    newRecord<SetRecord>({
      ...values,
      workoutId: we.workoutId,
      workoutExerciseId,
      order: last ? last.order + 1 : 0,
      done: false,
    }),
  )
}

export async function deleteSet(id: string): Promise<void> {
  await db.sets.update(id, { deleted: true, ...touch() })
}

export async function removeExerciseFromWorkout(workoutExerciseId: string): Promise<void> {
  await db.workoutExercises.update(workoutExerciseId, { deleted: true, ...touch() })
}

export async function moveExercise(workoutExerciseId: string, direction: -1 | 1): Promise<void> {
  const we = await db.workoutExercises.get(workoutExerciseId)
  if (!we) return
  const list = (await db.workoutExercises.where('workoutId').equals(we.workoutId).toArray())
    .filter((e) => !e.deleted)
    .sort(byOrder)
  const other = list[list.findIndex((e) => e.id === workoutExerciseId) + direction]
  if (!other) return
  await db.transaction('rw', db.workoutExercises, async () => {
    await db.workoutExercises.update(we.id, { order: other.order, ...touch() })
    await db.workoutExercises.update(other.id, { order: we.order, ...touch() })
  })
}

export async function updateExerciseNote(
  workoutExerciseId: string,
  changes: { effort?: Rating; note?: string },
): Promise<void> {
  await db.workoutExercises.update(workoutExerciseId, { effort: changes.effort, note: changes.note, ...touch() })
}
```

`src/repo/summary.ts`:
```ts
import { isPersonalRecord, totalVolume } from '../lib/workoutStats'
import { getHistorySets } from './history'
import type { WorkoutDetail } from './workouts'

export interface WorkoutSummary {
  durationMs: number
  volume: number
  doneSets: number
  /** 自己ベストを更新した種目名 */
  personalRecords: string[]
}

export async function summarizeWorkout(detail: WorkoutDetail): Promise<WorkoutSummary> {
  const { workout } = detail
  const personalRecords: string[] = []
  for (const e of detail.exercises) {
    const done = e.sets.filter((s) => s.done)
    if (!done.length) continue
    const history = await getHistorySets(e.exercise.id, workout.startedAt)
    if (isPersonalRecord(e.exercise.logType, done, history)) personalRecords.push(e.exercise.name)
  }
  return {
    durationMs: (workout.finishedAt ?? Date.now()) - workout.startedAt,
    volume: totalVolume(detail.exercises.map((e) => ({ logType: e.exercise.logType, sets: e.sets }))),
    doneSets: detail.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0),
    personalRecords,
  }
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/repo`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/repo
git commit -m "feat: edit sets/exercises and summarize workouts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 体の記録

**Files:**
- Create: `src/repo/body.ts`, `src/lib/image.ts`
- Test: `src/repo/body.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/repo/body.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { getBodyLog, getLatestBodyValues, listPhotoLogs, saveBodyLog } from './body'

beforeEach(resetDb)

describe('body', () => {
  it('同じ日に保存すると上書きする', async () => {
    await saveBodyLog('2026-10-12', { weightKg: 70 })
    await saveBodyLog('2026-10-12', { weightKg: 69.8 })
    expect((await getBodyLog('2026-10-12'))?.weightKg).toBe(69.8)
  })

  it('体重だけ保存しても写真は消えない', async () => {
    await saveBodyLog('2026-10-12', { weightKg: 70, photo: 'data:image/jpeg;base64,AAA' })
    await saveBodyLog('2026-10-12', { weightKg: 69.5 })
    expect(await getBodyLog('2026-10-12')).toMatchObject({ weightKg: 69.5, photo: 'data:image/jpeg;base64,AAA' })
  })

  it('最新の体重と体脂肪率を、それぞれ記録がある日から取る', async () => {
    await saveBodyLog('2026-10-01', { weightKg: 71, bodyFatPct: 18 })
    await saveBodyLog('2026-10-05', { weightKg: 70 })
    await saveBodyLog('2026-10-20', { weightKg: 68 })
    expect(await getLatestBodyValues('2026-10-12')).toEqual({ weightKg: 70, bodyFatPct: 18 })
  })

  it('写真がある記録を日付順に返す', async () => {
    await saveBodyLog('2026-10-05', { photo: 'b' })
    await saveBodyLog('2026-10-01', { photo: 'a' })
    await saveBodyLog('2026-10-03', { weightKg: 70 })
    expect((await listPhotoLogs()).map((l) => l.date)).toEqual(['2026-10-01', '2026-10-05'])
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/repo/body.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/repo/body.ts`:
```ts
import { db } from '../db/db'
import type { BodyLog } from '../db/types'
import { newRecord } from '../lib/records'

export type BodyInput = Partial<Pick<BodyLog, 'weightKg' | 'bodyFatPct' | 'photo'>>

export async function getBodyLog(date: string): Promise<BodyLog | undefined> {
  return (await db.bodyLogs.where('date').equals(date).toArray()).find((b) => !b.deleted)
}

/** date 以前で、体重・体脂肪率それぞれの最新の値（入力欄の初期値に使う） */
export async function getLatestBodyValues(date: string): Promise<{ weightKg?: number; bodyFatPct?: number }> {
  const logs = (await db.bodyLogs.where('date').belowOrEqual(date).toArray())
    .filter((b) => !b.deleted)
    .sort((a, b) => b.date.localeCompare(a.date))
  return {
    weightKg: logs.find((b) => b.weightKg !== undefined)?.weightKg,
    bodyFatPct: logs.find((b) => b.bodyFatPct !== undefined)?.bodyFatPct,
  }
}

/** input に含めた項目だけ更新する（undefined を明示的に渡すとその項目を消す） */
export async function saveBodyLog(date: string, input: BodyInput): Promise<void> {
  const existing = await getBodyLog(date)
  if (existing) await db.bodyLogs.update(existing.id, { ...input, updatedAt: Date.now() })
  else await db.bodyLogs.add(newRecord<BodyLog>({ date, ...input }))
}

export async function listPhotoLogs(): Promise<BodyLog[]> {
  return (await db.bodyLogs.toArray())
    .filter((b) => !b.deleted && b.photo)
    .sort((a, b) => a.date.localeCompare(b.date))
}
```

`src/lib/image.ts`（canvas を使うためテストは実機で確認する）:
```ts
/** 写真を長辺 maxSize px の JPEG に縮小して data URL にする（容量を抑えるため） */
export async function resizeImage(file: File, maxSize = 1080, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('画像を処理できませんでした')
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', quality)
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/repo/body.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/repo/body.ts src/repo/body.test.ts src/lib/image.ts
git commit -m "feat: add body log repository and photo resizing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: カレンダー用の月ごとの情報

**Files:**
- Create: `src/repo/calendar.ts`
- Test: `src/repo/calendar.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/repo/calendar.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { resetDb } from '../test/db'
import { saveBodyLog } from './body'
import { getMonthInfo } from './calendar'
import { assignRoutineToDate } from './plans'
import { createRoutine } from './routines'
import { startWorkout } from './workouts'

beforeEach(resetDb)

describe('getMonthInfo', () => {
  it('日付ごとに鍛えた部位・予定・体の記録をまとめる', async () => {
    await startWorkout({
      date: '2026-10-12',
      exercises: [
        { exerciseId: 'ex-side-raise', restSec: 60, sets: [] },
        { exerciseId: 'ex-bench-press', restSec: 90, sets: [] },
        { exerciseId: 'ex-dumbbell-press', restSec: 90, sets: [] },
      ],
    })
    const r = await createRoutine({ name: '脚の日', exercises: [] })
    await assignRoutineToDate(r.id, '2026-10-14')
    await saveBodyLog('2026-10-12', { weightKg: 70 })
    await startWorkout({ date: '2026-11-01', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [] }] })

    const info = await getMonthInfo(2026, 9)
    expect(info['2026-10-12']).toEqual({ bodyParts: ['chest', 'shoulders'], hasPlan: false, hasBodyLog: true })
    expect(info['2026-10-14']).toEqual({ bodyParts: [], hasPlan: true, hasBodyLog: false })
    expect(info['2026-11-01']).toBeUndefined()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/repo/calendar.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/repo/calendar.ts`:
```ts
import { db } from '../db/db'
import { BODY_PARTS, type BodyPart } from '../db/types'
import { monthRange } from '../lib/dates'

export interface CalendarDayInfo {
  bodyParts: BodyPart[]
  hasPlan: boolean
  hasBodyLog: boolean
}

/** month は 0〜11 */
export async function getMonthInfo(year: number, month: number): Promise<Record<string, CalendarDayInfo>> {
  const [from, to] = monthRange(year, month)
  const info: Record<string, CalendarDayInfo> = {}
  const day = (date: string) => (info[date] ??= { bodyParts: [], hasPlan: false, hasBodyLog: false })

  const workouts = (await db.workouts.where('date').between(from, to, true, true).toArray()).filter((w) => !w.deleted)
  if (workouts.length) {
    const dateOf = new Map(workouts.map((w) => [w.id, w.date]))
    const wes = (await db.workoutExercises.where('workoutId').anyOf([...dateOf.keys()]).toArray()).filter((we) => !we.deleted)
    const exercises = await db.exercises.bulkGet([...new Set(wes.map((we) => we.exerciseId))])
    const partOf = new Map(exercises.flatMap((e) => (e ? [[e.id, e.bodyPart] as const] : [])))
    for (const w of workouts) day(w.date)
    for (const we of wes) {
      const part = partOf.get(we.exerciseId)
      const d = day(dateOf.get(we.workoutId)!)
      if (part && !d.bodyParts.includes(part)) d.bodyParts.push(part)
    }
  }

  const plans = await db.plannedWorkouts.where('date').between(from, to, true, true).toArray()
  for (const p of plans) if (!p.deleted) day(p.date).hasPlan = true

  const bodyLogs = await db.bodyLogs.where('date').between(from, to, true, true).toArray()
  for (const b of bodyLogs) if (!b.deleted) day(b.date).hasBodyLog = true

  for (const d of Object.values(info)) d.bodyParts.sort((a, b) => BODY_PARTS.indexOf(a) - BODY_PARTS.indexOf(b))
  return info
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/repo/calendar.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/repo/calendar.ts src/repo/calendar.test.ts
git commit -m "feat: add monthly calendar summary" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: バックアップ

**Files:**
- Create: `src/lib/backup.ts`
- Test: `src/lib/backup.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`src/lib/backup.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../db/db'
import { getBodyLog, saveBodyLog } from '../repo/body'
import { createRoutine, listRoutines } from '../repo/routines'
import { resetDb } from '../test/db'
import { exportBackup, importBackup, parseBackup } from './backup'

beforeEach(resetDb)

describe('backup', () => {
  it('書き出したものを読み込むと元に戻る（写真も含む）', async () => {
    await createRoutine({ name: '胸の日', exercises: [] })
    await saveBodyLog('2026-10-12', { weightKg: 70, photo: 'data:image/jpeg;base64,AAA' })
    const text = JSON.stringify(await exportBackup())

    await resetDb()
    expect(await listRoutines()).toEqual([])

    await importBackup(parseBackup(text))
    expect((await listRoutines()).map((r) => r.name)).toEqual(['胸の日'])
    expect(await getBodyLog('2026-10-12')).toMatchObject({ weightKg: 70, photo: 'data:image/jpeg;base64,AAA' })
  })

  it('読み込むと今のデータは置き換わる', async () => {
    const text = JSON.stringify(await exportBackup())
    await createRoutine({ name: 'あとで作った', exercises: [] })
    await importBackup(parseBackup(text))
    expect(await listRoutines()).toEqual([])
  })

  it('JSONでなければエラー', () => {
    expect(() => parseBackup('not json')).toThrow('バックアップファイルを読み込めませんでした')
  })

  it('このアプリのファイルでなければエラー', () => {
    expect(() => parseBackup(JSON.stringify({ app: 'other', version: 1, data: {} }))).toThrow('このアプリのバックアップファイルではありません')
  })

  it('表が欠けていればエラーで、DBは変わらない', async () => {
    const backup = await exportBackup()
    const broken = { ...backup, data: { ...backup.data, sets: 'oops' } }
    expect(() => parseBackup(JSON.stringify(broken))).toThrow('バックアップファイルが壊れています（sets）')
    expect(await db.exercises.count()).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/lib/backup.test.ts`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/lib/backup.ts`:
```ts
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
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/lib/backup.test.ts`
Expected: PASS

- [ ] **Step 5: 全テストを確認してCommit**

Run: `npm test`
Expected: PASS（全テスト）

```bash
git add src/lib/backup.ts src/lib/backup.test.ts
git commit -m "feat: add backup export/import with validation" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: 共通の画面部品とスタイル

**Files:**
- Create: `src/components/Toast.tsx`, `src/components/Dialog.tsx`, `src/components/Stepper.tsx`, `src/components/RatingPicker.tsx`, `src/components/SetInputs.tsx`
- Modify: `src/index.css`（全体を置き換え）
- Test: `src/components/Stepper.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/components/Stepper.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Stepper } from './Stepper'

describe('Stepper', () => {
  it('＋−で刻み幅ずつ変える', async () => {
    const onChange = vi.fn()
    render(<Stepper label="重量" unit="kg" value={60} step={2.5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '重量を増やす' }))
    expect(onChange).toHaveBeenLastCalledWith(62.5)
    await userEvent.click(screen.getByRole('button', { name: '重量を減らす' }))
    expect(onChange).toHaveBeenLastCalledWith(57.5)
  })

  it('最小値より下にはならない', async () => {
    const onChange = vi.fn()
    render(<Stepper label="回数" value={0} step={1} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '回数を減らす' }))
    expect(onChange).toHaveBeenLastCalledWith(0)
  })

  it('数字をタップすると直接入力できる', async () => {
    const onChange = vi.fn()
    render(<Stepper label="重量" unit="kg" value={60} step={2.5} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '重量 60kg' }))
    const input = screen.getByRole('spinbutton', { name: '重量' })
    await userEvent.clear(input)
    await userEvent.type(input, '72.5')
    await userEvent.tab()
    expect(onChange).toHaveBeenLastCalledWith(72.5)
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/components`
Expected: FAIL

- [ ] **Step 3: 部品を実装する**

`src/components/Stepper.tsx`:
```tsx
import { useState } from 'react'

interface Props {
  label: string
  value: number
  step: number
  min?: number
  unit?: string
  onChange: (value: number) => void
}

const round = (v: number) => Math.round(v * 100) / 100

export function Stepper({ label, value, step, min = 0, unit, onChange }: Props) {
  const [editing, setEditing] = useState(false)
  return (
    <div className="stepper">
      <button type="button" aria-label={`${label}を減らす`} onClick={() => onChange(Math.max(min, round(value - step)))}>
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
            if (e.target.value !== '' && !Number.isNaN(v)) onChange(Math.max(min, round(v)))
            setEditing(false)
          }}
        />
      ) : (
        <button type="button" className="stepper-value" aria-label={`${label} ${value}${unit ?? ''}`} onClick={() => setEditing(true)}>
          {value}
          {unit && <small>{unit}</small>}
        </button>
      )}
      <button type="button" aria-label={`${label}を増やす`} onClick={() => onChange(round(value + step))}>
        ＋
      </button>
    </div>
  )
}
```

`src/components/Toast.tsx`:
```tsx
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ToastContext = createContext<(message: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMessage(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 3000)
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && (
        <div className="toast" role="alert">
          {message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}

/**
 * 保存処理を実行し、失敗したらトーストで知らせる。成功したら true。
 * 失敗時は false を返すので、呼び出し側は入力内容を消さずに残せる。
 */
export function useSafeAction() {
  const toast = useToast()
  return useCallback(
    async (action: () => Promise<unknown>, failMessage = '保存できませんでした。もう一度試してください'): Promise<boolean> => {
      try {
        await action()
        return true
      } catch (e) {
        console.error(e)
        toast(e instanceof Error && e.message ? `${failMessage}（${e.message}）` : failMessage)
        return false
      }
    },
    [toast],
  )
}
```

`src/components/Dialog.tsx`:
```tsx
import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Dialog({ title, onClose, children }: Props) {
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="閉じる" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
```

`src/components/RatingPicker.tsx`:
```tsx
import type { Rating } from '../db/types'

export const FACES = ['😫', '😕', '😐', '🙂', '😄']
export const NUMBERS = ['1', '2', '3', '4', '5']

interface Props {
  label: string
  symbols: string[]
  value: Rating | undefined
  onChange: (value: Rating | undefined) => void
}

/** 5段階の選択。選択中をもう一度押すと解除 */
export function RatingPicker({ label, symbols, value, onChange }: Props) {
  return (
    <div className="rating" role="group" aria-label={label}>
      {symbols.map((symbol, i) => {
        const r = (i + 1) as Rating
        return (
          <button
            key={r}
            type="button"
            className={value === r ? 'selected' : ''}
            aria-pressed={value === r}
            aria-label={`${label} ${r}`}
            onClick={() => onChange(value === r ? undefined : r)}
          >
            {symbol}
          </button>
        )
      })}
    </div>
  )
}
```

`src/components/SetInputs.tsx`:
```tsx
import type { BodyPart, LogType, SetValues, Settings } from '../db/types'
import { Stepper } from './Stepper'

interface Props {
  logType: LogType
  bodyPart: BodyPart
  values: SetValues
  settings: Settings
  /** 変更した項目だけを渡す */
  onChange: (changes: SetValues) => void
}

/** 記録形式に合わせた入力欄（トレーニング画面とマイメニュー編集で共通） */
export function SetInputs({ logType, bodyPart, values, settings, onChange }: Props) {
  if (logType === 'weight_reps') {
    return (
      <>
        <Stepper label="重量" unit="kg" value={values.weight ?? 0} step={settings.weightStep} onChange={(weight) => onChange({ weight })} />
        <Stepper label="回数" unit="回" value={values.reps ?? 0} step={settings.repStep} onChange={(reps) => onChange({ reps })} />
      </>
    )
  }
  if (logType === 'reps') {
    return (
      <>
        <Stepper label="回数" unit="回" value={values.reps ?? 0} step={settings.repStep} onChange={(reps) => onChange({ reps })} />
        <Stepper label="加重" unit="kg" min={-200} value={values.weight ?? 0} step={settings.weightStep} onChange={(weight) => onChange({ weight })} />
      </>
    )
  }
  if (bodyPart === 'cardio') {
    return (
      <>
        <Stepper
          label="時間"
          unit="分"
          value={Math.round((values.durationSec ?? 0) / 60)}
          step={1}
          onChange={(min) => onChange({ durationSec: min * 60 })}
        />
        <Stepper label="距離" unit="km" value={values.distanceKm ?? 0} step={0.1} onChange={(distanceKm) => onChange({ distanceKm })} />
      </>
    )
  }
  return <Stepper label="時間" unit="秒" value={values.durationSec ?? 0} step={15} onChange={(durationSec) => onChange({ durationSec })} />
}
```

- [ ] **Step 4: スタイルを書く**

`src/index.css`（全体を置き換え）:
```css
:root {
  color-scheme: dark;
  --bg: #0f1115;
  --surface: #1a1d24;
  --surface-2: #242833;
  --text: #f1f3f7;
  --muted: #9aa3b2;
  --accent: #f97316;
  --accent-text: #111111;
  --border: #2e3340;
  --danger: #ef4444;
  --ok: #22c55e;
  --radius: 14px;
  --nav-h: 64px;
  font-family: system-ui, -apple-system, 'Hiragino Sans', sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); -webkit-tap-highlight-color: transparent; }
body { padding-top: env(safe-area-inset-top); }
button, input, select, textarea { font: inherit; color: inherit; }
button { cursor: pointer; }
h1 { font-size: 1.4rem; margin: 0; }
h2 { font-size: 1.1rem; margin: 0 0 8px; }
a { color: var(--accent); }

.page { max-width: 640px; margin: 0 auto; padding: 16px 16px calc(var(--nav-h) + 96px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 12px; }
.page-header { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
.card.warning { border-color: var(--danger); }
.row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.row.between { justify-content: space-between; flex-wrap: nowrap; }
.stack { display: flex; flex-direction: column; gap: 8px; }
.muted { color: var(--muted); font-size: 0.9rem; margin: 4px 0; }

.btn { border: 1px solid var(--border); background: var(--surface-2); border-radius: 12px; padding: 12px 16px; min-height: 44px; text-align: center; text-decoration: none; color: var(--text); display: inline-block; }
.btn-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-text); font-weight: 700; }
.btn-ghost { background: transparent; }
.btn-danger { background: transparent; color: var(--danger); }
.btn-block { width: 100%; display: block; }
.btn-big { font-size: 1.15rem; padding: 18px; }
.icon-btn { background: none; border: none; min-width: 36px; min-height: 36px; font-size: 1.1rem; }

input[type='text'], input[type='search'], input[type='date'], select, textarea { width: 100%; background: var(--surface-2); border: 1px solid var(--border); border-radius: 10px; padding: 10px 12px; min-height: 44px; }
.field { display: flex; flex-direction: column; gap: 6px; font-size: 0.9rem; color: var(--muted); }

.chips { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; }
.chip { border: 1px solid var(--border); background: var(--surface-2); border-radius: 999px; padding: 6px 12px; white-space: nowrap; }
.chip.selected { background: var(--accent); border-color: var(--accent); color: var(--accent-text); }

.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.list .item { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 12px; border-radius: 10px; background: var(--surface-2); color: var(--text); text-decoration: none; border: none; width: 100%; text-align: left; }

.stepper { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.stepper > button { background: var(--surface-2); border: none; min-width: 36px; min-height: 40px; font-size: 1.1rem; }
.stepper .stepper-value { background: transparent; min-width: 54px; font-weight: 700; }
.stepper small { font-weight: 400; color: var(--muted); font-size: 0.75rem; margin-left: 2px; }
.stepper input { width: 64px; min-height: 40px; text-align: center; border: none; background: var(--bg); }

.exercise-head { display: flex; align-items: center; gap: 4px; }
.exercise-head h2 { flex: 1; margin: 0; }
.set-row { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
.set-row.done { opacity: 0.6; }
.set-no { width: 18px; color: var(--muted); }
.set-check { width: 30px; height: 30px; margin-left: auto; accent-color: var(--ok); }

.rating { display: flex; gap: 6px; }
.rating button { flex: 1; min-height: 44px; border-radius: 10px; border: 1px solid var(--border); background: var(--surface-2); font-size: 1.2rem; }
.rating button.selected { border-color: var(--accent); background: #3a2414; }

.dialog-backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
.dialog { background: var(--surface); width: 100%; max-width: 640px; max-height: 90vh; overflow-y: auto; border-radius: 18px 18px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 12px; }

.bottom-nav { position: fixed; left: 0; right: 0; bottom: 0; z-index: 20; height: calc(var(--nav-h) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); display: flex; background: var(--surface); border-top: 1px solid var(--border); }
.bottom-nav a { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; color: var(--muted); text-decoration: none; font-size: 0.75rem; }
.bottom-nav a.active { color: var(--accent); }
.bottom-nav .icon { font-size: 1.3rem; }

.timer-bar { position: fixed; left: 8px; right: 8px; z-index: 30; bottom: calc(var(--nav-h) + env(safe-area-inset-bottom) + 8px); display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--surface-2); border: 1px solid var(--accent); border-radius: 14px; }
.timer-bar .timer-time { flex: 1; font-size: 1.4rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.timer-big { position: sticky; top: 0; z-index: 10; text-align: center; padding: 12px; background: var(--surface-2); border: 2px solid var(--accent); border-radius: var(--radius); }
.timer-big .timer-time { display: block; font-size: 3.5rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.timer-big .row { justify-content: center; }
.timer-bar button, .timer-big button { min-height: 40px; padding: 0 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; }
.flash { animation: flash 0.5s ease-in-out 6 alternate; }
@keyframes flash { from { background: var(--surface-2); } to { background: var(--accent); color: var(--accent-text); } }
.screen-flash { position: fixed; inset: 0; z-index: 60; pointer-events: none; background: #ffffff; opacity: 0; animation: screen-flash 0.4s ease-in-out 6 alternate; }
@keyframes screen-flash { from { opacity: 0; } to { opacity: 0.7; } }

.calendar-head { display: flex; align-items: center; justify-content: space-between; }
.calendar-head h2 { margin: 0; }
.calendar-head button { background: none; border: none; font-size: 1.2rem; min-width: 44px; min-height: 44px; }
.calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.calendar-weekday { text-align: center; color: var(--muted); font-size: 0.8rem; }
.calendar-day { aspect-ratio: 1; display: flex; flex-direction: column; align-items: center; padding: 4px 0; font-size: 0.85rem; background: var(--surface-2); border: 1px solid transparent; border-radius: 8px; }
.calendar-day.today { border-color: var(--accent); }
.dots { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px; margin-top: 4px; }
.dots i { display: block; width: 7px; height: 7px; border-radius: 50%; }
.dots i.plan-dot { border: 1.5px solid var(--text); }
.legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; font-size: 0.75rem; color: var(--muted); }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 3px; }

.photos { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.photos img, img.photo { width: 100%; border-radius: 10px; }
.toast { position: fixed; z-index: 100; left: 16px; right: 16px; top: calc(env(safe-area-inset-top) + 12px); padding: 12px 16px; background: #333a48; border: 1px solid var(--accent); border-radius: 12px; }
```

- [ ] **Step 5: 成功を確認**

Run: `npx vitest run src/components`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/components src/index.css
git commit -m "feat: add shared UI components and base styles" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: 休憩タイマーの画面

**Files:**
- Create: `src/features/timer/RestTimerContext.tsx`, `src/features/timer/RestTimerDisplay.tsx`, `src/features/timer/useWakeLock.ts`
- Test: `src/features/timer/RestTimerDisplay.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/timer/RestTimerDisplay.test.tsx`:
```tsx
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { RestTimerProvider, useRestTimer } from './RestTimerContext'
import { RestTimerDisplay } from './RestTimerDisplay'

function StartButton({ sec }: { sec: number }) {
  const { start } = useRestTimer()
  return <button onClick={() => start(sec)}>start</button>
}

function setup(sec: number) {
  render(
    <RestTimerProvider>
      <StartButton sec={sec} />
      <RestTimerDisplay variant="bar" />
    </RestTimerProvider>,
  )
}

describe('RestTimerDisplay', () => {
  it('開始前は何も表示しない', () => {
    setup(90)
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('開始すると残り時間を表示し、＋15秒で増える', async () => {
    setup(90)
    await userEvent.click(screen.getByText('start'))
    expect(screen.getByRole('timer')).toHaveTextContent('1:30')
    await userEvent.click(screen.getByRole('button', { name: '＋15秒' }))
    expect(screen.getByRole('timer')).toHaveTextContent('1:45')
  })

  it('スキップで消える', async () => {
    setup(90)
    await userEvent.click(screen.getByText('start'))
    await userEvent.click(screen.getByRole('button', { name: 'スキップ' }))
    expect(screen.queryByRole('timer')).toBeNull()
  })

  it('0秒になると「休憩終了」と表示する', async () => {
    setup(1)
    await userEvent.click(screen.getByText('start'))
    await act(() => new Promise((r) => setTimeout(r, 1300)))
    expect(screen.getByRole('timer')).toHaveTextContent('休憩終了')
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/features/timer`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/features/timer/RestTimerContext.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { adjustTimer, loadTimer, saveTimer, startTimer, type RestTimerState } from '../../lib/restTimer'

interface RestTimerApi {
  state: RestTimerState | null
  start: (sec: number) => void
  adjust: (deltaSec: number) => void
  skip: () => void
}

const RestTimerContext = createContext<RestTimerApi>({ state: null, start: () => {}, adjust: () => {}, skip: () => {} })

export function RestTimerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RestTimerState | null>(() => loadTimer())
  const update = useCallback((next: RestTimerState | null) => {
    setState(next)
    saveTimer(next)
  }, [])
  const api = useMemo<RestTimerApi>(
    () => ({
      state,
      start: (sec) => update(sec > 0 ? startTimer(sec, Date.now()) : null),
      adjust: (delta) => {
        if (state) update(adjustTimer(state, delta, Date.now()))
      },
      skip: () => update(null),
    }),
    [state, update],
  )
  return <RestTimerContext.Provider value={api}>{children}</RestTimerContext.Provider>
}

export function useRestTimer() {
  return useContext(RestTimerContext)
}

/** active の間だけ、現在時刻を定期的に更新する */
export function useNow(active: boolean, intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    setNow(Date.now())
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(t)
  }, [active, intervalMs])
  return now
}
```

`src/features/timer/useWakeLock.ts`:
```ts
import { useEffect } from 'react'

/** active の間、画面が消えないようにする。アプリに戻ってきたら取り直す */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let cancelled = false
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request('screen')
        if (cancelled) await lock.release()
      } catch {
        // 取れなくてもタイマーは動く
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request()
    }
    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void lock?.release()
    }
  }, [active])
}
```

`src/features/timer/RestTimerDisplay.tsx`:
```tsx
import { remainingSec } from '../../lib/restTimer'
import { formatSeconds } from '../../lib/workoutStats'
import { useNow, useRestTimer } from './RestTimerContext'
import { useWakeLock } from './useWakeLock'

/**
 * big: トレーニング画面の上部に出す大きな表示
 * bar: 他の画面で下に出す小さな表示
 * 音は鳴らさない（ジムで周りの迷惑になるため）。終わったら画面を光らせる
 */
export function RestTimerDisplay({ variant }: { variant: 'big' | 'bar' }) {
  const { state, adjust, skip } = useRestTimer()
  const now = useNow(state !== null)
  const remaining = state ? remainingSec(state, now) : 0
  const finished = state !== null && remaining === 0
  useWakeLock(state !== null && !finished)
  if (!state) return null

  const controls = (
    <>
      {!finished && (
        <>
          <button type="button" onClick={() => adjust(-15)}>
            −15秒
          </button>
          <button type="button" onClick={() => adjust(15)}>
            ＋15秒
          </button>
        </>
      )}
      <button type="button" onClick={skip}>
        {finished ? '閉じる' : 'スキップ'}
      </button>
    </>
  )

  return (
    <>
      {finished && <div className="screen-flash" />}
      <div className={`${variant === 'big' ? 'timer-big' : 'timer-bar'} ${finished ? 'flash' : ''}`} role="timer">
        <span>{finished ? '休憩終了！' : '休憩中'}</span>
        <span className="timer-time">{formatSeconds(remaining)}</span>
        {variant === 'big' ? <div className="row">{controls}</div> : controls}
      </div>
    </>
  )
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/features/timer`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/timer
git commit -m "feat: add rest timer display with wake lock and flash" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: 画面の骨組み（下部メニュー・ルーティング）

**Files:**
- Create: `src/components/BottomNav.tsx`, `src/components/Layout.tsx`, `src/components/StorageWarning.tsx`, `src/features/home/HomePage.tsx`, `src/test/render.tsx`
- Modify: `src/App.tsx`（全体を置き換え）

- [ ] **Step 1: 部品を書く**

`src/components/BottomNav.tsx`:
```tsx
import { NavLink } from 'react-router'

const ITEMS = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/body', icon: '⚖️', label: '体' },
  { to: '/routines', icon: '📋', label: 'メニュー' },
  { to: '/exercises', icon: '💪', label: '種目' },
  { to: '/settings', icon: '⚙️', label: '設定' },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="メインメニュー">
      {ITEMS.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'}>
          <span className="icon" aria-hidden="true">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
```

`src/components/Layout.tsx`:
```tsx
import { Outlet, useMatch } from 'react-router'
import { RestTimerDisplay } from '../features/timer/RestTimerDisplay'
import { BottomNav } from './BottomNav'

export function Layout() {
  // トレーニング画面は自分で大きなタイマーを出すので、小さなバーは出さない
  const onWorkout = useMatch('/workout/:id')
  return (
    <>
      <main>
        <Outlet />
      </main>
      {!onWorkout && <RestTimerDisplay variant="bar" />}
      <BottomNav />
    </>
  )
}
```

`src/components/StorageWarning.tsx`:
```tsx
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
```

`src/features/home/HomePage.tsx`（Task 18で中身を足す）:
```tsx
export function HomePage() {
  return (
    <div className="page">
      <h1>筋トレ記録</h1>
    </div>
  )
}
```

`src/App.tsx`:
```tsx
import { HashRouter, Route, Routes } from 'react-router'
import { Layout } from './components/Layout'
import { ToastProvider } from './components/Toast'
import { HomePage } from './features/home/HomePage'
import { RestTimerProvider } from './features/timer/RestTimerContext'

export function App() {
  return (
    <ToastProvider>
      <RestTimerProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
            </Route>
          </Routes>
        </HashRouter>
      </RestTimerProvider>
    </ToastProvider>
  )
}
```

`src/test/render.tsx`（画面のテスト用）:
```tsx
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { ToastProvider } from '../components/Toast'
import { RestTimerProvider } from '../features/timer/RestTimerContext'

function CurrentPath() {
  return <p data-testid="current-path">{useLocation().pathname}</p>
}

/** path にページを置いて url を開く。どこへ遷移したかは data-testid="current-path" で確認できる */
export function renderPage(path: string, url: string, page: ReactNode) {
  return render(
    <ToastProvider>
      <RestTimerProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path={path} element={page} />
            <Route path="*" element={<CurrentPath />} />
          </Routes>
        </MemoryRouter>
      </RestTimerProvider>
    </ToastProvider>,
  )
}
```

- [ ] **Step 2: 動作確認**

Run: `npm run build`
Expected: エラーなし

Run: `npm run dev` を起動し、ブラウザで表示されたURLを開く
Expected: 「筋トレ記録」と下部メニュー（ホーム・体・メニュー・種目・設定）が表示される

- [ ] **Step 3: Commit**

```bash
git add src
git commit -m "feat: add app shell with bottom navigation and routing" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: 種目の一覧・検索・追加

**Files:**
- Create: `src/features/exercises/ExerciseFilter.tsx`, `src/features/exercises/ExercisePicker.tsx`, `src/features/exercises/ExerciseListPage.tsx`, `src/features/exercises/ExerciseEditPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/exercises/ExercisePicker.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/exercises/ExercisePicker.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resetDb } from '../../test/db'
import { ExercisePicker } from './ExercisePicker'

beforeEach(resetDb)

describe('ExercisePicker', () => {
  it('検索して選べる', async () => {
    const onPick = vi.fn()
    render(<ExercisePicker onPick={onPick} onClose={() => {}} />)
    await userEvent.type(screen.getByRole('searchbox', { name: '種目を検索' }), 'べんち')
    await userEvent.click(await screen.findByRole('button', { name: /^ベンチプレス/ }))
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 'ex-bench-press' }))
  })

  it('部位で絞り込める', async () => {
    render(<ExercisePicker onPick={() => {}} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '脚' }))
    expect(await screen.findByRole('button', { name: /^スクワット/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ベンチプレス/ })).toBeNull()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/features/exercises`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/features/exercises/ExerciseFilter.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { BODY_PART_LABELS, BODY_PARTS, type BodyPart, type Exercise } from '../../db/types'
import { filterExercises, listExercises } from '../../repo/exercises'

/** 検索欄と部位の絞り込み。絞り込んだ結果は呼び出し側で表示する */
export function useExerciseFilter() {
  const all = useLiveQuery(listExercises)
  const [query, setQuery] = useState('')
  const [bodyPart, setBodyPart] = useState<BodyPart | undefined>()
  const results: Exercise[] = all ? filterExercises(all, query, bodyPart) : []
  const controls = (
    <div className="stack">
      <input type="search" aria-label="種目を検索" placeholder="種目名で検索" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips">
        <button type="button" className={`chip ${bodyPart === undefined ? 'selected' : ''}`} onClick={() => setBodyPart(undefined)}>
          すべて
        </button>
        {BODY_PARTS.map((p) => (
          <button key={p} type="button" className={`chip ${bodyPart === p ? 'selected' : ''}`} onClick={() => setBodyPart(p)}>
            {BODY_PART_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  )
  return { results, controls, loading: all === undefined }
}
```

`src/features/exercises/ExercisePicker.tsx`:
```tsx
import { Dialog } from '../../components/Dialog'
import { EQUIPMENT_LABELS, type Exercise } from '../../db/types'
import { useExerciseFilter } from './ExerciseFilter'

interface Props {
  onPick: (exercise: Exercise) => void
  onClose: () => void
}

export function ExercisePicker({ onPick, onClose }: Props) {
  const { results, controls } = useExerciseFilter()
  return (
    <Dialog title="種目を選ぶ" onClose={onClose}>
      {controls}
      <ul className="list">
        {results.map((e) => (
          <li key={e.id}>
            <button type="button" className="item" onClick={() => onPick(e)}>
              {e.name}
              <span className="muted">{EQUIPMENT_LABELS[e.equipment]}</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
```

`src/features/exercises/ExerciseListPage.tsx`:
```tsx
import { Link } from 'react-router'
import { BODY_PART_LABELS, EQUIPMENT_LABELS } from '../../db/types'
import { useExerciseFilter } from './ExerciseFilter'

export function ExerciseListPage() {
  const { results, controls } = useExerciseFilter()
  return (
    <div className="page">
      <header className="page-header">
        <h1>種目</h1>
        <Link className="btn btn-primary" to="/exercises/new">
          ＋ 追加
        </Link>
      </header>
      {controls}
      <ul className="list">
        {results.map((e) => (
          <li key={e.id}>
            <Link className="item" to={`/exercises/${e.id}`}>
              {e.name}
              <span className="muted">
                {BODY_PART_LABELS[e.bodyPart]}・{EQUIPMENT_LABELS[e.equipment]}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

`src/features/exercises/ExerciseEditPage.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { Stepper } from '../../components/Stepper'
import { useSafeAction } from '../../components/Toast'
import {
  BODY_PART_LABELS,
  BODY_PARTS,
  EQUIPMENT_LABELS,
  LOG_TYPE_LABELS,
  type BodyPart,
  type Equipment,
  type LogType,
} from '../../db/types'
import { createExercise, getExercise, updateExercise, type ExerciseInput } from '../../repo/exercises'

const EMPTY: ExerciseInput = { name: '', bodyPart: 'chest', equipment: 'barbell', logType: 'weight_reps', defaultRestSec: 90 }

export function ExerciseEditPage() {
  const { id } = useParams()
  const existing = useLiveQuery(() => (id ? getExercise(id).then((e) => e ?? null) : Promise.resolve(null)), [id])
  if (existing === undefined) return <div className="page">読み込み中…</div>
  return <ExerciseForm key={id ?? 'new'} id={id} initial={existing ?? EMPTY} />
}

function ExerciseForm({ id, initial }: { id?: string; initial: ExerciseInput }) {
  const [form, setForm] = useState<ExerciseInput>({
    name: initial.name,
    bodyPart: initial.bodyPart,
    equipment: initial.equipment,
    logType: initial.logType,
    defaultRestSec: initial.defaultRestSec,
  })
  const navigate = useNavigate()
  const run = useSafeAction()
  const set = (changes: Partial<ExerciseInput>) => setForm((f) => ({ ...f, ...changes }))

  const save = async () => {
    const input = { ...form, name: form.name.trim() }
    const ok = await run(() => (id ? updateExercise(id, input) : createExercise(input)))
    if (ok) navigate('/exercises')
  }

  return (
    <div className="page">
      <h1>{id ? '種目を編集' : '種目を追加'}</h1>
      <label className="field">
        名前
        <input type="text" value={form.name} onChange={(e) => set({ name: e.target.value })} />
      </label>
      <label className="field">
        部位
        <select value={form.bodyPart} onChange={(e) => set({ bodyPart: e.target.value as BodyPart })}>
          {BODY_PARTS.map((p) => (
            <option key={p} value={p}>
              {BODY_PART_LABELS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        器具
        <select value={form.equipment} onChange={(e) => set({ equipment: e.target.value as Equipment })}>
          {Object.entries(EQUIPMENT_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        記録の形式
        <select value={form.logType} onChange={(e) => set({ logType: e.target.value as LogType })}>
          {Object.entries(LOG_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <div className="field">
        標準の休憩時間
        <Stepper label="休憩時間" unit="秒" step={15} value={form.defaultRestSec} onChange={(defaultRestSec) => set({ defaultRestSec })} />
      </div>
      <button type="button" className="btn btn-primary btn-block" disabled={!form.name.trim()} onClick={save}>
        保存
      </button>
    </div>
  )
}
```

- [ ] **Step 4: ルートを追加**

`src/App.tsx` の import に追加:
```tsx
import { ExerciseEditPage } from './features/exercises/ExerciseEditPage'
import { ExerciseListPage } from './features/exercises/ExerciseListPage'
```
`<Route index element={<HomePage />} />` の下に追加:
```tsx
              <Route path="exercises" element={<ExerciseListPage />} />
              <Route path="exercises/new" element={<ExerciseEditPage />} />
              <Route path="exercises/:id" element={<ExerciseEditPage />} />
```

- [ ] **Step 5: 成功を確認**

Run: `npx vitest run src/features/exercises`
Expected: PASS

Run: `npm run dev` で「種目」タブを開く
Expected: 種目一覧が出る。「べんち」で検索するとベンチプレス系が出る。追加・編集が保存される

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add exercise list, search, picker and editor" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 17: トレーニング実行画面

**Files:**
- Create: `src/features/workout/SetRow.tsx`, `src/features/workout/ExerciseNoteDialog.tsx`, `src/features/workout/FinishDialog.tsx`, `src/features/workout/ExerciseBlock.tsx`, `src/features/workout/WorkoutPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/workout/WorkoutPage.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/workout/WorkoutPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { getWorkoutDetail, startWorkout } from '../../repo/workouts'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { WorkoutPage } from './WorkoutPage'

let workoutId: string

beforeEach(async () => {
  await resetDb()
  workoutId = await startWorkout({
    date: '2026-10-12',
    title: '胸の日',
    exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }, { weight: 60, reps: 8 }] }],
  })
})

const open = () => renderPage('/workout/:id', `/workout/${workoutId}`, <WorkoutPage />)

describe('WorkoutPage', () => {
  it('予定の重量・回数が最初から入っている', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'ベンチプレス' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '重量 60kg' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '回数 8回' })).toHaveLength(2)
  })

  it('チェックすると記録され、休憩タイマーが始まる', async () => {
    open()
    await userEvent.click(await screen.findByRole('checkbox', { name: '1セット目 完了' }))
    await waitFor(async () => expect((await getWorkoutDetail(workoutId))!.exercises[0].sets[0].done).toBe(true))
    expect(screen.getByRole('timer')).toHaveTextContent('1:30')
  })

  it('＋で回数を変えられる', async () => {
    open()
    await userEvent.click((await screen.findAllByRole('button', { name: '回数を増やす' }))[0])
    await waitFor(async () => expect((await getWorkoutDetail(workoutId))!.exercises[0].sets[0].reps).toBe(9))
  })

  it('セットを追加できる', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: '＋ セット追加' }))
    expect(await screen.findByRole('checkbox', { name: '3セット目 完了' })).toBeInTheDocument()
  })

  it('終了すると調子・満足度を保存してホームへ戻る', async () => {
    open()
    await userEvent.click(await screen.findByRole('button', { name: 'トレーニング終了' }))
    await userEvent.click(screen.getByRole('button', { name: '調子 4' }))
    await userEvent.click(screen.getByRole('button', { name: '満足度 5' }))
    await userEvent.click(screen.getByRole('button', { name: '終了する' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent('/')
    expect((await getWorkoutDetail(workoutId))!.workout).toMatchObject({ condition: 4, satisfaction: 5, finishedAt: expect.any(Number) })
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/features/workout`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/features/workout/SetRow.tsx`:
```tsx
import { SetInputs } from '../../components/SetInputs'
import type { Exercise, SetRecord, SetValues, Settings } from '../../db/types'

interface Props {
  index: number
  set: SetRecord
  exercise: Exercise
  settings: Settings
  onChange: (changes: SetValues) => void
  onToggle: (done: boolean) => void
  onDelete: () => void
}

export function SetRow({ index, set, exercise, settings, onChange, onToggle, onDelete }: Props) {
  const no = index + 1
  return (
    <div className={`set-row ${set.done ? 'done' : ''}`}>
      <span className="set-no">{no}</span>
      <SetInputs logType={exercise.logType} bodyPart={exercise.bodyPart} values={set} settings={settings} onChange={onChange} />
      <input
        type="checkbox"
        className="set-check"
        aria-label={`${no}セット目 完了`}
        checked={set.done}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <button type="button" className="icon-btn" aria-label={`${no}セット目を削除`} onClick={onDelete}>
        ×
      </button>
    </div>
  )
}
```

`src/features/workout/ExerciseNoteDialog.tsx`:
```tsx
import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { NUMBERS, RatingPicker } from '../../components/RatingPicker'
import type { Rating, WorkoutExercise } from '../../db/types'

interface Props {
  title: string
  workoutExercise: WorkoutExercise
  onSave: (changes: { effort?: Rating; note?: string }) => void
  onClose: () => void
}

export function ExerciseNoteDialog({ title, workoutExercise, onSave, onClose }: Props) {
  const [effort, setEffort] = useState(workoutExercise.effort)
  const [note, setNote] = useState(workoutExercise.note ?? '')
  return (
    <Dialog title={`${title}のメモ`} onClose={onClose}>
      <div className="field">
        きつさ（1:楽 〜 5:限界）
        <RatingPicker label="きつさ" symbols={NUMBERS} value={effort} onChange={setEffort} />
      </div>
      <label className="field">
        メモ
        <textarea rows={3} value={note} placeholder="例：肩が少し痛んだ、グリップ幅を変えた" onChange={(e) => setNote(e.target.value)} />
      </label>
      <button type="button" className="btn btn-primary btn-block" onClick={() => onSave({ effort, note: note.trim() || undefined })}>
        保存
      </button>
    </Dialog>
  )
}
```

`src/features/workout/FinishDialog.tsx`:
```tsx
import { useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { FACES, NUMBERS, RatingPicker } from '../../components/RatingPicker'
import type { Rating } from '../../db/types'
import type { FinishResult } from '../../repo/workouts'

interface Props {
  onCancel: () => void
  onSubmit: (result: FinishResult) => void
}

export function FinishDialog({ onCancel, onSubmit }: Props) {
  const [condition, setCondition] = useState<Rating>()
  const [satisfaction, setSatisfaction] = useState<Rating>()
  const [note, setNote] = useState('')
  return (
    <Dialog title="トレーニング終了" onClose={onCancel}>
      <div className="field">
        今日の調子
        <RatingPicker label="調子" symbols={FACES} value={condition} onChange={setCondition} />
      </div>
      <div className="field">
        満足度
        <RatingPicker label="満足度" symbols={NUMBERS} value={satisfaction} onChange={setSatisfaction} />
      </div>
      <label className="field">
        メモ
        <textarea rows={3} value={note} placeholder="例：睡眠不足で重く感じた" onChange={(e) => setNote(e.target.value)} />
      </label>
      <button
        type="button"
        className="btn btn-primary btn-block"
        onClick={() => onSubmit({ condition, satisfaction, note: note.trim() || undefined })}
      >
        終了する
      </button>
    </Dialog>
  )
}
```

`src/features/workout/ExerciseBlock.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useSafeAction } from '../../components/Toast'
import type { Settings } from '../../db/types'
import { formatSets } from '../../lib/workoutStats'
import { getPreviousSets } from '../../repo/history'
import {
  addSet,
  deleteSet,
  moveExercise,
  removeExerciseFromWorkout,
  setDone,
  updateExerciseNote,
  updateSet,
} from '../../repo/workoutEdits'
import type { WorkoutExerciseDetail } from '../../repo/workouts'
import { ExerciseNoteDialog } from './ExerciseNoteDialog'
import { SetRow } from './SetRow'

interface Props {
  entry: WorkoutExerciseDetail
  /** この時刻より前の記録を「前回」とする */
  before: number
  settings: Settings
  isFirst: boolean
  isLast: boolean
  onSetDone: (done: boolean) => void
}

export function ExerciseBlock({ entry, before, settings, isFirst, isLast, onSetDone }: Props) {
  const { workoutExercise: we, exercise, sets } = entry
  const previous = useLiveQuery(() => getPreviousSets(exercise.id, before), [exercise.id, before])
  const run = useSafeAction()
  const [noteOpen, setNoteOpen] = useState(false)

  return (
    <section className="card" aria-label={exercise.name}>
      <div className="exercise-head">
        <h2>{exercise.name}</h2>
        <button type="button" className="icon-btn" aria-label={`${exercise.name}のメモ`} onClick={() => setNoteOpen(true)}>
          📝
        </button>
        {!isFirst && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を上へ`} onClick={() => run(() => moveExercise(we.id, -1))}>
            ↑
          </button>
        )}
        {!isLast && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を下へ`} onClick={() => run(() => moveExercise(we.id, 1))}>
            ↓
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={`${exercise.name}を削除`}
          onClick={() => {
            if (window.confirm(`${exercise.name}を削除しますか？`)) void run(() => removeExerciseFromWorkout(we.id))
          }}
        >
          🗑
        </button>
      </div>
      <p className="muted">
        休憩 {we.restSec}秒{previous && previous.length > 0 && ` ／ 前回 ${formatSets(exercise.logType, previous)}`}
      </p>
      {(we.effort !== undefined || we.note) && (
        <p className="muted">
          {we.effort !== undefined && `きつさ ${we.effort} `}
          {we.note}
        </p>
      )}
      {sets.map((s, i) => (
        <SetRow
          key={s.id}
          index={i}
          set={s}
          exercise={exercise}
          settings={settings}
          onChange={(changes) => void run(() => updateSet(s.id, changes))}
          onToggle={(done) => {
            void run(() => setDone(s.id, done))
            onSetDone(done)
          }}
          onDelete={() => void run(() => deleteSet(s.id))}
        />
      ))}
      <button type="button" className="btn btn-ghost" onClick={() => run(() => addSet(we.id))}>
        ＋ セット追加
      </button>
      {noteOpen && (
        <ExerciseNoteDialog
          title={exercise.name}
          workoutExercise={we}
          onClose={() => setNoteOpen(false)}
          onSave={async (changes) => {
            if (await run(() => updateExerciseNote(we.id, changes))) setNoteOpen(false)
          }}
        />
      )}
    </section>
  )
}
```

`src/features/workout/WorkoutPage.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useSafeAction, useToast } from '../../components/Toast'
import { DEFAULT_SETTINGS } from '../../db/types'
import { formatDateJa } from '../../lib/dates'
import { getSettings } from '../../repo/settings'
import {
  addExerciseToWorkout,
  deleteWorkout,
  finishWorkout,
  getWorkoutDetail,
  saveWorkoutAsRoutine,
} from '../../repo/workouts'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { useRestTimer } from '../timer/RestTimerContext'
import { RestTimerDisplay } from '../timer/RestTimerDisplay'
import { ExerciseBlock } from './ExerciseBlock'
import { FinishDialog } from './FinishDialog'

export function WorkoutPage() {
  const { id = '' } = useParams()
  const detail = useLiveQuery(() => getWorkoutDetail(id).then((d) => d ?? null), [id])
  const settings = useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
  const timer = useRestTimer()
  const run = useSafeAction()
  const toast = useToast()
  const navigate = useNavigate()
  const [picking, setPicking] = useState(false)
  const [finishing, setFinishing] = useState(false)

  if (detail === undefined) return <div className="page">読み込み中…</div>
  if (detail === null) return <div className="page">トレーニングが見つかりません</div>

  const { workout, exercises } = detail
  const active = workout.finishedAt === undefined

  const saveAsRoutine = async () => {
    const name = window.prompt('マイメニューの名前', workout.title ?? '')
    if (name?.trim() && (await run(() => saveWorkoutAsRoutine(workout.id, name.trim())))) toast('マイメニューに保存しました')
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>{workout.title ?? 'トレーニング'}</h1>
        <span className="muted">{formatDateJa(workout.date)}</span>
      </header>
      {active && <RestTimerDisplay variant="big" />}
      {exercises.map((e, i) => (
        <ExerciseBlock
          key={e.workoutExercise.id}
          entry={e}
          before={workout.startedAt}
          settings={settings}
          isFirst={i === 0}
          isLast={i === exercises.length - 1}
          onSetDone={(done) => {
            if (done && active) timer.start(e.workoutExercise.restSec)
          }}
        />
      ))}
      <button type="button" className="btn btn-block" onClick={() => setPicking(true)}>
        ＋ 種目を追加
      </button>
      {active ? (
        <button type="button" className="btn btn-primary btn-block btn-big" onClick={() => setFinishing(true)}>
          トレーニング終了
        </button>
      ) : (
        <button type="button" className="btn btn-block" onClick={saveAsRoutine}>
          マイメニューとして保存
        </button>
      )}
      <button
        type="button"
        className="btn btn-danger btn-block"
        onClick={async () => {
          if (window.confirm('このトレーニングを削除しますか？') && (await run(() => deleteWorkout(workout.id)))) {
            timer.skip()
            navigate('/')
          }
        }}
      >
        このトレーニングを削除
      </button>
      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={async (exercise) => {
            setPicking(false)
            await run(() => addExerciseToWorkout(workout.id, exercise.id))
          }}
        />
      )}
      {finishing && (
        <FinishDialog
          onCancel={() => setFinishing(false)}
          onSubmit={async (result) => {
            if (await run(() => finishWorkout(workout.id, result))) {
              timer.skip()
              navigate('/')
            }
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: ルートを追加**

`src/App.tsx` の import に追加:
```tsx
import { WorkoutPage } from './features/workout/WorkoutPage'
```
ルートに追加:
```tsx
              <Route path="workout/:id" element={<WorkoutPage />} />
```

- [ ] **Step 5: 成功を確認**

Run: `npx vitest run src/features/workout`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add workout screen with checkbox sets and rest timer" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: ホーム画面とカレンダー

**Files:**
- Create: `src/features/calendar/Calendar.tsx`, `src/features/home/TodayWeightCard.tsx`, `src/features/home/RoutinePickerDialog.tsx`, `src/features/home/TodayWorkoutCard.tsx`
- Modify: `src/features/home/HomePage.tsx`（全体を置き換え）
- Test: `src/features/home/TodayWorkoutCard.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/home/TodayWorkoutCard.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/db'
import { assignRoutineToDate } from '../../repo/plans'
import { createRoutine } from '../../repo/routines'
import { finishWorkout, getActiveWorkout, startWorkout } from '../../repo/workouts'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { TodayWorkoutCard } from './TodayWorkoutCard'

const TODAY = '2026-10-12'
const open = () => renderPage('/', '/', <TodayWorkoutCard date={TODAY} />)

beforeEach(resetDb)

describe('TodayWorkoutCard', () => {
  it('予定があれば「今日のトレーニングを始める」で予定どおり始まる', async () => {
    const r = await createRoutine({ name: '胸の日', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    await assignRoutineToDate(r.id, TODAY)
    open()
    expect(await screen.findByText('ベンチプレス')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '今日のトレーニングを始める' }))
    const active = await waitFor(async () => {
      const w = await getActiveWorkout()
      expect(w).toBeDefined()
      return w!
    })
    expect(active.title).toBe('胸の日')
    expect(await screen.findByTestId('current-path')).toHaveTextContent(`/workout/${active.id}`)
  })

  it('予定がなければ開始方法を選べる', async () => {
    open()
    expect(await screen.findByRole('button', { name: '空から始める' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'マイメニューから選ぶ' })).toBeInTheDocument()
  })

  it('トレーニング中なら進み具合と「続ける」を出す', async () => {
    const id = await startWorkout({ date: TODAY, exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    open()
    expect(await screen.findByText('0/1種目')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '続ける' }))
    expect(await screen.findByTestId('current-path')).toHaveTextContent(`/workout/${id}`)
  })

  it('終わったらまとめを出す', async () => {
    const id = await startWorkout({ date: TODAY, exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    const set = (await db.sets.where('workoutId').equals(id).first())!
    await db.sets.update(set.id, { done: true })
    await finishWorkout(id, {})
    open()
    expect(await screen.findByText('総重量 480kg')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/features/home`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/features/calendar/Calendar.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { BODY_PART_COLORS, BODY_PART_LABELS, BODY_PARTS } from '../../db/types'
import { formatDateJa, monthGrid, todayKey, WEEKDAYS } from '../../lib/dates'
import { getMonthInfo } from '../../repo/calendar'

export function Calendar() {
  const [ym, setYm] = useState(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() }
  })
  const info = useLiveQuery(() => getMonthInfo(ym.y, ym.m), [ym.y, ym.m]) ?? {}
  const navigate = useNavigate()
  const today = todayKey()
  const shift = (delta: number) =>
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })

  return (
    <section className="card">
      <div className="calendar-head">
        <button type="button" aria-label="前の月" onClick={() => shift(-1)}>
          ＜
        </button>
        <h2>
          {ym.y}年{ym.m + 1}月
        </h2>
        <button type="button" aria-label="次の月" onClick={() => shift(1)}>
          ＞
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="calendar-weekday">
            {w}
          </div>
        ))}
        {monthGrid(ym.y, ym.m)
          .flat()
          .map((key, i) =>
            key === null ? (
              <div key={`blank-${i}`} />
            ) : (
              <button
                key={key}
                type="button"
                className={`calendar-day ${key === today ? 'today' : ''}`}
                aria-label={formatDateJa(key)}
                onClick={() => navigate(`/day/${key}`)}
              >
                <span>{Number(key.slice(8))}</span>
                <span className="dots">
                  {info[key]?.bodyParts.map((p) => <i key={p} style={{ background: BODY_PART_COLORS[p] }} />)}
                  {info[key]?.hasPlan && <i className="plan-dot" />}
                </span>
              </button>
            ),
          )}
      </div>
      <div className="legend">
        {BODY_PARTS.map((p) => (
          <span key={p}>
            <i style={{ background: BODY_PART_COLORS[p] }} />
            {BODY_PART_LABELS[p]}
          </span>
        ))}
        <span>
          <i className="plan-dot" style={{ border: '1.5px solid currentColor' }} />
          予定
        </span>
      </div>
    </section>
  )
}
```

`src/features/home/TodayWeightCard.tsx`:
```tsx
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
```

`src/features/home/RoutinePickerDialog.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { Dialog } from '../../components/Dialog'
import type { Routine } from '../../db/types'
import { listRoutines } from '../../repo/routines'

interface Props {
  onPick: (routine: Routine) => void
  onClose: () => void
}

export function RoutinePickerDialog({ onPick, onClose }: Props) {
  const routines = useLiveQuery(listRoutines)
  return (
    <Dialog title="マイメニューから選ぶ" onClose={onClose}>
      {routines?.length === 0 && (
        <p className="muted">
          まだマイメニューがありません。<Link to="/routines/new">作成する</Link>
        </p>
      )}
      <ul className="list">
        {routines?.map((r) => (
          <li key={r.id}>
            <button type="button" className="item" onClick={() => onPick(r)}>
              {r.name}
              <span className="muted">{r.exercises.length}種目</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
```

`src/features/home/TodayWorkoutCard.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSafeAction } from '../../components/Toast'
import { db } from '../../db/db'
import { formatDuration } from '../../lib/dates'
import { getPlanForDate } from '../../repo/plans'
import { summarizeWorkout } from '../../repo/summary'
import {
  getActiveWorkout,
  getLastFinishedWorkout,
  getWorkoutDetail,
  listWorkoutsByDate,
  startWorkout,
  toPlannedExercises,
  type StartWorkoutOptions,
} from '../../repo/workouts'
import { RoutinePickerDialog } from './RoutinePickerDialog'

async function loadToday(date: string) {
  const active = await getActiveWorkout()
  const activeDetail = active ? await getWorkoutDetail(active.id) : undefined
  const finished = (await listWorkoutsByDate(date)).filter((w) => w.finishedAt !== undefined)
  const lastToday = finished[finished.length - 1]
  const finishedDetail = lastToday ? await getWorkoutDetail(lastToday.id) : undefined
  const summary = finishedDetail ? await summarizeWorkout(finishedDetail) : undefined
  const plan = await getPlanForDate(date)
  const planDone = plan !== undefined && finished.some((w) => w.plannedWorkoutId === plan.id)
  const planNames = plan ? (await db.exercises.bulkGet(plan.exercises.map((e) => e.exerciseId))).map((e) => e?.name ?? '') : []
  const last = await getLastFinishedWorkout()
  return { activeDetail, summary, plan: planDone ? undefined : plan, planNames, last }
}

export function TodayWorkoutCard({ date }: { date: string }) {
  const data = useLiveQuery(() => loadToday(date), [date])
  const [pickingRoutine, setPickingRoutine] = useState(false)
  const navigate = useNavigate()
  const run = useSafeAction()

  if (!data) return null
  const { activeDetail, summary, plan, planNames, last } = data

  const start = async (opts: StartWorkoutOptions) => {
    let id = ''
    if (await run(async () => (id = await startWorkout(opts)), 'トレーニングを開始できませんでした')) navigate(`/workout/${id}`)
  }

  const startFromLast = async () => {
    if (!last) return
    const detail = await getWorkoutDetail(last.id)
    if (detail) await start({ date, title: last.title, exercises: toPlannedExercises(detail) })
  }

  if (activeDetail) {
    const total = activeDetail.exercises.length
    const doneCount = activeDetail.exercises.filter((e) => e.sets.length > 0 && e.sets.every((s) => s.done)).length
    return (
      <section className="card stack">
        <h2>トレーニング中：{activeDetail.workout.title ?? 'トレーニング'}</h2>
        <p className="muted">
          {doneCount}/{total}種目
        </p>
        <button type="button" className="btn btn-primary btn-block btn-big" onClick={() => navigate(`/workout/${activeDetail.workout.id}`)}>
          続ける
        </button>
      </section>
    )
  }

  return (
    <section className="card stack">
      <h2>今日のトレーニング</h2>
      {summary && (
        <div className="stack">
          <p>
            お疲れさまでした！ {formatDuration(summary.durationMs)}・{summary.doneSets}セット
          </p>
          <p>総重量 {summary.volume.toLocaleString()}kg</p>
          {summary.personalRecords.length > 0 && <p>🏆 自己ベスト：{summary.personalRecords.join('、')}</p>}
        </div>
      )}
      {plan && (
        <>
          <p>
            <strong>{plan.title}</strong>
          </p>
          <ul className="list">
            {planNames.map((name, i) => (
              <li key={i} className="muted">
                {name}
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-primary btn-block btn-big" onClick={() => start({ date, plan })}>
            今日のトレーニングを始める
          </button>
        </>
      )}
      {!plan && (
        <>
          {last && (
            <button type="button" className={`btn btn-block ${summary ? '' : 'btn-primary'}`} onClick={startFromLast}>
              前回の「{last.title ?? 'トレーニング'}」で始める
            </button>
          )}
          <button type="button" className="btn btn-block" onClick={() => setPickingRoutine(true)}>
            マイメニューから選ぶ
          </button>
          <button type="button" className="btn btn-ghost btn-block" onClick={() => start({ date })}>
            空から始める
          </button>
        </>
      )}
      {pickingRoutine && (
        <RoutinePickerDialog
          onClose={() => setPickingRoutine(false)}
          onPick={(routine) => {
            setPickingRoutine(false)
            void start({ date, title: routine.name, exercises: routine.exercises })
          }}
        />
      )}
    </section>
  )
}
```

`src/features/home/HomePage.tsx`（全体を置き換え）:
```tsx
import { StorageWarning } from '../../components/StorageWarning'
import { todayKey } from '../../lib/dates'
import { Calendar } from '../calendar/Calendar'
import { TodayWeightCard } from './TodayWeightCard'
import { TodayWorkoutCard } from './TodayWorkoutCard'

export function HomePage() {
  const today = todayKey()
  return (
    <div className="page">
      <StorageWarning />
      <TodayWeightCard date={today} />
      <TodayWorkoutCard date={today} />
      <Calendar />
    </div>
  )
}
```

- [ ] **Step 4: 成功を確認**

Run: `npx vitest run src/features/home`
Expected: PASS

Run: `npm run dev` でホームを開く
Expected: 今日の体重、今日のトレーニング（空から始める等）、カレンダーが表示される。「空から始める」→種目追加→セットをチェック→終了、の後にホームにまとめが出て、カレンダーの今日に部位の色の点が出る

- [ ] **Step 5: Commit**

```bash
git add src
git commit -m "feat: add home screen with today's workout, weight and calendar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: 日付の詳細画面

**Files:**
- Create: `src/features/calendar/DayDetailPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/calendar/DayDetailPage.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/calendar/DayDetailPage.test.tsx`:
```tsx
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { saveBodyLog } from '../../repo/body'
import { getPlanForDate } from '../../repo/plans'
import { createRoutine } from '../../repo/routines'
import { setDone, updateExerciseNote } from '../../repo/workoutEdits'
import { finishWorkout, getWorkoutDetail, startWorkout } from '../../repo/workouts'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { DayDetailPage } from './DayDetailPage'

beforeEach(resetDb)

const open = (date: string) => renderPage('/day/:date', `/day/${date}`, <DayDetailPage />)

describe('DayDetailPage', () => {
  it('その日に入力したすべての情報を表示する', async () => {
    const id = await startWorkout({ date: '2026-10-12', title: '胸の日', exercises: [{ exerciseId: 'ex-bench-press', restSec: 90, sets: [{ weight: 60, reps: 8 }] }] })
    const d = (await getWorkoutDetail(id))!
    await setDone(d.exercises[0].sets[0].id, true)
    await updateExerciseNote(d.exercises[0].workoutExercise.id, { effort: 4, note: '肩が少し痛い' })
    await finishWorkout(id, { condition: 4, satisfaction: 5, note: '良い日' })
    await saveBodyLog('2026-10-12', { weightKg: 70, bodyFatPct: 15 })

    open('2026-10-12')
    expect(await screen.findByRole('heading', { name: '10月12日(月)' })).toBeInTheDocument()
    expect(await screen.findByText('胸の日')).toBeInTheDocument()
    expect(screen.getByText('60kg × 8')).toBeInTheDocument()
    expect(screen.getByText(/肩が少し痛い/)).toBeInTheDocument()
    expect(screen.getByText(/調子 🙂/)).toBeInTheDocument()
    expect(screen.getByText(/満足度 5/)).toBeInTheDocument()
    expect(screen.getByText(/良い日/)).toBeInTheDocument()
    expect(screen.getByText(/体重 70kg/)).toBeInTheDocument()
    expect(screen.getByText(/体脂肪率 15%/)).toBeInTheDocument()
  })

  it('マイメニューを割り当てて予定にできる', async () => {
    await createRoutine({ name: '脚の日', exercises: [{ exerciseId: 'ex-squat', restSec: 120, sets: [] }] })
    open('2026-10-20')
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'マイメニュー' }), '脚の日')
    await userEvent.click(screen.getByRole('button', { name: '予定にする' }))
    expect(await screen.findByText('予定：脚の日')).toBeInTheDocument()
    expect((await getPlanForDate('2026-10-20'))?.title).toBe('脚の日')
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/features/calendar`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/features/calendar/DayDetailPage.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { FACES } from '../../components/RatingPicker'
import { useSafeAction } from '../../components/Toast'
import { db } from '../../db/db'
import { formatDateJa } from '../../lib/dates'
import { formatSet } from '../../lib/workoutStats'
import { getBodyLog } from '../../repo/body'
import { assignRoutineToDate, deletePlan, getPlanForDate } from '../../repo/plans'
import { listRoutines } from '../../repo/routines'
import { getWorkoutDetail, listWorkoutsByDate, type WorkoutDetail } from '../../repo/workouts'

async function loadDay(date: string) {
  const workouts = await listWorkoutsByDate(date)
  const details = (await Promise.all(workouts.map((w) => getWorkoutDetail(w.id)))).filter((d): d is WorkoutDetail => !!d)
  const body = (await getBodyLog(date)) ?? null
  const plan = (await getPlanForDate(date)) ?? null
  const planNames = plan ? (await db.exercises.bulkGet(plan.exercises.map((e) => e.exerciseId))).map((e) => e?.name ?? '') : []
  return { details, body, plan, planNames }
}

export function DayDetailPage() {
  const { date = '' } = useParams()
  const data = useLiveQuery(() => loadDay(date), [date])
  const routines = useLiveQuery(listRoutines)
  const [routineId, setRoutineId] = useState('')
  const run = useSafeAction()

  if (!data) return <div className="page">読み込み中…</div>
  const { details, body, plan, planNames } = data
  const empty = details.length === 0 && !body && !plan

  return (
    <div className="page">
      <h1>{formatDateJa(date)}</h1>
      {empty && <p className="muted">この日の記録はありません</p>}

      {details.map(({ workout, exercises }) => (
        <section key={workout.id} className="card stack">
          <div className="row between">
            <h2>{workout.title ?? 'トレーニング'}</h2>
            <Link to={`/workout/${workout.id}`}>{workout.finishedAt === undefined ? '続ける' : '編集'}</Link>
          </div>
          {exercises.map(({ workoutExercise: we, exercise, sets }) => (
            <div key={we.id}>
              <strong>{exercise.name}</strong>
              <ul className="list">
                {sets
                  .filter((s) => s.done)
                  .map((s) => (
                    <li key={s.id}>{formatSet(exercise.logType, s)}</li>
                  ))}
              </ul>
              {(we.effort !== undefined || we.note) && (
                <p className="muted">
                  {we.effort !== undefined && `きつさ ${we.effort} `}
                  {we.note}
                </p>
              )}
            </div>
          ))}
          {(workout.condition !== undefined || workout.satisfaction !== undefined) && (
            <p>
              {workout.condition !== undefined && `調子 ${FACES[workout.condition - 1]}　`}
              {workout.satisfaction !== undefined && `満足度 ${workout.satisfaction}`}
            </p>
          )}
          {workout.note && <p className="muted">メモ：{workout.note}</p>}
        </section>
      ))}

      <section className="card stack">
        <div className="row between">
          <h2>体</h2>
          <Link to={`/body?date=${date}`}>{body ? '編集' : '記録する'}</Link>
        </div>
        {body?.weightKg !== undefined && <p>体重 {body.weightKg}kg</p>}
        {body?.bodyFatPct !== undefined && <p>体脂肪率 {body.bodyFatPct}%</p>}
        {body?.photo && <img className="photo" src={body.photo} alt={`${formatDateJa(date)}の写真`} />}
      </section>

      <section className="card stack">
        {plan ? (
          <>
            <h2>予定：{plan.title}</h2>
            <ul className="list">
              {planNames.map((name, i) => (
                <li key={i} className="muted">
                  {name}
                </li>
              ))}
            </ul>
            <button type="button" className="btn btn-danger" onClick={() => run(() => deletePlan(plan.id))}>
              予定を削除
            </button>
          </>
        ) : (
          <>
            <h2>予定を入れる</h2>
            <label className="field">
              マイメニュー
              <select value={routineId} onChange={(e) => setRoutineId(e.target.value)}>
                <option value="">選んでください</option>
                {routines?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-primary" disabled={!routineId} onClick={() => run(() => assignRoutineToDate(routineId, date))}>
              予定にする
            </button>
          </>
        )}
      </section>
    </div>
  )
}
```

注: `<select>` の `aria-label` は `<label>` で包んでいるので「マイメニュー」になる。

- [ ] **Step 4: ルートを追加**

`src/App.tsx` の import に追加:
```tsx
import { DayDetailPage } from './features/calendar/DayDetailPage'
```
ルートに追加:
```tsx
              <Route path="day/:date" element={<DayDetailPage />} />
```

- [ ] **Step 5: 成功を確認**

Run: `npx vitest run src/features/calendar`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add day detail page with plan assignment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: 体の記録画面と写真の比較

**Files:**
- Create: `src/features/body/BodyPage.tsx`, `src/features/body/PhotoCompare.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/body/BodyPage.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/body/BodyPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { getBodyLog, saveBodyLog } from '../../repo/body'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { BodyPage } from './BodyPage'

beforeEach(resetDb)

const open = (date: string) => renderPage('/body', `/body?date=${date}`, <BodyPage />)

describe('BodyPage', () => {
  it('前回の値が最初から入っていて、＋で調整して保存できる', async () => {
    await saveBodyLog('2026-10-11', { weightKg: 70, bodyFatPct: 15 })
    open('2026-10-12')
    expect(await screen.findByRole('button', { name: '体重 70kg' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '体重を増やす' }))
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(async () => expect(await getBodyLog('2026-10-12')).toMatchObject({ weightKg: 70.1, bodyFatPct: 15 }))
  })

  it('体脂肪率の記録がなければ、追加ボタンを押すまで保存しない', async () => {
    open('2026-10-12')
    await userEvent.click(await screen.findByRole('button', { name: '保存' }))
    await waitFor(async () => expect(await getBodyLog('2026-10-12')).toBeDefined())
    expect((await getBodyLog('2026-10-12'))?.bodyFatPct).toBeUndefined()
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/features/body`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/features/body/BodyPage.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { Stepper } from '../../components/Stepper'
import { useSafeAction, useToast } from '../../components/Toast'
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
      <h1>体の記録</h1>
      <p className="muted">{formatDateJa(date)}</p>
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
    <section className="card stack">
      <div className="row between">
        <span>体重</span>
        <Stepper label="体重" unit="kg" step={0.1} value={weight} onChange={setWeight} />
      </div>
      <div className="row between">
        <span>体脂肪率</span>
        {fat === undefined ? (
          <button type="button" className="btn btn-ghost" onClick={() => setFat(15)}>
            ＋ 体脂肪率を追加
          </button>
        ) : (
          <Stepper label="体脂肪率" unit="%" step={0.1} value={fat} onChange={setFat} />
        )}
      </div>
      <label className="field">
        写真（任意）
        <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>
      {photo && (
        <>
          <img className="photo" src={photo} alt="体の写真" />
          <button type="button" className="btn btn-danger" onClick={() => setPhoto(undefined)}>
            写真を外す
          </button>
        </>
      )}
      <button type="button" className="btn btn-primary btn-block" onClick={save}>
        保存
      </button>
    </section>
  )
}
```

`src/features/body/PhotoCompare.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { formatDateJa } from '../../lib/dates'
import { listPhotoLogs } from '../../repo/body'

export function PhotoCompare() {
  const logs = useLiveQuery(listPhotoLogs)
  const [left, setLeft] = useState<string>()
  const [right, setRight] = useState<string>()
  if (!logs) return null
  if (logs.length < 2) {
    return (
      <section className="card">
        <h2>写真の比較</h2>
        <p className="muted">写真が2枚以上になると比較できます</p>
      </section>
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
    <section className="card stack">
      <h2>写真の比較</h2>
      <div className="photos">
        {picker('左の写真', leftLog.date, setLeft)}
        {picker('右の写真', rightLog.date, setRight)}
        <img src={leftLog.photo} alt={`${formatDateJa(leftLog.date)}の写真`} />
        <img src={rightLog.photo} alt={`${formatDateJa(rightLog.date)}の写真`} />
      </div>
    </section>
  )
}
```

- [ ] **Step 4: ルートを追加**

`src/App.tsx` の import に追加:
```tsx
import { BodyPage } from './features/body/BodyPage'
```
ルートに追加:
```tsx
              <Route path="body" element={<BodyPage />} />
```

- [ ] **Step 5: 成功を確認**

Run: `npx vitest run src/features/body`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add body log page with photo comparison" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 21: マイメニューの一覧と編集

**Files:**
- Create: `src/features/routines/PlannedExerciseEditor.tsx`, `src/features/routines/RoutineListPage.tsx`, `src/features/routines/RoutineEditPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/routines/RoutineEditPage.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/routines/RoutineEditPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { listRoutines } from '../../repo/routines'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { RoutineEditPage } from './RoutineEditPage'

beforeEach(resetDb)

describe('RoutineEditPage', () => {
  it('名前と種目を入れて保存できる', async () => {
    renderPage('/routines/new', '/routines/new', <RoutineEditPage />)
    await userEvent.type(await screen.findByRole('textbox', { name: '名前' }), '胸の日')
    await userEvent.click(screen.getByRole('button', { name: '＋ 種目を追加' }))
    await userEvent.click(await screen.findByRole('button', { name: /^ベンチプレス/ }))
    expect(await screen.findAllByRole('button', { name: '重量 20kg' })).toHaveLength(3)
    await userEvent.click(screen.getAllByRole('button', { name: '重量を増やす' })[0])
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(async () => expect(await listRoutines()).toHaveLength(1))
    const [routine] = await listRoutines()
    expect(routine.name).toBe('胸の日')
    expect(routine.exercises[0]).toMatchObject({ exerciseId: 'ex-bench-press', restSec: 120 })
    expect(routine.exercises[0].sets[0]).toEqual({ weight: 22.5, reps: 10 })
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/features/routines`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/features/routines/PlannedExerciseEditor.tsx`:
```tsx
import { SetInputs } from '../../components/SetInputs'
import { Stepper } from '../../components/Stepper'
import type { Exercise, PlannedExercise, Settings } from '../../db/types'

interface Props {
  value: PlannedExercise
  exercise: Exercise
  settings: Settings
  isFirst: boolean
  isLast: boolean
  onChange: (value: PlannedExercise) => void
  onMove: (direction: -1 | 1) => void
  onRemove: () => void
}

export function PlannedExerciseEditor({ value, exercise, settings, isFirst, isLast, onChange, onMove, onRemove }: Props) {
  const updateSet = (index: number, changes: Partial<PlannedExercise['sets'][number]>) =>
    onChange({ ...value, sets: value.sets.map((s, i) => (i === index ? { ...s, ...changes } : s)) })
  return (
    <section className="card stack" aria-label={exercise.name}>
      <div className="exercise-head">
        <h2>{exercise.name}</h2>
        {!isFirst && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を上へ`} onClick={() => onMove(-1)}>
            ↑
          </button>
        )}
        {!isLast && (
          <button type="button" className="icon-btn" aria-label={`${exercise.name}を下へ`} onClick={() => onMove(1)}>
            ↓
          </button>
        )}
        <button type="button" className="icon-btn" aria-label={`${exercise.name}を削除`} onClick={onRemove}>
          🗑
        </button>
      </div>
      <div className="row">
        <span className="muted">休憩</span>
        <Stepper label="休憩時間" unit="秒" step={15} value={value.restSec} onChange={(restSec) => onChange({ ...value, restSec })} />
      </div>
      {value.sets.map((s, i) => (
        <div key={i} className="set-row">
          <span className="set-no">{i + 1}</span>
          <SetInputs logType={exercise.logType} bodyPart={exercise.bodyPart} values={s} settings={settings} onChange={(c) => updateSet(i, c)} />
          <button
            type="button"
            className="icon-btn"
            aria-label={`${i + 1}セット目を削除`}
            onClick={() => onChange({ ...value, sets: value.sets.filter((_, j) => j !== i) })}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => onChange({ ...value, sets: [...value.sets, { ...(value.sets[value.sets.length - 1] ?? {}) }] })}
      >
        ＋ セット追加
      </button>
    </section>
  )
}
```

`src/features/routines/RoutineListPage.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router'
import { listRoutines } from '../../repo/routines'

export function RoutineListPage() {
  const routines = useLiveQuery(listRoutines)
  return (
    <div className="page">
      <header className="page-header">
        <h1>マイメニュー</h1>
        <Link className="btn btn-primary" to="/routines/new">
          ＋ 新規
        </Link>
      </header>
      {routines?.length === 0 && <p className="muted">よくやる種目の組み合わせを保存しておくと、すぐにトレーニングを始められます。</p>}
      <ul className="list">
        {routines?.map((r) => (
          <li key={r.id}>
            <Link className="item" to={`/routines/${r.id}`}>
              {r.name}
              <span className="muted">{r.exercises.length}種目</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

`src/features/routines/RoutineEditPage.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useSafeAction, useToast } from '../../components/Toast'
import { DEFAULT_SETTINGS, type PlannedExercise, type Routine } from '../../db/types'
import { todayKey } from '../../lib/dates'
import { listExercises } from '../../repo/exercises'
import { suggestSets } from '../../repo/history'
import { assignRoutineToDate } from '../../repo/plans'
import { createRoutine, deleteRoutine, getRoutine, updateRoutine } from '../../repo/routines'
import { getSettings } from '../../repo/settings'
import { ExercisePicker } from '../exercises/ExercisePicker'
import { PlannedExerciseEditor } from './PlannedExerciseEditor'

export function RoutineEditPage() {
  const { id } = useParams()
  const routine = useLiveQuery(() => (id ? getRoutine(id).then((r) => r ?? null) : Promise.resolve(null)), [id])
  if (routine === undefined) return <div className="page">読み込み中…</div>
  return <RoutineForm key={id ?? 'new'} routine={routine} />
}

function RoutineForm({ routine }: { routine: Routine | null }) {
  const [name, setName] = useState(routine?.name ?? '')
  const [exercises, setExercises] = useState<PlannedExercise[]>(routine?.exercises ?? [])
  const [picking, setPicking] = useState(false)
  const [assignDate, setAssignDate] = useState(todayKey())
  const all = useLiveQuery(listExercises)
  const settings = useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
  const navigate = useNavigate()
  const run = useSafeAction()
  const toast = useToast()
  const byId = new Map(all?.map((e) => [e.id, e]))

  const input = () => ({ name: name.trim(), exercises })
  const save = async () => {
    const ok = await run(() => (routine ? updateRoutine(routine.id, input()) : createRoutine(input())))
    if (ok) navigate('/routines')
  }
  const move = (index: number, direction: -1 | 1) =>
    setExercises((list) => {
      const next = [...list]
      const target = index + direction
      if (target < 0 || target >= next.length) return list
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })

  return (
    <div className="page">
      <h1>{routine ? 'マイメニューを編集' : 'マイメニューを作成'}</h1>
      <label className="field">
        名前
        <input type="text" value={name} placeholder="例：胸の日" onChange={(e) => setName(e.target.value)} />
      </label>
      {exercises.map((pe, i) => {
        const exercise = byId.get(pe.exerciseId)
        if (!exercise) return null
        return (
          <PlannedExerciseEditor
            key={`${pe.exerciseId}-${i}`}
            value={pe}
            exercise={exercise}
            settings={settings}
            isFirst={i === 0}
            isLast={i === exercises.length - 1}
            onChange={(v) => setExercises((list) => list.map((x, j) => (j === i ? v : x)))}
            onMove={(d) => move(i, d)}
            onRemove={() => setExercises((list) => list.filter((_, j) => j !== i))}
          />
        )
      })}
      <button type="button" className="btn btn-block" onClick={() => setPicking(true)}>
        ＋ 種目を追加
      </button>
      <button type="button" className="btn btn-primary btn-block" disabled={!name.trim()} onClick={save}>
        保存
      </button>

      {routine && (
        <section className="card stack">
          <h2>日付に割り当てる</h2>
          <input type="date" aria-label="割り当てる日" value={assignDate} onChange={(e) => setAssignDate(e.target.value)} />
          <button
            type="button"
            className="btn"
            disabled={!assignDate}
            onClick={async () => {
              const ok = await run(async () => {
                await updateRoutine(routine.id, input())
                await assignRoutineToDate(routine.id, assignDate)
              })
              if (ok) toast('予定に入れました')
            }}
          >
            この日の予定にする
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              if (window.confirm(`「${routine.name}」を削除しますか？`) && (await run(() => deleteRoutine(routine.id)))) navigate('/routines')
            }}
          >
            このマイメニューを削除
          </button>
        </section>
      )}

      {picking && (
        <ExercisePicker
          onClose={() => setPicking(false)}
          onPick={async (exercise) => {
            setPicking(false)
            const sets = await suggestSets(exercise)
            setExercises((list) => [...list, { exerciseId: exercise.id, restSec: exercise.defaultRestSec, sets }])
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4: ルートを追加**

`src/App.tsx` の import に追加:
```tsx
import { RoutineEditPage } from './features/routines/RoutineEditPage'
import { RoutineListPage } from './features/routines/RoutineListPage'
```
ルートに追加:
```tsx
              <Route path="routines" element={<RoutineListPage />} />
              <Route path="routines/new" element={<RoutineEditPage />} />
              <Route path="routines/:id" element={<RoutineEditPage />} />
```

- [ ] **Step 5: 成功を確認**

Run: `npx vitest run src/features/routines`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add routine list and editor with date assignment" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: 設定とバックアップ画面

**Files:**
- Create: `src/features/settings/SettingsPage.tsx`
- Modify: `src/App.tsx`
- Test: `src/features/settings/SettingsPage.test.tsx`

- [ ] **Step 1: 失敗するテストを書く**

`src/features/settings/SettingsPage.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { exportBackup } from '../../lib/backup'
import { createRoutine, listRoutines } from '../../repo/routines'
import { getSettings } from '../../repo/settings'
import { resetDb } from '../../test/db'
import { renderPage } from '../../test/render'
import { SettingsPage } from './SettingsPage'

beforeEach(resetDb)

const open = () => renderPage('/settings', '/settings', <SettingsPage />)

describe('SettingsPage', () => {
  it('重量の刻み幅を変えられる', async () => {
    open()
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: '重量の刻み幅' }), '1.25')
    await waitFor(async () => expect((await getSettings()).weightStep).toBe(1.25))
  })

  it('確認してからバックアップを読み込む', async () => {
    await createRoutine({ name: '胸の日', exercises: [] })
    const text = JSON.stringify(await exportBackup())
    await resetDb()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    open()
    const file = new File([text], 'backup.json', { type: 'application/json' })
    await userEvent.upload(await screen.findByLabelText('バックアップを読み込む'), file)
    await waitFor(async () => expect((await listRoutines()).map((r) => r.name)).toEqual(['胸の日']))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('壊れたファイルは読み込まずに知らせる', async () => {
    open()
    const file = new File(['broken'], 'backup.json', { type: 'application/json' })
    await userEvent.upload(await screen.findByLabelText('バックアップを読み込む'), file)
    expect(await screen.findByRole('alert')).toHaveTextContent('バックアップファイルを読み込めませんでした')
  })
})
```

- [ ] **Step 2: 失敗を確認**

Run: `npx vitest run src/features/settings`
Expected: FAIL

- [ ] **Step 3: 実装する**

`src/features/settings/SettingsPage.tsx`:
```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { useSafeAction, useToast } from '../../components/Toast'
import { DEFAULT_SETTINGS } from '../../db/types'
import { backupFileName, exportBackup, importBackup, parseBackup, readFileText, shareOrDownload } from '../../lib/backup'
import { getSettings, saveSettings } from '../../repo/settings'

const WEIGHT_STEPS = [0.5, 1, 1.25, 2.5, 5]
const REP_STEPS = [1, 2, 5]

export function SettingsPage() {
  const settings = useLiveQuery(getSettings) ?? DEFAULT_SETTINGS
  const run = useSafeAction()
  const toast = useToast()
  const [usage, setUsage] = useState<string>()

  useEffect(() => {
    navigator.storage
      ?.estimate?.()
      .then(({ usage: used = 0, quota = 0 }) => setUsage(`${(used / 1024 / 1024).toFixed(1)}MB 使用中（上限の${quota ? Math.round((used / quota) * 100) : 0}%）`))
      .catch(() => {})
  }, [])

  const exportData = () =>
    run(async () => {
      const backup = await exportBackup()
      await shareOrDownload(backupFileName(), JSON.stringify(backup))
    }, 'バックアップを書き出せませんでした')

  const importData = async (file: File | undefined) => {
    if (!file) return
    await run(async () => {
      const backup = parseBackup(await readFileText(file))
      if (!window.confirm('今のデータはすべてバックアップの内容に置き換わります。よろしいですか？')) return
      await importBackup(backup)
      toast('バックアップから復元しました')
    }, '読み込めませんでした')
  }

  return (
    <div className="page">
      <h1>設定</h1>
      <section className="card stack">
        <h2>入力</h2>
        <label className="field">
          重量の刻み幅
          <select value={settings.weightStep} onChange={(e) => run(() => saveSettings({ weightStep: Number(e.target.value) }))}>
            {WEIGHT_STEPS.map((s) => (
              <option key={s} value={s}>
                {s}kg
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          回数の刻み幅
          <select value={settings.repStep} onChange={(e) => run(() => saveSettings({ repStep: Number(e.target.value) }))}>
            {REP_STEPS.map((s) => (
              <option key={s} value={s}>
                {s}回
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="card stack">
        <h2>バックアップ</h2>
        <p className="muted">データはこのiPhoneの中にだけ保存されています。機種変更に備えて、ときどき書き出してください。</p>
        {usage && <p className="muted">{usage}</p>}
        <button type="button" className="btn btn-primary btn-block" onClick={exportData}>
          バックアップを書き出す
        </button>
        <label className="field">
          バックアップを読み込む
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              void importData(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </label>
      </section>
    </div>
  )
}
```

注: `useSafeAction` は失敗時に「読み込めませんでした（バックアップファイルを読み込めませんでした）」のように理由を括弧で付けて表示する。テストは部分一致で確認している。

- [ ] **Step 4: ルートを追加**

`src/App.tsx` の import に追加:
```tsx
import { SettingsPage } from './features/settings/SettingsPage'
```
ルートに追加:
```tsx
              <Route path="settings" element={<SettingsPage />} />
```

- [ ] **Step 5: 成功を確認**

Run: `npm test`
Expected: PASS（全テスト）

- [ ] **Step 6: Commit**

```bash
git add src
git commit -m "feat: add settings page with backup export and restore" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: アイコン・ビルド・iPhoneでの確認

**Files:**
- Create: `public/icon.svg`、生成される `public/*.png`, `public/favicon.ico`

- [ ] **Step 1: アイコンの元画像を作る**

`public/icon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#0f1115"/>
  <g fill="#f97316">
    <rect x="56" y="208" width="40" height="96" rx="10"/>
    <rect x="96" y="176" width="48" height="160" rx="12"/>
    <rect x="144" y="240" width="224" height="32" rx="8"/>
    <rect x="368" y="176" width="48" height="160" rx="12"/>
    <rect x="416" y="208" width="40" height="96" rx="10"/>
  </g>
</svg>
```

- [ ] **Step 2: PNGアイコンを生成する**

Run: `npx pwa-assets-generator --preset minimal-2023 public/icon.svg`
Expected: `public/` に `pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`, `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico` ができる

- [ ] **Step 3: 全テストとビルド**

Run: `npm test`
Expected: PASS（全テスト）

Run: `npm run build`
Expected: エラーなし。`dist/manifest.webmanifest` と `dist/sw.js` ができる

- [ ] **Step 4: パソコンで通しの動作確認**

Run: `npm run preview` を起動してブラウザで開き（スマホサイズ表示にする）、次を順に確認する
1. ホームで体重を記録 → 「今日の体重 ◯kg」に変わる
2. 「メニュー」でマイメニュー「胸の日」を作成（ベンチプレス、サイドレイズ）→ 今日の予定にする
3. ホームに「今日のトレーニングを始める」が出る → 押す
4. 1セット目をチェック → 大きな休憩タイマーが出る → ホームに戻ると下に小さなバーが出る
5. タイマーが0になると画面が光る。音は鳴らない
6. 📝できつさとメモを入れる → トレーニング終了で調子・満足度を入れる
7. ホームにまとめ（時間・総重量）が出て、カレンダーの今日に胸・肩の色の点が出る
8. カレンダーの今日をタップ → 入力したすべての情報が表示される
9. 設定でバックアップを書き出す → 読み込む → データが残っている

- [ ] **Step 5: Commit**

```bash
git add public
git commit -m "feat: add PWA icons" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: iPhoneの実機で確認（ユーザーと一緒に行う）**

iPhoneのPWAは HTTPS で配信する必要がある。公開先（GitHub Pages など）への公開は外部に出す操作なので、**必ずユーザーに確認してから**行う。公開後、iPhoneの Safari で開き「共有 → ホーム画面に追加」をして、次を確認する。
1. ホーム画面のアイコンから全画面で起動する
2. 機内モードにしても起動・記録できる（オフライン動作）
3. 休憩中に画面が消えない。他のアプリに切り替えて戻ると残り時間が正しい
4. 体の写真を撮って保存できる
5. バックアップの書き出しで共有シートが出て「ファイルに保存」できる
```
