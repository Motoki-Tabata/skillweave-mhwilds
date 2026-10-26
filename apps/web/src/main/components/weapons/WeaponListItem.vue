<script setup lang="ts">
import { computed } from 'vue'
import { Ban } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  weaponBonusLabels,
  weaponDisplayName,
  weaponSpecLine,
  weaponTypeLabel,
} from '@/lib/weapons/convert'
import type { WeaponEntry } from '@/stores/weapons'
import { useMasterStore } from '@/stores/master'

const props = defineProps<{ entry: WeaponEntry; editing: boolean }>()
defineEmits<{ edit: []; remove: [] }>()

const master = useMasterStore()
const payload = computed(() => props.entry.weapon.payload)
const context = computed(() => ({ bundle: master.bundle!, nameOf: master.nameOf }))
const displayName = computed(() => weaponDisplayName(payload.value, context.value))
const typeLabel = computed(() => weaponTypeLabel(payload.value, context.value))
const bonusLabels = computed(() => weaponBonusLabels(payload.value, context.value))
const reasons = computed(() =>
  props.entry.eligibility !== null && !props.entry.eligibility.eligible
    ? props.entry.eligibility.reasons
    : [],
)
/** 2行目。武器種（基の武器がマスターに無ければ出さない）と、名前があるときは基の武器の名前。 */
const subtitle = computed(() => {
  if (typeLabel.value === null) return ''
  return payload.value.name === ''
    ? typeLabel.value
    : `${typeLabel.value} ／ 基の武器 ${master.nameOf(payload.value.baseWeaponId)}`
})
</script>

<template>
  <li
    class="flex flex-col gap-1 border-b px-3 py-2 last:border-b-0"
    :class="editing ? 'bg-muted border-l-primary border-l-[3px]' : ''"
    :data-weapon-id="entry.weapon.id"
  >
    <div class="flex items-start justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="text-base font-bold break-words">{{ displayName }}</span>
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
          :aria-label="`${displayName}を編集`"
          :data-edit-id="entry.weapon.id"
          @click="$emit('edit')"
        >
          編集
        </Button>
        <Button
          type="button"
          variant="outline"
          class="text-destructive border-destructive hover:text-destructive h-11"
          :aria-label="`${displayName}を削除`"
          :data-delete-id="entry.weapon.id"
          @click="$emit('remove')"
        >
          削除
        </Button>
      </div>
    </div>
    <p v-if="subtitle !== ''" class="text-xs">{{ subtitle }}</p>
    <p class="text-xs tabular-nums">{{ weaponSpecLine(payload) }}</p>
    <ul v-if="bonusLabels.length > 0" class="flex flex-wrap gap-1">
      <li
        v-for="label in bonusLabels"
        :key="label"
        class="rounded-md border px-1.5 text-sm break-words"
      >
        {{ label }}
      </li>
    </ul>
    <p v-else class="text-sm">付与スキルなし</p>
    <div v-if="reasons.length > 0" class="text-muted-foreground text-xs">
      <p v-for="reason in reasons" :key="reason">{{ reason }}</p>
      <p>編集して直すまで、検索の候補から外します。</p>
    </div>
  </li>
</template>
