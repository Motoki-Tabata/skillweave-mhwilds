import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { AuthApi } from '@/lib/api/auth'
import { useToastStore } from '@/stores/toast'
import { accountWeapon, createMemoryWeaponsApi } from '../support/weaponsApi'
import type { MemoryWeaponsApi } from '../support/weaponsApi'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import { makeWeaponBundle, makeWeaponDictionary, storedWeapon, weaponId } from '../support/weapons'
import {
  click,
  fakeAuthApi,
  findButton,
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
const rows = () => Array.from(document.querySelectorAll<HTMLElement>('[data-weapon-id]'))
const editButton = (id: string) => document.querySelector<HTMLElement>(`[data-edit-id="${id}"]`)!
const deleteButton = (id: string) =>
  document.querySelector<HTMLButtonElement>(`[data-delete-id="${id}"]`)!
const heading = () =>
  Array.from(document.querySelectorAll<HTMLElement>('h2')).find((h) =>
    textOf(h).startsWith('登録済みの武器'),
  )!
const dialog = () => document.querySelector<HTMLElement>('[role="alertdialog"]')
const toasts = (m: Mounted) => useToastStore(m.pinia).items.map((item) => item.message)
const SLOW = 20000

describe('WeaponsView（013: 保存先・競合・期限切れ）', () => {
  let mounted: Mounted | null = null

  beforeAll(installDomPolyfills)
  afterEach(() => {
    mounted?.wrapper.unmount()
    mounted = null
    restoreStubs()
    document.body.innerHTML = ''
  })

  async function open(
    options: { auth?: Partial<AuthApi>; api?: MemoryWeaponsApi; device?: number } = {},
  ): Promise<Mounted & { api: MemoryWeaponsApi }> {
    stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() })
    const api = options.api ?? createMemoryWeaponsApi()
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

  // AC-4
  it(
    'AC-4: ログイン中は「保存先: アカウント」、未ログインは「保存先: この端末」を出す',
    async () => {
      await open({ auth: loggedIn })
      expect(body()).toContain('保存先: アカウント')
      mounted!.wrapper.unmount()
      document.body.innerHTML = ''
      await open()
      expect(body()).toContain('保存先: この端末')
      expect(body()).not.toContain('保存先: アカウント')
    },
    SLOW,
  )

  // AC-4
  it(
    'AC-4: ログイン中に端末内の武器が残っていれば件数つきの帯を出す。0件・未ログインでは出さない',
    async () => {
      await open({ auth: loggedIn, device: 3 })
      expect(body()).toContain(
        'この端末には、ログインしていないときに登録した個体差のある武器が 3 件残っています。ログインしている間は表示せず、検索にも使いません。ログアウトすると、ふたたび表示します。',
      )
      mounted!.wrapper.unmount()
      document.body.innerHTML = ''
      await open({ auth: loggedIn, device: 0 })
      expect(body()).not.toContain('件残っています')
      mounted!.wrapper.unmount()
      document.body.innerHTML = ''
      await open({ device: 3 })
      expect(body()).not.toContain('件残っています')
    },
    SLOW,
  )

  // AC-1
  it('AC-1: ログイン中の一覧と検索の候補はアカウントの武器だけで、端末内の武器は出さない', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    const m = await open({ auth: loggedIn, api, device: 2 })
    expect(rows().map((r) => r.dataset.weaponId)).toEqual([weaponId(1)])
    expect(body()).toContain('登録済みの武器（1）')
    expect(m.weapons.candidateCount).toBe(1)
  })

  // AC-3
  it('AC-3: ログアウトすると、画面を移らずに端末内の武器と「この端末」に切り替わる', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    const m = await open({ auth: loggedIn, api, device: 2 })
    const path = m.wrapper.vm.$router.currentRoute.value.fullPath
    await click(findButton('ログアウト'))
    await vi.waitFor(() => expect(m.weapons.source).toBe('device'))
    await vi.waitFor(() => expect(rows()).toHaveLength(2))
    expect(m.wrapper.vm.$router.currentRoute.value.fullPath).toBe(path)
    expect(body()).toContain('保存先: この端末')
    expect(body()).not.toContain('件残っています')
  })

  // AC-3
  it('AC-3: ログアウトで、編集のモードは登録のモードに戻る', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    await open({ auth: loggedIn, api })
    await click(editButton(weaponId(1)))
    expect(body()).toContain('武器を編集')
    await click(findButton('ログアウト'))
    await vi.waitFor(() => expect(body()).toContain('武器を登録'))
    expect(body()).not.toContain('武器を編集')
  })

  // AC-12
  it('AC-12: ログイン中に一覧を取得できないとき、原因・再読み込み・フォームの無効化を出し、再読み込みで回復する', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    api.failWith('list', { kind: 'failed', cause: 'network' })
    const m = await open({ auth: loggedIn, api })
    expect(m.weapons.status).toBe('failed')
    expect(body()).toContain('個体差のある武器を読み込めません')
    expect(body()).toContain('サーバーに接続できませんでした。')
    expect(body()).toContain(
      '通信の状態を確かめて、「再読み込み」を押してください。通常の武器での検索は引き続き使えます。',
    )
    expect(body()).toContain(
      '個体差のある武器を読み込めないため、個体差のある武器を登録できません。',
    )
    expect(body()).toContain('保存先: アカウント')
    api.failWith('list', null)
    await click(findButton('再読み込み'))
    await vi.waitFor(() => expect(rows()).toHaveLength(1))
  })

  // AC-12
  it('AC-12: 保存・削除の失敗はトーストで知らせ、一覧を変えず、送り直さない', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    const m = await open({ auth: loggedIn, api })
    api.failWith('remove', { kind: 'failed', cause: 'server' })
    await click(deleteButton(weaponId(1)))
    await click(findButton('削除', dialog()!))
    await vi.waitFor(() =>
      expect(toasts(m)).toContain(
        '個体差のある武器を削除できませんでした。サーバーで処理できませんでした。 もう一度お試しください。',
      ),
    )
    expect(rows()).toHaveLength(1)
    expect(api.calls.remove).toBe(1)
    expect(deleteButton(weaponId(1)).disabled).toBe(false)
  })

  // AC-8
  it('AC-8: 更新が 409 のとき、知らせて読み直し、登録のモードに戻して「編集」にフォーカスを移す', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    const m = await open({ auth: loggedIn, api })
    await click(editButton(weaponId(1)))
    api.seed(accountWeapon(storedWeapon(1, { attack: 250 }), 5))
    await click(findButton('保存'))
    await vi.waitFor(() =>
      expect(toasts(m)).toContain(
        'この個体差のある武器は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。',
      ),
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(editButton(weaponId(1))))
    expect(body()).toContain('武器を登録')
    expect(body()).not.toContain('武器を編集')
    expect(api.calls.list).toBe(2)
    expect(textOf(rows()[0])).toContain('250')
  })

  // AC-8
  it('AC-8: 更新が 404 のとき、知らせて読み直し、登録のモードに戻して一覧の見出しにフォーカスを移す', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    const m = await open({ auth: loggedIn, api })
    await click(editButton(weaponId(1)))
    api.drop(weaponId(1))
    await click(findButton('保存'))
    await vi.waitFor(() =>
      expect(toasts(m)).toContain(
        'この個体差のある武器は別の端末で削除されていたため、保存しませんでした。一覧を読み直しました。',
      ),
    )
    await vi.waitFor(() => expect(document.activeElement).toBe(heading()))
    expect(rows()).toHaveLength(0)
    expect(body()).not.toContain('武器を編集')
  })

  // AC-12
  it('AC-12: 更新が 401 のとき、期限切れを知らせ、端末内の武器に切り替えて編集のモードを終える', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    const m = await open({ auth: loggedIn, api, device: 1 })
    await click(editButton(weaponId(1)))
    api.failWith('update', { kind: 'unauthorized' })
    await click(findButton('保存'))
    await vi.waitFor(() =>
      expect(toasts(m)).toContain(
        'ログインの有効期限が切れたため、保存しませんでした。端末内の個体差のある武器に切り替えました。アカウントに保存するには、もう一度「Discord でログイン」を押してください。',
      ),
    )
    await vi.waitFor(() => expect(m.weapons.source).toBe('device'))
    await vi.waitFor(() => expect(m.weapons.status).toBe('ready'))
    expect(api.calls.update).toBe(1)
    expect(body()).toContain('保存先: この端末')
    expect(body()).toContain('Discord でログイン')
    expect(body()).not.toContain('武器を編集')
    expect(rows()).toHaveLength(1)
  })

  // AC-12
  it('AC-12: 削除が 401 のとき、端末内の武器に切り替え、フォーカスを一覧の見出しに移す', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    const m = await open({ auth: loggedIn, api, device: 2 })
    api.failWith('remove', { kind: 'unauthorized' })
    await click(deleteButton(weaponId(1)))
    await click(findButton('削除', dialog()!))
    await vi.waitFor(() => expect(m.weapons.source).toBe('device'))
    await vi.waitFor(() => expect(rows()).toHaveLength(2))
    expect(toasts(m).filter((t) => t.startsWith('ログインの有効期限'))).toHaveLength(1)
    await vi.waitFor(() => expect(document.activeElement).toBe(heading()))
  })

  // AC-1（削除の確認と削除中の表示）
  it('ログイン中の削除の確認に「ほかの端末からも消えます」を足し、応答待ちの行を「削除中…」にする', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(1))])
    await open({ auth: loggedIn, api })
    const release = api.hold('remove')
    await click(deleteButton(weaponId(1)))
    expect(body()).toContain('削除すると元に戻せません。同じアカウントのほかの端末からも消えます。')
    await click(findButton('削除', dialog()!))
    await vi.waitFor(() => expect(deleteButton(weaponId(1)).disabled).toBe(true))
    expect(textOf(deleteButton(weaponId(1)))).toBe('削除中…')
    expect(deleteButton(weaponId(1)).getAttribute('aria-label')).toContain('を削除中')
    expect(editButton(weaponId(1)).hasAttribute('disabled')).toBe(true)
    release()
    await vi.waitFor(() => expect(rows()).toHaveLength(0))
  })

  // AC-3
  it('未ログインの削除の確認には、ほかの端末の文を足さない', async () => {
    await open({ device: 1 })
    await click(deleteButton(weaponId(100)))
    expect(body()).toContain('削除すると元に戻せません。')
    expect(body()).not.toContain('ほかの端末からも消えます')
  })
})
