# 筋トレ記録

iPhone のホーム画面に追加して使う、筋トレと体の記録アプリ（PWA）です。

- 予定メニューどおりに、セットのチェックボックスを押すだけで記録できる
- 前回の重量・回数が最初から入っていて、＋−ですぐ変えられる
- セットを終えると休憩タイマーが自動で始まる（音は鳴らさず、画面を光らせて知らせる）
- カレンダーで、日付ごとに鍛えた部位と、その日の記録をまとめて見られる
- 体重・体脂肪率・写真の記録、マイメニュー、バックアップ

- AIコーチ：プロフィールと記録から1週間分のメニュー案を作り、重さもアプリが計算する

記録はすべて端末内（IndexedDB）に保存されます。サーバーに送るのは、AIコーチに相談したときの内容（プロフィール・直近の記録の要約・チャット）だけで、サーバーは保存せずに Gemini へ中継します。

## 技術

React 19 / TypeScript / Vite / vite-plugin-pwa / Dexie.js / React Router / Vitest

## 開発

```bash
npm install
npm run dev     # 開発サーバー
npm test        # テスト
npm run build   # ビルド
```

設計と計画は `docs/superpowers/` にあります。

## 公開（Vercel）

Vercel で公開しています（`main` への push で自動デプロイ）。GitHub Actions（`.github/workflows/ci.yml`）はテストとビルドだけを確かめます。

- 画面は `dist/` の静的ファイル（ハッシュでの画面遷移なので、書き換えの設定は不要）。PWA はサイトのルート（`/`）で動く
- `api/coach.ts` が AIコーチのサーバー（Vercel 関数・Node.js）。実行時間の上限は60秒（`vercel.json`）
- Vercel の環境変数
  - `GEMINI_API_KEY`：Google AI Studio の APIキー（チャットやリポジトリには書かない）
  - `COACH_PASSCODE`：合言葉。アプリの設定に同じものを入れる（日本語も使える）
  - `GEMINI_MODEL`（任意）：既定は `gemini-2.5-flash`
  - `GEMINI_THINKING_BUDGET`（任意）：考える量。既定は 1024、`off` で送らない
- GitHub Pages から引っ越すときは、古いURLの設定画面でバックアップを書き出し、新しいURLの設定画面で読み込んでから、ホーム画面に追加し直す
