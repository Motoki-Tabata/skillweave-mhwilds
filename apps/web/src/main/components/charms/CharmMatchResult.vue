<script setup lang="ts">
import { CircleCheck, Info, TriangleAlert } from '@lucide/vue'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import type { CharmMatch } from '@/lib/charms/match'

defineProps<{ match: CharmMatch; rarity: number; confirmError: boolean }>()
/** テーブルに合わないことを確認したか */
const confirmed = defineModel<boolean>('confirmed', { required: true })
</script>

<template>
  <output class="block">
    <p v-if="match.status === 'pass'" class="flex items-start gap-2 text-sm">
      <CircleCheck class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      抽選テーブルに合います（レア{{ rarity }}）。
    </p>
    <p v-else-if="match.status === 'unchecked'" class="flex items-start gap-2 text-sm">
      <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      レア{{ rarity }}の抽選テーブルは未整備のため、照合していません。このまま登録できます。
    </p>
    <div
      v-else
      class="border-border border-l-warning bg-warning/15 flex flex-col gap-2 rounded-md border border-l-[3px] px-3 py-2"
    >
      <p class="flex items-start gap-2 text-sm font-bold">
        <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        抽選テーブルに合いません（レア{{ rarity }}）
      </p>
      <ul class="list-disc pl-9 text-sm">
        <li v-for="issue in match.issues" :key="issue">{{ issue }}</li>
      </ul>
      <div class="flex min-h-11 items-center gap-2">
        <Checkbox
          id="charm-confirm"
          v-model="confirmed"
          :aria-invalid="confirmError"
          aria-describedby="charm-confirm-error"
        />
        <Label for="charm-confirm" class="text-sm">テーブルに合わないことを確認しました</Label>
      </div>
      <p v-if="confirmError" id="charm-confirm-error" class="text-destructive text-sm">
        確認のチェックを入れてください。
      </p>
    </div>
  </output>
</template>
