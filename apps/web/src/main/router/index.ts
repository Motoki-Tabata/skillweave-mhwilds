import { createRouter, createWebHistory } from 'vue-router'
import type { Router, RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /** `document.title` に書くページのタイトル */
    title?: string
  }
}

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'search',
    component: () => import('@/views/SearchView.vue'),
    meta: { title: '装備検索 | SkillWeave' },
  },
  {
    path: '/charms',
    name: 'charms',
    component: () => import('@/views/CharmsView.vue'),
    meta: { title: '護石 | SkillWeave' },
  },
]

/** 遷移のたびに、ルートの `meta.title` を `document.title` に書く。 */
export function installTitleHook(target: Router): void {
  target.afterEach((to) => {
    if (to.meta.title !== undefined) document.title = to.meta.title
  })
}

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

installTitleHook(router)

export default router
