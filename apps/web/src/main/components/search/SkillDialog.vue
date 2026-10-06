<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MasterSkill, SkillKind } from '@swv/data'
import PickerDialog from '@/components/search/PickerDialog.vue'
import { Button } from '@/components/ui/button'
import { DialogClose } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SKILL_KINDS, skillKindLabel } from '@/constants/labels'
import { matchesQuery } from '@/lib/text'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  closeAutoFocus: [event: Event]
}>()

const master = useMasterStore()
const conditions = useConditionsStore()

const query = ref('')
const activeKind = ref<SkillKind>('weapon')

// 開いたときに、空の検索語から始める
watch(
  () => props.open,
  (open) => {
    if (open) query.value = ''
  },
  { immediate: true },
)

const searching = computed(() => query.value.trim() !== '')

/** 検索語があるときは、すべての種類から部分一致で絞り込む（種類の順、種類の中は名前順）。 */
const searchResults = computed<MasterSkill[]>(() =>
  SKILL_KINDS.flatMap((kind) => master.skillsByKind.get(kind.id) ?? []).filter((skill) =>
    matchesQuery(master.nameOf(skill.id), query.value),
  ),
)

/** フッターに出す選択中のスキル（種類ごと）。 */
const selectedGroups = computed(() =>
  conditions.requiredGroups.map((group) => ({
    kind: group.kind,
    label: group.label,
    names: group.rows.map((row) => master.nameOf(row.skill.id)),
  })),
)

const selectedCount = computed(() => conditions.required.length)

function onOpenChange(open: boolean): void {
  emit('update:open', open)
}
</script>

<template>
  <PickerDialog
    :open="open"
    title="スキルを選ぶ"
    description="必須スキルを追加・削除します。"
    @update:open="onOpenChange"
    @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)"
  >
    <div class="flex flex-col gap-3">
      <p class="text-muted-foreground text-xs">
        押すと必須スキルに追加し、もう一度押すと外します。下限は最大レベルで追加し、後から変えられます。
      </p>

      <Input v-model="query" type="search" class="h-10" aria-label="スキル名で検索" />

      <template v-if="searching">
        <p class="text-muted-foreground text-xs">
          「{{ query.trim() }}」を含むスキル（すべての種類）:
          <span class="tabular-nums">{{ searchResults.length }}</span> 件
        </p>
        <p v-if="searchResults.length === 0" class="text-sm">
          該当するスキルがありません。名前を変えてください。
        </p>
        <ul class="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
          <li v-for="skill in searchResults" :key="skill.id" class="flex">
            <button
              type="button"
              class="focus-visible:ring-ring/50 focus-visible:border-ring aria-pressed:border-foreground flex min-h-11 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 py-1 text-left text-sm outline-none focus-visible:ring-3 aria-pressed:border-2 aria-pressed:font-bold"
              :aria-pressed="conditions.isRequired(skill.id)"
              @click="conditions.toggleSkill(skill.id)"
            >
              <span class="min-w-0 break-words">{{ master.nameOf(skill.id) }}</span>
              <span class="flex shrink-0 flex-col items-end text-xs font-normal">
                <span v-if="conditions.isRequired(skill.id)">選択中</span>
                <span>{{ skillKindLabel(skill.kind) }}</span>
              </span>
            </button>
          </li>
        </ul>
      </template>

      <Tabs v-else v-model="activeKind">
        <TabsList aria-label="スキルの種類" class="h-11 w-full">
          <TabsTrigger v-for="kind in SKILL_KINDS" :key="kind.id" :value="kind.id">
            {{ kind.label }}
          </TabsTrigger>
        </TabsList>
        <TabsContent v-for="kind in SKILL_KINDS" :key="kind.id" :value="kind.id">
          <ul class="grid grid-cols-2 gap-1.5 lg:grid-cols-3">
            <li
              v-for="skill in master.skillsByKind.get(kind.id) ?? []"
              :key="skill.id"
              class="flex"
            >
              <button
                type="button"
                class="focus-visible:ring-ring/50 focus-visible:border-ring aria-pressed:border-foreground flex min-h-11 w-full items-center justify-between gap-1.5 rounded-md border px-2.5 py-1 text-left text-sm outline-none focus-visible:ring-3 aria-pressed:border-2 aria-pressed:font-bold"
                :aria-pressed="conditions.isRequired(skill.id)"
                @click="conditions.toggleSkill(skill.id)"
              >
                <span class="min-w-0 break-words">{{ master.nameOf(skill.id) }}</span>
                <span v-if="conditions.isRequired(skill.id)" class="shrink-0 text-xs font-normal"
                  >選択中</span
                >
              </button>
            </li>
          </ul>
        </TabsContent>
      </Tabs>
    </div>

    <template #footer>
      <div class="flex flex-col gap-2">
        <h3 class="text-xs font-bold">
          選択中のスキル（<span class="tabular-nums">{{ selectedCount }}</span
          >）
        </h3>
        <div v-for="group in selectedGroups" :key="group.kind" class="flex items-start gap-2">
          <span class="w-14 shrink-0 text-xs">{{ group.label }}</span>
          <ul class="flex min-w-0 flex-1 flex-wrap gap-1">
            <li
              v-for="name in group.names"
              :key="name"
              class="rounded-md border px-1.5 text-xs break-words"
            >
              {{ name }}
            </li>
          </ul>
        </div>
        <DialogClose as-child>
          <Button variant="secondary" class="h-10 w-full">閉じる</Button>
        </DialogClose>
      </div>
    </template>
  </PickerDialog>
</template>
