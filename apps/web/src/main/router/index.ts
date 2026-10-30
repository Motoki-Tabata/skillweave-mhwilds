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
    path: '/builds',
    name: 'builds',
    component: () => import('@/views/BuildsView.vue'),
    meta: { title: '保存した構成 | SkillWeave' },
  },
  {
    path: '/builds/:id',
    name: 'build',
    component: () => import('@/views/BuildView.vue'),
    meta: { title: '保存した構成 | SkillWeave' },
  },
  {
    path: '/shares',
    name: 'shares',
    component: () => import('@/views/SharesView.vue'),
    meta: { title: '共有した構成 | SkillWeave' },
  },
  {
    path: '/s/:shortId',
    name: 'shared-build',
    component: () => import('@/views/SharedBuildView.vue'),
    meta: { title: '共有された構成 | SkillWeave' },
  },
  {
    path: '/charms',
    name: 'charms',
    component: () => import('@/views/CharmsView.vue'),
    meta: { title: '護石 | SkillWeave' },
  },
  {
    path: '/weapons',
    name: 'weapons',
    component: () => import('@/views/WeaponsView.vue'),
    meta: { title: '個体差のある武器 | SkillWeave' },
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
