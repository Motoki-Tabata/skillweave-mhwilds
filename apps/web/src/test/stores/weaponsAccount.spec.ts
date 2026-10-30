import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import { accountWeapon, createMemoryWeaponsApi } from '../support/weaponsApi'
import { fakeAuthApi, flushPromises, loadStores, restoreStubs, stubBackend } from '../support/mount'
import {
  makePayload,
  makeWeaponBundle,
  makeWeaponDictionary,
  storedWeapon,
  weaponId,
} from '../support/weapons'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { AccountWeapon } from '@/lib/api/weapons'
import type { CurrentUserResult } from '@/lib/api/auth'
import type { StoredWeapon } from '@/lib/weapons/types'

const fresh = makePayload({ name: '新しい武器' })
const other = makePayload({ name: '別の端末の武器' })

const loggedIn = () =>
  fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: '狩人' }) })

describe('weapons ストア（アカウントの保存先）', () => {
  beforeEach(() => stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() }))
  afterEach(restoreStubs)

  async function setup(options: { server?: AccountWeapon[]; device?: StoredWeapon[] } = {}) {
    const api = createMemoryWeaponsApi(options.server ?? [])
    const device = createMemoryWeaponRepository(options.device ?? [])
    const stores = await loadStores(undefined, device, { authApi: loggedIn(), weaponsApi: api })
    const auth = useAuthStore(stores.pinia)
    const toasts = () => useToastStore(stores.pinia).items.map((i) => i.message)
    return { ...stores, api, device, auth, toasts }
  }

  // AC-1
  it('AC-1: ログイン中はアカウントの武器だけを一覧・候補にし、端末内の武器は件数だけ数える', async () => {
    const { weapons, device } = await setup({
      server: [accountWeapon(storedWeapon(2))],
      device: [storedWeapon(1), storedWeapon(3)],
    })
    await weapons.ensureLoaded()
    expect(weapons.source).toBe('account')
    expect(weapons.weapons.map((w) => w.id)).toEqual([weaponId(2)])
    expect(weapons.candidateCount).toBe(1)
    expect(weapons.deviceWeaponCount).toBe(2)
    expect(device.snapshot()).toHaveLength(2)
  })

  // AC-2
  it('AC-2: 登録は UUIDv7 を振ってサーバーに保存し、端末には書かない', async () => {
    const { weapons, api, device, toasts } = await setup({ device: [storedWeapon(1)] })
    await weapons.ensureLoaded()
    expect(await weapons.save(fresh)).toBe('saved')
    const [row] = api.snapshot()
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(row.schemaVersion).toBe(1)
    expect(row.payload).toEqual(fresh)
    expect(weapons.weapons[0].id).toBe(row.id)
    expect(device.snapshot()).toHaveLength(1)
    expect(toasts()).toHaveLength(1)
  })

  it('AC-2: 上書きは読んだ時点の行バージョンで送り、サーバーの応答で一覧を変える', async () => {
    const { weapons, api } = await setup({ server: [accountWeapon(storedWeapon(1), 4)] })
    await weapons.ensureLoaded()
    expect(await weapons.save(fresh, weapons.weapons[0])).toBe('saved')
    expect(api.snapshot()[0].version).toBe(5)
    expect(weapons.weapons[0].payload).toEqual(fresh)
  })

  it('AC-2: 削除はサーバーから消し、応答の間は deletingIds に入る', async () => {
    const { weapons, api } = await setup({
      server: [accountWeapon(storedWeapon(1)), accountWeapon(storedWeapon(2))],
    })
    await weapons.ensureLoaded()
    const release = api.hold('remove')
    const pending = weapons.remove(weaponId(2))
    expect(weapons.deletingIds).toEqual([weaponId(2)])
    release()
    expect(await pending).toBe('saved')
    expect(weapons.deletingIds).toEqual([])
    expect(api.snapshot().map((w) => w.id)).toEqual([weaponId(1)])
    expect(weapons.weapons.map((w) => w.id)).toEqual([weaponId(1)])
  })

  // AC-3
  it('AC-3: 認証の判定が終わるまで端末の一覧も読まず、未ログインなら端末を使う', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(9))])
    let resolveAuth: (r: CurrentUserResult) => void = () => {}
    const authApi = fakeAuthApi({
      fetchCurrentUser: () => new Promise<CurrentUserResult>((r) => (resolveAuth = r)),
    })
    const { weapons } = await loadStores(
      undefined,
      createMemoryWeaponRepository([storedWeapon(1)]),
      { authApi, weaponsApi: api },
    )
    const loaded = weapons.ensureLoaded()
    await flushPromises()
    expect(weapons.status).toBe('loading')
    expect(weapons.source).toBe('unknown')
    resolveAuth({ kind: 'unauthenticated' })
    await loaded
    expect(weapons.source).toBe('device')
    expect(weapons.weapons.map((w) => w.id)).toEqual([weaponId(1)])
    expect(api.calls.list).toBe(0)
  })

  it('AC-3: 認証状態を取得できないときも端末内の武器を使う', async () => {
    const api = createMemoryWeaponsApi([accountWeapon(storedWeapon(9))])
    const { weapons } = await loadStores(
      undefined,
      createMemoryWeaponRepository([storedWeapon(1)]),
      { weaponsApi: api },
    )
    await weapons.ensureLoaded()
    expect(weapons.source).toBe('device')
    expect(api.calls.list).toBe(0)
  })

  it('AC-3: ログアウトしたら、その場で端末内の武器に切り替える', async () => {
    const { weapons, auth } = await setup({
      server: [accountWeapon(storedWeapon(2))],
      device: [storedWeapon(1)],
    })
    await weapons.ensureLoaded()
    await auth.logout()
    await vi.waitFor(() => expect(weapons.status).toBe('ready'))
    expect(weapons.source).toBe('device')
    expect(weapons.weapons.map((w) => w.id)).toEqual([weaponId(1)])
  })

  // AC-8
  it('AC-8: 更新が 409 なら、知らせて、サーバーから読み直す', async () => {
    const { weapons, api, toasts } = await setup({ server: [accountWeapon(storedWeapon(1), 1)] })
    await weapons.ensureLoaded()
    const stale = weapons.weapons[0]
    api.seed(accountWeapon({ ...storedWeapon(1), payload: other }, 2))
    expect(await weapons.save(fresh, stale)).toBe('conflict')
    expect(toasts()).toEqual([
      'この個体差のある武器は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。',
    ])
    expect(weapons.status).toBe('ready')
    expect(weapons.weapons[0].payload).toEqual(other)
  })

  it('AC-8: 更新が 404 なら、別の端末で削除されたことを知らせて読み直す', async () => {
    const { weapons, api, toasts } = await setup({ server: [accountWeapon(storedWeapon(1))] })
    await weapons.ensureLoaded()
    const target = weapons.weapons[0]
    api.drop(weaponId(1))
    expect(await weapons.save(fresh, target)).toBe('notFound')
    expect(toasts()).toEqual([
      'この個体差のある武器は別の端末で削除されていたため、保存しませんでした。一覧を読み直しました。',
    ])
    expect(weapons.weapons).toEqual([])
  })

  // AC-12
  it('AC-12: 書き込みが 401 なら、未ログインにして端末に切り替え、トーストは1回だけ', async () => {
    const { weapons, auth, api, toasts } = await setup({
      server: [accountWeapon(storedWeapon(1))],
      device: [storedWeapon(7)],
    })
    await weapons.ensureLoaded()
    api.failWith('update', { kind: 'unauthorized' })
    api.failWith('remove', { kind: 'unauthorized' })
    const first = weapons.save(fresh, weapons.weapons[0])
    const second = weapons.remove(weaponId(1))
    expect(await first).toBe('expired')
    expect(await second).toBe('discarded')
    expect(auth.status).toBe('unauthenticated')
    await vi.waitFor(() => expect(weapons.status).toBe('ready'))
    expect(weapons.source).toBe('device')
    expect(weapons.weapons.map((w) => w.id)).toEqual([weaponId(7)])
    expect(toasts()).toEqual([
      'ログインの有効期限が切れたため、保存しませんでした。端末内の個体差のある武器に切り替えました。アカウントに保存するには、もう一度「Discord でログイン」を押してください。',
    ])
  })

  it('AC-12: 一覧の読み込みが 401 なら、読み込み用の文言で端末に切り替える', async () => {
    const { weapons, api, toasts } = await setup({ device: [storedWeapon(7)] })
    api.failWith('list', { kind: 'unauthorized' })
    await weapons.ensureLoaded()
    expect(weapons.source).toBe('device')
    expect(toasts()).toEqual([
      'ログインの有効期限が切れました。端末内の個体差のある武器に切り替えました。もう一度「Discord でログイン」を押すと、アカウントの個体差のある武器を使えます。',
    ])
  })

  it('AC-12: 一覧を取得できないときは読込失敗にし、再読み込みで回復する', async () => {
    const { weapons, api } = await setup({ server: [accountWeapon(storedWeapon(1))] })
    api.failWith('list', { kind: 'failed', cause: 'server' })
    await weapons.ensureLoaded()
    expect(weapons.status).toBe('failed')
    expect(weapons.source).toBe('account')
    expect(weapons.failureMessage).toBe('サーバーで処理できませんでした。')
    api.failWith('list', null)
    await weapons.reload()
    expect(weapons.status).toBe('ready')
    expect(weapons.weapons).toHaveLength(1)
  })

  it('AC-12: 保存・削除の失敗はトーストで知らせ、一覧を変えず、送り直さない', async () => {
    const { weapons, api, toasts } = await setup({ server: [accountWeapon(storedWeapon(1))] })
    await weapons.ensureLoaded()
    api.failWith('create', { kind: 'failed', cause: 'network' })
    api.failWith('remove', { kind: 'failed', cause: 'server' })
    expect(await weapons.save(fresh)).toBe('failed')
    expect(await weapons.remove(weaponId(1))).toBe('failed')
    expect(toasts()).toHaveLength(2)
    expect(weapons.weapons).toHaveLength(1)
    api.failWith('create', null)
    await flushPromises()
    expect(api.calls.create).toBe(1)
    expect(api.calls.remove).toBe(1)
    expect(api.snapshot()).toHaveLength(1)
  })
})

describe('conditions ストア: 一覧から消えた個体差のある武器の選択', () => {
  beforeEach(() => stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() }))
  afterEach(restoreStubs)

  async function setup(server: AccountWeapon[], device: StoredWeapon[]) {
    const api = createMemoryWeaponsApi(server)
    const stores = await loadStores(undefined, createMemoryWeaponRepository(device), {
      authApi: loggedIn(),
      weaponsApi: api,
    })
    await stores.weapons.ensureLoaded()
    return { ...stores, api, auth: useAuthStore(stores.pinia) }
  }

  // AC-5
  it('AC-5: ログアウトで一覧に無くなった武器の選択を外す', async () => {
    const { conditions, weapons, auth } = await setup([accountWeapon(storedWeapon(2))], [])
    conditions.selectCustomWeapon(weaponId(2))
    await auth.logout()
    await vi.waitFor(() => expect(weapons.source).toBe('device'))
    await vi.waitFor(() => expect(conditions.selection).toBeNull())
    expect(conditions.weaponErrorShown).toBe(false)
  })

  it('AC-5: 切り替え先にも同じ ID があれば、選択を残す', async () => {
    const { conditions, weapons, auth } = await setup(
      [accountWeapon(storedWeapon(2))],
      [storedWeapon(2)],
    )
    conditions.selectCustomWeapon(weaponId(2))
    await auth.logout()
    await vi.waitFor(() => expect(weapons.source).toBe('device'))
    await flushPromises()
    expect(conditions.selection).toEqual({ kind: 'custom', id: weaponId(2) })
  })

  it('AC-5: 読み直しで別の端末に削除されていたら外し、残っていれば外さない', async () => {
    const { conditions, weapons, api } = await setup(
      [accountWeapon(storedWeapon(1)), accountWeapon(storedWeapon(2))],
      [],
    )
    conditions.selectCustomWeapon(weaponId(2))
    await weapons.reload()
    expect(conditions.selection).toEqual({ kind: 'custom', id: weaponId(2) })
    api.drop(weaponId(2))
    await weapons.reload()
    await vi.waitFor(() => expect(conditions.selection).toBeNull())
  })

  it('AC-5: 一覧の読み直しの間（loading）は判定しない', async () => {
    const { conditions, weapons, api } = await setup([accountWeapon(storedWeapon(2))], [])
    conditions.selectCustomWeapon(weaponId(2))
    const release = api.hold('list')
    const pending = weapons.reload()
    await flushPromises()
    expect(weapons.status).toBe('loading')
    expect(conditions.selection).toEqual({ kind: 'custom', id: weaponId(2) })
    release()
    await pending
    expect(conditions.selection).toEqual({ kind: 'custom', id: weaponId(2) })
  })

  it('AC-5: 読み直しが失敗して一覧が空になったときも外す', async () => {
    const { conditions, weapons, api } = await setup([accountWeapon(storedWeapon(2))], [])
    conditions.selectCustomWeapon(weaponId(2))
    api.failWith('list', { kind: 'failed', cause: 'network' })
    await weapons.reload()
    expect(weapons.status).toBe('failed')
    await vi.waitFor(() => expect(conditions.selection).toBeNull())
  })

  it('AC-5: マスターの武器の選択は変えない', async () => {
    const { conditions, weapons, auth } = await setup([accountWeapon(storedWeapon(2))], [])
    const id = [...weapons.weapons][0].payload.baseWeaponId
    conditions.selectWeapon(id)
    await auth.logout()
    await vi.waitFor(() => expect(weapons.source).toBe('device'))
    await flushPromises()
    expect(conditions.selection).toEqual({ kind: 'master', weaponId: id })
  })
})
