import type { Exercise, Experience, Goal, MovementPattern, Muscle } from '../db/types'
import type { SlotPlan } from './types'

/** 1セット＝休憩込みで約3分（設計書「2. 日ごとの枠」） */
export const MINUTES_PER_SET = 3
/** 1種目のセット数（設計書「3. 量・回数・休憩」） */
export const MIN_SLOT_SETS = 2
export const MAX_SLOT_SETS = 4
/** 複数関節の枠のはじめのセット数（単関節の枠は MIN_SLOT_SETS） */
export const COMPOUND_START_SETS = 3
/** ふくらはぎ・腹の枠のセット数の上限 */
export const MAX_SMALL_SLOT_SETS = 3

/**
 * 動きの種類ごとの代表的な部位。骨組みの段階（種目が決まる前）で
 * 部位ごとのセット数を見積もるのと、同じ部位の日を判定するのに使う。
 */
export const PATTERN_MUSCLES: Record<MovementPattern, { primary: Muscle[]; secondary: Muscle[] }> = {
  squat: { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  hinge: { primary: ['hamstrings', 'glutes'], secondary: ['back'] },
  single_leg: { primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  horizontal_push: { primary: ['chest'], secondary: ['triceps', 'front_delt'] },
  vertical_push: { primary: ['front_delt'], secondary: ['side_delt', 'triceps'] },
  horizontal_pull: { primary: ['back'], secondary: ['biceps', 'rear_delt'] },
  vertical_pull: { primary: ['back'], secondary: ['biceps'] },
  chest_isolation: { primary: ['chest'], secondary: ['front_delt'] },
  side_delt: { primary: ['side_delt'], secondary: [] },
  rear_delt: { primary: ['rear_delt'], secondary: ['back'] },
  biceps: { primary: ['biceps'], secondary: [] },
  triceps: { primary: ['triceps'], secondary: [] },
  hamstring: { primary: ['hamstrings'], secondary: [] },
  quad_isolation: { primary: ['quads'], secondary: [] },
  calf: { primary: ['calves'], secondary: [] },
  core: { primary: ['abs'], secondary: [] },
  cardio: { primary: [], secondary: [] },
}

const BEGINNER: Experience[] = ['none', 'under_1y']
export const isBeginner = (experience: Experience) => BEGINNER.includes(experience)

/**
 * 回数の幅と休憩（設計書「3. 量・回数・休憩」の表）
 * - 筋肥大：複数関節 6〜10回・2〜3分（150秒）／単関節 10〜15回・60〜90秒（75秒）
 * - 筋力アップ：メイン 3〜6回・3〜5分（240秒）、他の複数関節 6〜10回・2分／単関節 10〜12回・75秒
 * - 減量・健康維持：複数関節 8〜12回・90秒／単関節 12〜15回・60秒
 * - 初めて・1年未満：目標にかかわらず複数関節 8〜12回・単関節 10〜15回（休憩は目標の「メイン以外」の値）
 */
export function repScheme(
  goal: Goal, experience: Experience, compound: boolean, isMain: boolean,
): { repRange: [number, number]; restSec: number } {
  const beginner = isBeginner(experience)
  let r: { repRange: [number, number]; restSec: number }
  if (goal === 'hypertrophy') {
    r = compound ? { repRange: [6, 10], restSec: 150 } : { repRange: [10, 15], restSec: 75 }
  } else if (goal === 'strength') {
    if (!compound) r = { repRange: [10, 12], restSec: 75 }
    else if (isMain && !beginner) r = { repRange: [3, 6], restSec: 240 }
    else r = { repRange: [6, 10], restSec: 120 }
  } else {
    r = compound ? { repRange: [8, 12], restSec: 90 } : { repRange: [12, 15], restSec: 60 }
  }
  if (beginner) r = { ...r, repRange: compound ? [8, 12] : [10, 15] }
  return r
}

/** 部位ごとの週のセット数の目標（設計書「3. 量・回数・休憩」） */
export function weeklySetTarget(experience: Experience): [number, number] {
  if (isBeginner(experience)) return [8, 12]
  if (experience === 'y1_3') return [10, 16]
  return [12, 20]
}

/** 週のセット数の目標を半分にする小さい部位（ふくらはぎ・腹） */
export const SMALL_MUSCLES: readonly Muscle[] = ['calves', 'abs']
/** セットを足すときに先に見る大きい部位 */
export const LARGE_MUSCLES: readonly Muscle[] = ['chest', 'back', 'quads', 'hamstrings', 'glutes']

/** 部位ごとの週のセット数の目標。ふくらはぎ・腹は半分（切り上げ。例：初心者 8〜12 → 4〜6） */
export function muscleSetTarget(target: [number, number], muscle: Muscle): [number, number] {
  return SMALL_MUSCLES.includes(muscle) ? [Math.ceil(target[0] / 2), Math.ceil(target[1] / 2)] : target
}

/** ふくらはぎ・腹だけを主に使う枠か */
export function isSmallSlot(s: Pick<SlotPlan, 'patterns'>): boolean {
  const primary = PATTERN_MUSCLES[s.patterns[0]]?.primary ?? []
  return primary.length > 0 && primary.every((m) => SMALL_MUSCLES.includes(m))
}

/** 枠のセット数の上限（ふくらはぎ・腹は3、ほかは4） */
export const slotMaxSets = (s: Pick<SlotPlan, 'patterns'>) => (isSmallSlot(s) ? MAX_SMALL_SLOT_SETS : MAX_SLOT_SETS)

/** 枠のはじめのセット数（複数関節3、単関節2） */
export const startSets = (s: Pick<SlotPlan, 'compound'>) => (s.compound ? COMPOUND_START_SETS : MIN_SLOT_SETS)

/** 1日に入るセット数（1セット3分） */
export const maxSetsFor = (minutes: number) => Math.max(1, Math.floor(minutes / MINUTES_PER_SET))

/**
 * 1回の時間に収まるように削る（設計書「2. 日ごとの枠」「3. 量・回数・休憩」）。
 * 1. 単関節・ふくらはぎ・腹の枠のセット数を2まで減らす（ふくらはぎ・腹が先、後ろの枠が先）
 * 2. 複数関節の枠を3まで減らす。初心者だけはさらに2まで減らしてよい
 * 3. それでも収まらなければ後ろの枠から削る
 * 4. 最初の枠だけでも収まらないときは、その枠のセット数を減らす（最低1）
 */
export function fitToTime(slots: SlotPlan[], minutes: number, opts: { beginner?: boolean } = {}): SlotPlan[] {
  const max = maxSetsFor(minutes)
  const out = slots.map((s) => ({ ...s }))
  const total = () => out.reduce((a, s) => a + s.sets, 0)
  const floor = (s: SlotPlan) => (s.compound && !opts.beginner ? COMPOUND_START_SETS : MIN_SLOT_SETS)
  const rank = (s: SlotPlan) => (isSmallSlot(s) ? 0 : s.compound ? 2 : 1)
  while (total() > max) {
    const i = out
      .map((_, i) => i)
      .filter((i) => out[i].sets > floor(out[i]))
      .sort((a, b) => rank(out[a]) - rank(out[b]) || out[b].sets - out[a].sets || b - a)[0]
    if (i === undefined) break
    out[i].sets--
  }
  while (out.length > 1 && total() > max) out.pop()
  if (out.length === 1 && out[0].sets > max) out[0].sets = max
  return out
}

function addSets(acc: Partial<Record<Muscle, number>>, primary: Muscle[], secondary: Muscle[], sets: number) {
  for (const m of primary) acc[m] = (acc[m] ?? 0) + sets
  for (const m of secondary) acc[m] = (acc[m] ?? 0) + sets * 0.5
}

/**
 * 部位ごとのセット数（設計書「3. 量・回数・休憩」：主に使う部位1、補助0.5）。
 * 有酸素・部位の情報がない種目・知らない種目は数えない。
 */
export function countMuscleSets(
  exercises: { exerciseId: string; sets: number }[], catalog: Exercise[],
): Partial<Record<Muscle, number>> {
  const byId = new Map(catalog.map((e) => [e.id, e]))
  const acc: Partial<Record<Muscle, number>> = {}
  for (const x of exercises) {
    const e = byId.get(x.exerciseId)
    if (!e || e.pattern === 'cardio' || !e.primary) continue
    addSets(acc, e.primary, e.secondary ?? [], x.sets)
  }
  return acc
}

/** 骨組みの枠から部位ごとの週のセット数を見積もる（枠の最初の動きの代表的な部位で数える） */
export function estimateMuscleSets(slots: SlotPlan[]): Partial<Record<Muscle, number>> {
  const acc: Partial<Record<Muscle, number>> = {}
  for (const s of slots) {
    const pm = PATTERN_MUSCLES[s.patterns[0]]
    if (pm) addSets(acc, pm.primary, pm.secondary, s.sets)
  }
  return acc
}
