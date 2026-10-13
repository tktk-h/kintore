/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// @types/node を入れていないので、使う分だけ型を書く
declare const process: { env: Record<string, string | undefined> }

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

/** ビルドしたコミット（短い形）。Vercel では VERCEL_GIT_COMMIT_SHA、GitHub Actions では GITHUB_SHA、手元では git から。分からなければ空 */
function gitCommit(): string {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA
  if (sha) return sha.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

export default defineConfig({
  // 相対パスにしておくと、Vercel のルート（/）でもサブパスでも動く。PWA の start_url・scope も manifest からの相対で / になる
  base: './',
  // アプリが更新されたか分かるように、バージョンとビルド日時を埋め込む（テストでも使える）
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __COMMIT__: JSON.stringify(gitCommit()),
  },
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
        background_color: '#0b0b0d',
        theme_color: '#0b0b0d',
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
    // jsdom の画面テストは PC の負荷で遅くなることがあるため、既定の 5 秒より長めにする
    testTimeout: 15000,
    // 並列を増やしすぎると jsdom の画面テストが互いに遅くなる（1本が10秒を超えることがあった）ので4つまで。
    // 4つにすると全体も速くなった（約70秒 → 約50秒）。pool: 'vmThreads' は速くならず、不安定だったので使わない
    maxWorkers: 4,
  },
})
