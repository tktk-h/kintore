# 筋トレ記録

iPhone のホーム画面に追加して使う、筋トレと体の記録アプリ（PWA）です。

- 予定メニューどおりに、セットのチェックボックスを押すだけで記録できる
- 前回の重量・回数が最初から入っていて、＋−ですぐ変えられる
- セットを終えると休憩タイマーが自動で始まる（音は鳴らさず、画面を光らせて知らせる）
- カレンダーで、日付ごとに鍛えた部位と、その日の記録をまとめて見られる
- 体重・体脂肪率・写真の記録、マイメニュー、バックアップ

データはすべて端末内（IndexedDB）に保存され、サーバーには送られません。

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
