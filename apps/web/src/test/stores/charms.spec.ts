import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sk, makeTableBundle } from '../support/fixtures'
import { createMemoryCharmRepository } from '../support/charmRepository'
import { charmId, storedCharm } from '../support/charms'
import { createMemoryCharmsApi, accountCharm } from '../support/charmsApi'
import { fakeAuthApi, flushPromises, loadStores, restoreStubs, stubBackend } from '../support/mount'
import { useAuthStore } from '@/stores/auth'
import type { AccountCharm } from '@/lib/api/charms'
import type { CurrentUserResult } from '@/lib/api/auth'
import type { StoredCharm } from '@/lib/charms/storage'
import { useToastStore } from '@/stores/toast'
import type { CharmPayload } from '@/lib/charms/types'

const passing: CharmPayload = {
  rarity: 8,
  skills: [{ skillId: sk('a1'), level: 2 }],
  slots: [{ target: 'weapon', level: 1 }],
}
const mismatching: CharmPayload = { ...passing, skills: [{ skillId: sk('a1'), level: 3 }] }
const unchecked: CharmPayload = { ...passing, rarity: 6 }
const overLevel: CharmPayload = { ...passing, skills: [{ skillId: sk('a1'), level: 9 }] }
const unknownSkill: CharmPayload = { ...passing, skills: [{ skillId: sk('zz'), level: 1 }] }

describe('charms ストア', () => {
  beforeEach(() => stubBackend({ bundle: makeTableBundle() }))
  afterEach(restoreStubs)

  // 受入基準 3・4（保存と一覧の並び）
  it('読み込むと状態が ready になり、一覧は ID の降順に並ぶ', async () => {
    const repo = createMemoryCharmRepository([
      storedCharm(1, passing),
      storedCharm(3, passing),
      storedCharm(2, passing),
    ])
    const { charms } = await loadStores(repo)
    expect(charms.status).toBe('loading')
    await charms.ensureLoaded()
    expect(charms.status).toBe('ready')
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(3), charmId(2), charmId(1)])
  })

  it('登録: UUIDv7 を振って保存してから一覧の先頭に足し、トーストを出す', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing)])
    const { charms, pinia } = await loadStores(repo)
    await charms.ensureLoaded()
    expect(await charms.save(unchecked)).toBe('saved')
    const saved = repo.snapshot().find((c) => c.id !== charmId(1))!
    expect(saved.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
    expect(saved.schemaVersion).toBe(1)
    expect(saved.payload).toEqual(unchecked)
    expect(charms.charms[0].id).toBe(saved.id)
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual(['護石を登録しました。'])
  })

  it('上書き: 同じ ID・登録日時のまま中身と更新日時を変え、並びは変えない', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing), storedCharm(2, passing)])
    const { charms, pinia } = await loadStores(repo)
    await charms.ensureLoaded()
    const target = charms.charms[1]
    expect(await charms.save(unchecked, target)).toBe('saved')
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(2), charmId(1)])
    const saved = repo.snapshot().find((c) => c.id === charmId(1))!
    expect(saved.payload).toEqual(unchecked)
    expect(saved.createdAt).toBe(target.createdAt)
    expect(saved.updatedAt).not.toBe(target.updatedAt)
    expect(useToastStore(pinia).items.map((i) => i.message)).toEqual(['護石を保存しました。'])
  })

  it('削除: 端末から消えてから一覧を変え、トーストを出す', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing), storedCharm(2, passing)])
    const { charms, pinia } = await loadStores(repo)
    await charms.ensureLoaded()
    expect(await charms.remove(charmId(2))).toBe('saved')
    expect(repo.snapshot().map((c) => c.id)).toEqual([charmId(1)])
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(1)])
    expect(useToastStore(pinia).items[0].message).toBe('護石を削除しました。')
  })

  // 受入基準 11（書き込みの失敗）
  it('書き込みに失敗したら、一覧を変えず、原因つきの destructive のトーストを出す', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing)])
    const { charms, pinia } = await loadStores(repo)
    await charms.ensureLoaded()
    repo.failWith('put', 'quota')
    expect(await charms.save(unchecked)).toBe('failed')
    expect(await charms.save(unchecked, charms.charms[0])).toBe('failed')
    expect(charms.charms).toHaveLength(1)
    expect(charms.charms[0].payload).toEqual(passing)
    repo.failWith('delete', 'unknown')
    expect(await charms.remove(charmId(1))).toBe('failed')
    expect(charms.charms).toHaveLength(1)
    const toasts = useToastStore(pinia).items
    expect(toasts.map((t) => t.tone)).toEqual(['destructive', 'destructive', 'destructive'])
    expect(toasts[0].message).toBe(
      '護石を保存できませんでした。端末の保存容量が足りません。 もう一度お試しください。',
    )
    expect(toasts[2].message).toBe(
      '護石を削除できませんでした。端末への保存（IndexedDB）に失敗しました。 もう一度お試しください。',
    )
  })

  it('保存先を開けないときは「端末に保存できない」になり、原因を持ち、書き込まない', async () => {
    const { charms, pinia } = await loadStores()
    charms.setRepositoryOpener(async () => {
      throw Object.assign(new Error('x'), { name: 'SecurityError' })
    })
    await charms.ensureLoaded()
    expect(charms.status).toBe('unavailable')
    expect(charms.failureMessage).toBe(
      'この端末のブラウザでは、端末への保存（IndexedDB）が使えません。',
    )
    expect(await charms.save(unchecked)).toBe('failed')
    expect(useToastStore(pinia).items).toHaveLength(0)
  })

  it('一覧を読めないときは「読み込みの失敗」になり、再読み込みで回復する', async () => {
    const repo = createMemoryCharmRepository([storedCharm(1, passing)])
    const { charms } = await loadStores(repo)
    repo.failWith('list', 'unknown')
    await charms.ensureLoaded()
    expect(charms.status).toBe('failed')
    expect(charms.failureMessage).toBe('端末への保存（IndexedDB）に失敗しました。')
    repo.failWith('list', null)
    await charms.reload()
    expect(charms.status).toBe('ready')
    expect(charms.charms).toHaveLength(1)
  })

  it('ensureLoaded は1回だけ開く', async () => {
    const { charms } = await loadStores()
    let opened = 0
    charms.setRepositoryOpener(async () => {
      opened += 1
      return createMemoryCharmRepository()
    })
    await Promise.all([charms.ensureLoaded(), charms.ensureLoaded()])
    await charms.ensureLoaded()
    expect(opened).toBe(1)
  })

  // 受入基準 6・7（照合の結果）、8・10（候補と検索対象外）
  it('各護石の照合の結果を、現行のマスターで求める', async () => {
    const repo = createMemoryCharmRepository([
      storedCharm(1, passing),
      storedCharm(2, mismatching),
      storedCharm(3, unchecked),
    ])
    const { charms } = await loadStores(repo)
    await charms.ensureLoaded()
    expect(charms.entries.map((e) => e.match?.status)).toEqual(['unchecked', 'mismatch', 'pass'])
  })

  it('候補は構造上の制約を満たすものすべて（未検査・不一致を含む）で、外す護石は件数と理由を返す', async () => {
    const repo = createMemoryCharmRepository([
      storedCharm(1, passing),
      storedCharm(2, mismatching),
      storedCharm(3, unchecked),
      storedCharm(4, overLevel),
      storedCharm(5, unknownSkill),
    ])
    const { charms } = await loadStores(repo)
    await charms.ensureLoaded()
    expect(charms.candidates.map((c) => c.id).sort()).toEqual(
      [charmId(1), charmId(2), charmId(3)].sort(),
    )
    expect(charms.candidateCount).toBe(3)
    expect(charms.excludedCount).toBe(2)
    expect(charms.excluded.find((e) => e.id === charmId(4))?.reasons).toEqual([
      '「攻撃 Lv9」が最大レベル（Lv3）を超えています。',
    ])
    expect(charms.excluded.find((e) => e.id === charmId(5))?.reasons[0]).toContain(
      'が現行のマスターにありません。',
    )
  })
})

// 010 charm-save: 保存先の切り替え
describe('charms ストア（アカウントの保存先）', () => {
  beforeEach(() => stubBackend({ bundle: makeTableBundle() }))
  afterEach(restoreStubs)

  const loggedIn = () =>
    fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: '狩人' }) })

  async function setup(options: { server?: AccountCharm[]; device?: StoredCharm[] } = {}) {
    const api = createMemoryCharmsApi(options.server ?? [])
    const device = createMemoryCharmRepository(options.device ?? [])
    const authApi = loggedIn()
    const stores = await loadStores(device, undefined, { authApi, charmsApi: api })
    const auth = useAuthStore(stores.pinia)
    const toasts = () => useToastStore(stores.pinia).items.map((i) => i.message)
    return { ...stores, api, device, auth, toasts }
  }

  // AC-1
  it('AC-1: ログイン中はアカウントの護石だけを一覧・候補にし、端末内の護石は件数だけ数える', async () => {
    const { charms, device } = await setup({
      server: [accountCharm(storedCharm(2, passing))],
      device: [storedCharm(1, passing), storedCharm(3, passing)],
    })
    await charms.ensureLoaded()
    expect(charms.source).toBe('account')
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(2)])
    expect(charms.candidateCount).toBe(1)
    expect(charms.deviceCharmCount).toBe(2)
    expect(device.snapshot()).toHaveLength(2)
  })

  it('AC-1: 端末内の護石を開けないときの件数は null で、エラーは出さない', async () => {
    const { charms, device, toasts } = await setup()
    device.failWith('list', 'unknown')
    await charms.ensureLoaded()
    expect(charms.status).toBe('ready')
    expect(charms.deviceCharmCount).toBeNull()
    expect(toasts()).toEqual([])
  })

  // AC-2
  it('AC-2: 登録は UUIDv7 を振ってサーバーに保存し、端末には書かない', async () => {
    const { charms, api, device, toasts } = await setup({ device: [storedCharm(1, passing)] })
    await charms.ensureLoaded()
    expect(await charms.save(unchecked)).toBe('saved')
    const [row] = api.snapshot()
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(row.schemaVersion).toBe(1)
    expect(row.payload).toEqual(unchecked)
    expect(charms.charms[0].id).toBe(row.id)
    expect(device.snapshot()).toHaveLength(1)
    expect(toasts()).toEqual(['護石を登録しました。'])
  })

  it('AC-2: 上書きは読んだ時点の行バージョンで送り、サーバーの応答で一覧を変える', async () => {
    const { charms, api, toasts } = await setup({
      server: [accountCharm(storedCharm(1, passing), 4)],
    })
    await charms.ensureLoaded()
    expect(await charms.save(unchecked, charms.charms[0])).toBe('saved')
    expect(api.snapshot()[0].version).toBe(5)
    expect((charms.charms[0] as AccountCharm).version).toBe(5)
    expect(charms.charms[0].payload).toEqual(unchecked)
    expect(toasts()).toEqual(['護石を保存しました。'])
  })

  it('AC-2: 削除はサーバーから消して一覧を変え、応答の間は deletingIds に入る', async () => {
    const { charms, api, toasts } = await setup({
      server: [accountCharm(storedCharm(1, passing)), accountCharm(storedCharm(2, passing))],
    })
    await charms.ensureLoaded()
    const release = api.hold('remove')
    const pending = charms.remove(charmId(2))
    expect(charms.deletingIds).toEqual([charmId(2)])
    release()
    expect(await pending).toBe('saved')
    expect(charms.deletingIds).toEqual([])
    expect(api.snapshot().map((c) => c.id)).toEqual([charmId(1)])
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(1)])
    expect(toasts()).toEqual(['護石を削除しました。'])
  })

  // AC-3
  it('AC-3: 認証の判定が終わるまで、端末の一覧も読まない', async () => {
    const api = createMemoryCharmsApi()
    const device = createMemoryCharmRepository([storedCharm(1, passing)])
    let resolveAuth: (r: CurrentUserResult) => void = () => {}
    const authApi = fakeAuthApi({
      fetchCurrentUser: () => new Promise<CurrentUserResult>((r) => (resolveAuth = r)),
    })
    const { charms } = await loadStores(device, undefined, { authApi, charmsApi: api })
    const loaded = charms.ensureLoaded()
    await flushPromises()
    expect(charms.status).toBe('loading')
    expect(charms.source).toBe('unknown')
    expect(charms.charms).toEqual([])
    resolveAuth({ kind: 'unauthenticated' })
    await loaded
    expect(charms.source).toBe('device')
    expect(charms.charms).toHaveLength(1)
    expect(api.calls.list).toBe(0)
  })

  it.each([
    ['未ログイン', { kind: 'unauthenticated' } as const],
    ['取得できない', { kind: 'unavailable' } as const],
  ])('AC-3: %s のときは端末内の護石を使う', async (_label, result) => {
    const api = createMemoryCharmsApi([accountCharm(storedCharm(9, passing))])
    const { charms } = await loadStores(
      createMemoryCharmRepository([storedCharm(1, passing)]),
      undefined,
      { authApi: fakeAuthApi({ fetchCurrentUser: async () => result }), charmsApi: api },
    )
    await charms.ensureLoaded()
    expect(charms.source).toBe('device')
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(1)])
    expect(api.calls.list).toBe(0)
  })

  it('AC-3: ログアウトしたら、その場で端末内の護石に切り替える', async () => {
    const { charms, auth } = await setup({
      server: [accountCharm(storedCharm(2, passing))],
      device: [storedCharm(1, passing)],
    })
    await charms.ensureLoaded()
    await auth.logout()
    await vi.waitFor(() => expect(charms.status).toBe('ready'))
    expect(charms.source).toBe('device')
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(1)])
    expect(charms.candidateCount).toBe(1)
    expect(charms.deviceCharmCount).toBeNull()
  })

  it('AC-3: 保存先が変わる前に送った保存の応答は、一覧にもトーストにも反映しない', async () => {
    const { charms, auth, api, toasts } = await setup({
      server: [accountCharm(storedCharm(1, passing))],
    })
    await charms.ensureLoaded()
    const release = api.hold('update')
    const pending = charms.save(unchecked, charms.charms[0])
    await auth.logout()
    release()
    expect(await pending).toBe('discarded')
    await vi.waitFor(() => expect(charms.status).toBe('ready'))
    expect(charms.source).toBe('device')
    expect(toasts().filter((m) => m.includes('保存'))).toEqual([])
  })

  // AC-8
  it('AC-8: 更新が 409 なら、知らせて、サーバーから読み直す', async () => {
    const { charms, api, toasts } = await setup({
      server: [accountCharm(storedCharm(1, passing), 1)],
    })
    await charms.ensureLoaded()
    const stale = charms.charms[0]
    api.seed(accountCharm(storedCharm(1, mismatching), 2))
    expect(await charms.save(unchecked, stale)).toBe('conflict')
    expect(toasts()).toEqual([
      'この護石は別の端末で変更されていたため、保存しませんでした。一覧を読み直しました。内容を確かめて、もう一度編集してください。',
    ])
    expect(charms.status).toBe('ready')
    expect(charms.charms[0].payload).toEqual(mismatching)
    expect(api.snapshot()[0].payload).toEqual(mismatching)
  })

  it('AC-8: 更新が 404 なら、別の端末で削除されたことを知らせて読み直す', async () => {
    const { charms, api, toasts } = await setup({ server: [accountCharm(storedCharm(1, passing))] })
    await charms.ensureLoaded()
    const target = charms.charms[0]
    api.drop(charmId(1))
    expect(await charms.save(unchecked, target)).toBe('notFound')
    expect(toasts()).toEqual([
      'この護石は別の端末で削除されていたため、保存しませんでした。一覧を読み直しました。',
    ])
    expect(charms.charms).toEqual([])
    expect(charms.status).toBe('ready')
  })

  it('AC-8: 読み直しが失敗したら読み込みの失敗にする', async () => {
    const { charms, api } = await setup({ server: [accountCharm(storedCharm(1, passing))] })
    await charms.ensureLoaded()
    api.failWith('update', { kind: 'conflict' })
    api.failWith('list', { kind: 'failed', cause: 'network' })
    expect(await charms.save(unchecked, charms.charms[0])).toBe('conflict')
    expect(charms.status).toBe('failed')
    expect(charms.failureMessage).toBe('サーバーに接続できませんでした。')
  })

  // AC-11
  it('AC-11: 書き込みが 401 なら、未ログインにして端末に切り替え、トーストは1回だけ', async () => {
    const { charms, auth, api, toasts } = await setup({
      server: [accountCharm(storedCharm(1, passing))],
      device: [storedCharm(7, passing)],
    })
    await charms.ensureLoaded()
    api.failWith('update', { kind: 'unauthorized' })
    api.failWith('remove', { kind: 'unauthorized' })
    const first = charms.save(unchecked, charms.charms[0])
    const second = charms.remove(charmId(1))
    expect(await first).toBe('expired')
    expect(await second).toBe('discarded')
    expect(auth.status).toBe('unauthenticated')
    expect(auth.displayName).toBe('')
    await vi.waitFor(() => expect(charms.status).toBe('ready'))
    expect(charms.source).toBe('device')
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(7)])
    expect(toasts()).toEqual([
      'ログインの有効期限が切れたため、保存しませんでした。端末内の護石に切り替えました。アカウントに保存するには、もう一度「Discord でログイン」を押してください。',
    ])
  })

  it('AC-11: 一覧の読み込みが 401 なら、読み込み用の文言で端末に切り替える', async () => {
    const { charms, auth, api, toasts } = await setup({ device: [storedCharm(7, passing)] })
    api.failWith('list', { kind: 'unauthorized' })
    await charms.ensureLoaded()
    expect(auth.status).toBe('unauthenticated')
    expect(charms.source).toBe('device')
    expect(charms.status).toBe('ready')
    expect(charms.charms.map((c) => c.id)).toEqual([charmId(7)])
    expect(toasts()).toEqual([
      'ログインの有効期限が切れました。端末内の護石に切り替えました。もう一度「Discord でログイン」を押すと、アカウントの護石を使えます。',
    ])
  })

  // AC-12
  it('AC-12: 一覧を取得できないときは読込失敗にし、再読み込みで回復する', async () => {
    const { charms, api, device } = await setup({ server: [accountCharm(storedCharm(1, passing))] })
    api.failWith('list', { kind: 'failed', cause: 'server' })
    await charms.ensureLoaded()
    expect(charms.status).toBe('failed')
    expect(charms.source).toBe('account')
    expect(charms.failureMessage).toBe('サーバーで処理できませんでした。')
    expect(charms.candidateCount).toBe(0)
    api.failWith('list', null)
    device.failWith('list', 'unknown')
    await charms.reload()
    expect(charms.status).toBe('ready')
    expect(charms.charms).toHaveLength(1)
    expect(charms.deviceCharmCount).toBeNull()
  })

  it('AC-12: 保存・削除の失敗はトーストで知らせ、一覧を変えず、送り直さない', async () => {
    const { charms, api, toasts } = await setup({ server: [accountCharm(storedCharm(1, passing))] })
    await charms.ensureLoaded()
    api.failWith('create', { kind: 'failed', cause: 'network' })
    api.failWith('remove', { kind: 'failed', cause: 'server' })
    expect(await charms.save(unchecked)).toBe('failed')
    expect(await charms.remove(charmId(1))).toBe('failed')
    expect(toasts()).toEqual([
      '護石を保存できませんでした。サーバーに接続できませんでした。 もう一度お試しください。',
      '護石を削除できませんでした。サーバーで処理できませんでした。 もう一度お試しください。',
    ])
    expect(charms.charms).toHaveLength(1)
    expect(charms.deletingIds).toEqual([])
    api.failWith('create', null)
    await flushPromises()
    expect(api.calls.create).toBe(1)
    expect(api.calls.remove).toBe(1)
    expect(api.snapshot()).toHaveLength(1)
  })
})
