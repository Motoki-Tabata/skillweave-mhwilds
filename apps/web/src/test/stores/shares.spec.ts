import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { AuthApi } from '@/lib/api/auth'
import { useAuthStore } from '@/stores/auth'
import { useBuildsStore } from '@/stores/builds'
import { useSharesStore } from '@/stores/shares'
import { useToastStore } from '@/stores/toast'
import { createMemoryBuildsApi } from '../support/buildsApi'
import { createMemorySharesApi, savedShare } from '../support/sharesApi'
import { savedBuild } from '../support/builds'
import { fakeAuthApi } from '../support/mount'

const loggedIn: AuthApi = fakeAuthApi({
  fetchCurrentUser: async () => ({ kind: 'authenticated', displayName: 'tester' }),
})
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/

function setup(authApi: AuthApi, rows = [savedShare(1), savedShare(2)]) {
  setActivePinia(createPinia())
  const api = createMemorySharesApi(rows)
  const auth = useAuthStore()
  auth.setApi(authApi)
  const shares = useSharesStore()
  shares.setApi(api)
  const buildsApi = createMemoryBuildsApi([savedBuild(1)])
  const builds = useBuildsStore()
  builds.setApi(buildsApi)
  const pushed = vi.spyOn(useToastStore(), 'push')
  return { api, auth, shares, builds, buildsApi, pushed }
}

async function ready(rows?: Parameters<typeof setup>[1]) {
  const ctx = setup(loggedIn, rows)
  await ctx.shares.ensureLoaded()
  return ctx
}

describe('shares ストアの一覧', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('AC-8: 認証の判定を待ち、ログイン中なら新しい順の一覧を読む', async () => {
    const { shares, api } = setup(loggedIn)
    expect(shares.status).toBe('loading')
    await shares.ensureLoaded()
    expect(shares.status).toBe('ready')
    expect(shares.shares.map((s) => s.name)).toEqual(['構成2', '構成1'])
    expect(api.calls.list).toBe(1)
  })

  it('AC-8: 画面を開くたびに一覧をサーバーから読み直す', async () => {
    const { shares, api } = await ready()
    api.seed(savedShare(3))
    await shares.ensureLoaded()
    expect(api.calls.list).toBe(2)
    expect(shares.shares).toHaveLength(3)
  })

  it('AC-8: 0件のときは ready で空', async () => {
    const { shares } = await ready([])
    expect(shares.status).toBe('ready')
    expect(shares.shares).toEqual([])
  })

  it('AC-12: 未ログインはログインが必要（一覧は読まない）', async () => {
    const { shares, api } = setup(
      fakeAuthApi({ fetchCurrentUser: async () => ({ kind: 'unauthenticated' }) }),
    )
    await shares.ensureLoaded()
    expect(shares.status).toBe('loginRequired')
    expect(shares.loginRequiredReason).toBe('unauthenticated')
    expect(api.calls.list).toBe(0)
  })

  it('AC-12: 取得できないときもログインが必要で、理由を区別する', async () => {
    const { shares } = setup(fakeAuthApi())
    await shares.ensureLoaded()
    expect(shares.status).toBe('loginRequired')
    expect(shares.loginRequiredReason).toBe('unavailable')
  })

  it('AC-12: 認証の判定中は読込中のままで、ログインが必要にしない', async () => {
    let resolve: (value: { kind: 'authenticated'; displayName: string }) => void = () => {}
    const { shares } = setup(
      fakeAuthApi({
        fetchCurrentUser: () =>
          new Promise((r) => {
            resolve = r
          }),
      }),
    )
    const loading = shares.ensureLoaded()
    await Promise.resolve()
    expect(shares.status).toBe('loading')
    resolve({ kind: 'authenticated', displayName: 'a' })
    await loading
    expect(shares.status).toBe('ready')
  })

  it.each([
    [{ kind: 'failed', cause: 'network' } as const, 'サーバーに接続できませんでした。'],
    [{ kind: 'failed', cause: 'server' } as const, 'サーバーで処理できませんでした。'],
  ])('AC-12: 一覧の読込が失敗したら読込失敗と原因の文言（%o）', async (failure, text) => {
    const { shares, api } = setup(loggedIn)
    api.failWith('list', failure)
    await shares.ensureLoaded()
    expect(shares.status).toBe('failed')
    expect(shares.failureMessage).toBe(text)
  })

  it('AC-12: 「再読み込み」は一覧だけを読み直し、認証は読み直さない', async () => {
    const fetchCurrentUser = vi.fn(loggedIn.fetchCurrentUser)
    const { shares, api } = setup({ ...loggedIn, fetchCurrentUser })
    api.failWith('list', { kind: 'failed', cause: 'network' })
    await shares.ensureLoaded()
    api.failWith('list', null)
    await shares.reload()
    expect(shares.status).toBe('ready')
    expect(shares.shares).toHaveLength(2)
    expect(fetchCurrentUser).toHaveBeenCalledTimes(1)
  })

  it('AC-12: ログイン中でなければ「再読み込み」は何もしない', async () => {
    const { shares, api } = setup(fakeAuthApi())
    await shares.ensureLoaded()
    await shares.reload()
    expect(api.calls.list).toBe(0)
  })

  it('AC-12: 一覧が 401 ならトーストを1回出してログインが必要にし、ヘッダーを未ログインに戻す', async () => {
    const { shares, api, auth, pushed } = setup(loggedIn)
    api.failWith('list', { kind: 'unauthorized' })
    await shares.ensureLoaded()
    expect(shares.status).toBe('loginRequired')
    expect(auth.status).toBe('unauthenticated')
    expect(pushed).toHaveBeenCalledTimes(1)
    expect(pushed.mock.calls[0][0]).toContain('ログインの有効期限が切れました')
    expect(pushed.mock.calls[0][1]).toBe('destructive')
  })

  it('AC-12: 構成のストアが先に 401 を処理していたら、トーストは重ねない', async () => {
    const { shares, api, auth, pushed } = setup(loggedIn)
    await shares.ensureLoaded()
    auth.expire()
    expect(shares.status).toBe('loginRequired')
    api.failWith('create', { kind: 'unauthorized' })
    pushed.mockClear()
    await shares.create(savedBuild(1).id)
    expect(pushed).not.toHaveBeenCalled()
  })

  it('AC-12: ログアウトしたら、その場でログインが必要にして一覧を捨てる', async () => {
    const { shares, auth } = await ready()
    auth.expire()
    expect(shares.status).toBe('loginRequired')
    expect(shares.shares).toEqual([])
  })

  it('AC-12: ログイン中でなくなったら、古い一覧の応答を捨てる', async () => {
    const { shares, api, auth } = setup(loggedIn)
    const release = api.hold('list')
    const loading = shares.ensureLoaded()
    await vi.waitFor(() => expect(api.calls.list).toBe(1))
    auth.expire()
    release()
    await loading
    expect(shares.status).toBe('loginRequired')
    expect(shares.shares).toEqual([])
  })
})

describe('shares ストアの作成', () => {
  beforeEach(() => vi.restoreAllMocks())
  const buildId = savedBuild(1).id

  it('AC-1: UUIDv7 を採番して送り、created と共有を返す。読み込み済みなら先頭に足す', async () => {
    const { shares, api } = await ready()
    const out = await shares.create(buildId)
    expect(out.result).toBe('created')
    expect(out.share?.buildId).toBe(buildId)
    const request = api.created[0] as { id: string; buildId: string }
    expect(request.id).toMatch(UUID_PATTERN)
    expect(Object.keys(request).sort()).toEqual(['buildId', 'id'])
    expect(shares.shares[0].id).toBe(request.id)
  })

  it('AC-3: 既存の有効な共有が返ったら existing で、一覧に足さない', async () => {
    const { shares } = await ready([savedShare(1, { buildId })])
    const out = await shares.create(buildId)
    expect(out.result).toBe('existing')
    expect(out.share?.id).toBe(savedShare(1).id)
    expect(shares.shares).toHaveLength(1)
  })

  it('AC-1: 押し直しは新しい ID で送る', async () => {
    const { shares, api } = await ready()
    api.failWith('create', { kind: 'failed', cause: 'network' })
    await shares.create(buildId)
    api.failWith('create', null)
    await shares.create(buildId)
    const [first, second] = api.created as { id: string }[]
    expect(first.id).not.toBe(second.id)
  })

  it('AC-4: 元の構成が無い（404）ときは、トーストを出して構成の一覧を読み直す', async () => {
    const { shares, api, builds, buildsApi, pushed } = await ready()
    await builds.ensureLoaded()
    api.setBuildExists(() => false)
    buildsApi.drop(buildId)
    const out = await shares.create(buildId)
    expect(out.result).toBe('notFound')
    expect(builds.builds).toEqual([])
    expect(pushed).toHaveBeenCalledWith(
      'この構成は別の端末で削除されていたため、共有しませんでした。一覧を読み直しました。',
      'destructive',
    )
  })

  it('AC-4: 409 は一般の失敗として扱い、原因を添えたトーストを出す', async () => {
    const { shares, api, pushed } = await ready()
    api.failWith('create', { kind: 'conflict' })
    const out = await shares.create(buildId)
    expect(out.result).toBe('failed')
    expect(pushed).toHaveBeenCalledWith(
      '構成を共有できませんでした。サーバーで処理できませんでした。 もう一度お試しください。',
      'destructive',
    )
  })

  it('AC-12: 通信の失敗では一覧を変えずに failed', async () => {
    const { shares, api } = await ready()
    api.failWith('create', { kind: 'failed', cause: 'network' })
    expect((await shares.create(buildId)).result).toBe('failed')
    expect(shares.shares).toHaveLength(2)
  })

  it('AC-12: 401 は expired で、トーストを1回出してログインが必要にする', async () => {
    const { shares, api, pushed } = await ready()
    api.failWith('create', { kind: 'unauthorized' })
    expect((await shares.create(buildId)).result).toBe('expired')
    expect(shares.status).toBe('loginRequired')
    expect(pushed).toHaveBeenCalledTimes(1)
  })

  it('AC-12: ログイン中でなければ要求を送らず expired', async () => {
    const { shares, api } = setup(fakeAuthApi())
    expect((await shares.create(buildId)).result).toBe('expired')
    expect(api.calls.create).toBe(0)
  })

  it('AC-12: 応答待ちの間にログイン中でなくなったら discarded で、トーストも出さない', async () => {
    const { shares, api, auth, pushed } = await ready()
    const release = api.hold('create')
    const pending = shares.create(buildId)
    await vi.waitFor(() => expect(api.calls.create).toBe(1))
    auth.expire()
    api.failWith('create', { kind: 'unauthorized' })
    release()
    expect((await pending).result).toBe('discarded')
    expect(pushed).not.toHaveBeenCalled()
  })
})

describe('shares ストアの取り消し', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('AC-9: 成功したら一覧から消してトーストを出す', async () => {
    const { shares, api, pushed } = await ready()
    expect(await shares.revoke(savedShare(1).id)).toBe('revoked')
    expect(shares.shares.map((s) => s.id)).toEqual([savedShare(2).id])
    expect(api.snapshot()).toHaveLength(1)
    expect(pushed).toHaveBeenCalledWith('共有を取り消しました。')
  })

  it('AC-8: 応答待ちの ID を持ち、終わると外す。待ち中の二重の取り消しは送らない', async () => {
    const { shares, api } = await ready()
    const id = savedShare(1).id
    const release = api.hold('revoke')
    const first = shares.revoke(id)
    await vi.waitFor(() => expect(api.calls.revoke).toBe(1))
    expect(shares.revokingIds).toEqual([id])
    expect(await shares.revoke(id)).toBe('failed')
    release()
    expect(await first).toBe('revoked')
    expect(shares.revokingIds).toEqual([])
    expect(api.calls.revoke).toBe(1)
  })

  it('AC-12: 通信の失敗では一覧を変えずにトーストを出す', async () => {
    const { shares, api, pushed } = await ready()
    api.failWith('revoke', { kind: 'failed', cause: 'network' })
    expect(await shares.revoke(savedShare(1).id)).toBe('failed')
    expect(shares.shares).toHaveLength(2)
    expect(pushed).toHaveBeenCalledWith(
      '共有を取り消せませんでした。サーバーに接続できませんでした。 もう一度お試しください。',
      'destructive',
    )
  })

  it('AC-12: 401 は expired でログインが必要にする', async () => {
    const { shares, api, pushed } = await ready()
    api.failWith('revoke', { kind: 'unauthorized' })
    expect(await shares.revoke(savedShare(1).id)).toBe('expired')
    expect(shares.status).toBe('loginRequired')
    expect(pushed).toHaveBeenCalledTimes(1)
  })

  it('AC-12: ログイン中でなければ要求を送らず expired', async () => {
    const { shares, api } = setup(fakeAuthApi())
    expect(await shares.revoke(savedShare(1).id)).toBe('expired')
    expect(api.calls.revoke).toBe(0)
  })

  it('AC-12: 応答待ちの間にログイン中でなくなったら discarded', async () => {
    const { shares, api, auth, pushed } = await ready()
    const release = api.hold('revoke')
    const pending = shares.revoke(savedShare(1).id)
    await vi.waitFor(() => expect(api.calls.revoke).toBe(1))
    auth.expire()
    release()
    expect(await pending).toBe('discarded')
    expect(pushed).not.toHaveBeenCalled()
  })
})

describe('shares ストアの閲覧', () => {
  it('AC-5: fetchShared はログインの状態を待たず、閲覧の結果をそのまま返す', async () => {
    const { shares, api } = setup(fakeAuthApi())
    const shared = {
      name: '共有',
      masterVersion: 'test-1',
      payload: savedBuild(1).payload,
      schemaVersion: 1 as const,
      createdAt: '2026-10-01T00:00:00Z',
    }
    api.seedShared('Ab3dE6gH9jK2', shared)
    expect(await shares.fetchShared('Ab3dE6gH9jK2')).toEqual({ kind: 'ok', value: shared })
    expect(api.calls.view).toBe(1)
  })

  it('AC-10: 不在・取り消し済みは notFound、失敗はそのまま返す', async () => {
    const { shares, api } = setup(fakeAuthApi())
    expect(await shares.fetchShared('Zz0000000000')).toEqual({ kind: 'notFound' })
    api.failWith('view', { kind: 'failed', cause: 'network' })
    expect(await shares.fetchShared('Zz0000000000')).toEqual({
      kind: 'failed',
      cause: 'network',
    })
  })
})
