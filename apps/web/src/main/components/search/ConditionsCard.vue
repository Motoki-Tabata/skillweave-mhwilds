<script setup lang="ts">
import { ref } from 'vue'
import type { AcceptableValue } from 'reka-ui'
import type { ArmorRank } from '@swv/data'
import { Minus, Plus } from '@lucide/vue'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldIncrement,
  NumberFieldInput,
} from '@/components/ui/number-field'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ARMOR_RANKS, OBJECTIVE_OPTIONS } from '@/constants/labels'
import type { ObjectiveChoice } from '@/constants/labels'
import { MAX_RESULTS_MAX, MAX_RESULTS_MIN } from '@/constants/search'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'

const RANK_ERROR_ID = 'rank-error'

const conditions = useConditionsStore()
const master = useMasterStore()

const root = ref<HTMLElement | null>(null)
// 件数の欄が空のまま確定されたときに、直前の値で作り直すための鍵
const countKey = ref(0)

const stepButtonClass =
  'static size-11 translate-y-0 rounded-md border p-0 flex items-center justify-center hover:bg-accent disabled:opacity-40 focus-visible:ring-ring/50 focus-visible:ring-3 outline-none'

function rankOptions() {
  return ARMOR_RANKS.filter((rank) => master.availableRanks.includes(rank.id))
}

function onCountChange(value: number | undefined): void {
  if (value === undefined) {
    // 空欄は直前の値に戻す
    countKey.value += 1
    return
  }
  conditions.setMaxResults(value)
}

function onObjectiveChange(value: AcceptableValue): void {
  conditions.setObjective(value as ObjectiveChoice)
}

function onRankChange(rank: ArmorRank, checked: boolean | 'indeterminate'): void {
  conditions.setRank(rank, checked === true)
}

/** 最初の不正な項目（ランク）へフォーカスを移す。 */
function focusRanks(): void {
  root.value?.querySelector<HTMLElement>('[data-rank-checkbox]')?.focus()
}

defineExpose({ focusRanks })
</script>

<template>
  <Card class="gap-3 py-4">
    <h2 class="px-4 text-base leading-snug font-semibold">検索条件</h2>
    <CardContent class="px-4">
      <div ref="root" class="flex flex-col gap-4">
        <div class="flex flex-col gap-1">
          <span id="objective-label" class="text-sm font-medium">目的</span>
          <RadioGroup
            :model-value="conditions.objective"
            aria-labelledby="objective-label"
            class="gap-0"
            @update:model-value="onObjectiveChange"
          >
            <div
              v-for="option in OBJECTIVE_OPTIONS"
              :key="option.id"
              class="flex min-h-11 items-start gap-3 py-2"
            >
              <RadioGroupItem
                :id="`objective-${option.id}`"
                :value="option.id"
                class="mt-0.5"
                :aria-describedby="`objective-${option.id}-description`"
              />
              <div class="flex flex-col">
                <Label :for="`objective-${option.id}`">{{ option.label }}</Label>
                <span
                  :id="`objective-${option.id}-description`"
                  class="text-muted-foreground text-xs"
                  >{{ option.description }}</span
                >
              </div>
            </div>
          </RadioGroup>
        </div>

        <div class="flex flex-col gap-1">
          <Label for="max-results">件数</Label>
          <NumberField
            :key="countKey"
            id="max-results"
            class="w-fit"
            :model-value="conditions.maxResults"
            :min="MAX_RESULTS_MIN"
            :max="MAX_RESULTS_MAX"
            :step="1"
            @update:model-value="onCountChange"
          >
            <div class="flex items-center gap-2">
              <NumberFieldDecrement aria-label="件数を減らす" :class="stepButtonClass">
                <Minus class="size-4" />
              </NumberFieldDecrement>
              <NumberFieldInput
                class="h-10 w-16 text-base tabular-nums md:text-sm"
                inputmode="numeric"
              />
              <NumberFieldIncrement aria-label="件数を増やす" :class="stepButtonClass">
                <Plus class="size-4" />
              </NumberFieldIncrement>
            </div>
          </NumberField>
          <span class="text-muted-foreground text-xs">
            {{ MAX_RESULTS_MIN }}〜{{ MAX_RESULTS_MAX }} 件
          </span>
        </div>

        <div class="flex flex-col gap-1">
          <span id="rank-label" class="text-sm font-medium">候補にするランク</span>
          <fieldset
            aria-labelledby="rank-label"
            class="m-0 flex min-w-0 flex-wrap gap-x-4 border-0 p-0"
            :aria-describedby="conditions.rankError ? RANK_ERROR_ID : undefined"
          >
            <div
              v-for="rank in rankOptions()"
              :key="rank.id"
              class="flex min-h-11 items-center gap-2"
            >
              <Checkbox
                :id="`rank-${rank.id}`"
                data-rank-checkbox
                :model-value="conditions.ranks.includes(rank.id)"
                @update:model-value="(checked) => onRankChange(rank.id, checked)"
              />
              <Label :for="`rank-${rank.id}`">{{ rank.label }}</Label>
            </div>
          </fieldset>
          <p v-if="conditions.rankError" :id="RANK_ERROR_ID" class="text-destructive text-sm">
            候補にするランクを1つ以上選んでください。
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
