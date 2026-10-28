# AIコーチのチャット画面の作り直し Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メニュー案をチャットから分けて専用の画面にし、前の案との違いを見せ、吹き出しを見分けやすくする（設計書 `docs/superpowers/specs/2026-10-28-coach-chat-redesign-design.md`）。

**Architecture:** 案のデータ（`ChatMessage.proposal`）は変えない。チャット（`CoachPage`）は文の吹き出しと案の1行（`ProposalLink`）だけを出す。新しいページ `ProposalPage`（`/coach/proposal/:id`）が、案の切り替えと、今の `ProposalCard` の中身を出す。違いは純粋な関数 `diffProposals`（`src/coach/diff.ts`）で求め、`ExerciseRow` に前の値を渡して表示する。

**Tech Stack:** React 19 / TypeScript / React Router 7 / Dexie（useLiveQuery）/ Vitest + Testing Library

**公開の決まり（各タスクの最後）：** `npx tsc --noEmit`・`npm test`（終了コード0のときだけ）・`npm run build` → commit（末尾に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`）→ `git push`

---

## ファイルの分担

| ファイル | 役割 |
|---|---|
| `src/styles/coach.css` | 吹き出しの色・寄せ・間隔、案の1行、案の画面、違いの表示の見た目 |
| `src/coach/diff.ts`（新） | 2つの案の違いを求める純粋な関数 |
| `src/coach/diff.test.ts`（新） | その テスト |
| `src/features/coach/proposalList.ts`（新） | チャットから案の一覧（通し番号つき）を取り出す小さな関数 |
| `src/features/coach/ProposalLink.tsx`（新） | チャットの案の1行 |
| `src/features/coach/ProposalPage.tsx`（新） | 案の画面（戻る・切り替え・中身） |
| `src/features/coach/ProposalCard.tsx` | 折りたたみカードをやめて普通の section に。違い（`diff`）を受け取って行に渡し、外した種目・外した日を出す |
| `src/components/ExerciseRow.tsx` | 「新」「入れ替え」の印と、前の値（←60）を出せるようにする |
| `src/features/coach/CoachPage.tsx` | カードの代わりに1行を出す。考え中の文を直す |
| `src/App.tsx` | `/coach/proposal/:id` を足す |

---

### Task 1: 吹き出しの見た目と考え中の文

**Files:**
- Modify: `src/styles/coach.css`（`.chat-list`〜`.bubble.coach`）
- Modify: `src/features/coach/CoachPage.tsx`（考え中の下の文）
- Test: `src/features/coach/CoachPage.test.tsx`

- [ ] **Step 1: 考え中の文のテストを直す**（「送信中は『考え中…』を出し、送信できない」のテストに追加）

```ts
expect(screen.getByText('10秒ほどかかります。画面はこのままでお待ちください')).toBeInTheDocument()
```

- [ ] **Step 2: 失敗を確認** `npx vitest run src/features/coach/CoachPage.test.tsx`

- [ ] **Step 3: 文を直す**（`CoachPage.tsx`）

```tsx
<p className="muted">10秒ほどかかります。画面はこのままでお待ちください</p>
```

- [ ] **Step 4: 吹き出しの CSS を置き換える**（`coach.css` の `/* チャット */` の部分）

```css
/* チャット：話す人が変わるときは間を広く、同じ人が続くときは狭く */
.chat-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-5); }
.chat-item { display: flex; flex-direction: column; gap: var(--s-2); min-width: 0; }
.chat-item.user { align-items: flex-end; }
.chat-item.coach { align-items: flex-start; }
.chat-item.user + .chat-item.user, .chat-item.coach + .chat-item.coach { margin-top: calc(var(--s-2) - var(--s-5)); }
.bubble { max-width: 82%; padding: 10px 14px; border-radius: var(--r-lg); font-size: var(--fs-body); line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
/* 自分：オレンジで塗って右へ（すぐ見つけられるように） */
.bubble.user { background: var(--accent); color: var(--on-accent); font-weight: 600; border-bottom-right-radius: var(--r-xs); }
/* AI：濃い灰色で左へ */
.bubble.coach { background: var(--surface-2); border: 1px solid var(--line); color: var(--text); border-bottom-left-radius: var(--r-xs); }
.bubble.thinking { display: inline-flex; align-items: center; gap: 10px; color: var(--muted); font-weight: 600; }
```

（`--s-5`・`--surface-2`・`--on-accent` が `src/styles` のトークンにあるか `grep -n "\-\-s-5\|--surface-2\|--on-accent" src/styles/*.css` で確かめ、なければ近いもの（`--s-4` など）を使う）

- [ ] **Step 5: 確認と公開**：テスト・型・ビルド → プレビューで吹き出しの見た目をスクリーンショット → commit `feat: make chat bubbles easier to tell apart` → push

---

### Task 2: 違いの見つけ方（`diff.ts`）

**Files:**
- Create: `src/coach/diff.ts`
- Test: `src/coach/diff.test.ts`

- [ ] **Step 1: テストを書く**

```ts
import { describe, expect, it } from 'vitest'
import { diffProposals } from './diff'
import type { Proposal, ProposalExercise } from './types'

const ex = (slot: string, exerciseId: string, o: Partial<ProposalExercise> = {}): ProposalExercise =>
  ({ slot, exerciseId, sets: 3, reps: 8, repRange: [6, 10], restSec: 120, weight: 60, ...o })
const plan = (days: { date: string; exercises: ProposalExercise[] }[]): Proposal =>
  ({ split: 'upper_lower', reasons: '', issues: [], muscleSets: {}, days: days.map((d) => ({ ...d, title: '上半身' })) })

describe('diffProposals', () => {
  it('同じ枠で重さ・回数・セット数が変わったら changed（前の値つき）', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press'), ex('upper.2', 'ex-lat-pulldown')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press', { weight: 62.5 }), ex('upper.2', 'ex-lat-pulldown')] }])
    const d = diffProposals(prev, next)!
    expect(d.days['2026-11-02']).toEqual([
      { kind: 'changed', prev: prev.days[0].exercises[0], fields: ['weight'] },
      { kind: 'same' },
    ])
    expect(d.count).toBe(1)
  })

  it('1種目で重さと回数が両方変わっても1か所', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press', { weight: 62.5, reps: 10, sets: 4 })] }])
    const d = diffProposals(prev, next)!
    expect(d.days['2026-11-02'][0]).toMatchObject({ kind: 'changed', fields: ['weight', 'reps', 'sets'] })
    expect(d.count).toBe(1)
  })

  it('同じ枠で種目が替われば swapped、前にない枠は new、なくなった枠は removed', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press'), ex('upper.3', 'ex-side-raise')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-dumbbell-press'), ex('upper.4', 'ex-dumbbell-curl')] }])
    const d = diffProposals(prev, next)!
    expect(d.days['2026-11-02']).toEqual([{ kind: 'swapped', prev: prev.days[0].exercises[0] }, { kind: 'new' }])
    expect(d.removed['2026-11-02']).toEqual([prev.days[0].exercises[1]])
    expect(d.count).toBe(3)
  })

  it('枠がない種目は種目IDで結びつける', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('', 'ex-plank', { weight: undefined })] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('', 'ex-plank', { weight: undefined, sets: 2 })] }])
    expect(diffProposals(prev, next)!.days['2026-11-02'][0]).toMatchObject({ kind: 'changed', fields: ['sets'] })
  })

  it('日ごとなくなったら removedDays と removed に入る', () => {
    const prev = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press')] }, { date: '2026-11-03', exercises: [ex('lower.1', 'ex-squat')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press')] }])
    const d = diffProposals(prev, next)!
    expect(d.removedDays).toEqual(['2026-11-03'])
    expect(d.removed['2026-11-03']).toEqual(prev.days[1].exercises)
    expect(d.count).toBe(1)
  })

  it('対象の日付が1日も重ならなければ比べない（undefined）', () => {
    const prev = plan([{ date: '2026-10-26', exercises: [ex('upper.1', 'ex-bench-press')] }])
    const next = plan([{ date: '2026-11-02', exercises: [ex('upper.1', 'ex-bench-press')] }])
    expect(diffProposals(prev, next)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 失敗を確認** `npx vitest run src/coach/diff.test.ts`（diff が見つからない）

- [ ] **Step 3: 実装**

```ts
import type { Proposal, ProposalExercise } from './types'

/** 前の案と比べた、1種目の変化 */
export type ExerciseChange =
  | { kind: 'same' }
  | { kind: 'changed'; prev: ProposalExercise; fields: ChangedField[] }
  | { kind: 'swapped'; prev: ProposalExercise }
  | { kind: 'new' }

export type ChangedField = 'weight' | 'reps' | 'sets'

export interface ProposalDiff {
  /** 日付 → 今の案の種目と同じ順の変化 */
  days: Record<string, ExerciseChange[]>
  /** 日付 → 外した種目（日ごと外れた日も含む） */
  removed: Record<string, ProposalExercise[]>
  /** 前の案にあって今の案にない日（古い順） */
  removedDays: string[]
  /** 変わった・入れ替え・新・外した種目の数（1種目で何項目変わっても1か所） */
  count: number
}

const FIELDS: ChangedField[] = ['weight', 'reps', 'sets']

/** 種目を結びつける鍵：日付＋枠。枠がなければ日付＋種目ID */
const keyOf = (date: string, x: ProposalExercise) => (x.slot ? `${date}|slot|${x.slot}` : `${date}|ex|${x.exerciseId}`)

/**
 * 前の案（prev）と今の案（next）の違い（設計書「3. 違いの見つけ方」）。
 * 対象の日付が1日も重ならないときは比べない（undefined）。
 */
export function diffProposals(prev: Proposal, next: Proposal): ProposalDiff | undefined {
  const nextDates = new Set(next.days.map((d) => d.date))
  if (!prev.days.some((d) => nextDates.has(d.date))) return undefined

  // 同じ鍵が2つあっても順に結びつけられるよう、鍵ごとに前の種目を並べておく
  const pool = new Map<string, ProposalExercise[]>()
  for (const d of prev.days) for (const x of d.exercises) pool.set(keyOf(d.date, x), [...(pool.get(keyOf(d.date, x)) ?? []), x])

  const days: Record<string, ExerciseChange[]> = {}
  let count = 0
  for (const d of next.days) {
    days[d.date] = d.exercises.map((x): ExerciseChange => {
      const p = pool.get(keyOf(d.date, x))?.shift()
      if (!p) { count++; return { kind: 'new' } }
      if (p.exerciseId !== x.exerciseId) { count++; return { kind: 'swapped', prev: p } }
      const fields = FIELDS.filter((f) => p[f] !== x[f])
      if (fields.length === 0) return { kind: 'same' }
      count++
      return { kind: 'changed', prev: p, fields }
    })
  }

  const removed: Record<string, ProposalExercise[]> = {}
  for (const d of prev.days) {
    const left = d.exercises.filter((x) => pool.get(keyOf(d.date, x))?.includes(x))
    if (left.length > 0) { removed[d.date] = left; count += left.length }
  }
  const removedDays = prev.days.map((d) => d.date).filter((date) => !nextDates.has(date)).sort()
  return { days, removed, removedDays, count }
}
```

- [ ] **Step 4: 通ることを確認** `npx vitest run src/coach/diff.test.ts`

- [ ] **Step 5: 公開**：テスト・型・ビルド → commit `feat: find what changed between two menu proposals` → push

---

### Task 3: 案の画面とチャットの1行

**Files:**
- Create: `src/features/coach/proposalList.ts`、`src/features/coach/ProposalLink.tsx`、`src/features/coach/ProposalPage.tsx`、`src/features/coach/ProposalPage.test.tsx`
- Modify: `src/features/coach/ProposalCard.tsx`（`CollapsibleCard` → `<section className="card stack proposal-card" aria-label="メニュー案">`。見出し「メニュー案」と中身はそのまま）
- Modify: `src/features/coach/CoachPage.tsx`（`<ProposalCard>` → `<ProposalLink>`）
- Modify: `src/App.tsx`（`<Route path="coach/proposal/:id" element={<ProposalPage />} />`）
- Modify: `src/features/coach/CoachPage.test.tsx`（反映まわりのテストは、1行を押して案の画面で反映する流れに直す）

- [ ] **Step 1: 案の一覧の関数**（`proposalList.ts`）

```ts
import type { ChatMessage } from '../../db/types'
import { diffProposals, type ProposalDiff } from '../../coach/diff'

export interface ProposalEntry {
  message: ChatMessage
  /** このチャットでの通し番号（古い順に1から） */
  no: number
  /** 1つ前の案との違い（案1・週が違うときは undefined） */
  diff?: ProposalDiff
}

/** チャットのメッセージから案だけを古い順に取り出す */
export function proposalEntries(messages: ChatMessage[]): ProposalEntry[] {
  const withProposal = messages.filter((m) => m.role === 'coach' && m.proposal)
  return withProposal.map((message, i) => ({
    message,
    no: i + 1,
    diff: i > 0 ? diffProposals(withProposal[i - 1].proposal!, message.proposal!) : undefined,
  }))
}
```

- [ ] **Step 2: 1行（`ProposalLink.tsx`）**

```tsx
import { ChevronRight, ListChecks } from 'lucide-react'
import { Link } from 'react-router'
import type { ProposalEntry } from './proposalList'

/** チャットの中の案の1行。押すと案の画面を開く */
export function ProposalLink({ entry, latest }: { entry: ProposalEntry; latest: boolean }) {
  const { message, no, diff } = entry
  const p = message.proposal!
  const applied = message.appliedAt !== undefined
  const detail = diff ? `変更 ${diff.count}か所` : `${p.days.length}日 · ${p.days.reduce((n, d) => n + d.exercises.length, 0)}種目`
  return (
    <Link className={`proposal-link ${latest && !applied ? 'is-current' : ''}`.trim()} to={`/coach/proposal/${message.id}`}>
      <ListChecks aria-hidden="true" />
      <span className="proposal-link-text">案{no} · {detail}</span>
      <span className="proposal-link-status">{applied ? '反映済み' : '未反映'}</span>
      <ChevronRight aria-hidden="true" />
    </Link>
  )
}
```

`CoachPage.tsx` では `const entries = proposalEntries(messages ?? [])` を作り、`m.proposal` のメッセージで `entries.find((e) => e.message.id === m.id)` を渡す。`latest` は `entries.at(-1)?.message.id === m.id`。

- [ ] **Step 3: 案の画面（`ProposalPage.tsx`）**

```tsx
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link, useParams } from 'react-router'
import { PageHeader } from '../../components/PageHeader'
import { formatDateShort } from '../../lib/dates'
import { listChatMessages } from '../../repo/chat'
import { ProposalCard } from './ProposalCard'
import { proposalEntries } from './proposalList'

/** メニュー案の画面（設計書「2. 案の画面」）。矢印でこのチャットのほかの案に切り替える */
export function ProposalPage() {
  const { id } = useParams()
  const messages = useLiveQuery(listChatMessages)
  if (!messages) return null
  const entries = proposalEntries(messages)
  const i = entries.findIndex((e) => e.message.id === id)
  const entry = entries[i]
  const prev = entries[i - 1]
  const next = entries[i + 1]
  return (
    <div className="page proposal-page">
      <PageHeader title="メニュー案" backTo="/coach" />
      {!entry ? (
        <p className="muted">この案は見つかりませんでした。</p>
      ) : (
        <>
          <nav className="proposal-switch" aria-label="案の切り替え">
            {prev ? <Link className="icon-btn" to={`/coach/proposal/${prev.message.id}`} replace aria-label="前の案"><ChevronLeft aria-hidden="true" /></Link>
              : <span className="icon-btn is-disabled" aria-hidden="true"><ChevronLeft /></span>}
            <span className="num">案{entry.no} / {entries.length} · {range(entry.message.proposal!.days.map((d) => d.date))}</span>
            {next ? <Link className="icon-btn" to={`/coach/proposal/${next.message.id}`} replace aria-label="次の案"><ChevronRight aria-hidden="true" /></Link>
              : <span className="icon-btn is-disabled" aria-hidden="true"><ChevronRight /></span>}
          </nav>
          <ProposalCard message={entry.message} />
        </>
      )}
    </div>
  )
}

const range = (dates: string[]) => {
  const s = [...dates].sort()
  return s.length === 0 ? '' : s[0] === s.at(-1) ? formatDateShort(s[0]) : `${formatDateShort(s[0])}〜${formatDateShort(s.at(-1)!)}`
}
```

- [ ] **Step 4: テスト（`ProposalPage.test.tsx`）**：`ProposalCard.test.tsx` の `goodReply`・`profile` と同じ準備で `askCoach` を2回呼び（2回目は1種目の reps を変える）、`renderPage('/coach/proposal/:id', '/coach/proposal/<2つ目のid>', <ProposalPage />)` で
  - 「案2 / 2」が出る、「前の案」で案1に切り替わる（「案1 / 2」）、「次の案」は押せない
  - 戻るボタン（`戻る`）がある
  - 「反映する」で反映できる（`getPlanForDate` で予定が入る）
  - 存在しない id なら「この案は見つかりませんでした。」

  `CoachPage.test.tsx` の「案のカード → 反映」系は、チャットに `案1 · 4日 · 16種目` のような1行（`role: 'link'`、名前に「案1」を含む）が出ることを確かめる形に直し、反映の確認は `ProposalPage.test.tsx` に移す。

- [ ] **Step 5: CSS（`coach.css` に追加）**

```css
/* 案の1行（チャットの中） */
.proposal-link { display: flex; align-items: center; gap: var(--s-2); min-height: 44px; max-width: 82%; padding: 8px 12px; border: 1px solid var(--line-strong); border-radius: var(--r-md); color: var(--text-2); font-size: var(--fs-sub); font-weight: 700; text-decoration: none; }
.proposal-link svg { width: 18px; height: 18px; flex: none; }
.proposal-link-text { min-width: 0; }
.proposal-link-status { margin-left: auto; color: var(--muted); font-size: var(--fs-caption); }
/* まだ反映していない一番新しい案 */
.proposal-link.is-current { border-color: var(--accent); color: var(--accent-hi); }
/* 案の画面 */
.proposal-switch { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); padding: 4px; border-radius: var(--r-md); background: var(--surface); font-weight: 700; }
.proposal-switch .is-disabled { opacity: 0.3; }
```

- [ ] **Step 6: 確認と公開**：テスト・型・ビルド → プレビューで「チャットの1行 → 案の画面 → 戻る」を確かめスクリーンショット → commit `feat: open menu proposals on their own page from a one-line entry in the chat` → push

---

### Task 4: 前の案との違いの表示

**Files:**
- Modify: `src/components/ExerciseRow.tsx`、`src/features/coach/ProposalCard.tsx`、`src/features/coach/ProposalPage.tsx`、`src/styles/coach.css`
- Test: `src/features/coach/ProposalPage.test.tsx`

- [ ] **Step 1: テストを足す**（`ProposalPage.test.tsx`）
  - 2つ目の案の画面に「オレンジ＝案1から変わった所」が出る
  - reps を変えた種目の行の読み上げ名に「前 8×3」のような前の値が入る（`getByRole('button', { name: /ベンチプレス.*前/ })`）
  - 種目を入れ替えた案では「入れ替え」、外した種目は「外した種目」の下に名前が出る
  - 案1では違いの説明が出ない。週が違う2つの案では「前の案と対象の週が違うので比べていません」

- [ ] **Step 2: 失敗を確認**

- [ ] **Step 3: `ExerciseRow` に違いを足す**

```tsx
export interface ExerciseRowProps {
  // …今までの項目…
  /** 前の案との違い：印（「新」「入れ替え」）と、変わった量・重さの前の値 */
  change?: { badge?: string; volumeFrom?: string; weightFrom?: string }
}
// 行の中：
{change?.badge && <span className="ex-row-badge">{change.badge}</span>}
<span className={`ex-row-volume num ${change?.volumeFrom ? 'is-changed' : ''}`.trim()}>{volume}{change?.volumeFrom && <small className="ex-row-from">←{change.volumeFrom}</small>}</span>
{weight && <span className={`ex-row-weight num ${change?.weightFrom ? 'is-changed' : ''}`.trim()}>{weight}{change?.weightFrom && <small className="ex-row-from">←{change.weightFrom}</small>}</span>}
```

読み上げ名（`ariaLabel` を作る所、`ProposalCard`）には `前 ${volumeFrom}`・`前 ${weightFrom}`・印を足す。

- [ ] **Step 4: `ProposalCard` に `diff?: ProposalDiff` と `prevNo?: number` と `compared: 'yes' | 'first' | 'other-week'` を渡す**（`ProposalPage` から `entry.diff`・`entry.no - 1`・`entry.no === 1 ? 'first' : entry.diff ? 'yes' : 'other-week'`）
  - 行ごと：`diff.days[d.date][xi]` が `changed` なら、`fields` に `reps`/`sets` があれば `volumeFrom = volumeText(prev, ex)`、`weight` があれば `weightFrom = weightText(prev, ex) ?? 'なし'`。`swapped` は `badge: '入れ替え'`、`new` は `badge: '新'`
  - 日の下：`diff.removed[d.date]` を「外した種目」として `muted` で名前と量を並べる
  - 一番下（理由の前）：`diff.removedDays` を「外した日」として日付と種目名を並べる
  - 上：`compared === 'yes'` なら「オレンジ＝案{prevNo}から変わった所」、`'other-week'` なら「前の案と対象の週が違うので比べていません」

- [ ] **Step 5: CSS**

```css
.ex-row .is-changed { color: var(--accent-hi); }
.ex-row-from { margin-left: 4px; color: var(--muted); font-size: var(--fs-caption); font-weight: 600; }
.ex-row-badge { flex: none; padding: 0 6px; border-radius: var(--r-pill); background: var(--accent-soft); color: var(--accent-hi); font-size: var(--fs-caption); font-weight: 800; }
.proposal-removed { margin: 4px 0 0; color: var(--muted); font-size: var(--fs-caption); }
.proposal-legend { color: var(--muted); font-size: var(--fs-caption); }
```

- [ ] **Step 6: 確認と公開**：テスト・型・ビルド → プレビューで違いの表示をスクリーンショット → commit `feat: highlight what changed from the previous proposal` → push → 引き継ぎメモ（`docs/HANDOFF.md`）の「これまでに作ったもの」に1行足す
