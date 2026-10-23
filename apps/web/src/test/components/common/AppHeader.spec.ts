import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { installDomPolyfills, mountReadyApp, restoreStubs, stubBackend } from '../../support/mount'
import type { Mounted } from '../../support/mount'

// 受入基準 14（ヘッダーのテーマの切り替え）
describe('AppHeader（テーマの切り替え）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  beforeEach(() => {
    stubBackend()
    document.documentElement.classList.add('dark')
  })
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    document.documentElement.classList.remove('dark')
    localStorage.clear()
    restoreStubs()
  })

  const button = () => document.querySelector<HTMLButtonElement>('header button')!

  it('ダークのとき「ライトテーマに切り替える」。押すとライトにして swv-theme に保存する', async () => {
    mounted = await mountReadyApp()
    expect(button().getAttribute('aria-label')).toBe('ライトテーマに切り替える')
    expect(button().getAttribute('title')).toBe('ライトテーマに切り替える')
    button().click()
    await flushPromises()
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('swv-theme')).toBe('light')
    expect(button().getAttribute('aria-label')).toBe('ダークテーマに切り替える')
  })

  it('もう一度押すとダークに戻して保存する', async () => {
    mounted = await mountReadyApp()
    button().click()
    await flushPromises()
    button().click()
    await flushPromises()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('swv-theme')).toBe('dark')
    expect(button().getAttribute('aria-label')).toBe('ライトテーマに切り替える')
  })
})
