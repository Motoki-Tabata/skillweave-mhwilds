<script setup lang="ts">
import { computed } from 'vue'
import type { ReverseLookupCandidate, SolvedBuild, SolverCharm } from '@swv/solver'
import BuildCard from '@/components/search/BuildCard.vue'
import type { BuildCardDamage } from '@/components/search/BuildCard.vue'
import { SLOT_TARGET_LABELS } from '@/constants/charms'
import { REVERSE_CHARM_ID } from '@/constants/search'
import type { BuildLookup } from '@/lib/solver/buildView'
import { useMasterStore } from '@/stores/master'
import { useReverseLookupStore } from '@/stores/reverseLookup'

/** 逆引きの候補 1 件。狙う護石を示し、その護石を使った構成を構成のカードで示す。 */
const props = defineProps<{
  candidate: ReverseLookupCandidate
  index: number
}>()

const master = useMasterStore()
const reverse = useReverseLookupStore()

/** 仮想の護石を、構成の表示の材料（装飾品の持ち主・スロットの Lv）として引けるようにした護石。 */
const solverCharm = computed<SolverCharm>(() => ({
  id: REVERSE_CHARM_ID,
  rarity: props.candidate.charm.rarity,
  skills: props.candidate.charm.skills.flatMap((skill) => (skill === null ? [] : [skill])),
  slots: props.candidate.charm.slots,
}))

const build = computed<SolvedBuild>(() => ({ ...props.candidate.build, charmId: REVERSE_CHARM_ID }))

const lookup = computed<BuildLookup>(() => ({
  charm: (id) => (id === REVERSE_CHARM_ID ? solverCharm.value : undefined),
  armor: (id) => master.armorById.get(id),
  weaponSlots: reverse.summary?.weaponSlots,
  skillKind: (skillId) => master.skillById.get(skillId)?.kind,
  nameOf: master.nameOf,
}))

const damage = computed<BuildCardDamage | null>(() => {
  const basis = reverse.submittedBasis
  if (basis === null) return null
  return {
    base: basis.damageBase,
    skills: props.candidate.build.skills,
    conditionIds: basis.activeConditionIds,
  }
})

const skillChips = computed(() =>
  props.candidate.charm.skills.map((skill) =>
    skill === null
      ? { name: '任意', level: null }
      : { name: master.nameOf(skill.skillId), level: skill.level },
  ),
)

const slotsText = computed(() => {
  const slots = props.candidate.charm.slots
  if (slots.length === 0) return 'スロットなし'
  return slots.map((slot) => `${SLOT_TARGET_LABELS[slot.target]} Lv${slot.level}`).join('・')
})
</script>

<template>
  <BuildCard
    :build="build"
    :title="`候補 ${index + 1}`"
    :lookup="lookup"
    :damage="damage"
    :show-charm="false"
  >
    <template #charm>
      <section class="flex flex-col gap-1 px-4">
        <h4 class="text-sm font-bold">狙う護石</h4>
        <dl class="flex flex-col gap-1 text-sm">
          <div class="flex items-start gap-2">
            <dt class="w-14 shrink-0 pt-0.5 text-xs">レア度</dt>
            <dd class="font-num tabular-nums">{{ candidate.charm.rarity }}</dd>
          </div>
          <div class="flex items-start gap-2">
            <dt class="w-14 shrink-0 pt-0.5 text-xs">スキル</dt>
            <dd class="min-w-0 flex-1">
              <ul class="flex flex-wrap gap-1">
                <li
                  v-for="(chip, i) in skillChips"
                  :key="i"
                  class="rounded-md border px-2 py-0.5 text-xs break-words"
                  :class="chip.level === null ? 'text-muted-foreground border-dashed' : ''"
                >
                  {{ chip.name }}
                  <span v-if="chip.level !== null" class="font-num tabular-nums"
                    >Lv{{ chip.level }}</span
                  >
                </li>
              </ul>
            </dd>
          </div>
          <div class="flex items-start gap-2">
            <dt class="w-14 shrink-0 pt-0.5 text-xs">スロット</dt>
            <dd class="min-w-0 flex-1 break-words">{{ slotsText }}</dd>
          </div>
        </dl>
      </section>
    </template>
  </BuildCard>
</template>
