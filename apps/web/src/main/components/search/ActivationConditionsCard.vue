<script setup lang="ts">
import type { ConditionId } from '@swv/data'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { useConditionsStore } from '@/stores/conditions'

const conditions = useConditionsStore()

function onChange(id: ConditionId, checked: boolean | 'indeterminate'): void {
  conditions.setConditionActive(id, checked === true)
}
</script>

<template>
  <Card class="gap-3 py-4">
    <div class="flex items-baseline justify-between gap-2 px-4">
      <h2 class="text-base leading-snug font-semibold">発動条件</h2>
      <span class="text-muted-foreground text-xs tabular-nums">
        オン {{ conditions.activeConditionIds.length }} 件
      </span>
    </div>
    <CardContent class="flex flex-col gap-3 px-4">
      <p class="text-muted-foreground text-xs">
        オンにした条件の効果を、火力の計算と「火力の最大化」に数えます。検索の後に変えたときは、次の検索から反映します。
      </p>
      <fieldset aria-label="発動条件" class="m-0 flex min-w-0 flex-wrap gap-2 border-0 p-0">
        <label
          v-for="option in conditions.conditionOptions"
          :key="option.id"
          :for="`condition-${option.id}`"
          :class="
            cn(
              'flex min-h-11 items-center gap-2 rounded-sm border px-3 text-sm',
              conditions.activeConditionIds.includes(option.id)
                ? 'border-foreground'
                : 'border-input',
            )
          "
        >
          <Checkbox
            :id="`condition-${option.id}`"
            :model-value="conditions.activeConditionIds.includes(option.id)"
            @update:model-value="(checked) => onChange(option.id, checked)"
          />
          <span>{{ option.name }}</span>
        </label>
      </fieldset>
    </CardContent>
  </Card>
</template>
