<script setup lang="ts">
import { computed, useId } from 'vue'
import { Info } from '@lucide/vue'
import type { MasterSkill } from '@swv/data'
import SkillLevelText from '@/components/search/SkillLevelText.vue'
import { skillKindLabel } from '@/constants/labels'
import { skillLevelTexts } from '@/lib/skills/levelText'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'

/** スキルのトグルボタンの格子と、スキルごとの説明の開閉（開くのは1つだけ。ID は親が持つ）。 */
const props = defineProps<{
  skills: readonly MasterSkill[]
  /** すべての種類から絞り込む表示では、種類名を出す */
  showKind?: boolean
  openId: string | null
}>()
const emit = defineEmits<{ 'update:openId': [id: string | null] }>()

const master = useMasterStore()
const conditions = useConditionsStore()
const idPrefix = useId()

const regionId = (skill: MasterSkill) => `${idPrefix}-${skill.id}`

function toggleDescription(skill: MasterSkill): void {
  emit('update:openId', props.openId === skill.id ? null : skill.id)
}

/** Lv1 から最大レベルまでのうち、説明文か補完があるレベル。 */
function levelsOf(skill: MasterSkill): number[] {
  return Array.from({ length: skill.maxLevel }, (_, i) => i + 1).filter((level) => {
    const texts = skillLevelTexts(skill, master.dictionary, level, master.nameOf)
    return texts.description !== null || texts.summary !== null
  })
}

const openSkill = computed(() => props.skills.find((skill) => skill.id === props.openId))
</script>

<template>
  <ul class="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-3">
    <template v-for="skill in skills" :key="skill.id">
      <li class="flex gap-1.5">
        <button
          type="button"
          class="focus-visible:ring-ring/50 focus-visible:border-ring aria-pressed:border-foreground flex min-h-11 min-w-0 flex-1 items-center justify-between gap-1.5 rounded-md border px-2.5 py-1 text-left text-sm outline-none focus-visible:ring-3 aria-pressed:border-2 aria-pressed:font-bold"
          :aria-pressed="conditions.isRequired(skill.id)"
          @click="conditions.toggleSkill(skill.id)"
        >
          <span class="min-w-0 break-words">{{ master.nameOf(skill.id) }}</span>
          <span class="flex shrink-0 flex-col items-end text-xs font-normal">
            <span v-if="conditions.isRequired(skill.id)">選択中</span>
            <span v-if="showKind">{{ skillKindLabel(skill.kind) }}</span>
          </span>
        </button>
        <button
          type="button"
          class="hover:bg-muted focus-visible:ring-ring/50 focus-visible:border-ring aria-expanded:bg-muted flex size-11 shrink-0 items-center justify-center rounded-md outline-none focus-visible:ring-3"
          :aria-label="`${master.nameOf(skill.id)}の説明`"
          :aria-expanded="openId === skill.id"
          :aria-controls="regionId(skill)"
          @click="toggleDescription(skill)"
        >
          <Info class="size-4" aria-hidden="true" />
        </button>
      </li>
      <li v-if="openSkill?.id === skill.id" class="col-span-full">
        <section
          :id="regionId(skill)"
          :aria-label="`${master.nameOf(skill.id)}の説明`"
          class="bg-muted flex flex-col gap-2 rounded border p-3"
        >
          <p class="text-sm font-bold">
            {{ master.nameOf(skill.id) }}（最大 Lv<span class="tabular-nums">{{
              skill.maxLevel
            }}</span
            >）
          </p>
          <dl v-if="levelsOf(skill).length > 0" class="flex flex-col gap-1.5">
            <div v-for="level in levelsOf(skill)" :key="level" class="flex gap-2">
              <dt class="font-num w-8 shrink-0 text-xs">Lv{{ level }}</dt>
              <dd class="flex min-w-0 flex-1 flex-col gap-0.5">
                <SkillLevelText :skill-id="skill.id" :level="level" />
              </dd>
            </div>
          </dl>
          <p v-else class="text-xs">このスキルの説明はありません。</p>
        </section>
      </li>
    </template>
  </ul>
</template>
