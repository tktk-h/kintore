import type { BodyPart, Equipment, Exercise, LogType, MovementPattern, Muscle } from './types'

type Row = [
  id: string,
  name: string,
  bodyPart: BodyPart,
  equipment: Equipment,
  logType: LogType,
  restSec: number,
  pattern: MovementPattern,
  primary: Muscle[],
  secondary: Muscle[],
  compound: boolean,
]

const PRESS: Muscle[] = ['triceps', 'front_delt']
const ROW: Muscle[] = ['biceps', 'rear_delt']

const ROWS: Row[] = [
  // 胸
  ['bench-press', 'ベンチプレス', 'chest', 'barbell', 'weight_reps', 120, 'horizontal_push', ['chest'], PRESS, true],
  ['incline-bench-press', 'インクラインベンチプレス', 'chest', 'barbell', 'weight_reps', 120, 'horizontal_push', ['chest'], PRESS, true],
  ['dumbbell-press', 'ダンベルプレス', 'chest', 'dumbbell', 'weight_reps', 90, 'horizontal_push', ['chest'], PRESS, true],
  ['incline-dumbbell-press', 'インクラインダンベルプレス', 'chest', 'dumbbell', 'weight_reps', 90, 'horizontal_push', ['chest'], PRESS, true],
  ['dumbbell-fly', 'ダンベルフライ', 'chest', 'dumbbell', 'weight_reps', 60, 'chest_isolation', ['chest'], ['front_delt'], false],
  ['chest-press', 'チェストプレス', 'chest', 'machine', 'weight_reps', 90, 'horizontal_push', ['chest'], PRESS, true],
  ['pec-deck', 'ペックデック', 'chest', 'machine', 'weight_reps', 60, 'chest_isolation', ['chest'], ['front_delt'], false],
  ['cable-crossover', 'ケーブルクロスオーバー', 'chest', 'cable', 'weight_reps', 60, 'chest_isolation', ['chest'], ['front_delt'], false],
  ['dips', 'ディップス', 'chest', 'bodyweight', 'reps', 90, 'horizontal_push', ['chest', 'triceps'], ['front_delt'], true],
  ['push-up', '腕立て伏せ', 'chest', 'bodyweight', 'reps', 60, 'horizontal_push', ['chest'], PRESS, true],
  // 背中
  ['deadlift', 'デッドリフト', 'back', 'barbell', 'weight_reps', 180, 'hinge', ['hamstrings', 'glutes', 'back'], ['quads'], true],
  ['barbell-row', 'ベントオーバーロウ', 'back', 'barbell', 'weight_reps', 120, 'horizontal_pull', ['back'], ROW, true],
  ['one-arm-dumbbell-row', 'ワンハンドダンベルロウ', 'back', 'dumbbell', 'weight_reps', 90, 'horizontal_pull', ['back'], ROW, true],
  ['lat-pulldown', 'ラットプルダウン', 'back', 'machine', 'weight_reps', 90, 'vertical_pull', ['back'], ['biceps'], true],
  ['seated-cable-row', 'シーテッドロウ', 'back', 'cable', 'weight_reps', 90, 'horizontal_pull', ['back'], ROW, true],
  ['machine-row', 'マシンロウ', 'back', 'machine', 'weight_reps', 90, 'horizontal_pull', ['back'], ROW, true],
  ['t-bar-row', 'Tバーロウ', 'back', 'barbell', 'weight_reps', 90, 'horizontal_pull', ['back'], ROW, true],
  ['pull-up', '懸垂', 'back', 'bodyweight', 'reps', 120, 'vertical_pull', ['back'], ['biceps'], true],
  ['chin-up', '逆手懸垂', 'back', 'bodyweight', 'reps', 120, 'vertical_pull', ['back'], ['biceps'], true],
  ['back-extension', 'バックエクステンション', 'back', 'bodyweight', 'reps', 60, 'hinge', ['glutes', 'hamstrings'], ['back'], false],
  // 脚
  ['squat', 'スクワット', 'legs', 'barbell', 'weight_reps', 180, 'squat', ['quads', 'glutes'], ['hamstrings'], true],
  ['front-squat', 'フロントスクワット', 'legs', 'barbell', 'weight_reps', 180, 'squat', ['quads', 'glutes'], ['abs'], true],
  ['leg-press', 'レッグプレス', 'legs', 'machine', 'weight_reps', 120, 'squat', ['quads', 'glutes'], ['hamstrings'], true],
  ['romanian-deadlift', 'ルーマニアンデッドリフト', 'legs', 'barbell', 'weight_reps', 120, 'hinge', ['hamstrings', 'glutes'], ['back'], true],
  ['bulgarian-split-squat', 'ブルガリアンスクワット', 'legs', 'dumbbell', 'weight_reps', 90, 'single_leg', ['quads', 'glutes'], ['hamstrings'], true],
  ['lunge', 'ランジ', 'legs', 'dumbbell', 'weight_reps', 90, 'single_leg', ['quads', 'glutes'], ['hamstrings'], true],
  ['leg-extension', 'レッグエクステンション', 'legs', 'machine', 'weight_reps', 60, 'quad_isolation', ['quads'], [], false],
  ['leg-curl', 'レッグカール', 'legs', 'machine', 'weight_reps', 60, 'hamstring', ['hamstrings'], [], false],
  ['hip-thrust', 'ヒップスラスト', 'legs', 'barbell', 'weight_reps', 90, 'hinge', ['glutes'], ['hamstrings'], true],
  ['calf-raise', 'カーフレイズ', 'legs', 'machine', 'weight_reps', 60, 'calf', ['calves'], [], false],
  ['bodyweight-squat', '自重スクワット', 'legs', 'bodyweight', 'reps', 60, 'squat', ['quads', 'glutes'], ['hamstrings'], true],
  // 肩
  ['overhead-press', 'オーバーヘッドプレス', 'shoulders', 'barbell', 'weight_reps', 120, 'vertical_push', ['front_delt'], ['side_delt', 'triceps'], true],
  ['dumbbell-shoulder-press', 'ダンベルショルダープレス', 'shoulders', 'dumbbell', 'weight_reps', 90, 'vertical_push', ['front_delt'], ['side_delt', 'triceps'], true],
  ['shoulder-press-machine', 'ショルダープレスマシン', 'shoulders', 'machine', 'weight_reps', 90, 'vertical_push', ['front_delt'], ['side_delt', 'triceps'], true],
  ['side-raise', 'サイドレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60, 'side_delt', ['side_delt'], [], false],
  ['rear-raise', 'リアレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60, 'rear_delt', ['rear_delt'], ['back'], false],
  // 前肩の単関節。横肩の枠に入らないよう「上に押す」に分類する
  ['front-raise', 'フロントレイズ', 'shoulders', 'dumbbell', 'weight_reps', 60, 'vertical_push', ['front_delt'], ['side_delt'], false],
  ['face-pull', 'フェイスプル', 'shoulders', 'cable', 'weight_reps', 60, 'rear_delt', ['rear_delt'], ['back'], false],
  ['upright-row', 'アップライトロウ', 'shoulders', 'barbell', 'weight_reps', 60, 'side_delt', ['side_delt'], ['front_delt', 'biceps'], true],
  // 腕
  ['barbell-curl', 'バーベルカール', 'arms', 'barbell', 'weight_reps', 60, 'biceps', ['biceps'], [], false],
  ['dumbbell-curl', 'ダンベルカール', 'arms', 'dumbbell', 'weight_reps', 60, 'biceps', ['biceps'], [], false],
  ['hammer-curl', 'ハンマーカール', 'arms', 'dumbbell', 'weight_reps', 60, 'biceps', ['biceps'], [], false],
  ['preacher-curl', 'プリーチャーカール', 'arms', 'barbell', 'weight_reps', 60, 'biceps', ['biceps'], [], false],
  ['cable-curl', 'ケーブルカール', 'arms', 'cable', 'weight_reps', 60, 'biceps', ['biceps'], [], false],
  ['triceps-pushdown', 'トライセプスプッシュダウン', 'arms', 'cable', 'weight_reps', 60, 'triceps', ['triceps'], [], false],
  ['lying-triceps-extension', 'ライイングトライセプスエクステンション', 'arms', 'barbell', 'weight_reps', 60, 'triceps', ['triceps'], [], false],
  ['overhead-triceps-extension', 'オーバーヘッドトライセプスエクステンション', 'arms', 'dumbbell', 'weight_reps', 60, 'triceps', ['triceps'], [], false],
  ['close-grip-bench-press', 'ナローベンチプレス', 'arms', 'barbell', 'weight_reps', 90, 'triceps', ['triceps'], ['chest', 'front_delt'], true],
  // 腹
  ['crunch', 'クランチ', 'abs', 'bodyweight', 'reps', 45, 'core', ['abs'], [], false],
  ['leg-raise', 'レッグレイズ', 'abs', 'bodyweight', 'reps', 45, 'core', ['abs'], [], false],
  ['hanging-leg-raise', 'ハンギングレッグレイズ', 'abs', 'bodyweight', 'reps', 60, 'core', ['abs'], [], false],
  ['ab-roller', 'アブローラー', 'abs', 'other', 'reps', 60, 'core', ['abs'], [], false],
  ['cable-crunch', 'ケーブルクランチ', 'abs', 'cable', 'weight_reps', 60, 'core', ['abs'], [], false],
  ['plank', 'プランク', 'abs', 'bodyweight', 'time_distance', 45, 'core', ['abs'], [], false],
  ['side-plank', 'サイドプランク', 'abs', 'bodyweight', 'time_distance', 45, 'core', ['abs'], [], false],
  // 有酸素
  ['running', 'ランニング', 'cardio', 'other', 'time_distance', 0, 'cardio', ['quads'], ['hamstrings', 'glutes', 'calves'], true],
  ['treadmill', 'トレッドミル', 'cardio', 'machine', 'time_distance', 0, 'cardio', ['quads'], ['hamstrings', 'glutes', 'calves'], true],
  ['walking', 'ウォーキング', 'cardio', 'other', 'time_distance', 0, 'cardio', ['quads'], ['hamstrings', 'glutes', 'calves'], true],
  ['exercise-bike', 'エアロバイク', 'cardio', 'machine', 'time_distance', 0, 'cardio', ['quads'], ['hamstrings', 'glutes', 'calves'], true],
  ['rowing-machine', 'ローイングマシン', 'cardio', 'machine', 'time_distance', 0, 'cardio', ['back', 'quads'], ['biceps', 'hamstrings', 'glutes'], true],
  ['swimming', '水泳', 'cardio', 'other', 'time_distance', 0, 'cardio', ['back'], ['chest', 'front_delt', 'triceps'], true],
  ['jump-rope', '縄跳び', 'cardio', 'other', 'time_distance', 60, 'cardio', ['calves'], ['quads'], true],
  ['hiit', 'HIIT', 'cardio', 'other', 'time_distance', 60, 'cardio', ['quads'], ['glutes', 'hamstrings'], true],
]

/**
 * 初心者の目安の重さ（kg。ダンベルは片手あたり、ケーブルは片側あたり）。重量×回数の種目だけ（自重はなし）。
 * 記録もプロフィールの重量もないときに、刻み幅で丸めて使う（設計書「5. 重さの決め方」）
 */
const START_WEIGHTS: Record<string, number> = {
  // 胸
  'bench-press': 30, 'incline-bench-press': 25, 'dumbbell-press': 10, 'incline-dumbbell-press': 8, 'dumbbell-fly': 6,
  'chest-press': 20, 'pec-deck': 20, 'cable-crossover': 7.5,
  // 背中
  deadlift: 40, 'barbell-row': 30, 'one-arm-dumbbell-row': 12, 'lat-pulldown': 30, 'seated-cable-row': 30,
  'machine-row': 30, 't-bar-row': 20,
  // 脚
  squat: 30, 'front-squat': 25, 'leg-press': 60, 'romanian-deadlift': 30, 'bulgarian-split-squat': 6, lunge: 6,
  'leg-extension': 20, 'leg-curl': 15, 'hip-thrust': 30, 'calf-raise': 30,
  // 肩
  'overhead-press': 20, 'dumbbell-shoulder-press': 8, 'shoulder-press-machine': 15, 'side-raise': 4, 'rear-raise': 4,
  'front-raise': 4, 'face-pull': 10, 'upright-row': 15,
  // 腕
  'barbell-curl': 15, 'dumbbell-curl': 6, 'hammer-curl': 6, 'preacher-curl': 10, 'cable-curl': 10,
  'triceps-pushdown': 15, 'lying-triceps-extension': 15, 'overhead-triceps-extension': 8, 'close-grip-bench-press': 25,
  // 腹
  'cable-crunch': 15,
}

export function seedExercises(): Exercise[] {
  return ROWS.map(([id, name, bodyPart, equipment, logType, defaultRestSec, pattern, primary, secondary, compound]) => ({
    id: `ex-${id}`,
    name,
    bodyPart,
    equipment,
    logType,
    defaultRestSec,
    pattern,
    primary: [...primary],
    secondary: [...secondary],
    compound,
    ...(START_WEIGHTS[id] !== undefined ? { startWeight: START_WEIGHTS[id] } : {}),
    custom: false,
    createdAt: 0,
    updatedAt: 0,
    deleted: false,
  }))
}

/**
 * 定番種目に、後から足した情報を書き足す（名前などは変えない）。自作種目はそのまま。
 * - 動きの種類・部位・複数関節：動きの種類がまだない種目だけ
 * - 初心者の目安の重さ（startWeight）：まだない種目だけ（入っている値は変えない）
 * 書き足したときは true。DB の version 2・3 へのアップグレードと、古いバックアップの読み込みで使う。
 */
const SEED_BY_ID = new Map(seedExercises().map((e) => [e.id, e]))
export function backfillSeedMetadata(e: Exercise): boolean {
  const seed = SEED_BY_ID.get(e.id)
  if (e.custom || !seed) return false
  let changed = false
  if (e.pattern === undefined) {
    e.pattern = seed.pattern
    e.primary = [...(seed.primary ?? [])]
    e.secondary = [...(seed.secondary ?? [])]
    e.compound = seed.compound
    changed = true
  }
  if (e.startWeight === undefined && seed.startWeight !== undefined) {
    e.startWeight = seed.startWeight
    changed = true
  }
  return changed
}
