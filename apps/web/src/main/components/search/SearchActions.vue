<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useConditionsStore } from '@/stores/conditions'
import { useReverseLookupStore } from '@/stores/reverseLookup'
import { useSearchStore } from '@/stores/search'

const REASON_ID = 'search-reason'
const REVERSE_NOTE_ID = 'reverse-lookup-note'
const REVERSE_NOTE =
  '登録した護石の代わりに、抽選テーブルから出うる護石で組めるかを調べます。目的・件数・護石の条件は使いません。'

const conditions = useConditionsStore()
const search = useSearchStore()
const reverse = useReverseLookupStore()

const searching = computed(() => search.status === 'searching')
const reversing = computed(() => reverse.status === 'searching')

/** 実行中のほうを取り消す。 */
function cancel(): void {
  if (reversing.value) reverse.cancel()
  else search.cancel()
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <p v-if="conditions.unavailableReason" :id="REASON_ID" class="text-muted-foreground text-xs">
      {{ conditions.unavailableReason }}
    </p>
    <div class="flex gap-2">
      <Button
        type="submit"
        class="h-10 min-w-28 flex-1"
        :disabled="conditions.unavailableReason !== null"
        :aria-describedby="conditions.unavailableReason ? REASON_ID : undefined"
      >
        {{ searching ? '検索し直す' : '検索' }}
      </Button>
      <Button
        v-if="searching || reversing"
        type="button"
        variant="outline"
        class="h-10 min-w-24"
        @click="cancel()"
      >
        キャンセル
      </Button>
    </div>
    <Button
      type="button"
      variant="outline"
      class="h-10 w-full"
      :disabled="reverse.unavailableReason !== null"
      :aria-describedby="REVERSE_NOTE_ID"
      @click="reverse.submit()"
    >
      {{ reversing ? '逆引きし直す' : '護石を逆引き' }}
    </Button>
    <p :id="REVERSE_NOTE_ID" class="text-muted-foreground text-xs">
      {{ reverse.unavailableReason ?? REVERSE_NOTE }}
    </p>
  </div>
</template>
