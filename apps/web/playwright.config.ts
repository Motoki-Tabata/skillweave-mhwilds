import { defineConfig, devices } from '@playwright/test'

// e2e（*.spec.ts）と測定（*.measure.ts）の2プロジェクト。測定は CI では実行しない。
// API・DB は起動しない。ビルドした web を vite preview で配信する。
export default defineConfig({
  testDir: './e2e',
  forbidOnly: !!process.env.CI,
  // flake を隠さないため再実行しない。
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'e2e', testMatch: '**/*.spec.ts', use: { ...devices['Desktop Chrome'] } },
    { name: 'measure', testMatch: '**/*.measure.ts', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm run build && pnpm run preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // 護石の OCR の測定用ページ（e2e/measure/charm-ocr）をビルドの入力に足す。
    env: { SWV_OCR_MEASURE: '1' },
  },
})
