<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import LoginRequiredCard from '@/components/builds/LoginRequiredCard.vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import { useBuildsStore } from '@/stores/builds'
import { useMasterStore } from '@/stores/master'

/**
 * 保存した構成の画面（S4・S5）の共通の状態。読込中・ログインが必要・マスターの読込失敗・
 * 一覧の読込失敗を出し、一覧とマスターが揃ったときだけ既定のスロットを出す。
 */
const master = useMasterStore()
const builds = useBuildsStore()

type Phase = 'loading' | 'loginRequired' | 'masterFailed' | 'listFailed' | 'ready'

const phase = computed<Phase>(() => {
  if (builds.status === 'loading') return 'loading'
  if (builds.status === 'loginRequired') return 'loginRequired'
  if (master.status === 'loading') return 'loading'
  if (master.status === 'failed') return 'masterFailed'
  return builds.status === 'failed' ? 'listFailed' : 'ready'
})

// 読み込みが 300ms 未満で終わるときは、スケルトンを出さない（ちらつきを避ける）
const showSkeleton = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearSkeletonTimer(): void {
  if (skeletonTimer !== undefined) clearTimeout(skeletonTimer)
  skeletonTimer = undefined
}

watch(
  () => phase.value === 'loading',
  (isLoading) => {
    clearSkeletonTimer()
    showSkeleton.value = false
    if (!isLoading) return
    skeletonTimer = setTimeout(() => {
      showSkeleton.value = true
    }, LOADING_SKELETON_DELAY_MS)
  },
  { immediate: true },
)

onMounted(() => {
  if (master.bundle === null) void master.load()
  void builds.ensureLoaded()
})
onBeforeUnmount(clearSkeletonTimer)
</script>

<template>
  <div v-if="phase === 'loading'" class="flex flex-col gap-2">
    <template v-if="showSkeleton">
      <output class="block text-sm">保存した構成を読み込んでいます…</output>
      <Skeleton class="h-28 w-full" />
      <Skeleton class="h-28 w-full" />
      <Skeleton class="h-28 w-full" />
    </template>
  </div>

  <LoginRequiredCard v-else-if="phase === 'loginRequired'" :reason="builds.loginRequiredReason" />

  <div v-else-if="phase === 'masterFailed'" class="flex flex-col items-start gap-3">
    <ResultAlert tone="error" title="データを読み込めませんでした">
      <p>{{ master.failureMessage }}</p>
      <p>通信状況を確かめて、「再読み込み」を押してください。</p>
    </ResultAlert>
    <Button type="button" class="h-10" @click="master.load()">再読み込み</Button>
  </div>

  <div v-else-if="phase === 'listFailed'" class="flex flex-col items-start gap-3">
    <ResultAlert tone="error" title="保存した構成を読み込めません">
      <p>{{ builds.failureMessage }}</p>
      <p>通信の状態を確かめて、「再読み込み」を押してください。</p>
    </ResultAlert>
    <Button type="button" variant="outline" class="h-10" @click="builds.reload()">
      再読み込み
    </Button>
  </div>

  <slot v-else />
</template>
