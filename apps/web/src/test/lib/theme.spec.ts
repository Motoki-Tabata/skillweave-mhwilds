import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, currentTheme, THEME_STORAGE_KEY, toggleTheme } from '@/lib/theme'

// 受入基準 14（ダーク・ライトの切り替えと localStorage への保存）
describe('theme', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('dark クラスがあればダーク、無ければライト（OS の設定は見ない）', () => {
    expect(currentTheme()).toBe('light')
    document.documentElement.classList.add('dark')
    expect(currentTheme()).toBe('dark')
  })

  it('切り替えるとクラスを付け外しし、swv-theme に保存する', () => {
    document.documentElement.classList.add('dark')
    expect(toggleTheme()).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(toggleTheme()).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('swv-theme')).toBe('dark')
  })

  it('localStorage が失敗しても、その場の切り替えは効く', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(() => applyTheme('dark')).not.toThrow()
    expect(currentTheme()).toBe('dark')
  })
})
