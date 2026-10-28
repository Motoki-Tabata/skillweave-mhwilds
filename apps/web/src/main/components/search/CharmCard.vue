<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { LOADING_SKELETON_DELAY_MS } from '@/constants/search'
import { cn } from '@/lib/utils'
import { useCharmsStore } from '@/stores/charms'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'

const charms = useCharmsStore()
const conditions = useConditionsStore()
const master = useMasterStore()

// 読み込みが 300ms 未満で終わるときは、何も出さない（ちらつきを避ける）
const showLoading = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

function clearTimer(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

watch(
  () => charms.status,
  (status) => {
    clearTimer()
    showLoading.value = false
    if (status !== 'loading') return
    timer = setTimeout(() => {
      showLoading.value = true
    }, LOADING_SKELETON_DELAY_MS)
  },
  { immediate: true },
)

onMounted(() => {
  void charms.ensureLoaded()
})
onBeforeUnmount(clearTimer)

const fallbackText = computed(() =>
  conditions.includeCraftedCharms
    ? '生産護石だけを候補にして検索します。'
    : '護石なしで検索します。',
)
</script>

<template>
  <Card class="gap-3 py-4">
    <h2 class="px-4 text-base leading-snug font-semibold">護石</h2>
    <CardContent class="flex flex-col items-start gap-3 px-4">
      <div class="flex flex-col gap-1">
        <div class="flex min-h-11 items-center gap-2">
          <Checkbox
            id="include-crafted-charms"
            aria-describedby="include-crafted-charms-description"
            :model-value="conditions.includeCraftedCharms"
            @update:model-value="(checked) => (conditions.includeCraftedCharms = checked === true)"
          />
          <Label for="include-crafted-charms">生産護石を候補に含める</Label>
        </div>
        <p id="include-crafted-charms-description" class="text-muted-foreground pl-6 text-xs">
          素材で作れる護石を、すべて持っているとみなして候補にします（系統ごとに最上位ランクの
          <span class="font-num tabular-nums">{{ master.craftedCharms.length }}</span> 件）。
        </p>
      </div>
      <output v-if="charms.status === 'loading'" class="block text-sm">
        <template v-if="showLoading">護石を読み込んでいます…</template>
      </output>
      <ResultAlert v-else-if="charms.status !== 'ready'" tone="warning">
        <p>
          護石を読み込めませんでした（{{ charms.failureMessage.replace(/。$/, '') }}）。{{
            fallbackText
          }}
        </p>
      </ResultAlert>
      <p v-else-if="charms.charms.length === 0" class="text-sm">
        鑑定護石が登録されていません。{{ fallbackText }}
      </p>
      <div v-else class="flex flex-col gap-1">
        <p class="text-sm">
          候補にする鑑定護石:
          <span class="font-num font-bold tabular-nums">{{ charms.candidateCount }}</span> 件
        </p>
        <p v-if="charms.excludedCount > 0" class="text-muted-foreground text-xs">
          登録した <span class="tabular-nums">{{ charms.charms.length }}</span> 件のうち
          <span class="tabular-nums">{{ charms.excludedCount }}</span>
          件は、スキルが現行のマスターに合わないため候補から外しています。
        </p>
      </div>
      <RouterLink to="/charms" :class="cn(buttonVariants({ variant: 'outline' }), 'h-10')">
        護石の一覧へ
      </RouterLink>
    </CardContent>
  </Card>
</template>
