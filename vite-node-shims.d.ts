// @types/node を入れていないので、vite.config.ts と api/ で使う Node の機能だけ型を書く
declare module 'node:child_process' {
  export function execSync(command: string, options?: { stdio?: unknown; encoding?: 'utf8' }): string
}
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string
}
// api/coach.ts（Vercel 関数）で使う分
declare module 'node:crypto' {
  export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean
}
