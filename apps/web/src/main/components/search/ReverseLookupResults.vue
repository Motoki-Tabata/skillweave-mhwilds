<script setup lang="ts">
import { computed } from 'vue'
import { ProgressIndicator, ProgressRoot } from 'reka-ui'
import ResultAlert from '@/components/search/ResultAlert.vue'
import ReverseCandidateCard from '@/components/search/ReverseCandidateCard.vue'
import { Button } from '@/components/ui/button'
import { REVERSE_LOOKUP_MAX_RESULTS } from '@/constants/search'
import { useReverseLookupStore } from '@/stores/reverseLookup'

/** 逆引きの状態（R1〜R6）。結果パネルの見出しの下に出す。 */
const reverse = useReverseLookupStore()

const max = REVERSE_LOOKUP_MAX_RESULTS
const progressPercent = computed(() => Math.min(100, (reverse.found / max) * 100))
const candidates = computed(() => reverse.candidates)
const hasCandidates = computed(() => candidates.value.length > 0)
const timedOut = computed(() => reverse.response?.status === 'timeout')

const hasExclusion = computed(
  () =>
    (reverse.summary?.excludedArmorCount ?? 0) + (reverse.summary?.excludedDecorationCount ?? 0) >
    0,
)
const hasLockOrExclusion = computed(
  () => (reverse.summary?.fixedPartCount ?? 0) > 0 || hasExclusion.value,
)

const summaryLine = computed(() => {
  const summary = reverse.summary
  if (summary === null) return ''
  const conditionsText =
    summary.activeConditionNames.length === 0 ? 'なし' : summary.activeConditionNames.join('・')
  const fixedText = summary.fixedPartCount > 0 ? `固定 ${summary.fixedPartCount} 部位` : '固定なし'
  const excludedText = hasExclusion.value
    ? `除外: 防具 ${summary.excludedArmorCount} 件・装飾品 ${summary.excludedDecorationCount} 件`
    : '除外なし'
  const tableText = summary.rarities.map((rarity) => `レア${rarity}`).join('・')
  return `武器: ${summary.weaponName} ／ 必須スキル ${summary.requiredCount} 件 ／ 発動条件: ${conditionsText} ／ ${fixedText} ／ ${excludedText} ／ 抽選テーブル: ${tableText}`
})

const TIMEOUT_HINT = '必須スキルを減らす・下限レベルを下げると、最後まで探せることがあります。'
</script>

<template>
  <!-- R1 実行中 -->
  <div v-if="reverse.status === 'searching'" class="flex flex-col gap-2">
    <div class="flex items-center justify-between gap-2">
      <output aria-live="polite" class="block text-sm">
        見つけた護石: <span class="tabular-nums">{{ reverse.found }}</span> 件
      </output>
      <Button type="button" variant="outline" class="h-10" @click="reverse.cancel()">
        キャンセル
      </Button>
    </div>
    <ProgressRoot
      :model-value="Math.min(reverse.found, max)"
      :max="max"
      class="bg-secondary relative h-2 w-full overflow-hidden rounded-full"
    >
      <ProgressIndicator
        class="bg-foreground h-full transition-all"
        :style="{ width: `${progressPercent}%` }"
      />
    </ProgressRoot>
    <template v-if="hasCandidates">
      <p class="text-muted-foreground text-xs">
        見つけた順に表示しています。逆引きが終わると、要るスキルが少ない順に並べ直します。
      </p>
      <p class="text-xs break-words">{{ summaryLine }}</p>
      <ul class="flex flex-col gap-4">
        <li v-for="(candidate, index) in candidates" :key="`progress-${index}`">
          <ReverseCandidateCard :candidate="candidate" :index="index" />
        </li>
      </ul>
    </template>
  </div>

  <!-- R6 エラー -->
  <ResultAlert v-else-if="reverse.status === 'error'" tone="error" title="逆引きできませんでした">
    <p>{{ reverse.errorMessage }}</p>
    <p>条件を変えて逆引きし直してください。直らないときは、ページを再読み込みしてください。</p>
  </ResultAlert>

  <!-- R3 見つからない -->
  <ResultAlert
    v-else-if="!hasCandidates && !timedOut"
    tone="info"
    title="抽選テーブルのどの護石でも条件を満たせません"
  >
    <ul class="list-disc pl-5">
      <li>必須スキルを減らす</li>
      <li>下限レベルを下げる</li>
      <li v-if="!reverse.summary?.allRanksSelected">候補にするランクを広げる</li>
      <li v-if="hasLockOrExclusion">部位の固定や除外を減らす</li>
    </ul>
  </ResultAlert>

  <!-- R5 打ち切り（候補なし） -->
  <ResultAlert v-else-if="!hasCandidates" tone="warning">
    <p>時間の上限で逆引きを打ち切りました。護石は見つかっていません。</p>
    <p>{{ TIMEOUT_HINT }}</p>
  </ResultAlert>

  <!-- R2・R4 候補あり -->
  <template v-else>
    <ResultAlert v-if="timedOut" tone="warning">
      <p>
        時間の上限で逆引きを打ち切りました。それまでに見つけた
        <span class="tabular-nums">{{ candidates.length }}</span> 件を表示しています。
      </p>
      <p>{{ TIMEOUT_HINT }}</p>
    </ResultAlert>
    <div v-else class="flex flex-col gap-1">
      <p class="text-base font-bold">
        <span class="tabular-nums">{{ candidates.length }}</span> 件の護石が見つかりました
      </p>
      <p class="text-muted-foreground text-xs">
        {{
          candidates.length >= max
            ? `件数の上限（${max} 件）に達しました。必須スキルを増やすと、候補を絞り込めます。`
            : '条件を満たせる護石はこれで全部です。'
        }}
      </p>
      <p class="text-muted-foreground text-xs">
        抽選の出やすさは示していません。要るスキルが少ない順・レベルの合計が低い順・レア度が低い順に並べています。
      </p>
    </div>
    <p class="text-xs break-words">{{ summaryLine }}</p>
    <ul class="flex flex-col gap-4">
      <li v-for="(candidate, index) in candidates" :key="`result-${index}`">
        <ReverseCandidateCard :candidate="candidate" :index="index" />
      </li>
    </ul>
  </template>
</template>
