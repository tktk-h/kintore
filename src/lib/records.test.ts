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
