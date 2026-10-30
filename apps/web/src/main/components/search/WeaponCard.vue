<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { ChevronRight } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { weaponTypeName } from '@/constants/weaponTypes'
import { formatWeaponStats } from '@/lib/format'
import { weaponBonusLabels, weaponSpecLine } from '@/lib/weapons/convert'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'

defineEmits<{ open: [] }>()

const WEAPON_ERROR_ID = 'weapon-error'

const conditions = useConditionsStore()
const master = useMasterStore()

const button = ref<HTMLButtonElement | null>(null)

const weapon = computed(() => conditions.weapon)

const specLine = computed(() => {
  const current = weapon.value
  if (current === null) return ''
  const type = weaponTypeName(current.weaponType)
  if (current.stored !== undefined) return `${type} ／ ${weaponSpecLine(current.stored.payload)}`
  return current.master === undefined ? '' : `${type} ／ ${formatWeaponStats(current.master)}`
})

const skillLine = computed(() => {
  const current = weapon.value
  if (current === null) return ''
  if (current.stored !== undefined && master.bundle !== null) {
    const labels = weaponBonusLabels(current.stored.payload, {
      bundle: master.bundle,
      nameOf: master.nameOf,
    })
    return labels.length === 0 ? '' : `付与スキル: ${labels.join('・')}`
  }
  const skills = current.master?.skills ?? []
  if (skills.length === 0) return ''
  const names = skills.map((skill) => master.nameOf(skill.skillId) + ' Lv' + skill.level)
  return `スキル: ${names.join('・')}`
})

defineExpose({ focus: () => button.value?.focus() })
</script>

<template>
  <div class="flex flex-col gap-3">
    <Card class="gap-3 py-4">
      <h2 class="px-4 text-base leading-snug font-bold">武器</h2>
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
              <span class="flex flex-wrap items-center gap-2">
                <span class="font-bold break-words">{{ weapon.name }}</span>
                <Badge v-if="weapon.kind === 'custom'" variant="outline">個体差</Badge>
              </span>
              <span class="font-num text-xs break-words tabular-nums">{{ specLine }}</span>
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
    <RouterLink to="/weapons" :class="buttonVariants({ variant: 'outline', size: 'lg' })">
      個体差のある武器の一覧へ
    </RouterLink>
  </div>
</template>
