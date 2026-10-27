import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fakeAuthApi,
  flushPromises,
  installDomPolyfills,
  mountApp,
  restoreStubs,
  stubBackend,
} from '../../support/mount'
import type { Mounted } from '../../support/mount'
import type { AuthApi } from '@/lib/api/auth'
import { LOGIN_RETURN_KEY } from '@/lib/auth/loginReturn'

const loggedIn: Partial<AuthApi> = {
  fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: 'モンハン太郎' }),
}
const loggedOut: Partial<AuthApi> = {
  fetchCurrentUser: async () => ({ kind: 'unauthenticated' }),
}

describe('AuthControls（ヘッダーの認証の部品）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  beforeEach(() => stubBackend({ hang: true }))
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    sessionStorage.clear()
    document.body.innerHTML = ''
    restoreStubs()
  })

  const slot = () => document.querySelector('[data-slot="header-auth"]')!
  const loginLink = () => slot().querySelector<HTMLAnchorElement>('a')
  const toasts = () => document.body.textContent ?? ''
  const logoutButton = () =>
    Array.from(slot().querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'ログアウト',
    )!

  it('[11] 取得できないとき、部品を出さず、トーストも出さない', async () => {
    mounted = await mountApp({ authApi: fakeAuthApi() })
    expect(slot().children).toHaveLength(0)
    expect(toasts()).not.toContain('ログイン')
  })

  it('[12] 取得できなくても、ゲストの画面（護石）を従来どおり開ける', async () => {
    mounted = await mountApp({ authApi: fakeAuthApi(), path: '/charms' })
    expect(document.querySelector('main')).not.toBeNull()
    expect(document.title).toBe('護石 | SkillWeave')
  })

  it('[12] 未ログインでもゲストの画面が使え、ログインのリンクだけが出る', async () => {
    mounted = await mountApp({ authApi: fakeAuthApi(loggedOut), path: '/weapons' })
    expect(document.title).toBe('個体差のある武器 | SkillWeave')
    expect(loginLink()?.getAttribute('href')).toBe('/api/oauth2/authorization/discord')
    expect(loginLink()?.getAttribute('aria-label')).toBe('Discord でログイン')
  })

  it('[3] ログインのリンクを押すと今の画面を swv-login-return に覚える', async () => {
    mounted = await mountApp({ authApi: fakeAuthApi(loggedOut), path: '/charms' })
    const link = loginLink()!
    link.addEventListener('click', (e) => e.preventDefault())
    link.click()
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBe('/charms')
  })

  it('[3] 戻り先の記録があれば、ログイン後にその画面へ移り成功のトーストを出す', async () => {
    sessionStorage.setItem(LOGIN_RETURN_KEY, '/charms')
    mounted = await mountApp({ authApi: fakeAuthApi(loggedIn), path: '/' })
    await vi.waitFor(() => expect(document.title).toBe('護石 | SkillWeave'))
    expect(toasts()).toContain('Discord でログインしました')
    expect(sessionStorage.getItem(LOGIN_RETURN_KEY)).toBeNull()
  })

  it('[4] 戻り先の記録があって 401 なら、失敗のトーストを出す', async () => {
    sessionStorage.setItem(LOGIN_RETURN_KEY, '/weapons')
    mounted = await mountApp({ authApi: fakeAuthApi(loggedOut), path: '/' })
    await vi.waitFor(() => expect(toasts()).toContain('Discord でログインできませんでした'))
    expect(document.querySelector('[data-tone="destructive"]')).not.toBeNull()
  })

  it('[5] ログイン中は表示名とログアウトを出し、アバター画像は出さない', async () => {
    mounted = await mountApp({ authApi: fakeAuthApi(loggedIn) })
    expect(slot().textContent).toContain('ログイン中: ')
    expect(slot().textContent).toContain('モンハン太郎')
    expect(logoutButton()).toBeDefined()
    expect(slot().querySelector('img')).toBeNull()
    expect(
      slot().querySelector('[aria-label="アカウント（モンハン太郎）"]')?.getAttribute('title'),
    ).toBe('モンハン太郎')
  })

  it('[6] ログアウトすると未ログインの表示に戻り、画面は移らず、フォーカスがリンクへ移る', async () => {
    const logout = vi.fn(async () => true)
    mounted = await mountApp({
      authApi: fakeAuthApi({ ...loggedIn, logout }),
      path: '/charms',
    })
    logoutButton().click()
    await flushPromises()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(loginLink()).not.toBeNull()
    expect(document.activeElement).toBe(loginLink())
    expect(mounted.wrapper.vm.$router.currentRoute.value.fullPath).toBe('/charms')
    expect(toasts()).toContain('ログアウトしました')
  })

  it('[6] ログアウトに失敗するとログイン中のまま、ボタンを有効に戻し、失敗のトースト', async () => {
    mounted = await mountApp({
      authApi: fakeAuthApi({ ...loggedIn, logout: async () => false }),
    })
    logoutButton().click()
    await flushPromises()
    expect(logoutButton().disabled).toBe(false)
    expect(loginLink()).toBeNull()
    expect(toasts()).toContain('ログアウトできませんでした')
  })

  it('[6] 基準幅のアカウントのメニューから表示名を確認してログアウトできる', async () => {
    const logout = vi.fn(async () => true)
    mounted = await mountApp({ authApi: fakeAuthApi({ ...loggedIn, logout }) })
    const trigger = slot().querySelector<HTMLElement>('[aria-label="アカウント（モンハン太郎）"]')!
    trigger.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, button: 0, ctrlKey: false }),
    )
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())
    const menu = document.querySelector('[role="menu"]')!
    expect(menu.textContent).toContain('モンハン太郎')
    menu.querySelector<HTMLElement>('[role="menuitem"]')!.click()
    await vi.waitFor(() => expect(logout).toHaveBeenCalledTimes(1))
  })
})
