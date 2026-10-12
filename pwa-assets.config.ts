import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// 余白を白ではなくアプリの背景色で埋める（ホーム画面のアイコンに白い枠が出ないように）
const background = '#0b0b0d'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    apple: { sizes: [180], padding: 0, resizeOptions: { background } },
    maskable: { sizes: [512], padding: 0.1, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
})
