import { createRouter, createWebHistory } from 'vue-router'
import type { Component } from 'vue'
import type { Router, RouteRecordRaw } from 'vue-router'
import { useChunkLoadStore } from '@/stores/chunkLoad'

declare module 'vue-router' {
  interface RouteMeta {
    /** `document.title` に書くページのタイトル */
    title?: string
  }
}

/** キャッチオールの経路の名前（`/:pathMatch(.*)*`）。 */
export const NOT_FOUND_ROUTE_NAME = 'not-found'

/** 経路の部品（画面）を読めなかったことを表す。`cause` に元の例外を持つ。 */
export class RouteChunkLoadError extends Error {
  constructor(cause: unknown) {
    super('Failed to load route component', { cause })
    this.name = 'RouteChunkLoadError'
  }
}

type ViewModule = { default: Component }

/** 経路の部品の読み込みを包み、失敗を `RouteChunkLoadError` にする。 */
export function lazyView(load: () => Promise<ViewModule>): () => Promise<ViewModule> {
  return () =>
    load().catch((cause: unknown) => {
      throw new RouteChunkLoadError(cause)
    })
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'search',
    component: lazyView(() => import('@/views/SearchView.vue')),
    meta: { title: '装備検索 | SkillWeave' },
  },
  {
    path: '/builds',
    name: 'builds',
    component: lazyView(() => import('@/views/BuildsView.vue')),
    meta: { title: '保存した構成 | SkillWeave' },
  },
  {
    path: '/builds/:id',
    name: 'build',
    component: lazyView(() => import('@/views/BuildView.vue')),
    meta: { title: '保存した構成 | SkillWeave' },
  },
  {
    path: '/shares',
    name: 'shares',
    component: lazyView(() => import('@/views/SharesView.vue')),
    meta: { title: '共有した構成 | SkillWeave' },
  },
  {
    path: '/s/:shortId',
    name: 'shared-build',
    component: lazyView(() => import('@/views/SharedBuildView.vue')),
    meta: { title: '共有された構成 | SkillWeave' },
  },
  {
    path: '/charms',
    name: 'charms',
    component: lazyView(() => import('@/views/CharmsView.vue')),
    meta: { title: '護石 | SkillWeave' },
  },
  {
    path: '/weapons',
    name: 'weapons',
    component: lazyView(() => import('@/views/WeaponsView.vue')),
    meta: { title: '個体差のある武器 | SkillWeave' },
  },
  {
    path: '/privacy',
    name: 'privacy',
    component: lazyView(() => import('@/views/PrivacyView.vue')),
    meta: { title: 'プライバシー | SkillWeave' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: NOT_FOUND_ROUTE_NAME,
    component: lazyView(() => import('@/views/NotFoundView.vue')),
    meta: { title: 'ページが見つかりません | SkillWeave' },
  },
]

/** 遷移のたびに、ルートの `meta.title` を `document.title` に書く。 */
export function installTitleHook(target: Router): void {
  target.afterEach((to) => {
    if (to.meta.title !== undefined) document.title = to.meta.title
  })
}

/** 部品の読み込み失敗で移動が失敗したとき、読み込み失敗の通知を出す。それ以外の失敗では何もしない。 */
export function installChunkErrorHook(target: Router): void {
  target.onError((error, to) => {
    if (error instanceof RouteChunkLoadError) {
      useChunkLoadStore().report(target.resolve(to.fullPath).href)
    }
  })
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

installTitleHook(router)
installChunkErrorHook(router)

export default router
