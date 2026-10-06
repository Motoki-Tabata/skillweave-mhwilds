<script setup lang="ts">
import { computed, ref } from 'vue'
import { ChevronRight } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { weaponTypeName } from '@/constants/weaponTypes'
import { formatWeaponStats } from '@/lib/format'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'

defineEmits<{ open: [] }>()

const WEAPON_ERROR_ID = 'weapon-error'

const conditions = useConditionsStore()
const master = useMasterStore()

const button = ref<HTMLButtonElement | null>(null)

const weapon = computed(() => conditions.weapon)

const specLine = computed(() =>
  weapon.value === null
    ? ''
    : `${weaponTypeName(weapon.value.weaponType)} ／ ${formatWeaponStats(weapon.value)}`,
)

const skillLine = computed(() => {
  if (weapon.value === null || weapon.value.skills.length === 0) return ''
  const skills = weapon.value.skills.map(
    (skill) => `${master.nameOf(skill.skillId)} Lv${skill.level}`,
  )
  return `スキル: ${skills.join('・')}`
})

defineExpose({ focus: () => button.value?.focus() })
</script>

<template>
  <Card class="gap-3 py-4">
    <h2 class="px-4 text-base leading-snug font-semibold">武器</h2>
    <CardContent class="px-4">
      <button
        ref="button"
        type="button"
        class="focus-visible:ring-ring/50 focus-visible:border-ring border-input flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-3"
        aria-haspopup="dialog"
        :aria-describedby="conditions.weaponErrorShown ? WEAPON_ERROR_ID : undefined"
        @click="$emit('open')"
      >
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="flex items-center gap-2 text-xs">
            武器 <Badge variant="outline">必須</Badge>
          </span>
          <template v-if="weapon === null">
            <span class="text-sm">武器を選択</span>
          </template>
          <template v-else>
            <span class="font-bold break-words">{{ master.nameOf(weapon.id) }}</span>
            <span class="text-xs break-words tabular-nums">{{ specLine }}</span>
            <span v-if="skillLine" class="text-xs break-words">{{ skillLine }}</span>
          </template>
        </span>
        <ChevronRight class="size-6 shrink-0" aria-hidden="true" />
      </button>
      <p
        v-if="conditions.weaponErrorShown"
        :id="WEAPON_ERROR_ID"
        class="text-destructive mt-2 text-sm"
      >
        武器を選んでください。
      </p>
    </CardContent>
  </Card>
</template>
