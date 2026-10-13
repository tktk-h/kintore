// @vitest-environment node
import { describe, expect, it } from 'vitest'

/**
 * Vercel の Node 関数は ESM をバンドルせずに動かすので、拡張子のない相対 import は解決できない。
 * api/ の中の相対 import はすべて .js をつける。
 */
const sources = import.meta.glob(['./**/*.ts', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>

describe('api/ の import', () => {
  it('相対 import には .js の拡張子がついている', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    const bad: string[] = []
    for (const [file, text] of Object.entries(sources)) {
      for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
        if (!m[1].endsWith('.js')) bad.push(`${file}: ${m[1]}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('api/ から src/ や Node 専用の型の置き換えに頼らない', () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text, file).not.toMatch(/from\s+['"](\.\.\/)+src\//)
      expect(text, file).not.toMatch(/from\s+['"]node:/)
    }
  })

  it('schema.ts は何も import しない（ブラウザとサーバーの両方で使う）', () => {
    expect(sources['./_lib/schema.ts']).not.toMatch(/^\s*import\s/m)
  })
})
