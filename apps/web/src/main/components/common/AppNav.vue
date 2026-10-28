<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'

const LINKS = [
  { to: '/', label: '装備検索' },
  { to: '/builds', label: '保存した構成' },
  { to: '/charms', label: '護石' },
  { to: '/weapons', label: '個体差のある武器' },
] as const

const route = useRoute()
const list = ref<HTMLElement | null>(null)

/** 今の画面のリンクか。保存した構成の詳細（`/builds/:id`）は「保存した構成」にする。 */
function isCurrent(to: string): boolean {
  if (to === '/') return route.path === '/'
  return route.path === to || route.path.startsWith(`${to}/`)
}

/** 今のリンクが見える範囲に入るよう、ナビの行だけを横にスクロールする（ページは動かさない）。 */
function revealCurrent(): void {
  const container = list.value
  const current = container?.querySelector<HTMLElement>('[aria-current="page"]')
  if (container === null || container === undefined || current === null || current === undefined) {
    return
  }
  const left = current.offsetLeft
  const right = left + current.offsetWidth
  if (left < container.scrollLeft) container.scrollLeft = left
  else if (right > container.scrollLeft + container.clientWidth) {
    container.scrollLeft = right - container.clientWidth
  }
}

watch(
  () => route.path,
  () => void nextTick(revealCurrent),
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <nav aria-label="画面の切り替え" class="border-b">
    <ul
      ref="list"
      class="relative mx-auto flex w-full gap-2 overflow-x-auto px-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]"
    >
      <li v-for="link in LINKS" :key="link.to" class="flex shrink-0">
        <RouterLink v-slot="{ href, navigate }" :to="link.to" custom>
          <a
            :href="href"
            :aria-current="isCurrent(link.to) ? 'page' : undefined"
            class="focus-visible:ring-ring/50 flex h-11 items-center border-b-[3px] border-transparent px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-inset aria-[current=page]:border-primary aria-[current=page]:font-bold"
            @click="navigate"
          >
            {{ link.label }}
          </a>
        </RouterLink>
      </li>
    </ul>
  </nav>
</template>
