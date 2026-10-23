<script setup lang="ts">
import { computed } from 'vue'
import type { MasterSkill, SkillLevel } from '@swv/data'
import { X } from '@lucide/vue'
import { ComboboxInput } from 'reka-ui'
import { Button } from '@/components/ui/button'
import {
  Combobox,
  ComboboxAnchor,
  ComboboxItem,
  ComboboxList,
  ComboboxViewport,
} from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { skillKindLabel } from '@/constants/labels'
import { matchesSkillQuery } from '@/lib/text'
import { useMasterStore } from '@/stores/master'

const props = defineProps<{
  /** 1 始まりの行番号 */
  row: number
  skill: SkillLevel | null
  disabled: boolean
  error: string | null
}>()
const emit = defineEmits<{
  select: [skillId: string]
  level: [level: number]
  clear: []
  blur: []
}>()
/** Combobox の入力欄の文字（選んだスキルの名前か、入力途中の語） */
const text = defineModel<string>('text', { required: true })

const master = useMasterStore()

const inputId = computed(() => `charm-skill-${props.row}`)
const errorId = computed(() => `charm-skill-${props.row}-error`)

const selectedName = computed(() =>
  props.skill === null ? '' : master.nameOf(props.skill.skillId),
)
const maxLevel = computed(() =>
  props.skill === null ? 0 : (master.skillById.get(props.skill.skillId)?.maxLevel ?? 0),
)
const levels = computed(() => Array.from({ length: maxLevel.value }, (_, i) => i + 1))

/** 選んだ名前がそのまま入っているときは、絞り込まずにすべてを出す。 */
const query = computed(() => (text.value === selectedName.value ? '' : text.value.trim()))

/** 候補は武器スキル→防具スキルの順（シリーズ・グループは出さない）。 */
const candidates = computed<MasterSkill[]>(() =>
  [
    ...(master.skillsByKind.get('weapon') ?? []),
    ...(master.skillsByKind.get('armor') ?? []),
  ].filter((skill) =>
    matchesSkillQuery(
      master.nameOf(skill.id),
      master.dictionary?.entries[skill.id]?.reading,
      query.value,
    ),
  ),
)

function displayValue(id: unknown): string {
  return typeof id === 'string' && id !== '' ? master.nameOf(id) : ''
}

function onSelect(value: unknown): void {
  if (typeof value === 'string' && value !== '') emit('select', value)
}

function onBlur(): void {
  // 選んだスキルがあるのに文字を書き換えたまま離れたら、選んだ名前に戻す
  if (props.skill !== null && text.value !== selectedName.value) text.value = selectedName.value
  emit('blur')
}

function onLevel(value: unknown): void {
  if (typeof value === 'string') emit('level', Number(value))
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <Label :for="inputId" class="text-sm">スキル{{ row }}</Label>
    <div class="flex items-center gap-2">
      <Combobox
        :model-value="skill?.skillId ?? ''"
        :ignore-filter="true"
        :open-on-click="true"
        :reset-search-term-on-blur="false"
        :disabled="disabled"
        class="min-w-0 flex-1"
        @update:model-value="onSelect"
      >
        <ComboboxAnchor class="w-full min-w-[150px]">
          <!-- 検索の入力欄として、Input と同じ見た目にする（ui の ComboboxInput は検索パレット用の見た目） -->
          <ComboboxInput
            :id="inputId"
            v-model="text"
            :display-value="displayValue"
            :disabled="disabled"
            placeholder="スキルを検索"
            :aria-invalid="error !== null"
            :aria-describedby="error === null ? undefined : errorId"
            class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-11 w-full min-w-0 truncate rounded-md border px-3 text-base md:text-sm outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50"
            @blur="onBlur"
          />
        </ComboboxAnchor>
        <ComboboxList class="w-(--reka-combobox-trigger-width) min-w-60">
          <ComboboxViewport class="max-h-72 overflow-y-auto p-1">
            <p v-if="query !== ''" class="text-muted-foreground px-2 py-1 text-xs">
              「{{ query }}」を含むスキル:
              <span class="tabular-nums">{{ candidates.length }}</span> 件（名前と読み）
            </p>
            <p v-if="candidates.length === 0" class="px-2 py-1.5 text-sm">
              該当するスキルがありません。名前か読みを変えてください。
            </p>
            <ComboboxItem
              v-for="candidate in candidates"
              :key="candidate.id"
              :value="candidate.id"
              class="min-h-11 justify-between"
            >
              <span class="min-w-0 break-words">{{ master.nameOf(candidate.id) }}</span>
              <span class="text-muted-foreground shrink-0 text-xs">{{
                skillKindLabel(candidate.kind)
              }}</span>
            </ComboboxItem>
          </ComboboxViewport>
        </ComboboxList>
      </Combobox>

      <Select
        :model-value="skill === null ? '' : String(skill.level)"
        :disabled="disabled || skill === null"
        @update:model-value="onLevel"
      >
        <SelectTrigger class="h-11 w-20 shrink-0" :aria-label="`スキル${row}のレベル`">
          <SelectValue placeholder="−" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="level in levels" :key="level" :value="String(level)">
            Lv{{ level }}
          </SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="ghost"
        class="size-11 shrink-0"
        :aria-label="`スキル${row}を空にする`"
        :disabled="disabled"
        @click="emit('clear')"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
    <p v-if="error !== null" :id="errorId" class="text-destructive text-sm">{{ error }}</p>
  </div>
</template>
