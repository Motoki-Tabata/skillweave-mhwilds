<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MasterWeapon, WeaponId } from '@swv/data'
import PickerDialog from '@/components/search/PickerDialog.vue'
import { Input } from '@/components/ui/input'
import { WEAPON_TYPES, weaponTypeName } from '@/constants/weaponTypes'
import { WEAPON_LIST_LIMIT } from '@/constants/search'
import { formatWeaponStats } from '@/lib/format'
import { matchesQuery } from '@/lib/text'
import { useConditionsStore } from '@/stores/conditions'
import { useMasterStore } from '@/stores/master'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  closeAutoFocus: [event: Event]
}>()

const ALL = 'all'

const master = useMasterStore()
const conditions = useConditionsStore()

const typeFilter = ref<string>(ALL)
const query = ref('')

// 開いたときに、選択中の武器の武器種（未選択なら「すべて」）・空の検索語から始める
watch(
  () => props.open,
  (open) => {
    if (!open) return
    typeFilter.value = conditions.weapon?.weaponType ?? ALL
    query.value = ''
  },
  { immediate: true },
)

/** マスターに含まれる武器種だけを、定数の並び順で出す。 */
const typeButtons = computed(() => {
  const present = new Set(master.bundle?.weapons.map((weapon) => weapon.weaponType))
  return WEAPON_TYPES.filter((type) => present.has(type.id))
})

const matched = computed<MasterWeapon[]>(() =>
  (master.bundle?.weapons ?? []).filter(
    (weapon) =>
      (typeFilter.value === ALL || weapon.weaponType === typeFilter.value) &&
      matchesQuery(master.nameOf(weapon.id), query.value),
  ),
)

const shown = computed(() => matched.value.slice(0, WEAPON_LIST_LIMIT))

const typeLabel = computed(() =>
  typeFilter.value === ALL ? 'すべて' : weaponTypeName(typeFilter.value),
)

const hint = computed(() => {
  if (matched.value.length === 0) return '該当する武器がありません。武器種や名前を変えてください。'
  if (matched.value.length > WEAPON_LIST_LIMIT) {
    return `${typeLabel.value} ${matched.value.length} 件のうち ${WEAPON_LIST_LIMIT} 件を表示しています。名前で絞り込んでください。`
  }
  return ''
})

function skillTags(weapon: MasterWeapon): string[] {
  return weapon.skills.map((skill) => `${master.nameOf(skill.skillId)} Lv${skill.level}`)
}

function onOpenChange(open: boolean): void {
  // 選ばずに閉じたときは、武器欄にエラーを出す
  if (!open) conditions.showWeaponError()
  emit('update:open', open)
}

function select(id: WeaponId): void {
  conditions.selectWeapon(id)
  emit('update:open', false)
}
</script>

<template>
  <PickerDialog
    :open="open"
    title="武器を選択"
    description="武器種と名前で絞り込み、武器を1つ選びます。"
    @update:open="onOpenChange"
    @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)"
  >
    <div class="flex flex-col gap-3">
      <fieldset aria-label="武器種" class="grid min-w-0 grid-cols-5 gap-1.5 border-0 p-0">
        <button
          type="button"
          class="focus-visible:ring-ring/50 focus-visible:border-ring aria-pressed:bg-secondary aria-pressed:border-foreground aria-pressed:font-bold min-h-11 rounded-md border px-1 text-xs outline-none focus-visible:ring-3"
          :aria-pressed="typeFilter === ALL"
          @click="typeFilter = ALL"
        >
          すべて
        </button>
        <button
          v-for="type in typeButtons"
          :key="type.id"
          type="button"
          class="focus-visible:ring-ring/50 focus-visible:border-ring aria-pressed:bg-secondary aria-pressed:border-foreground aria-pressed:font-bold min-h-11 rounded-md border px-1 text-xs outline-none focus-visible:ring-3"
          :aria-label="type.name"
          :aria-pressed="typeFilter === type.id"
          @click="typeFilter = type.id"
        >
          {{ type.shortName }}
        </button>
      </fieldset>

      <Input v-model="query" type="search" class="h-10" aria-label="武器名で検索" />

      <p v-if="hint" class="text-muted-foreground text-xs">{{ hint }}</p>

      <ul class="flex flex-col gap-2">
        <li v-for="weapon in shown" :key="weapon.id">
          <button
            type="button"
            class="focus-visible:ring-ring/50 focus-visible:border-ring aria-pressed:border-foreground aria-pressed:bg-secondary flex min-h-11 w-full flex-col gap-1 rounded-md border px-3 py-2 text-left outline-none focus-visible:ring-3 aria-pressed:border-2"
            :aria-pressed="weapon.id === conditions.weaponId"
            @click="select(weapon.id)"
          >
            <span class="flex items-start justify-between gap-2">
              <span class="min-w-0 font-bold break-words">{{ master.nameOf(weapon.id) }}</span>
              <span class="shrink-0 text-xs">{{ weaponTypeName(weapon.weaponType) }}</span>
            </span>
            <span class="font-num text-xs tabular-nums">{{ formatWeaponStats(weapon) }}</span>
            <span v-if="weapon.skills.length > 0" class="flex flex-wrap gap-1">
              <span
                v-for="tag in skillTags(weapon)"
                :key="tag"
                class="rounded-md border px-1.5 text-xs"
                >{{ tag }}</span
              >
            </span>
          </button>
        </li>
      </ul>
    </div>
  </PickerDialog>
</template>
