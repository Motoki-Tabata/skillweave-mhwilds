<script setup lang="ts">
import { computed } from 'vue'
import { BookmarkCheck, BookmarkPlus } from '@lucide/vue'
import type { SolvedBuild } from '@swv/solver'
import BuildCard from '@/components/search/BuildCard.vue'
import type { BuildCardDamage } from '@/components/search/BuildCard.vue'
import { Button } from '@/components/ui/button'
import type { BuildLookup } from '@/lib/solver/buildView'
import { useAuthStore } from '@/stores/auth'
import { useMasterStore } from '@/stores/master'
import { useSearchStore } from '@/stores/search'

/** 検索結果の 1 件。検索したときの写しから構成のカードの材料を組み立てる。 */
const props = defineProps<{
  build: SolvedBuild
  index: number
  /** 「保存」を出すか（検索が終わった後の結果だけ） */
  saveable: boolean
}>()
const emit = defineEmits<{ save: [index: number] }>()

const master = useMasterStore()
const search = useSearchStore()
const auth = useAuthStore()

// 検索の後に武器の選択を変えても、結果は検索したときの武器で表示する
const lookup = computed<BuildLookup>(() => ({
  charm: (id) => search.submittedCharms.get(id),
  armor: (id) => master.armorById.get(id),
  weaponSlots: search.summary?.weaponSlots,
  skillKind: (skillId) => master.skillById.get(skillId)?.kind,
  nameOf: master.nameOf,
}))

const damage = computed<BuildCardDamage | null>(() => {
  const basis = search.submittedBasis
  if (basis === null) return null
  return {
    base: basis.damageBase,
    skills: props.build.skills,
    conditionIds: basis.activeConditionIds,
  }
})

const number = computed(() => props.index + 1)
const saved = computed(() => search.isSaved(props.index))
/** 保存済みの印は `aria-disabled` なので、押されても何もしない。 */
function onSave(): void {
  if (!saved.value) emit('save', props.index)
}
const label = computed(() =>
  saved.value ? `構成 ${number.value} は保存済み` : `構成 ${number.value} を保存`,
)
</script>

<template>
  <BuildCard
    :build="build"
    :title="`構成 ${number}`"
    :lookup="lookup"
    :damage="damage"
    :show-charm="(search.summary?.charmCount ?? 0) > 0"
  >
    <template v-if="saveable" #action>
      <Button
        type="button"
        variant="ghost"
        class="md:bg-background md:dark:bg-input/30 md:dark:border-input md:dark:hover:bg-input/50 size-11 shrink-0 md:h-10 md:w-auto md:border md:px-4 md:shadow-xs"
        :aria-label="label"
        :title="label"
        :aria-disabled="saved ? 'true' : undefined"
        :disabled="auth.status === 'checking'"
        :data-save-index="index"
        @click="onSave"
      >
        <component
          :is="saved ? BookmarkCheck : BookmarkPlus"
          class="size-5 md:size-4"
          aria-hidden="true"
        />
        <span class="hidden md:inline" aria-hidden="true">{{ saved ? '保存済み' : '保存' }}</span>
      </Button>
    </template>
  </BuildCard>
</template>
