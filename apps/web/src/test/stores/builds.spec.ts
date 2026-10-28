import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthApi } from '@/lib/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useBuildsStore } from '@/stores/builds'
import { useToastStore } from '@/stores/toast'
import { createMemoryBuildsApi } from '../support/buildsApi'
import type { MemoryBuildsApi } from '../support/buildsApi'
import { minimalPayload, savedBuild } from '../support/builds'
import { fakeAuthApi } from '../support/mount'

const loggedIn: AuthApi = fakeAuthApi({
  fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: 'tester' }),
})
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/

function setup(authApi: AuthApi, rows = [savedBuild(1), savedBuild(2)]) {
  setActivePinia(createPinia())
  const api = createMemoryBuildsApi(rows)
  const auth = useAuthStore()
  auth.setApi(authApi)
  const builds = useBuildsStore()
  builds.setApi(api)
  const toast = useToastStore()
  const pushed = vi.spyOn(toast, 'push')
  return { api, auth, builds, pushed }
}

async function ready(rows?: Parameters<typeof setup>[1]) {
  const ctx = setup(loggedIn, rows)
  await ctx.builds.ensureLoaded()
  return ctx
}

const notFailed = (api: MemoryBuildsApi) => api.failWith('list', null)

describe('builds ストアの一覧', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('AC-3: 認証の判定を待ち、ログイン中なら新しい順の一覧を読む', async () => {
    const { builds, api } = setup(loggedIn)
    expect(builds.status).toBe('loading')
    await builds.ensureLoaded()
    expect(builds.status).toBe('ready')
    expect(builds.builds.map((b) => b.name)).toEqual(['構成2', '構成1'])
    expect(api.calls.list).toBe(1)
  })

  it('AC-3: 画面を開くたびに一覧をサーバーから読み直す', async () => {
    const { builds, api } = await ready()
    api.seed(savedBuild(3))
    await builds.ensureLoaded()
    expect(api.calls.list).toBe(2)
    expect(builds.builds).toHaveLength(3)
  })

  it('AC-3: 0件のときは ready で空', async () => {
    const { builds } = await ready([])
    expect(builds.status).toBe('ready')
    expect(builds.builds).toEqual([])
  })

  it('AC-2: 未ログインはログインが必要（一覧は読まない）', async () => {
    const { builds, api } = setup(
      fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'unauthenticated' }) }),
    )
    await builds.ensureLoaded()
    expect(builds.status).toBe('loginRequired')
    expect(builds.loginRequiredReason).toBe('unauthenticated')
    expect(api.calls.list).toBe(0)
  })

  it('AC-2: 取得できないときもログインが必要で、理由を区別する', async () => {
    const { builds } = setup(fakeAuthApi())
    await builds.ensureLoaded()
    expect(builds.status).toBe('loginRequired')
    expect(builds.loginRequiredReason).toBe('unavailable')
  })

  it('AC-2: 認証の判定中は読込中のままで、ログインが必要にしない', async () => {
    let resolve: (value: { kind: 'authenticated'; displayName: string }) => void = () => {}
    const { builds } = setup(
      fakeAuthApi({
        fetchCurrentUser: () =>
          new Promise((r) => {
            resolve = r
          }),
      }),
    )
    const loading = builds.ensureLoaded()
    await Promise.resolve()
    expect(builds.status).toBe('loading')
    resolve({ kind: 'authenticated', displayName: 'a' })
    await loading
    expect(builds.status).toBe('ready')
  })

  it.each([
    [{ kind: 'failed', cause: 'network' } as const, 'サーバーに接続できませんでした。'],
    [{ kind: 'failed', cause: 'server' } as const, 'サーバーで処理できませんでした。'],
    [{ kind: 'notFound' } as const, 'サーバーで処理できませんでした。'],
  ])('AC-12: 一覧の読込が失敗したら読込失敗と原因の文言（%o）', async (failure, text) => {
    const { builds, api } = setup(loggedIn)
    api.failWith('list', failure)
    await builds.ensureLoaded()
    expect(builds.status).toBe('failed')
    expect(builds.failureMessage).toBe(text)
  })

  it('AC-12: 「再読み込み」は一覧だけを読み直し、認証は読み直さない', async () => {
    const fetchCurrentUser = vi.fn(loggedIn.fetchCurrentUser)
    const { builds, api } = setup({ ...loggedIn, fetchCurrentUser })
    api.failWith('list', { kind: 'failed', cause: 'network' })
    await builds.ensureLoaded()
    notFailed(api)
    await builds.reload()
    expect(builds.status).toBe('ready')
    expect(builds.builds).toHaveLength(2)
    expect(fetchCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('AC-12: ログイン中でなければ「再読み込み」は何もしない', async () => {
    const { builds, api } = setup(fakeAuthApi())
    await builds.ensureLoaded()
    await builds.reload()
    expect(api.calls.list).toBe(0)
  })

  it('AC-12: 一覧が 401 ならトーストを1回出してログインが必要にし、ヘッダーを未ログインに戻す', async () => {
    const { builds, api, auth, pushed } = setup(loggedIn)
    api.failWith('list', { kind: 'unauthorized' })
    await builds.ensureLoaded()
    expect(builds.status).toBe('loginRequired')
    expect(auth.status).toBe('unauthenticated')
    expect(pushed).toHaveBeenCalledTimes(1)
    expect(pushed.mock.calls[0][0]).toContain('ログインの有効期限が切れました')
    expect(pushed.mock.calls[0][1]).toBe('destructive')
  })

  it('AC-2: ログアウトしたら、その場でログインが必要にして一覧を捨てる', async () => {
    const { builds, auth } = await ready()
    await auth.logout()
    expect(builds.status).toBe('loginRequired')
    expect(builds.builds).toEqual([])
  })

  it('AC-12: 読込中にログアウトしたら、遅れて届いた一覧の応答を捨てる', async () => {
    const { builds, api, auth } = setup(loggedIn)
    const release = api.hold('list')
    const loading = builds.ensureLoaded()
    await vi.waitFor(() => expect(api.calls.list).toBe(1))
    await auth.logout()
    release()
    await loading
    expect(builds.status).toBe('loginRequired')
    expect(builds.builds).toEqual([])
  })

  it('AC-12: 一覧の読込が重なったときは新しい読込の結果を残す', async () => {
    const { builds, api } = await ready()
    const release = api.hold('list')
    const slow = builds.reload()
    await vi.waitFor(() => expect(api.calls.list).toBe(2))
    release()
    api.seed(savedBuild(9))
    await slow
    await builds.reload()
    expect(builds.builds).toHaveLength(3)
  })
})

describe('builds ストアの保存', () => {
  beforeEach(() => vi.restoreAllMocks())

  const payload = minimalPayload()

  it('AC-1: UUIDv7 を ID にし、名前・マスターの版・payload・schemaVersion 1 を送り、一覧の先頭に足してトーストを出す', async () => {
    const { builds, api, pushed } = await ready()
    expect(await builds.save('新しい構成', '2026.10.4', payload)).toBe('saved')
    const sent = api.created[0] as Record<string, unknown>
    expect(sent.id).toMatch(UUID_PATTERN)
    expect(sent).toMatchObject({
      name: '新しい構成',
      masterVersion: '2026.10.4',
      schemaVersion: 1,
      payload,
    })
    expect(builds.builds[0].name).toBe('新しい構成')
    expect(builds.builds).toHaveLength(3)
    expect(pushed).toHaveBeenCalledWith(
      '「新しい構成」を保存しました。「保存した構成」から開けます。',
    )
  })

  it('AC-1: 一覧を読んでいなくても保存でき、一覧は変えない', async () => {
    const { builds, api } = setup(loggedIn)
    expect(await builds.save('名前', 'v', payload)).toBe('saved')
    expect(api.snapshot()).toHaveLength(3)
    expect(builds.builds).toEqual([])
  })

  it('AC-1: 同じ名前を複数保存でき、押し直しは新しい ID になる', async () => {
    const { builds, api } = await ready()
    await builds.save('同じ', 'v', payload)
    await builds.save('同じ', 'v', payload)
    const ids = (api.created as { id: string }[]).map((c) => c.id)
    expect(new Set(ids).size).toBe(2)
    expect(builds.builds.filter((b) => b.name === '同じ')).toHaveLength(2)
  })

  it('AC-2: ログイン中でなければ送らない', async () => {
    const { builds, api } = setup(fakeAuthApi())
    expect(await builds.save('名前', 'v', payload)).toBe('expired')
    expect(api.calls.create).toBe(0)
  })

  it('AC-12: 通信の失敗は原因つきのトーストで知らせ、一覧を変えず、送り直さない', async () => {
    const { builds, api, pushed } = await ready()
    api.failWith('create', { kind: 'failed', cause: 'network' })
    expect(await builds.save('名前', 'v', payload)).toBe('failed')
    expect(builds.builds).toHaveLength(2)
    expect(api.calls.create).toBe(1)
    expect(pushed).toHaveBeenCalledWith(
      '構成を保存できませんでした。サーバーに接続できませんでした。 もう一度お試しください。',
      'destructive',
    )
  })

  it('AC-12: 作成の 409（ID の衝突）は読み直さずに一般の失敗にする', async () => {
    const { builds, api } = await ready()
    api.failWith('create', { kind: 'conflict' })
    expect(await builds.save('名前', 'v', payload)).toBe('failed')
    expect(api.calls.list).toBe(1)
  })

  it('AC-12: 保存が 401 なら保存用のトーストを1回出してログインが必要にする', async () => {
    const { builds, api, auth, pushed } = await ready()
    api.failWith('create', { kind: 'unauthorized' })
    expect(await builds.save('名前', 'v', payload)).toBe('expired')
    expect(auth.status).toBe('unauthenticated')
    expect(builds.status).toBe('loginRequired')
    expect(pushed).toHaveBeenCalledTimes(1)
    expect(pushed.mock.calls[0][0]).toContain('いまの検索結果は消えます')
  })

  it('AC-12: 同時の 401 でもトーストは1回だけ', async () => {
    const { builds, api, pushed } = await ready()
    api.failWith('create', { kind: 'unauthorized' })
    api.failWith('remove', { kind: 'unauthorized' })
    await Promise.all([builds.save('a', 'v', payload), builds.remove(savedBuild(1).id)])
    expect(pushed).toHaveBeenCalledTimes(1)
  })

  it('AC-12: 保存の応答待ちにログアウトしたら、応答を一覧にもトーストにも反映しない', async () => {
    const { builds, api, auth, pushed } = await ready()
    const release = api.hold('create')
    const saving = builds.save('名前', 'v', payload)
    await vi.waitFor(() => expect(api.calls.create).toBe(1))
    await auth.logout()
    pushed.mockClear()
    release()
    expect(await saving).toBe('discarded')
    expect(builds.builds).toEqual([])
    expect(pushed).not.toHaveBeenCalled()
  })
})

describe('builds ストアの名前の変更', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('AC-6: 読んだ時点の version で送り、並びを変えずに名前を替える', async () => {
    const { builds, api, pushed } = await ready([savedBuild(1, { version: 4 }), savedBuild(2)])
    expect(await builds.rename(savedBuild(1).id, '新名')).toBe('saved')
    expect(builds.builds.map((b) => b.name)).toEqual(['構成2', '新名'])
    expect(builds.builds[1].version).toBe(5)
    expect(api.snapshot().find((b) => b.id === savedBuild(1).id)?.name).toBe('新名')
    expect(pushed).toHaveBeenCalledWith('名前を変更しました。')
  })

  it('AC-9: 409 は別の端末で変更されたことをトーストで知らせ、一覧を読み直す', async () => {
    const { builds, api, pushed } = await ready()
    api.seed(savedBuild(1, { name: '他端末', version: 7 }))
    expect(await builds.rename(savedBuild(1).id, '新名')).toBe('conflict')
    expect(api.calls.list).toBe(2)
    expect(builds.builds.find((b) => b.id === savedBuild(1).id)?.name).toBe('他端末')
    expect(pushed.mock.calls[0][0]).toContain('別の端末で変更されていた')
    expect(pushed.mock.calls[0][1]).toBe('destructive')
  })

  it('AC-9: 404 は別の端末で削除されたことをトーストで知らせ、一覧を読み直す', async () => {
    const { builds, api, pushed } = await ready()
    api.drop(savedBuild(1).id)
    expect(await builds.rename(savedBuild(1).id, '新名')).toBe('notFound')
    expect(builds.builds.map((b) => b.id)).toEqual([savedBuild(2).id])
    expect(pushed.mock.calls[0][0]).toContain('別の端末で削除されていた')
  })

  it('AC-9: 読み直しが失敗したら読込失敗になる', async () => {
    const { builds, api } = await ready()
    api.seed(savedBuild(1, { version: 7 }))
    api.failWith('list', { kind: 'failed', cause: 'network' })
    expect(await builds.rename(savedBuild(1).id, '新名')).toBe('conflict')
    expect(builds.status).toBe('failed')
  })

  it('AC-12: それ以外の失敗は一覧を変えず、トーストで知らせ、送り直さない', async () => {
    const { builds, api, pushed } = await ready()
    api.failWith('rename', { kind: 'failed', cause: 'server' })
    expect(await builds.rename(savedBuild(1).id, '新名')).toBe('failed')
    expect(builds.builds.map((b) => b.name)).toEqual(['構成2', '構成1'])
    expect(api.calls.rename).toBe(1)
    expect(pushed).toHaveBeenCalledWith(
      '名前を変更できませんでした。サーバーで処理できませんでした。 もう一度お試しください。',
      'destructive',
    )
  })

  it('AC-12: 401 はログインの期限切れのトーストを1回出してログインが必要にする', async () => {
    const { builds, api, pushed } = await ready()
    api.failWith('rename', { kind: 'unauthorized' })
    expect(await builds.rename(savedBuild(1).id, '新名')).toBe('expired')
    expect(builds.status).toBe('loginRequired')
    expect(pushed).toHaveBeenCalledTimes(1)
  })

  it('AC-12: 一覧に無い ID は送らず失敗にする', async () => {
    const { builds, api } = await ready()
    expect(await builds.rename('00000000-0000-7000-8000-00000000ffff', 'x')).toBe('failed')
    expect(api.calls.rename).toBe(0)
  })

  it('AC-12: 応答待ちにログアウトしたら応答を捨てる', async () => {
    const { builds, api, auth, pushed } = await ready()
    const release = api.hold('rename')
    const renaming = builds.rename(savedBuild(1).id, '新名')
    await vi.waitFor(() => expect(api.calls.rename).toBe(1))
    await auth.logout()
    pushed.mockClear()
    release()
    expect(await renaming).toBe('discarded')
    expect(pushed).not.toHaveBeenCalled()
  })
})

describe('builds ストアの削除', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('AC-6: 削除したら一覧から消え、応答待ちの間は ID を持つ', async () => {
    const { builds, api, pushed } = await ready()
    const release = api.hold('remove')
    const removing = builds.remove(savedBuild(1).id)
    await vi.waitFor(() => expect(builds.deletingIds).toEqual([savedBuild(1).id]))
    expect(await builds.remove(savedBuild(1).id)).toBe('failed')
    release()
    expect(await removing).toBe('saved')
    expect(builds.deletingIds).toEqual([])
    expect(builds.builds.map((b) => b.id)).toEqual([savedBuild(2).id])
    expect(pushed).toHaveBeenCalledWith('構成を削除しました。')
  })

  it('AC-12: 失敗したら一覧を変えず、トーストで知らせ、待ちの ID を外す', async () => {
    const { builds, api, pushed } = await ready()
    api.failWith('remove', { kind: 'failed', cause: 'network' })
    expect(await builds.remove(savedBuild(1).id)).toBe('failed')
    expect(builds.builds).toHaveLength(2)
    expect(builds.deletingIds).toEqual([])
    expect(pushed).toHaveBeenCalledWith(
      '構成を削除できませんでした。サーバーに接続できませんでした。 もう一度お試しください。',
      'destructive',
    )
  })

  it('AC-12: 401 は期限切れのトーストを出してログインが必要にする', async () => {
    const { builds, api } = await ready()
    api.failWith('remove', { kind: 'unauthorized' })
    expect(await builds.remove(savedBuild(1).id)).toBe('expired')
    expect(builds.status).toBe('loginRequired')
    expect(builds.deletingIds).toEqual([])
  })

  it('AC-12: 応答待ちにログアウトしたら応答を捨て、待ちの ID も空にする', async () => {
    const { builds, api, auth, pushed } = await ready()
    const release = api.hold('remove')
    const removing = builds.remove(savedBuild(1).id)
    await vi.waitFor(() => expect(api.calls.remove).toBe(1))
    await auth.logout()
    pushed.mockClear()
    release()
    expect(await removing).toBe('discarded')
    expect(builds.deletingIds).toEqual([])
    expect(pushed).not.toHaveBeenCalled()
  })

  it('AC-2: ログイン中でなければ送らない', async () => {
    const { builds, api } = setup(fakeAuthApi())
    expect(await builds.remove(savedBuild(1).id)).toBe('expired')
    expect(api.calls.remove).toBe(0)
    expect(builds.deletingIds).toEqual([])
  })
})
