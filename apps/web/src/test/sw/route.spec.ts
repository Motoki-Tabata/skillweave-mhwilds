// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { classify } from '@/sw/route'
import { CONFIG, ORIGIN, req } from '../support/serviceWorker'

const nav = (path: string) => req(`${ORIGIN}${path}`, { mode: 'navigate' })
const get = (url: string) => req(url)

describe('classify（plan.md D6 の振り分け）', () => {
  it('AC-7: GET 以外は何もしない', () => {
    expect(classify(req(`${ORIGIN}/api/builds`, { method: 'POST' }), ORIGIN, CONFIG)).toBe('ignore')
    expect(classify(req(`${ORIGIN}/assets/main-1.js`, { method: 'POST' }), ORIGIN, CONFIG)).toBe(
      'ignore',
    )
  })

  it('AC-7: /api/ は GET もナビゲーションも何もしない', () => {
    expect(classify(get(`${ORIGIN}/api/auth/me`), ORIGIN, CONFIG)).toBe('ignore')
    expect(classify(nav('/api/auth/discord'), ORIGIN, CONFIG)).toBe('ignore')
  })

  it.each(['/', '/charms', '/builds/0190a1b2-0000-7000-8000-000000000000', '/s/abc123'])(
    'AC-3: ナビゲーションの %s は殻（/）を返す',
    (path) => {
      expect(classify(nav(path), ORIGIN, CONFIG)).toBe('shell')
    },
  )

  it('AC-7: 拡張子のあるナビゲーションは殻にしない（en の辞書は何もしない）', () => {
    expect(classify(nav('/master-2026.11.1.en.json'), ORIGIN, CONFIG)).toBe('ignore')
  })

  it('AC-4: 事前キャッシュの一覧にあるパスはクエリを除いて一致する', () => {
    expect(classify(get(`${ORIGIN}/master-2026.11.1.json`), ORIGIN, CONFIG)).toBe('precache')
    expect(classify(get(`${ORIGIN}/assets/main-1.js?x=1`), ORIGIN, CONFIG)).toBe('precache')
  })

  it('AC-7: 一覧に無い en の辞書は何もしない', () => {
    expect(classify(get(`${ORIGIN}/master-2026.11.1.en.json`), ORIGIN, CONFIG)).toBe('ignore')
  })

  it('AC-5: /tesseract/ のファイルは OCR の利用時キャッシュ', () => {
    expect(classify(get(`${ORIGIN}/tesseract/worker.min.js`), ORIGIN, CONFIG)).toBe('ocr')
    expect(classify(get(`${ORIGIN}/tesseract/lang/jpn.traineddata.gz`), ORIGIN, CONFIG)).toBe('ocr')
  })

  it('AC-5: hash を知らない /tesseract/ のファイルは何もしない', () => {
    expect(classify(get(`${ORIGIN}/tesseract/unknown.js`), ORIGIN, CONFIG)).toBe('ignore')
  })

  it('AC-6: Web フォントの 2 つのオリジンを振り分ける', () => {
    expect(classify(get('https://fonts.gstatic.com/s/a.woff2'), ORIGIN, CONFIG)).toBe(
      'fonts-static',
    )
    expect(classify(get('https://fonts.googleapis.com/css2?family=A'), ORIGIN, CONFIG)).toBe(
      'fonts-css',
    )
  })

  it('AC-7: ほかのオリジン・測定のページは何もしない', () => {
    expect(classify(get('https://example.com/a.js'), ORIGIN, CONFIG)).toBe('ignore')
    expect(classify(get(`${ORIGIN}/e2e/measure/charm-ocr/index.html`), ORIGIN, CONFIG)).toBe(
      'ignore',
    )
  })
})
