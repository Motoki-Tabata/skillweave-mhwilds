<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ArmorPart } from '@swv/data'
import { Check } from '@lucide/vue'
import { ComboboxInput } from 'reka-ui'
import {
  Combobox,
  ComboboxAnchor,
  ComboboxGroup,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxViewport,
} from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { fixedCandidates } from '@/lib/search/lockExclude'
import { useLockExcludeStore } from '@/stores/lockExclude'
import { useMasterStore } from '@/stores/master'

/** Combobox の値。防具の ID と重ならない。 */
const UNLOCKED = 'lock:none'
const EMPTY = 'lock:empty'
const UNLOCKED_LABEL = '固定しない'
const EMPTY_LABEL = '何も付けない'

const props = defineProps<{ part: ArmorPart; label: string }>()

const master = useMasterStore()
const store = useLockExcludeStore()

const inputId = computed(() => `armor-lock-${props.part}`)

const current = computed(() => {
  const value = store.fixed[props.part]
  if (value === undefined) return UNLOCKED
  return value === null ? EMPTY : value
})

function nameOfValue(value: string): string {
  if (value === UNLOCKED) return UNLOCKED_LABEL
  if (value === EMPTY) return EMPTY_LABEL
  return master.nameOf(value)
}

const selectedName = computed(() => nameOfValue(current.value))
/** 入力欄の文字（選んだ値の表示名か、入力途中の語） */
const text = ref(selectedName.value)
// 他の操作（除外の追加による固定の解除など）で値が変わったら、表示を合わせる
watch(selectedName, (name) => {
  text.value = name
})

/** 選んだ名前がそのまま入っているときは、絞り込まずにすべてを出す。 */
const query = computed(() => (text.value === selectedName.value ? '' : text.value.trim()))

const candidates = computed(() =>
  master.bundle === null
    ? { groups: [], count: 0 }
    : fixedCandidates(master.bundle, master.nameOf, props.part, query.value),
)

function displayValue(value: unknown): string {
  return typeof value === 'string' && value !== '' ? nameOfValue(value) : ''
}

function onSelect(value: unknown): void {
  if (typeof value !== 'string' || value === '') return
  if (value === UNLOCKED) store.setFixed(props.part, undefined)
  else if (value === EMPTY) store.setFixed(props.part, null)
  else store.setFixed(props.part, value as Parameters<typeof store.setFixed>[1])
  text.value = nameOfValue(value)
}

function onBlur(): void {
  // 選ばずにフォーカスを外したら、選んでいる値の表示名に戻す
  if (text.value !== selectedName.value) text.value = selectedName.value
}
</script>

<template>
  <div class="flex items-center gap-2">
    <Label :for="inputId" class="w-8 shrink-0 text-sm">{{ label }}</Label>
    <Combobox
      :model-value="current"
      :ignore-filter="true"
      :open-on-click="true"
      :reset-search-term-on-blur="false"
      class="min-w-0 flex-1"
      @update:model-value="onSelect"
    >
      <ComboboxAnchor class="w-full min-w-[150px]">
        <ComboboxInput
          :id="inputId"
          v-model="text"
          :display-value="displayValue"
          class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 truncate rounded-md border px-3 text-base outline-none focus-visible:ring-3 md:text-sm"
          :class="{ 'text-muted-foreground': current === UNLOCKED && text === selectedName }"
          @blur="onBlur"
        />
      </ComboboxAnchor>
      <ComboboxList class="w-(--reka-combobox-trigger-width) min-w-60">
        <ComboboxViewport class="max-h-72 overflow-y-auto p-1">
          <p v-if="query !== ''" class="text-muted-foreground px-2 py-1 text-xs">
            「{{ query }}」を含む防具: <span class="tabular-nums">{{ candidates.count }}</span> 件
          </p>
          <p v-if="query !== '' && candidates.count === 0" class="px-2 py-1.5 text-sm">
            該当する防具がありません。名前を変えてください。
          </p>
          <ComboboxItem :value="UNLOCKED" class="min-h-11">
            <span class="min-w-0 break-words">{{ UNLOCKED_LABEL }}</span>
            <ComboboxItemIndicator><Check aria-hidden="true" /></ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxItem :value="EMPTY" class="min-h-11">
            <span class="min-w-0 break-words">{{ EMPTY_LABEL }}</span>
            <ComboboxItemIndicator><Check aria-hidden="true" /></ComboboxItemIndicator>
          </ComboboxItem>
          <ComboboxGroup
            v-for="group in candidates.groups"
            :key="group.rank"
            :heading="group.label"
          >
            <ComboboxItem
              v-for="armor in group.armors"
              :key="armor.id"
              :value="armor.id"
              class="min-h-11"
            >
              <span class="min-w-0 break-words">{{ armor.name }}</span>
              <ComboboxItemIndicator><Check aria-hidden="true" /></ComboboxItemIndicator>
            </ComboboxItem>
          </ComboboxGroup>
        </ComboboxViewport>
      </ComboboxList>
    </Combobox>
  </div>
</template>
