import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMemoryWeaponRepository } from '../support/weaponRepository'
import { accountWeapon, createMemoryWeaponsApi } from '../support/weaponsApi'
import { fakeAuthApi, loadStores, restoreStubs, stubBackend } from '../support/mount'
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
import type { StoredWeapon } from '@/lib/weapons/types'

const loggedIn = () =>
  fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: '狩人' }) })

// 014 guest-draft-import: 端末内の個体差のある武器のアカウントへの取り込み
describe('weapons ストア（端末内の武器の取り込み）', () => {
  beforeEach(() => stubBackend({ bundle: makeWeaponBundle(), dictionary: makeWeaponDictionary() }))
  afterEach(restoreStubs)

  async function setup(options: { server?: AccountWeapon[]; device?: StoredWeapon[] } = {}) {
    const api = createMemoryWeaponsApi(options.server ?? [])
    const device = createMemoryWeaponRepository(options.device ?? [])
    const stores = await loadStores(undefined, device, { authApi: loggedIn(), weaponsApi: api })
    const auth = useAuthStore(stores.pinia)
    const toasts = () => useToastStore(stores.pinia).items.map((i) => i.message)
    await stores.weapons.ensureLoaded()
    return { ...stores, api, device, auth, toasts }
  }

  const ids = (items: { id: string }[]) => items.map((i) => i.id)

  // AC-3・AC-4・AC-9
  it('AC-3: ID・内容・スキーマ版を変えずに昇順で1件ずつ送り、AC-4: 受け付けたものを端末から消す', async () => {
    const { weapons, api, device, toasts } = await setup({
      device: [storedWeapon(2, { name: 'b' }), storedWeapon(1, { name: 'a' })],
    })
    expect(api.calls.create).toBe(0)
    expect(await weapons.importFromDevice()).toBe('done')
    expect(api.createRequests).toEqual([
      { id: weaponId(1), payload: makePayload({ name: 'a' }), schemaVersion: 1 },
      { id: weaponId(2), payload: makePayload({ name: 'b' }), schemaVersion: 1 },
    ])
    expect(device.snapshot()).toEqual([])
    expect(toasts()).toEqual(['個体差のある武器を 2 件アカウントに取り込みました。'])
    expect(weapons.deviceWeaponCount).toBe(0)
    expect(ids(weapons.weapons)).toEqual([weaponId(2), weaponId(1)])
  })

  // AC-5
  it('AC-5: アカウントに同じ ID があるものは、送らずに端末から消し、取り込んだ数に数える', async () => {
    const { weapons, api, device, toasts } = await setup({
      server: [accountWeapon(storedWeapon(1))],
      device: [storedWeapon(1), storedWeapon(2)],
    })
    expect(await weapons.importFromDevice()).toBe('done')
    expect(api.createRequests.map((r) => r.id)).toEqual([weaponId(2)])
    expect(device.snapshot()).toEqual([])
    expect(toasts()).toEqual(['個体差のある武器を 2 件アカウントに取り込みました。'])
  })

  // AC-6
  it.each([
    ['400', { kind: 'badRequest' } as const],
    ['409', { kind: 'conflict' } as const],
  ])('AC-6: %s の1件を端末に残し、次の1件へ進む', async (_label, failure) => {
    const { weapons, api, device, toasts } = await setup({
      device: [storedWeapon(1), storedWeapon(2), storedWeapon(3)],
    })
    api.failCreateOf(weaponId(2), failure)
    expect(await weapons.importFromDevice()).toBe('partial')
    expect(api.createRequests).toHaveLength(3)
    expect(ids(device.snapshot())).toEqual([weaponId(2)])
    expect(toasts()).toEqual([
      '個体差のある武器の取り込みが終わりました。取り込んだのは 2 件で、1 件はアカウントに保存できなかったため、この端末に残しています。',
    ])
  })

  // AC-7
  it('AC-7: 作成が 401 なら止め、期限切れを知らせ、端末の一覧に切り替える', async () => {
    const { weapons, api, device, auth, toasts } = await setup({
      device: [storedWeapon(1), storedWeapon(2)],
    })
    api.failCreateOf(weaponId(2), { kind: 'unauthorized' })
    expect(await weapons.importFromDevice()).toBe('expired')
    expect(ids(device.snapshot())).toEqual([weaponId(2)])
    expect(auth.status).toBe('unauthenticated')
    expect(weapons.source).toBe('device')
    expect(ids(weapons.weapons)).toEqual([weaponId(2)])
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]).toContain(
      '取り込みを止めました。取り込んだのは 1 件で、1 件はこの端末に残しています。',
    )
  })

  // AC-8
  it('AC-8: 通信の失敗で止め、失敗した1件と残りを端末に残し、送り直さない', async () => {
    const { weapons, api, device, toasts } = await setup({
      device: [storedWeapon(1), storedWeapon(2), storedWeapon(3)],
    })
    api.failCreateOf(weaponId(2), { kind: 'failed', cause: 'network' })
    expect(await weapons.importFromDevice()).toBe('stopped')
    expect(api.createRequests).toHaveLength(2)
    expect(ids(device.snapshot())).toEqual([weaponId(2), weaponId(3)])
    expect(toasts()[0]).toContain(
      'サーバーに接続できませんでした。 取り込んだのは 1 件で、2 件はこの端末に残しています。',
    )
    expect(weapons.deviceWeaponCount).toBe(2)
  })
})
