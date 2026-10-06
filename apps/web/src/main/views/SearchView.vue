<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import ConditionsCard from '@/components/search/ConditionsCard.vue'
import RequiredSkillsCard from '@/components/search/RequiredSkillsCard.vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import ResultsPanel from '@/components/search/ResultsPanel.vue'
import SearchActions from '@/components/search/SearchActions.vue'
import SkillDialog from '@/components/search/SkillDialog.vue'
import WeaponCard from '@/components/search/WeaponCard.vue'
import WeaponDialog from '@/components/search/WeaponDialog.vue'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'
import { useSearchStore } from '@/stores/search'

const master = useMasterStore()
const conditions = useConditionsStore()
const search = useSearchStore()

const weaponDialogOpen = ref(false)
const skillDialogOpen = ref(false)
const weaponCard = ref<InstanceType<typeof WeaponCard> | null>(null)
const conditionsCard = ref<InstanceType<typeof ConditionsCard> | null>(null)

// 読み込みが 300ms 未満で終わるときは、スケルトンを出さない（ちらつきを避ける）
const showSkeleton = ref(false)
let skeletonTimer: ReturnType<typeof setTimeout> | undefined

function clearSkeletonTimer(): void {
  if (skeletonTimer !== undefined) clearTimeout(skeletonTimer)
  skeletonTimer = undefined
}

watch(
  () => master.status,
  (status) => {
    clearSkeletonTimer()
    showSkeleton.value = false
    if (status !== 'loading') return
    skeletonTimer = setTimeout(() => {
      showSkeleton.value = true
    }, LOADING_SKELETON_DELAY_MS)
  },
  { immediate: true },
)

onMounted(() => {
  if (master.bundle === null) void master.load()
})

onBeforeUnmount(clearSkeletonTimer)

function focusFirstInvalid(): void {
  if (conditions.weaponId === null) weaponCard.value?.focus()
  else if (conditions.rankError) conditionsCard.value?.focusRanks()
}

function onSubmit(): void {
  if (!search.submit()) focusFirstInvalid()
}

// 送信ボタンが無効のあいだは Enter での送信が起きないので、ここで受けて各項目のエラーを出す
function onEnter(event: KeyboardEvent): void {
  if (!(event.target instanceof HTMLInputElement) || conditions.unavailableReason === null) return
  event.preventDefault()
  onSubmit()
}

// ダイアログを閉じたら、フォーカスを武器のボタンに戻す
function returnFocusToWeapon(event: Event): void {
  event.preventDefault()
  weaponCard.value?.focus()
}
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <h1 class="mb-4 text-xl leading-snug font-semibold">装備検索</h1>
    <div
      class="flex flex-col gap-4 lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-6"
    >
      <!-- P1 読込中 -->
      <template v-if="master.status === 'loading'">
        <div class="flex flex-col gap-4">
          <template v-if="showSkeleton">
            <output class="block text-sm">マスターデータとソルバーを読み込んでいます…</output>
            <Skeleton class="h-24 w-full" />
            <Skeleton class="h-32 w-full" />
            <Skeleton class="h-48 w-full" />
          </template>
        </div>
        <div v-if="showSkeleton" class="flex flex-col gap-4">
          <Skeleton class="h-8 w-40" />
          <Skeleton class="h-64 w-full" />
        </div>
      </template>

      <!-- P2 読込失敗 -->
      <div v-else-if="master.status === 'failed'" class="flex flex-col items-start gap-3">
        <ResultAlert tone="error" title="データを読み込めませんでした">
          <p>{{ master.failureMessage }}</p>
          <p>通信状況を確かめて、「再読み込み」を押してください。</p>
        </ResultAlert>
        <Button type="button" class="h-10" @click="master.load()">再読み込み</Button>
      </div>

      <!-- P3 準備完了 -->
      <template v-else>
        <form
          class="flex flex-col gap-4"
          novalidate
          @submit.prevent="onSubmit"
          @keydown.enter="onEnter"
        >
          <WeaponCard ref="weaponCard" @open="weaponDialogOpen = true" />
          <RequiredSkillsCard @open="skillDialogOpen = true" />
          <ConditionsCard ref="conditionsCard" />
          <SearchActions />
        </form>
        <ResultsPanel @pick-weapon="weaponDialogOpen = true" />
        <WeaponDialog v-model:open="weaponDialogOpen" @close-auto-focus="returnFocusToWeapon" />
        <SkillDialog v-model:open="skillDialogOpen" />
      </template>
    </div>
  </div>
</template>
