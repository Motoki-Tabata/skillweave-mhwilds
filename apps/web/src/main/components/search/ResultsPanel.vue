<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { ProgressIndicator, ProgressRoot } from 'reka-ui'
import BuildCard from '@/components/search/BuildCard.vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { Button } from '@/components/ui/button'
import { useConditionsStore } from '@/stores/conditions'
import { useSearchStore } from '@/stores/search'

defineEmits<{ pickWeapon: [] }>()

const conditions = useConditionsStore()
const search = useSearchStore()

const heading = ref<HTMLElement | null>(null)

// 検索を始めたら、結果パネルの見出しへフォーカスを移す
watch(
  () => search.runCount,
  async () => {
    await nextTick()
    heading.value?.focus()
  },
)

type Outcome = 'found' | 'infeasible' | 'timeoutWithBuilds' | 'timeoutEmpty'

const builds = computed(() => search.response?.builds ?? [])

/** 結果の状態（Q2〜Q5）。 */
const outcome = computed<Outcome>(() => {
  if (search.response?.status === 'timeout') {
    return builds.value.length > 0 ? 'timeoutWithBuilds' : 'timeoutEmpty'
  }
  return builds.value.length > 0 ? 'found' : 'infeasible'
})

const max = computed(() => search.summary?.maxResults ?? 1)
const progressPercent = computed(() => Math.min(100, (search.found / max.value) * 100))
const reachedLimit = computed(() => builds.value.length >= max.value)

const summaryLine = computed(() => {
  const summary = search.summary
  if (summary === null) return ''
  return `武器: ${summary.weaponName} ／ 必須スキル ${summary.requiredCount} 件 ／ ${summary.objectiveLabel} ／ ${summary.maxResults} 件まで`
})

const TIMEOUT_HINT =
  '必須スキルを減らす・下限レベルを下げる・件数を減らすと、最後まで探せることがあります。'
</script>

<template>
  <section aria-labelledby="results-heading" class="flex min-w-0 flex-col gap-4">
    <h2
      id="results-heading"
      ref="heading"
      tabindex="-1"
      class="text-base leading-snug font-semibold"
    >
      検索結果
    </h2>

    <!-- Q0 未検索 -->
    <div
      v-if="search.status === 'idle'"
      class="flex flex-col items-start gap-3 rounded-lg border p-4"
    >
      <p class="text-muted-foreground text-sm">
        検索条件を選んで「検索」を押すと、構成がここに表示されます。
      </p>
      <Button
        v-if="conditions.weaponId === null"
        type="button"
        variant="outline"
        class="h-10"
        aria-haspopup="dialog"
        @click="$emit('pickWeapon')"
      >
        武器を選ぶ
      </Button>
    </div>

    <!-- Q1 検索中 -->
    <div v-else-if="search.status === 'searching'" class="flex flex-col gap-2">
      <div class="flex items-center justify-between gap-2">
        <output aria-live="polite" class="block text-sm">
          見つけた構成: <span class="tabular-nums">{{ search.found }}</span> 件
        </output>
        <Button type="button" variant="outline" class="h-10" @click="search.cancel()">
          キャンセル
        </Button>
      </div>
      <ProgressRoot
        :model-value="Math.min(search.found, max)"
        :max="max"
        class="bg-secondary relative h-2 w-full overflow-hidden rounded-full"
      >
        <ProgressIndicator
          class="bg-foreground h-full transition-all"
          :style="{ width: `${progressPercent}%` }"
        />
      </ProgressRoot>
    </div>

    <!-- Q6 エラー -->
    <ResultAlert v-else-if="search.status === 'error'" tone="error" title="検索できませんでした">
      <p>{{ search.errorMessage }}</p>
      <p>条件を変えて検索し直してください。直らないときは、ページを再読み込みしてください。</p>
    </ResultAlert>

    <!-- Q2〜Q5 結果 -->
    <template v-else>
      <ResultAlert
        v-if="outcome === 'infeasible'"
        tone="info"
        title="条件を満たす構成が見つかりませんでした"
      >
        <ul class="list-disc pl-5">
          <li>必須スキルを減らす</li>
          <li>下限レベルを下げる</li>
          <li v-if="!search.summary?.allRanksSelected">候補にするランクを広げる</li>
        </ul>
      </ResultAlert>

      <ResultAlert v-else-if="outcome === 'timeoutEmpty'" tone="warning">
        <p>時間の上限で検索を打ち切りました。構成は見つかっていません。</p>
        <p>{{ TIMEOUT_HINT }}</p>
      </ResultAlert>

      <template v-else>
        <ResultAlert v-if="outcome === 'timeoutWithBuilds'" tone="warning">
          <p>
            時間の上限で検索を打ち切りました。それまでに見つけた
            <span class="tabular-nums">{{ builds.length }}</span> 件を表示しています。
          </p>
          <p>{{ TIMEOUT_HINT }}</p>
        </ResultAlert>
        <div v-else class="flex flex-col gap-1">
          <p class="text-base font-semibold">
            <span class="tabular-nums">{{ builds.length }}</span> 件の構成が見つかりました
          </p>
          <p class="text-muted-foreground text-xs">
            {{
              reachedLimit
                ? '件数の上限に達しました。件数を増やすと、さらに見つかることがあります。'
                : '条件を満たす構成はこれで全部です。'
            }}
          </p>
        </div>
        <p class="text-xs break-words">{{ summaryLine }}</p>
        <ul class="flex flex-col gap-4">
          <li v-for="(build, index) in builds" :key="index">
            <BuildCard :build="build" :index="index" />
          </li>
        </ul>
      </template>
    </template>
  </section>
</template>
