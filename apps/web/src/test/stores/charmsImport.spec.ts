import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sk, makeTableBundle } from '../support/fixtures'
import { createMemoryCharmRepository } from '../support/charmRepository'
import { charmId, storedCharm } from '../support/charms'
import { accountCharm, createMemoryCharmsApi } from '../support/charmsApi'
import { fakeAuthApi, loadStores, restoreStubs, stubBackend } from '../support/mount'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'
import type { AccountCharm } from '@/lib/api/charms'
import type { StoredCharm } from '@/lib/charms/storage'
import type { CharmPayload } from '@/lib/charms/types'

const payload: CharmPayload = {
  rarity: 8,
  skills: [{ skillId: sk('a1'), level: 2 }],
  slots: [{ target: 'weapon', level: 1 }],
}

const loggedIn = () =>
  fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: '狩人' }) })

// 014 guest-draft-import: 端末内の護石のアカウントへの取り込み
describe('charms ストア（端末内の護石の取り込み）', () => {
  beforeEach(() => stubBackend({ bundle: makeTableBundle() }))
  afterEach(restoreStubs)

  async function setup(options: { server?: AccountCharm[]; device?: StoredCharm[] } = {}) {
    const api = createMemoryCharmsApi(options.server ?? [])
    const device = createMemoryCharmRepository(options.device ?? [])
    const stores = await loadStores(device, undefined, { authApi: loggedIn(), charmsApi: api })
    const auth = useAuthStore(stores.pinia)
    const toasts = () => useToastStore(stores.pinia).items.map((i) => i.message)
    const toastTones = () => useToastStore(stores.pinia).items.map((i) => i.tone)
    await stores.charms.ensureLoaded()
    return { ...stores, api, device, auth, toasts, toastTones }
  }

  const ids = (items: { id: string }[]) => items.map((i) => i.id)

  // AC-3
  it('AC-3: 取り込みを承認するまで送らない（ログインの判定だけでは作成を呼ばない）', async () => {
    const { api } = await setup({ device: [storedCharm(1, payload)] })
    expect(api.calls.create).toBe(0)
  })

  it('AC-3: ID・内容・スキーマ版を変えずに、ID の昇順で1件ずつ送る', async () => {
    const { charms, api, device } = await setup({
      device: [storedCharm(3, payload), storedCharm(1, payload), storedCharm(2, payload)],
    })
    expect(await charms.importFromDevice()).toBe('done')
    expect(api.createRequests).toEqual(
      [1, 2, 3].map((n) => ({
        id: charmId(n),
        payload,
        schemaVersion: 1,
      })),
    )
    expect(device.snapshot()).toEqual([])
  })

  it('AC-3: マスターとの照合の結果で送るものを選ばない（レベル超過も送る）', async () => {
    const overLevel: CharmPayload = { ...payload, skills: [{ skillId: sk('a1'), level: 9 }] }
    const { charms, api } = await setup({ device: [storedCharm(1, overLevel)] })
    await charms.importFromDevice()
    expect(api.createRequests.map((r) => r.id)).toEqual([charmId(1)])
  })

  // AC-4
  it('AC-4: 受け付けた1件だけを端末から消し、取り込んだ数に数える', async () => {
    const { charms, api, device, toasts } = await setup({
      device: [storedCharm(1, payload), storedCharm(2, payload)],
    })
    api.failCreateOf(charmId(2), { kind: 'badRequest' })
    await charms.importFromDevice()
    expect(ids(api.snapshot())).toEqual([charmId(1)])
    expect(ids(device.snapshot())).toEqual([charmId(2)])
    expect(toasts()[0]).toContain('取り込んだのは 1 件で、1 件はアカウントに保存できなかった')
  })

  it('AC-4: 受け付けたが端末から消せなかったときも、取り込んだ数に数える', async () => {
    const { charms, device, toasts } = await setup({ device: [storedCharm(1, payload)] })
    device.failWith('delete', 'unknown')
    expect(await charms.importFromDevice()).toBe('done')
    expect(toasts()).toEqual(['護石を 1 件アカウントに取り込みました。'])
    expect(device.snapshot()).toHaveLength(1)
  })

  // AC-5
  it('AC-5: アカウントに同じ ID があるものは、送らずに端末から消し、取り込んだ数に数える', async () => {
    const { charms, api, device, toasts } = await setup({
      server: [accountCharm(storedCharm(1, payload))],
      device: [storedCharm(1, payload), storedCharm(2, payload)],
    })
    expect(await charms.importFromDevice()).toBe('done')
    expect(api.createRequests.map((r) => r.id)).toEqual([charmId(2)])
    expect(device.snapshot()).toEqual([])
    expect(toasts()).toEqual(['護石を 2 件アカウントに取り込みました。'])
  })

  // AC-6
  it.each([
    ['400', { kind: 'badRequest' } as const],
    ['409', { kind: 'conflict' } as const],
  ])('AC-6: %s の1件を端末に残し、次の1件へ進む', async (_label, failure) => {
    const { charms, api, device, toasts, toastTones } = await setup({
      device: [storedCharm(1, payload), storedCharm(2, payload), storedCharm(3, payload)],
    })
    api.failCreateOf(charmId(2), failure)
    expect(await charms.importFromDevice()).toBe('partial')
    expect(api.createRequests).toHaveLength(3)
    expect(ids(device.snapshot())).toEqual([charmId(2)])
    expect(toasts()).toEqual([
      '護石の取り込みが終わりました。取り込んだのは 2 件で、1 件はアカウントに保存できなかったため、この端末に残しています。',
    ])
    expect(toastTones()).toEqual(['destructive'])
  })

  // AC-7
  it('AC-7: 作成が 401 なら止め、期限切れを知らせ、未ログインにして端末の一覧に切り替える', async () => {
    const { charms, api, device, auth, toasts } = await setup({
      device: [storedCharm(1, payload), storedCharm(2, payload), storedCharm(3, payload)],
    })
    api.failCreateOf(charmId(2), { kind: 'unauthorized' })
    expect(await charms.importFromDevice()).toBe('expired')
    expect(api.createRequests).toHaveLength(2)
    expect(ids(device.snapshot())).toEqual([charmId(2), charmId(3)])
    expect(auth.status).toBe('unauthenticated')
    expect(charms.source).toBe('device')
    expect(ids(charms.charms)).toEqual([charmId(3), charmId(2)])
    expect(toasts()).toEqual([
      'ログインの有効期限が切れたため、取り込みを止めました。取り込んだのは 1 件で、2 件はこの端末に残しています。端末内の護石に切り替えました。もう一度「Discord でログイン」を押すと、続きを取り込めます。',
    ])
  })

  it('AC-7: 始める時点のアカウントの一覧が 401 なら、何も送らずに同じく止める', async () => {
    const { charms, api, device, auth, toasts } = await setup({ device: [storedCharm(1, payload)] })
    api.failWith('list', { kind: 'unauthorized' })
    expect(await charms.importFromDevice()).toBe('expired')
    expect(api.calls.create).toBe(0)
    expect(device.snapshot()).toHaveLength(1)
    expect(auth.status).toBe('unauthenticated')
    expect(toasts()).toHaveLength(1)
    expect(toasts()[0]).toContain('取り込んだのは 0 件で、1 件はこの端末に残しています')
  })

  // AC-8
  it.each([
    ['network', 'サーバーに接続できませんでした。'],
    ['server', 'サーバーで処理できませんでした。'],
  ] as const)(
    'AC-8: %s の失敗で止め、失敗した1件と残りを端末に残し、送り直さない',
    async (cause, text) => {
      const { charms, api, device, toasts, toastTones } = await setup({
        device: [storedCharm(1, payload), storedCharm(2, payload), storedCharm(3, payload)],
      })
      api.failCreateOf(charmId(2), { kind: 'failed', cause })
      expect(await charms.importFromDevice()).toBe('stopped')
      expect(api.createRequests).toHaveLength(2)
      expect(ids(device.snapshot())).toEqual([charmId(2), charmId(3)])
      expect(toasts()).toEqual([
        `護石の取り込みを途中で止めました。${text} 取り込んだのは 1 件で、2 件はこの端末に残しています。通信の状態を確かめて、もう一度「アカウントに取り込む」を押してください。`,
      ])
      expect(toastTones()).toEqual(['destructive'])
      expect(charms.source).toBe('account')
    },
  )

  it('AC-8: 始める時点のアカウントの一覧を読めなければ、何も送らずに止める', async () => {
    const { charms, api, device } = await setup({ device: [storedCharm(1, payload)] })
    api.failWith('list', { kind: 'failed', cause: 'network' })
    expect(await charms.importFromDevice()).toBe('stopped')
    expect(api.calls.create).toBe(0)
    expect(device.snapshot()).toHaveLength(1)
  })

  it('AC-8: 端末の保存先を読めなければ、何も送らずに知らせて止める', async () => {
    const { charms, api, device, toasts } = await setup({ device: [storedCharm(1, payload)] })
    device.failWith('list', 'unknown')
    expect(await charms.importFromDevice()).toBe('stopped')
    expect(api.calls.create).toBe(0)
    expect(toasts()).toEqual([
      '護石を取り込めませんでした。端末への保存（IndexedDB）に失敗しました。 もう一度お試しください。',
    ])
  })

  // AC-9
  it('AC-9: 終わったらアカウントの一覧と端末内の件数を読み直す', async () => {
    const { charms, api } = await setup({
      server: [accountCharm(storedCharm(9, payload))],
      device: [storedCharm(1, payload), storedCharm(2, payload)],
    })
    expect(charms.deviceCharmCount).toBe(2)
    api.failCreateOf(charmId(2), { kind: 'badRequest' })
    await charms.importFromDevice()
    expect(ids(charms.charms)).toEqual([charmId(9), charmId(1)].sort().reverse())
    expect(charms.deviceCharmCount).toBe(1)
  })

  it('AC-9: 止めたときも読み直し、残ったものは取り込み直せる', async () => {
    const { charms, api, device } = await setup({
      device: [storedCharm(1, payload), storedCharm(2, payload)],
    })
    api.failCreateOf(charmId(2), { kind: 'failed', cause: 'network' })
    await charms.importFromDevice()
    expect(charms.deviceCharmCount).toBe(1)
    expect(ids(charms.charms)).toEqual([charmId(1)])
    api.failCreateOf(charmId(2), null)
    expect(await charms.importFromDevice()).toBe('done')
    expect(device.snapshot()).toEqual([])
    expect(charms.deviceCharmCount).toBe(0)
  })

  // AC-10
  it('AC-10: 取り込みの最中は importing が立ち、重ねて始めず、終わったら下りる', async () => {
    const { charms, api } = await setup({ device: [storedCharm(1, payload)] })
    const release = api.hold('create')
    const first = charms.importFromDevice()
    await vi.waitFor(() => expect(charms.importing).toBe(true))
    expect(await charms.importFromDevice()).toBe('ignored')
    release()
    expect(await first).toBe('done')
    expect(charms.importing).toBe(false)
    expect(api.createRequests).toHaveLength(1)
  })

  it('AC-10: アカウントの保存先でなければ始めない', async () => {
    const api = createMemoryCharmsApi()
    const device = createMemoryCharmRepository([storedCharm(1, payload)])
    const { charms } = await loadStores(device, undefined, { charmsApi: api })
    await charms.ensureLoaded()
    expect(charms.source).toBe('device')
    expect(await charms.importFromDevice()).toBe('ignored')
    expect(api.calls.create).toBe(0)
  })

  // AC-11
  it('AC-11: 取り込み中のログアウトは、応答待ちの1件まで扱い、残りは送らず、端末には取り込まなかったものだけを出す', async () => {
    const { charms, api, device, auth, toasts } = await setup({
      device: [storedCharm(1, payload), storedCharm(2, payload)],
    })
    const release = api.hold('create')
    const running = charms.importFromDevice()
    await vi.waitFor(() => expect(api.createRequests).toHaveLength(1))
    await auth.logout()
    release()
    expect(await running).toBe('discarded')
    await vi.waitFor(() => expect(charms.status).toBe('ready'))
    expect(api.createRequests).toHaveLength(1)
    expect(ids(device.snapshot())).toEqual([charmId(2)])
    expect(charms.source).toBe('device')
    expect(ids(charms.charms)).toEqual([charmId(2)])
    expect(toasts()).toEqual(['ログアウトしました'])
    expect(charms.importing).toBe(false)
  })
})
