export type Theme = 'dark' | 'light'

export const THEME_STORAGE_KEY = 'swv-theme'

/** 現在のテーマ（`<html>` の `dark` クラス。index.html の先行スクリプトが反映済み）。 */
export function currentTheme(root: HTMLElement = document.documentElement): Theme {
  return root.classList.contains('dark') ? 'dark' : 'light'
}

/** テーマを反映して `localStorage` に保存する。保存の失敗は握りつぶし、その場の切り替えは効かせる。 */
export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', theme === 'dark')
  try {
    globalThis.localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 保存できなくても切り替えは有効
  }
}

export function toggleTheme(root: HTMLElement = document.documentElement): Theme {
  const next: Theme = currentTheme(root) === 'dark' ? 'light' : 'dark'
  applyTheme(next, root)
  return next
}
