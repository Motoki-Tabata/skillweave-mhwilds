import { afterEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import {
  NOT_FOUND_ROUTE_NAME,
  RouteChunkLoadError,
  installChunkErrorHook,
  installTitleHook,
  lazyView,
  routes,
} from '@/router'
import { useChunkLoadStore } from '@/stores/chunkLoad'
import { createPinia, setActivePinia } from 'pinia'

// 受入基準 4（護石の画面を /charms で開き、ページのタイトルを出す。D14）／011 AC-3・AC-4（/builds・/builds/:id）
describe('router', () => {
  const original = document.title
  afterEach(() => {
    document.title = original
  })

  it('/charms のルート（名前 charms）を持つ', () => {
    expect(routes.find((route) => route.path === '/charms')?.name).toBe('charms')
  })

  it('/builds（builds）と /builds/:id（build）のルートを持つ', () => {
    expect(routes.find((route) => route.path === '/builds')?.name).toBe('builds')
    expect(routes.find((route) => route.path === '/builds/:id')?.name).toBe('build')
  })

  it('012: /shares（shares）と /s/:shortId（shared-build）のルートを持つ', () => {
    expect(routes.find((route) => route.path === '/shares')?.name).toBe('shares')
    expect(routes.find((route) => route.path === '/s/:shortId')?.name).toBe('shared-build')
  })

  it('030 AC-1: /privacy（privacy）のルートを持ち、タイトルを書く', async () => {
    expect(routes.find((route) => route.path === '/privacy')?.name).toBe('privacy')
    const router = createRouter({ history: createMemoryHistory(), routes })
    installTitleHook(router)
    await router.push('/privacy')
    expect(document.title).toBe('プライバシー | SkillWeave')
  })

  it('遷移のたびに meta.title を document.title に書く', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    installTitleHook(router)
    await router.push('/charms')
    expect(document.title).toBe('護石 | SkillWeave')
    await router.push('/')
    expect(document.title).toBe('装備検索 | SkillWeave')
    await router.push('/builds')
    expect(document.title).toBe('保存した構成 | SkillWeave')
    await router.push('/builds/abc')
    expect(document.title).toBe('保存した構成 | SkillWeave')
  })
})

// 039 not-found-route の AC-1・AC-5・AC-8・AC-9
describe('router: キャッチオールと部品の読み込み失敗', () => {
  const original = document.title
  afterEach(() => {
    document.title = original
  })

  it('AC-1: キャッチオールの経路は名前 not-found とタイトルを持つ', async () => {
    const route = routes.find((r) => r.path === '/:pathMatch(.*)*')
    expect(route?.name).toBe(NOT_FOUND_ROUTE_NAME)
    expect(route?.meta?.title).toBe('ページが見つかりません | SkillWeave')
  })

  it.each(['/no-such-page', '/builds/abc/extra'])(
    'AC-1: %s へ移ると not-found に一致し、URL はそのまま・タイトルを書く',
    async (path) => {
      const router = createRouter({ history: createMemoryHistory(), routes })
      installTitleHook(router)
      await router.push('/')
      await router.push(path)
      expect(router.currentRoute.value.name).toBe('not-found')
      expect(router.currentRoute.value.fullPath).toBe(path)
      expect(document.title).toBe('ページが見つかりません | SkillWeave')
    },
  )

  it('AC-9: 既存の経路はキャッチオールに奪われない', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes })
    await router.push('/builds/abc')
    expect(router.currentRoute.value.name).toBe('build')
    await router.push('/')
    expect(router.currentRoute.value.name).toBe('search')
  })

  function chunkRouter(guardError?: Error) {
    setActivePinia(createPinia())
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: { template: '<div />' } },
        {
          path: '/broken',
          component: lazyView(() => Promise.reject(new TypeError('Failed to fetch'))),
        },
        {
          path: '/guarded',
          component: { template: '<div />' },
          beforeEnter: () => {
            throw guardError ?? new Error('guard')
          },
        },
      ],
    })
    installChunkErrorHook(router)
    return router
  }

  it('AC-5: lazyView は読み込みの拒否を元の例外つきの RouteChunkLoadError にする', async () => {
    const cause = new TypeError('x')
    await expect(lazyView(() => Promise.reject(cause))()).rejects.toMatchObject({
      name: 'RouteChunkLoadError',
      cause,
    })
    await expect(lazyView(() => Promise.reject(cause))()).rejects.toBeInstanceOf(
      RouteChunkLoadError,
    )
  })

  it('AC-5: 部品の読み込みで移動が失敗すると、行き先の href で通知を出す。画面は移動の前のまま', async () => {
    const router = chunkRouter()
    await router.push('/')
    await router.push('/broken?x=1').catch(() => undefined)
    const store = useChunkLoadStore()
    expect(store.visible).toBe(true)
    expect(store.targetHref).toBe('/broken?x=1')
    expect(router.currentRoute.value.fullPath).toBe('/')
  })

  it('AC-8: ガードの例外による失敗では通知を出さない', async () => {
    const router = chunkRouter()
    await router.push('/')
    await router.push('/guarded').catch(() => undefined)
    expect(useChunkLoadStore().visible).toBe(false)
  })
})
