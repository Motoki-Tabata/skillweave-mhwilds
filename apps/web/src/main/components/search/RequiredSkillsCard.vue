<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { SkillId } from '@swv/data'
import { X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'

defineEmits<{ open: [] }>()

const conditions = useConditionsStore()
const master = useMasterStore()

const root = ref<HTMLElement | null>(null)
const pickButton = ref<{ $el: HTMLElement } | null>(null)

function levelsOf(maxLevel: number): number[] {
  return Array.from({ length: maxLevel }, (_, index) => index + 1)
}

function deleteButtons(): HTMLElement[] {
  return Array.from(root.value?.querySelectorAll<HTMLElement>('[data-skill-delete]') ?? [])
}

/** 削除した後、フォーカスを次の行の削除ボタンへ。次の行が無ければ「スキルを選ぶ」へ。 */
async function remove(skillId: SkillId): Promise<void> {
  const before = deleteButtons()
  const index = before.findIndex((button) => button.dataset.skillDelete === skillId)
  conditions.removeSkill(skillId)
  await nextTick()
  const next = index === -1 ? undefined : before[index + 1]
  if (next?.isConnected) next.focus()
  else pickButton.value?.$el.focus()
}
</script>

<template>
  <Card class="gap-3 py-4">
    <h2 class="px-4 text-base leading-snug font-semibold">必須スキル</h2>
    <CardContent class="px-4">
      <div ref="root" class="flex flex-col gap-3">
        <Button
          ref="pickButton"
          type="button"
          variant="outline"
          class="h-10 w-full"
          aria-haspopup="dialog"
          @click="$emit('open')"
        >
          スキルを選ぶ
        </Button>

        <p v-if="conditions.requiredGroups.length === 0" class="text-muted-foreground text-xs">
          必須スキルが選ばれていません。「スキルを選ぶ」から追加してください（追加しなくても検索できます）。
        </p>

        <section v-for="group in conditions.requiredGroups" :key="group.kind">
          <h3 class="text-xs font-bold">{{ group.label }}</h3>
          <ul class="flex flex-col">
            <li
              v-for="row in group.rows"
              :key="row.skill.id"
              class="flex items-center gap-2 border-b py-1 last:border-b-0"
            >
              <span class="min-w-0 flex-1 text-sm break-words">{{
                master.nameOf(row.skill.id)
              }}</span>
              <Label :for="`level-${row.skill.id}`" class="sr-only">{{
                `${master.nameOf(row.skill.id)}の下限レベル`
              }}</Label>
              <Select
                :model-value="String(row.level)"
                @update:model-value="
                  (value) => conditions.setSkillLevel(row.skill.id, Number(value))
                "
              >
                <SelectTrigger
                  :id="`level-${row.skill.id}`"
                  class="h-10 w-[88px] text-base md:text-sm"
                  :aria-label="`${master.nameOf(row.skill.id)}の下限レベル`"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="level in levelsOf(row.skill.maxLevel)"
                    :key="level"
                    :value="String(level)"
                  >
                    Lv{{ level }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-11"
                :data-skill-delete="row.skill.id"
                :aria-label="`${master.nameOf(row.skill.id)}を削除`"
                @click="remove(row.skill.id)"
              >
                <X />
              </Button>
            </li>
          </ul>
        </section>
      </div>
    </CardContent>
  </Card>
</template>
