<script setup lang="ts">
import { computed } from 'vue'
import { Ban, CircleCheck, Info, TriangleAlert } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CHARM_MATCH_LABELS } from '@/constants/charms'
import { charmSummary, slotsLabel } from '@/lib/charms/format'
import type { CharmEntry } from '@/stores/charms'
import { useMasterStore } from '@/stores/master'

const props = defineProps<{ entry: CharmEntry; editing: boolean }>()
defineEmits<{ edit: []; remove: [] }>()

const master = useMasterStore()
const payload = computed(() => props.entry.charm.payload)
const summary = computed(() => charmSummary(payload.value, master.nameOf))
const status = computed(() => props.entry.match?.status ?? null)
const reasons = computed(() =>
  props.entry.eligibility !== null && !props.entry.eligibility.eligible
    ? props.entry.eligibility.reasons
    : [],
)
const statusIcon = computed(() => {
  if (status.value === 'pass') return CircleCheck
  return status.value === 'mismatch' ? TriangleAlert : Info
})
</script>

<template>
  <li
    class="flex flex-col gap-1 border-b px-3 py-2 last:border-b-0"
    :class="editing ? 'bg-muted border-l-primary border-l-[3px]' : ''"
    :data-charm-id="entry.charm.id"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="text-base font-bold tabular-nums">レア{{ payload.rarity }}</span>
        <Badge v-if="status !== null" variant="outline">
          <component :is="statusIcon" aria-hidden="true" />
          {{ CHARM_MATCH_LABELS[status] }}
        </Badge>
        <Badge v-if="reasons.length > 0" variant="outline">
          <Ban aria-hidden="true" />
          検索対象外
        </Badge>
      </div>
      <div class="flex shrink-0 gap-2">
        <Button
          type="button"
          variant="outline"
          class="h-11"
          :aria-label="`${summary}を編集`"
          :data-edit-id="entry.charm.id"
          @click="$emit('edit')"
        >
          編集
        </Button>
        <Button
          type="button"
          variant="outline"
          class="text-destructive border-destructive hover:text-destructive h-11"
          :aria-label="`${summary}を削除`"
          :data-delete-id="entry.charm.id"
          @click="$emit('remove')"
        >
          削除
        </Button>
      </div>
    </div>
    <ul v-if="payload.skills.length > 0" class="flex flex-wrap gap-1">
      <li
        v-for="skill in payload.skills"
        :key="skill.skillId"
        class="rounded-md border px-1.5 text-sm break-words"
      >
        {{ master.nameOf(skill.skillId) }} Lv{{ skill.level }}
      </li>
    </ul>
    <p v-else class="text-sm">スキルなし</p>
    <p class="text-sm">
      {{ payload.slots.length > 0 ? `スロット ${slotsLabel(payload.slots)}` : 'スロットなし' }}
    </p>
    <div v-if="reasons.length > 0" class="text-muted-foreground text-xs">
      <p v-for="reason in reasons" :key="reason">{{ reason }}</p>
      <p>編集して直すまで、検索の候補から外します。</p>
    </div>
  </li>
</template>
