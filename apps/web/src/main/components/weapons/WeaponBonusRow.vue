<script setup lang="ts">
import { computed } from 'vue'
import type { SetBonusId } from '@swv/data'
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
import { compareJa, matchesSkillQuery } from '@/lib/text'
import { useMasterStore } from '@/stores/master'

const props = defineProps<{
  /** 付与スキルの種別。候補はこの種別のスキルのものだけ */
  kind: 'series' | 'group'
  bonusId: SetBonusId | null
  disabled: boolean
  error: string | null
}>()
const emit = defineEmits<{ select: [id: SetBonusId]; clear: []; blur: [] }>()
/** Combobox の入力欄の文字（選んだ名前か、入力途中の語） */
const text = defineModel<string>('text', { required: true })

const master = useMasterStore()

const label = computed(() => (props.kind === 'series' ? 'シリーズスキル' : 'グループスキル'))
const inputId = computed(() => (props.kind === 'series' ? 'weapon-series' : 'weapon-group'))
const errorId = computed(() => `${inputId.value}-error`)

interface Candidate {
  id: SetBonusId
  name: string
  reading: string | undefined
}

/** 種別が合うスキルの setBonus を、名前の順に並べたもの。 */
const options = computed<Candidate[]>(() => {
  const bundle = master.bundle
  if (bundle === null) return []
  const kindOf = new Map(bundle.skills.map((skill) => [skill.id, skill.kind]))
  return bundle.setBonuses
    .filter((bonus) => kindOf.get(bonus.skillId) === props.kind)
    .map((bonus) => ({
      id: bonus.id,
      name: master.nameOf(bonus.skillId),
      reading: master.dictionary?.entries[bonus.skillId]?.reading,
    }))
    .sort((a, b) => compareJa(a.name, b.name))
})

const selectedName = computed(
  () => options.value.find((option) => option.id === props.bonusId)?.name ?? '',
)

/** 選んだ名前がそのまま入っているときは、絞り込まずにすべてを出す。 */
const query = computed(() => (text.value === selectedName.value ? '' : text.value.trim()))

const candidates = computed(() =>
  options.value.filter((option) => matchesSkillQuery(option.name, option.reading, query.value)),
)

function displayValue(id: unknown): string {
  return options.value.find((option) => option.id === id)?.name ?? ''
}

function onSelect(value: unknown): void {
  if (typeof value === 'string' && value !== '') emit('select', value as SetBonusId)
}

function onBlur(): void {
  // 選んだスキルがあるのに文字を書き換えたまま離れたら、選んだ名前に戻す
  if (props.bonusId !== null && selectedName.value !== '' && text.value !== selectedName.value) {
    text.value = selectedName.value
  }
  emit('blur')
}
</script>

<template>
  <div class="flex flex-col gap-1">
    <Label :for="inputId" class="text-sm">{{ label }}</Label>
    <div class="flex items-center gap-2">
      <Combobox
        :model-value="bonusId ?? ''"
        :ignore-filter="true"
        :open-on-click="true"
        :reset-search-term-on-blur="false"
        :disabled="disabled"
        class="min-w-0 flex-1"
        @update:model-value="onSelect"
      >
        <ComboboxAnchor class="w-full min-w-[150px]">
          <ComboboxInput
            :id="inputId"
            v-model="text"
            :display-value="displayValue"
            :disabled="disabled"
            :placeholder="`${label}を検索`"
            :aria-invalid="error !== null"
            :aria-describedby="error === null ? undefined : errorId"
            class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive h-11 w-full min-w-0 truncate rounded-md border px-3 text-base outline-none focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            @blur="onBlur"
          />
        </ComboboxAnchor>
        <ComboboxList class="w-(--reka-combobox-trigger-width) min-w-60">
          <ComboboxViewport class="max-h-72 overflow-y-auto p-1">
            <p v-if="query !== ''" class="text-muted-foreground px-2 py-1 text-xs">
              「{{ query }}」を含む{{ label }}:
              <span class="tabular-nums">{{ candidates.length }}</span> 件（名前と読み）
            </p>
            <p v-if="candidates.length === 0" class="px-2 py-1.5 text-sm">
              該当する{{ label }}がありません。名前か読みを変えてください。
            </p>
            <ComboboxItem
              v-for="candidate in candidates"
              :key="candidate.id"
              :value="candidate.id"
              class="min-h-11"
            >
              <span class="min-w-0 break-words">{{ candidate.name }}</span>
            </ComboboxItem>
          </ComboboxViewport>
        </ComboboxList>
      </Combobox>

      <Button
        type="button"
        variant="ghost"
        class="size-11 shrink-0"
        :aria-label="`${label}を空にする`"
        :disabled="disabled"
        @click="emit('clear')"
      >
        <X aria-hidden="true" />
      </Button>
    </div>
    <p v-if="error !== null" :id="errorId" class="text-destructive text-sm">{{ error }}</p>
  </div>
</template>
