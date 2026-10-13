# フェーズ1b AIコーチ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** アプリ内のAIコーチ（Gemini）と相談して、根拠のあるルールで組んだ1週間分のメニューを作り、確認して予定に反映できるようにする。きつさの記録で重さとセット数を調整する。

**Architecture:** メニューの骨組み（分割法・日の並び・枠・量）、重さの計算、きつさによる調整、メニュー案のチェックは、すべて `src/coach/` の純粋な関数としてブラウザ側で行う。AIは枠に種目を入れて説明するだけ。サーバーは Vercel の関数 `api/coach.ts` で、合言葉を照合して Gemini を中継するだけ。データは今まで通り IndexedDB（Dexie）に保存する。

**Tech Stack:** 既存（React 19, TypeScript 5.9, Vite 8, Dexie 4, React Router 7, Vitest 5, lucide-react）＋ Vercel Functions（Node.js runtime, Web 標準の `Request`/`Response`）＋ Gemini REST API（構造化出力）

**設計書:** `docs/superpowers/specs/2026-10-13-phase1b-ai-coach-design.md`（各タスクで該当する節を必ず読むこと）

**共通ルール**
- 作業フォルダ `C:\dev\kintore`、ブランチ `phase1b`（Task 1 の前に `main` から作る）
- コミットメッセージの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`（`-m` を2つ使う）
- 毎コミット前に `npx tsc --noEmit` と `npm test` を通す
- 画面の文言は日本語。音は絶対に鳴らさない。入力欄は16px以上。375px幅で横スクロールなし。移動先のページには `PageHeader` の戻るボタン
- 既存のデザイン（`src/styles/*.css` のトークン、lucide-react のアイコン、`CollapsibleCard`）に合わせる
- 削除は論理削除。読むときは `deleted` を除外する
- このプランは、純粋なロジックについては型と具体的なテストケースまで決めている。実装コードは TDD（テストを書く → 失敗を確認 → 実装 → 成功を確認）で書く

---

## ファイル構成（追加・変更）

```
api/
  coach.ts                    Vercel 関数：POST /api/coach（合言葉照合・サイズ制限・Gemini 中継）
  _lib/gemini.ts              Gemini 呼び出し（乗り換えるときはここだけ替える）
  _lib/schema.ts              AIの返事の JSON スキーマ（サーバーと共有する型）
src/
  db/types.ts                 追加：MovementPattern, Muscle, Profile, ChatMessage など
  db/db.ts                    version(2)：profile, chatMessages 表、定番種目に情報を書き足す
  db/seedExercises.ts         定番種目に pattern / primary / secondary / compound を追加
  coach/                      AIコーチの純粋なロジック（DBに触らない）
    split.ts                  分割法の選択と日の並び
    templates.ts              日の種類ごとの枠
    volume.ts                 量・回数・休憩、時間で枠を削る、部位ごとのセット数の数え方
    skeleton.ts               骨組みを組み立てる
    load.ts                   重さの計算ときつさによる調整
    validate.ts               メニュー案のチェック
    context.ts                AIに渡す情報（記録の要約・候補・ルール文）
    response.ts               AIの返事の読み取りと検証
    types.ts                  coach 内の型
  repo/
    profile.ts, chat.ts       プロフィールとチャットの読み書き
    coachData.ts              骨組み作成に必要な記録をDBから集める
    applyProposal.ts          メニュー案を予定メニューとして保存する
  features/coach/
    client.ts                 /api/coach を呼ぶ（エラーを分類する）
    coachService.ts           骨組み → AI → チェック → 1回だけ作り直し → 重さ計算
    CoachPage.tsx             チャット画面
    ProposalCard.tsx          メニュー案カード
    ProfilePage.tsx           プロフィールの聞き取り・編集
  features/workout/EffortPrompt.tsx   最後のセットのあとに出す「きつさは？」
  features/routines/MenuPage.tsx      マイメニューと種目をタブで切り替える画面
vercel.json                   必要な場合のみ（SPA の書き換えなど）
```

---

### Task 1: 種目データに動き・部位の情報を追加

**Files:** Modify `src/db/types.ts`, `src/db/seedExercises.ts`, `src/db/db.ts`, `src/features/exercises/ExerciseEditPage.tsx`, `src/lib/backup.ts`（CHECKS は新しい項目を必須にしない）. Test `src/db/db.test.ts`, `src/db/seedExercises.test.ts`

- [ ] **Step 1: 型を追加**（`src/db/types.ts`）

```ts
export type MovementPattern =
  | 'squat' | 'hinge' | 'single_leg' | 'horizontal_push' | 'vertical_push'
  | 'horizontal_pull' | 'vertical_pull' | 'chest_isolation' | 'side_delt'
  | 'rear_delt' | 'biceps' | 'triceps' | 'hamstring' | 'quad_isolation'
  | 'calf' | 'core' | 'cardio'

export type Muscle =
  | 'chest' | 'back' | 'front_delt' | 'side_delt' | 'rear_delt' | 'biceps'
  | 'triceps' | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'abs'

export const MOVEMENT_PATTERN_LABELS: Record<MovementPattern, string> = {
  squat: 'スクワット系', hinge: 'ヒンジ系', single_leg: '片脚', horizontal_push: '水平に押す',
  vertical_push: '上に押す', horizontal_pull: '水平に引く', vertical_pull: '上から引く',
  chest_isolation: '胸の単関節', side_delt: '横肩', rear_delt: '後ろ肩', biceps: '二頭',
  triceps: '三頭', hamstring: '裏もも', quad_isolation: '前もも', calf: 'ふくらはぎ', core: '腹', cardio: '有酸素',
}
export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: '胸', back: '背中', front_delt: '前肩', side_delt: '横肩', rear_delt: '後ろ肩', biceps: '二頭',
  triceps: '三頭', quads: '前もも', hamstrings: '裏もも', glutes: 'お尻', calves: 'ふくらはぎ', abs: '腹',
}
```
`Exercise` に任意項目として追加：`pattern?: MovementPattern`, `primary?: Muscle[]`, `secondary?: Muscle[]`, `compound?: boolean`（既存データと自作種目のために任意）。

- [ ] **Step 2: テストを書く**（`src/db/seedExercises.test.ts`）
  - 定番種目すべてに `pattern`, `primary`（1個以上）, `secondary`, `compound` がある
  - 抜き取り確認：`ex-bench-press` → `horizontal_push`, primary `['chest']`, secondary に `triceps` と `front_delt`, compound true／`ex-squat` → `squat`, primary `['quads','glutes']`／`ex-romanian-deadlift` → `hinge`, primary に `hamstrings`／`ex-side-raise` → `side_delt`, compound false／`ex-lat-pulldown` → `vertical_pull`, primary `['back']`, secondary に `biceps`／`ex-plank` → `core`／`ex-running` → `cardio`
  - 設計書「メニューの決め方 2. 日ごとの枠」のすべての枠について、器具「ジムのフリーウェイト＋マシン」で候補が1つ以上ある
- [ ] **Step 3: 定番種目の行に情報を足す**（`seedExercises.ts` の `Row` を拡張。全64種目。腕・肩・脚などの対応は一般的な分類に従う。`dips` は `horizontal_push`（胸・三頭）、`push-up` は `horizontal_push`、`hip-thrust` は `hinge`（お尻）、`leg-extension` は `quad_isolation`、`leg-curl` は `hamstring`、`lunge`/`bulgarian-split-squat` は `single_leg`、`face-pull`/`rear-raise` は `rear_delt`、`front-raise`/`upright-row` は `side_delt` か `vertical_push` から妥当な方、腹の種目は `core`、有酸素は `cardio`）
- [ ] **Step 4: DB を version(2) に上げる**（`db.ts`）。`this.version(2).stores({ ...v1, profile: 'id', chatMessages: 'id, createdAt' }).upgrade(tx => …)` で、既存の定番種目（`custom === false`）に seed の情報を書き足す。テスト：version 1 のDBを作ってから開き直すと、定番種目に `pattern` が入り、既存の記録が残っている
- [ ] **Step 5: 種目の編集画面に「動きの種類」「主に使う部位」「補助で使う部位」「複数関節」を追加**（任意入力。チップで複数選択）
- [ ] **Step 6: tsc・テスト → Commit**（`feat: add movement pattern and muscles to exercises`）

---

### Task 2: プロフィール・チャット・設定のデータ

**Files:** Modify `src/db/types.ts`, `src/lib/backup.ts`. Create `src/repo/profile.ts`, `src/repo/chat.ts`. Test 各 `*.test.ts`, `src/lib/backup.test.ts`

- [ ] **Step 1: 型**

```ts
export type Goal = 'hypertrophy' | 'strength' | 'fat_loss' | 'health'
export type Experience = 'none' | 'under_1y' | 'y1_3' | 'over_3y'
export type EquipmentAccess = 'gym_free' | 'gym_machine' | 'home_dumbbell' | 'bodyweight'
export interface BaselineLift { exerciseId: string; weight: number; reps: number }
export interface Profile {
  id: 'me'
  goal: Goal
  experience: Experience
  daysPerWeek: number            // 1〜7
  minutesPerSession: number      // 例：60
  weekdays: number[]             // 0=日〜6=土
  equipment: EquipmentAccess[]
  injuries: string               // 自由記入（空でもよい）
  baselines: BaselineLift[]      // 任意
  preferredSplit?: SplitType     // チャットで変更されたとき
  updatedAt: number
}
export interface ChatMessage extends BaseRecord {
  role: 'user' | 'coach'
  text: string
  proposal?: Proposal            // src/coach/types.ts の型（重さ計算・チェック済み）
  appliedAt?: number
}
```
`PlanSource` に `'ai'` を追加。`PlannedExercise` に任意 `slot?: string`, `repRange?: [number, number]` を追加。`Settings` に `coachPasscode?: string` を追加。

- [ ] **Step 2: repo**：`getProfile()`, `saveProfile(p)`, `listChatMessages()`（createdAt 昇順、削除済み除外）, `addChatMessage(m)`, `markProposalApplied(id)`, `clearChat()`（論理削除）
- [ ] **Step 3: バックアップ**：`profile` と `chatMessages` を TABLES と CHECKS に追加。古いバックアップ（2つの表がない）も読み込めるようにする（ない表は空として扱う）。テスト：古い形式のファイルを読み込める
- [ ] **Step 4: tsc・テスト → Commit**（`feat: add profile, chat and passcode data`）

---

### Task 3: 分割法・日の並び・枠・量（骨組み）

**Files:** Create `src/coach/types.ts`, `split.ts`, `templates.ts`, `volume.ts`, `skeleton.ts` と各テスト

設計書「メニューの決め方 1〜3」をそのままコードにする。

- [ ] **Step 1: 型**（`src/coach/types.ts`）

```ts
export type SplitType = 'full_body' | 'upper_lower' | 'ppl' | 'ul_ppl'
export type DayType = 'full' | 'upper' | 'lower' | 'push' | 'pull' | 'legs'
export interface SlotPlan {
  slot: string                    // 例：'upper.1'
  patterns: MovementPattern[]     // この枠に入れてよい動き
  sets: number
  repRange: [number, number]
  restSec: number
  compound: boolean
}
export interface DayPlan { date: string; dayType: DayType; title: string; slots: SlotPlan[] }
export interface Skeleton {
  split: SplitType
  weekStart: string               // 月曜の日付
  days: DayPlan[]
  weeklySetTarget: [number, number]   // 部位ごとの週のセット数の目標
  deload: boolean
}
export interface ProposalExercise { slot: string; exerciseId: string; sets: number; reps: number; repRange: [number, number]; restSec: number; weight?: number }
export interface ProposalDay { date: string; title: string; exercises: ProposalExercise[]; note?: string }
export interface Proposal { split: SplitType; days: ProposalDay[]; reasons: string; issues: string[]; muscleSets: Partial<Record<Muscle, number>> }
```

- [ ] **Step 2: テスト**（split / schedule）
  - `chooseSplit(days, experience, preferred?)`：2→full_body、3→full_body、3＋経験 y1_3＋preferred 'ppl'→ppl、4→upper_lower、5→ul_ppl、6→ppl、7→ppl（6日扱い）、初心者（none/under_1y）で6→upper_lower（4日に抑える）、初心者で5→upper_lower
  - `effectiveDays(days, experience)`：初心者は最大4
  - `scheduleDays(split, weekdays, weekStart, count)`：行ける曜日から日付を選ぶ。テスト：全身×3・曜日[月,火,水,木,金]→月・水・金／上下×2・[月,火,木,金]→月=上・火=下・木=上・金=下／PPL×2・[月〜土]→押・引・脚・押・引・脚
  - 48時間ルール：同じ部位を含む日の間が48時間以上（全身×3で[月,火,水]しか行けないとき→3日は組めないので2日にし、理由を返す）
- [ ] **Step 3: テスト**（templates / volume）
  - 各日の種類の枠の並びが設計書の表どおり
  - `repScheme(goal, experience, compound, isMain)`：筋肥大・複数関節→[6,10]・休憩150／筋肥大・単関節→[10,15]・75／筋力・メイン→[3,6]・240／筋力・複数関節（メイン以外）→[6,10]・120／減量・複数関節→[8,12]・90／初心者は目標に関係なく複数関節[8,12]・単関節[10,15]
  - `weeklySetTarget(experience)`：none/under_1y→[8,12]、y1_3→[10,16]、over_3y→[12,20]
  - `fitToTime(slots, minutes)`：合計セット×3分が時間を超えたら後ろの枠から削る（60分→20セットまで）
  - `countMuscleSets(exercises, catalog)`：主に使う部位1、補助0.5（例：ベンチ3セット→胸3・三頭1.5・前肩1.5）
- [ ] **Step 4: テスト**（skeleton）
  - `buildSkeleton({ profile, weekStart, effortTrend, weeksSinceDeload })`：経験1〜3年・筋肥大・週4日60分→upper_lower、4日、各枠のセット数が2〜4、部位ごとの週のセット数がおおむね目標内
  - `weeksSinceDeload >= 6` → `deload: true` でセット数が約半分（各枠1以上）
- [ ] **Step 5: 実装 → 成功 → Commit**（`feat: add program skeleton rules`）

---

### Task 4: 重さの計算ときつさによる調整

**Files:** Create `src/coach/load.ts`, `src/coach/load.test.ts`

設計書「5. 重さの決め方」「6. きつさによる調整」の表を全行テストする。

- [ ] **Step 1: 型と関数**

```ts
export interface PastSession { date: string; weight: number; repsPerSet: number[]; targetReps: number; effort?: Rating }
export interface LoadDecision { weight?: number; reps: number; setDelta: -1 | 0 | 1; reason: string }
export function estimate1RM(weight: number, reps: number): number          // Epley
export function percentForReps(reps: number): number                       // 5→0.87, 6→0.85, 8→0.80, 10→0.75, 12→0.70, 15→0.65（間は直線で補う）
export function roundToStep(weight: number, step: number): number
export function decideLoad(args: { history: PastSession[]; repRange: [number, number]; step: number; baseline?: { weight: number; reps: number }; logType: LogType }): LoadDecision
```
- [ ] **Step 2: テスト（表の全行＋端のケース）**
  - 楽（1〜2）が直近2回 → 前回＋step×2、reps は下限、setDelta +1（2回目以降も楽が続いた場合）
  - 全セットで上限回数に届いた・きつさ3以下 → 前回＋step、reps は下限
  - 届いた・きつさ4 → 据え置き
  - 届かなかった → 5〜10%下げて step で丸める、setDelta −1
  - きつさ5が2回続いた → 同上
  - きつさの記録がない → 届けば＋step、届かなければ据え置き
  - 同じ重さで3回続けて届かない → 10%下げる
  - 記録なし・baseline あり（100kg×5、目標8回）→ 推定1RM 116.7 × 0.80 = 93.3 → step 2.5 で 92.5
  - 記録なし・baseline なし → 20、reason に「軽めで試す」旨
  - logType が `reps` / `time_distance` → weight は undefined
- [ ] **Step 3: 実装 → 成功 → Commit**（`feat: add load progression and effort-based adjustment`）

---

### Task 5: メニュー案のチェック

**Files:** Create `src/coach/validate.ts` と test

- [ ] **Step 1: `validateProposal(proposal, skeleton, catalog, profile): string[]`**（問題を日本語の文で返す。空なら問題なし）
- [ ] **Step 2: テスト**：候補にない種目ID／枠の動きに合わない種目／セット0や11／回数0や31／休憩301／対象週の外の日付／行けない曜日／同じ部位の日が48時間未満／1日の合計時間が超過／部位ごとの週のセット数が目標より大きく外れる（下限の半分未満・上限の1.5倍超）。それぞれ1件ずつ検出され、正しい案では空配列
- [ ] **Step 3: 実装 → 成功 → Commit**（`feat: validate coach proposals`）

---

### Task 6: AIに渡す情報と返事の読み取り

**Files:** Create `src/coach/context.ts`, `src/coach/response.ts`, `api/_lib/schema.ts` と test

- [ ] **Step 1: `api/_lib/schema.ts`**：AIの返事の型（`CoachReply = { message: string; proposal?: { split; days: { date; title; exercises: { slot; exerciseId; sets; reps; restSec }[]; note? }[]; reasons } }`）と、Gemini の `responseSchema`（OpenAPI サブセットの JSON）を定義。サーバーとブラウザの両方から import する
- [ ] **Step 2: `buildCoachRequest({ profile, skeleton, catalog, history, existingPlans, chat, userText })`**：
  - `system`：役割と設計書の「メニューの決め方」の要点を日本語で。枠の候補からしか選ばない、前の週と同じ種目を続ける、ケガを避ける、骨組みの範囲を守る、理由を短く、返事は日本語
  - `context`：プロフィール、骨組み（JSON）、枠ごとの候補（id・名前・器具）と前の週の種目、直近4週間の要約（日付・種目・重量×回数・きつさ・調子・予定があったのに実施しなかった日）、対象週の既存の予定
  - `messages`：直近20件のチャット
  - テスト：候補は使える器具とケガで絞られている（器具が自重のみならバーベル種目が候補にない）、履歴は4週間より前を含まない、チャットは最大20件、全体のサイズが上限（例：60KB）以下
- [ ] **Step 3: `parseCoachReply(raw: unknown): CoachReply`**：形が違えば `Error('AIの返事を読み取れませんでした')`。テスト：正しい形・message のみ・proposal の型違い・JSON でない文字列
- [ ] **Step 4: 実装 → 成功 → Commit**（`feat: build coach context and parse replies`）

---

### Task 7: サーバー（Vercel 関数）

**Files:** Create `api/coach.ts`, `api/_lib/gemini.ts`, `api/coach.test.ts`（先頭に `// @vitest-environment node`）. Modify `tsconfig.json`（`include` に `api`）, `vite.config.ts`（必要なら test の include）

- [ ] **Step 1: テスト**（`fetch` を差し替える）
  - POST 以外 → 405
  - 本文が 100KB 超 → 413
  - 合言葉なし・不一致 → 401（`COACH_PASSCODE` と一定時間比較）
  - `GEMINI_API_KEY` 未設定 → 500「サーバーの設定が足りません」
  - Gemini が 429 → 429 と「今日は上限に達しました。時間をおいて試してください」
  - Gemini がそれ以外の失敗 → 502
  - 成功 → 200 で `CoachReply`（`candidates[0].content.parts[0].text` を JSON として読む）
  - レスポンスやエラーにAPIキー・合言葉が含まれない
- [ ] **Step 2: `api/_lib/gemini.ts`**：`callGemini({ apiKey, model, system, context, messages }): Promise<CoachReply>`。エンドポイント `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`、ヘッダー `x-goog-api-key`、`systemInstruction`、`contents`、`generationConfig: { responseMimeType: 'application/json', responseSchema, temperature: 0.4 }`。モデルは環境変数 `GEMINI_MODEL`（既定 `gemini-2.5-flash`。Task 12 で実際に使えるモデル名を確認して設定する）
- [ ] **Step 3: `api/coach.ts`**：`export async function POST(request: Request): Promise<Response>`（Vercel の Web 標準ハンドラー）。上記のチェック → `callGemini` → `Response.json(reply)`
- [ ] **Step 4: 実装 → 成功 → Commit**（`feat: add coach API function for Vercel`）

---

### Task 8: ブラウザ側のつなぎ（呼び出し・作り直し・反映）

**Files:** Create `src/features/coach/client.ts`, `src/features/coach/coachService.ts`, `src/repo/coachData.ts`, `src/repo/applyProposal.ts` と test

- [ ] **Step 1: `client.ts`**：`sendToCoach(body, passcode): Promise<CoachReply>`。エラーを `CoachError` の `kind`（`offline` / `unauthorized` / `rate_limited` / `server` / `invalid`）で分類して投げる。テスト：各ステータス・`navigator.onLine === false`・ネットワーク失敗
- [ ] **Step 2: `coachData.ts`**：`loadCoachInputs(weekStart)`：プロフィール、種目一覧、直近4週間の記録（種目ごとの `PastSession[]`、きつさは WorkoutExercise.effort）、対象週の予定、前の週のAI予定の枠と種目、最後のデロードからの週数（AI予定の `note` か専用フラグで判断）
- [ ] **Step 3: `coachService.ts`**：`askCoach(userText, opts)`：
  1. 入力を集め `buildSkeleton` → `buildCoachRequest` → `sendToCoach`
  2. 返事に proposal があれば、`decideLoad` で各種目の重さと回数・setDelta を反映 → `validateProposal`
  3. 問題があれば、問題の文をつけて1回だけ作り直しを依頼。まだ問題があれば `issues` に入れる
  4. ユーザーのメッセージとAIの返事（proposal 付き）を `chatMessages` に保存
  - テスト（client を差し替え）：正しい案→そのまま保存／1回目が不正→作り直しが呼ばれ2回目を採用／2回とも不正→issues 付きで保存／エラー時はユーザーのメッセージだけ保存され、再送できる
- [ ] **Step 4: `applyProposal(messageId)`**：各日を `PlannedWorkout`（`source: 'ai'`、各種目に `slot` と `repRange`、セットは `sets` 個の `{ weight, reps }`）として保存。既存の予定がある日は置き換え（論理削除）。`markProposalApplied`。テスト：保存される・置き換わる・2回押しても重複しない
- [ ] **Step 5: 実装 → 成功 → Commit**（`feat: coach service with retry, loads and apply`）

---

### Task 9: プロフィール画面とAIコーチ画面

**Files:** Create `src/features/coach/ProfilePage.tsx`, `CoachPage.tsx`, `ProposalCard.tsx` と test. Modify `src/App.tsx`（`/coach`, `/coach/profile`）

- [ ] **Step 1: ProfilePage**：設計書「プロフィールの聞き取り」の項目。今の重量は4種目の「重量×回数」（任意）。保存で `/coach` へ。`PageHeader`（戻る先 `/coach`）
- [ ] **Step 2: CoachPage**（タブのルートなので戻るボタンなし）
  - プロフィール未作成なら聞き取りへ案内するカード
  - 合言葉が未設定なら設定へ案内するカード
  - チャットの一覧（自分は右、AIは左）、入力欄（16px）、送信ボタン、クイックボタン「来週のメニューを作って」「今日できなかった」「今週を見直して」
  - 送信中は「考え中…」。エラーは種類ごとの文言と「もう一度送る」
  - オフラインなら送信不可と理由
- [ ] **Step 3: ProposalCard**：分割法、日ごとの種目（セット×回数・休憩・重さ）、部位ごとの週のセット数、理由、注意点、「反映する」（置き換える日があれば確認ダイアログで日付を示す）、反映済みなら「反映済み」
- [ ] **Step 4: テスト**（`sendToCoach` を差し替え）：送信 → カード表示 → 反映 → `getPlanForDate` で予定が入っている／エラー表示と再送／プロフィール未作成の案内
- [ ] **Step 5: 実装 → 成功 → Commit**（`feat: add coach chat, proposal card and profile screens`）

---

### Task 10: 下部メニューの変更と「メニュー」画面のタブ

**Files:** Modify `src/components/BottomNav.tsx`, `src/App.tsx`. Create `src/features/routines/MenuPage.tsx` と test

- [ ] **Step 1**：下部メニューを「ホーム（House）／AIコーチ（Sparkles か Bot）／メニュー（ClipboardList）／体（Scale）／設定（Settings）」にする
- [ ] **Step 2**：`/routines` を `MenuPage` にし、上部のタブ「マイメニュー／種目」で `RoutineListPage` と `ExerciseListPage` の中身を切り替える（`/routines?tab=exercises`）。`/exercises` は `/routines?tab=exercises` へ書き換え。種目の追加・編集ページの戻り先を合わせる
- [ ] **Step 3: テスト**：タブ切り替え、既存の種目・マイメニューのテストが通る
- [ ] **Step 4: Commit**（`feat: add coach tab and merge exercises into menu`）

---

### Task 11: きつさの入力（最後のセットのあと）と設定

**Files:** Create `src/features/workout/EffortPrompt.tsx`. Modify `ExerciseBlock.tsx`, `src/features/settings/SettingsPage.tsx`. Test 追加

- [ ] **Step 1**：その種目の全セットが完了した瞬間に、カード内に「きつさは？」と `1 楽` `2` `3 ちょうどいい` `4` `5 限界` を出す。タップで `updateExerciseNote(id, { effort, note: 既存のnote })` を保存して閉じる。×で閉じる。すでに effort があれば出さない
- [ ] **Step 2**：設定に「AIコーチ」の節：合言葉（`type="password"`、保存）、「プロフィールを編集」リンク、「チャット履歴を消す」（確認あり）
- [ ] **Step 3: テスト**：最後のセットにチェック → 「きつさは？」→ 4 を押す → effort 4 が保存される／途中のセットでは出ない／合言葉が保存される
- [ ] **Step 4: Commit**（`feat: quick effort prompt and coach settings`）

---

### Task 12: Vercel への引っ越しと本番確認（ユーザーと一緒に行う）

**Files:** Modify `.github/workflows/deploy.yml`（GitHub Pages の公開をやめ、テストだけ走らせる `ci.yml` にする）, `vite.config.ts`（`base` を `/` にしてよいか確認）, `README.md`. Create `vercel.json`（必要な場合）

- [ ] **Step 1**：ローカルで `npx vercel dev` 相当の確認ができない場合は、`api/coach.test.ts` が通っていればよい。`npm run build` が通ることを確認
- [ ] **Step 2（ユーザー）**：Google AI Studio で APIキーを作る（手順を案内する）。キーはチャットに貼らず、Vercel の環境変数に直接入れてもらう
- [ ] **Step 3（ユーザー）**：Vercel に GitHub アカウントでログイン → `tktk-h/kintore` を Import → 環境変数 `GEMINI_API_KEY`、`COACH_PASSCODE`（合言葉）、`GEMINI_MODEL` を設定 → Deploy
- [ ] **Step 4**：公開URLで `/api/coach` に合言葉なしで POST して 401 が返ることを確認（キーを使わない確認）。ユーザーにアプリの設定で合言葉を入れてもらい、プロフィールを作って「来週のメニューを作って」を試す。メニュー案の質を一緒に確認し、気になる点を直す
- [ ] **Step 5**：古いURLでバックアップを書き出し → 新しいURLで読み込み → ホーム画面に追加し直す（手順を案内する）。GitHub Pages の公開を止める
- [ ] **Step 6: Commit・push**（`chore: move hosting to Vercel`）
