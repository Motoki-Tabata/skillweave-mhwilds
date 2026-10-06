<script setup lang="ts">
import { computed } from 'vue'
import { Button } from '@/components/ui/button'
import { useConditionsStore } from '@/stores/conditions'
import { useSearchStore } from '@/stores/search'

const REASON_ID = 'search-reason'

const conditions = useConditionsStore()
const search = useSearchStore()

const searching = computed(() => search.status === 'searching')
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
        v-if="searching"
        type="button"
        variant="outline"
        class="h-10 min-w-24"
        @click="search.cancel()"
      >
        キャンセル
      </Button>
    </div>
  </div>
</template>
