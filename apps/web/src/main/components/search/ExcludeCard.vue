<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { X } from '@lucide/vue'
import { ComboboxInput } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Combobox,
  ComboboxAnchor,
  ComboboxGroup,
  ComboboxItem,
  ComboboxList,
  ComboboxViewport,
} from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { armorHint, decorationHint, excludeCandidates } from '@/lib/search/lockExclude'
import { useLockExcludeStore } from '@/stores/lockExclude'
import { useMasterStore } from '@/stores/master'

const INPUT_ID = 'exclude-search'

const master = useMasterStore()
const store = useLockExcludeStore()

const root = ref<HTMLElement | null>(null)
const text = ref('')
const open = ref(false)

const query = computed(() => text.value.trim())

const candidates = computed(() =>
  master.bundle === null
    ? { armors: [], decorations: [], total: 0, remaining: 0 }
    : excludeCandidates(
        master.bundle,
        master.nameOf,
        query.value,
        store.excludedArmorIds,
        store.excludedDecorationIds,
      ),
)

interface Row {
  id: string
  name: string
  hint: string
}

const armorRows = computed<Row[]>(() =>
  store.excludedArmorIds.map((id) => {
    const armor = master.armorById.get(id)
    return {
      id,
      name: master.nameOf(id),
      hint: armor === undefined ? '' : armorHint(armor.part, armor.rank),
    }
  }),
)

const decorationRows = computed<Row[]>(() =>
  store.excludedDecorationIds.map((id) => {
    const decoration = master.decorationById.get(id)
    return {
      id,
      name: master.nameOf(id),
      hint: decoration === undefined ? '' : decorationHint(decoration),
    }
  }),
)

const isEmpty = computed(() => armorRows.value.length + decorationRows.value.length === 0)

function removeButtonId(id: string): string {
  return `exclude-remove-${id}`
}

function focusInput(): void {
  document.getElementById(INPUT_ID)?.focus()
}

function onSelect(value: unknown): void {
  if (typeof value !== 'string' || value === '') return
  if (candidates.value.armors.some((armor) => armor.id === value)) {
    store.addExcludedArmor(value as Parameters<typeof store.addExcludedArmor>[0])
  } else {
    store.addExcludedDecoration(value as Parameters<typeof store.addExcludedDecoration>[0])
  }
  text.value = ''
  open.value = false
  focusInput()
}

/** 外した後は、次の行の外すボタン、無ければ前の行、どちらも無ければ探す欄へフォーカスを移す。 */
async function remove(id: string, isArmor: boolean): Promise<void> {
  const ids = [...armorRows.value, ...decorationRows.value].map((row) => row.id)
  const index = ids.indexOf(id)
  const nextId = ids[index + 1] ?? ids[index - 1]
  if (isArmor) store.removeExcludedArmor(id as Parameters<typeof store.removeExcludedArmor>[0])
  else store.removeExcludedDecoration(id as Parameters<typeof store.removeExcludedDecoration>[0])
  await nextTick()
  const target = nextId === undefined ? null : document.getElementById(removeButtonId(nextId))
  if (target === null) focusInput()
  else target.focus()
}
</script>

<template>
  <Card class="gap-3 py-4">
    <div class="flex flex-col gap-1 px-4">
      <h2 class="text-base leading-snug font-semibold">除外</h2>
      <p class="text-muted-foreground text-xs">除外した防具・装飾品は、検索の候補にしません。</p>
    </div>
    <CardContent class="px-4">
      <div ref="root" class="flex flex-col gap-3">
        <div class="flex flex-col gap-1">
          <Label :for="INPUT_ID" class="text-sm">防具・装飾品を探す</Label>
          <Combobox
            v-model:open="open"
            model-value=""
            :ignore-filter="true"
            :reset-search-term-on-blur="false"
            class="min-w-0"
            @update:model-value="onSelect"
          >
            <ComboboxAnchor class="w-full">
              <ComboboxInput
                :id="INPUT_ID"
                v-model="text"
                placeholder="名前の一部を入力"
                class="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full min-w-0 rounded-md border px-3 text-base outline-none focus-visible:ring-3 md:text-sm"
              />
            </ComboboxAnchor>
            <ComboboxList v-if="query !== ''" class="w-(--reka-combobox-trigger-width) min-w-60">
              <ComboboxViewport class="max-h-72 overflow-y-auto p-1">
                <p class="text-muted-foreground px-2 py-1 text-xs">
                  「{{ query }}」を含む防具・装飾品:
                  <span class="tabular-nums">{{ candidates.total }}</span> 件
                </p>
                <p v-if="candidates.total === 0" class="px-2 py-1.5 text-sm">
                  該当する防具・装飾品がありません。名前を変えてください。
                </p>
                <ComboboxGroup v-if="candidates.armors.length > 0" heading="防具">
                  <ComboboxItem
                    v-for="armor in candidates.armors"
                    :key="armor.id"
                    :value="armor.id"
                    class="min-h-11 justify-between"
                  >
                    <span class="min-w-0 break-words">{{ armor.name }}</span>
                    <span class="text-muted-foreground shrink-0 text-xs">{{ armor.hint }}</span>
                  </ComboboxItem>
                </ComboboxGroup>
                <ComboboxGroup v-if="candidates.decorations.length > 0" heading="装飾品">
                  <ComboboxItem
                    v-for="decoration in candidates.decorations"
                    :key="decoration.id"
                    :value="decoration.id"
                    class="min-h-11 justify-between"
                  >
                    <span class="min-w-0 break-words">{{ decoration.name }}</span>
                    <span class="text-muted-foreground shrink-0 text-xs tabular-nums">{{
                      decoration.hint
                    }}</span>
                  </ComboboxItem>
                </ComboboxGroup>
                <p v-if="candidates.remaining > 0" class="text-muted-foreground px-2 py-1 text-xs">
                  ほかに
                  <span class="tabular-nums">{{ candidates.remaining }}</span>
                  件あります。名前を絞り込んでください。
                </p>
              </ComboboxViewport>
            </ComboboxList>
          </Combobox>
        </div>

        <p v-if="isEmpty" class="text-muted-foreground text-sm">
          除外している防具・装飾品はありません。
        </p>
        <section v-if="armorRows.length > 0" class="flex flex-col gap-1">
          <h3 class="text-xs font-bold">防具（{{ armorRows.length }} 件）</h3>
          <ul class="flex flex-col">
            <li
              v-for="row in armorRows"
              :key="row.id"
              class="flex min-h-11 items-center justify-between gap-2"
            >
              <span class="min-w-0 text-sm break-words">{{ row.name }}</span>
              <span class="text-muted-foreground shrink-0 text-xs">{{ row.hint }}</span>
              <Button
                :id="removeButtonId(row.id)"
                type="button"
                variant="ghost"
                class="size-11 shrink-0"
                :aria-label="`${row.name}を除外から外す`"
                @click="remove(row.id, true)"
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          </ul>
        </section>
        <section v-if="decorationRows.length > 0" class="flex flex-col gap-1">
          <h3 class="text-xs font-bold">装飾品（{{ decorationRows.length }} 件）</h3>
          <ul class="flex flex-col">
            <li
              v-for="row in decorationRows"
              :key="row.id"
              class="flex min-h-11 items-center justify-between gap-2"
            >
              <span class="min-w-0 text-sm break-words">{{ row.name }}</span>
              <span class="text-muted-foreground shrink-0 text-xs tabular-nums">{{
                row.hint
              }}</span>
              <Button
                :id="removeButtonId(row.id)"
                type="button"
                variant="ghost"
                class="size-11 shrink-0"
                :aria-label="`${row.name}を除外から外す`"
                @click="remove(row.id, false)"
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          </ul>
        </section>
      </div>
    </CardContent>
  </Card>
</template>
