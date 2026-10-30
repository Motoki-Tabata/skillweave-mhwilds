import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { AuthApi } from '@/lib/api/auth'
import { useToastStore } from '@/stores/toast'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import { createMemoryWeaponsApi } from '../support/weaponsApi'
import type { MemoryWeaponsApi } from '../support/weaponsApi'
import { makeWeaponBundle, makeWeaponDictionary, storedWeapon } from '../support/weapons'
import {
  click,
  fakeAuthApi,
  installDomPolyfills,
  mountApp,
  restoreStubs,
  stubBackend,
  textOf,
} from '../support/mount'
import type { Mounted } from '../support/mount'

const loggedIn: Partial<AuthApi> = {
  fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: 'テスト' }),
}

const body = () => textOf(document.body)
const importButton = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    /アカウントに取り込む|取り込み中/.test(textOf(b)),
  ) ?? null
const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]')
const dialogButton = (text: string) =>
  Array.from(dialog()!.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => textOf(b) === text,
  )!

// 014 guest-draft-import: 端末内の個体差のある武器の取り込み操作
describe('WeaponsView（014: 取り込みの操作）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function open(options: { auth?: Partial<AuthApi>; device?: number } = {}) {
    stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() })
    const api: MemoryWeaponsApi = createMemoryWeaponsApi()
    const device = Array.from({ length: options.device ?? 0 }, (_, i) => storedWeapon(100 + i))
    const m = await mountApp({
      path: '/weapons',
      authApi: fakeAuthApi(options.auth),
      weaponsApi: api,
      weaponRepository: createMemoryWeaponRepository(device),
    })
    mounted = m
    await vi.waitFor(() => expect(m.weapons.status).not.toBe('loading'))
    await vi.waitFor(() => expect(m.master.status).toBe('ready'))
    await flushPromises()
    return { ...m, api }
  }

  // AC-1
  it('AC-1: ログイン中で端末内に1件以上あるときだけ、帯に「アカウントに取り込む」を出す', async () => {
    await open({ auth: loggedIn, device: 2 })
    expect(importButton()).not.toBeNull()
    mounted!.wrapper.unmount()
    document.body.innerHTML = ''
    await open({ auth: loggedIn, device: 0 })
    expect(importButton()).toBeNull()
    mounted!.wrapper.unmount()
    document.body.innerHTML = ''
    await open({ device: 2 })
    expect(importButton()).toBeNull()
  })

  // AC-2
  it('AC-2: 押すと件数と端末から消す旨を確認し、キャンセルでは送らず端末内も変えない', async () => {
    const m = await open({ auth: loggedIn, device: 2 })
    await click(importButton()!)
    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    expect(textOf(dialog())).toContain('個体差のある武器をアカウントに取り込みますか？')
    expect(textOf(dialog())).toContain(
      'この端末の個体差のある武器 2 件を、ログイン中のアカウントに取り込みます。',
    )
    expect(textOf(dialog())).toContain('この端末から消え')
    expect(m.api.calls.create).toBe(0)
    await click(dialogButton('キャンセル'))
    await vi.waitFor(() => expect(dialog()).toBeNull())
    await vi.waitFor(() => expect(document.activeElement).toBe(importButton()))
    expect(m.api.calls.create).toBe(0)
    expect(m.weapons.deviceWeaponCount).toBe(2)
    expect(body()).toContain('2 件残っています')
  })

  // AC-9, AC-10
  it('AC-10: 取り込み中は「取り込み中…」と aria-disabled で示し、重ねて受け付けない。終わると知らせて帯が消える', async () => {
    const m = await open({ auth: loggedIn, device: 2 })
    const release = m.api.hold('create')
    await click(importButton()!)
    await vi.waitFor(() => expect(dialog()).not.toBeNull())
    await click(dialogButton('取り込む'))
    await vi.waitFor(() => expect(textOf(importButton())).toContain('取り込み中…'))
    const busy = importButton()!
    expect(busy.getAttribute('aria-disabled')).toBe('true')
    expect(busy.disabled).toBe(false)
    expect(busy.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    await vi.waitFor(() => expect(document.activeElement).toBe(busy))
    expect(body()).toContain('2 件残っています')
    await click(busy)
    expect(dialog()).toBeNull()
    release()
    await vi.waitFor(() => expect(m.weapons.importing).toBe(false))
    await vi.waitFor(() => expect(importButton()).toBeNull())
    expect(m.api.calls.create).toBe(2)
    expect(useToastStore(m.pinia).items.map((i) => i.message)).toContain(
      '個体差のある武器を 2 件アカウントに取り込みました。',
    )
  })
})
