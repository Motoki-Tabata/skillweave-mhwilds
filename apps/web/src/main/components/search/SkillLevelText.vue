<script setup lang="ts">
import { computed } from 'vue'
import type { SkillId } from '@swv/data'
import { skillLevelTexts } from '@/lib/skills/levelText'
import { useMasterStore } from '@/stores/master'

/** スキルのあるレベルの説明文と補完の組（結果の構成カードと D2 のダイアログで共通）。 */
const props = defineProps<{ skillId: SkillId; level: number }>()

const master = useMasterStore()

const texts = computed(() =>
  skillLevelTexts(
    master.skillById.get(props.skillId),
    master.dictionary,
    props.level,
    master.nameOf,
  ),
)
</script>

<template>
  <p v-if="texts.description !== null" class="text-xs break-words whitespace-pre-line">
    {{ texts.description }}
  </p>
  <p
    v-if="texts.summary !== null"
    class="font-num text-muted-foreground text-xs tabular-nums break-words"
  >
    {{ texts.summary }}
  </p>
</template>
