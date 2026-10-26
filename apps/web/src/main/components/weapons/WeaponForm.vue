<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { SetBonusId, WeaponId } from '@swv/data'
import WeaponBonusRow from '@/components/weapons/WeaponBonusRow.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WEAPON_TYPES, weaponTypeName } from '@/constants/weaponTypes'
import { ELEMENT_TYPES, WEAPON_MAX_SLOTS, WEAPON_NAME_MAX } from '@/constants/weapons'
import { draftToPayload, payloadToDraft } from '@/lib/weapons/input'
import type { StoredWeapon, WeaponDraft } from '@/lib/weapons/types'
import { isArtiaWeapon, validateWeapon } from '@/lib/weapons/validate'
import type { WeaponError } from '@/lib/weapons/validate'
import { useMasterStore } from '@/stores/master'
import { useWeaponsStore } from '@/stores/weapons'

const props = defineProps<{
  /** 編集中の武器。無ければ登録のモード */
  editing: StoredWeapon | null
  /** 端末に保存できないあいだ、フォーム全体を無効にする */
  disabled: boolean
  disabledMessage: string
}>()
const emit = defineEmits<{ saved: []; cancel: [] }>()

const master = useMasterStore()
const weapons = useWeaponsStore()

const SLOT_ROWS = Array.from({ length: WEAPON_MAX_SLOTS }, (_, i) => i)
const SLOT_OPTIONS = [
  { value: 'none', label: 'なし' },
  { value: '1', label: 'Lv1' },
  { value: '2', label: 'Lv2' },
  { value: '3', label: 'Lv3' },
]

function emptyDraft(baseWeaponId: WeaponId | null = null): WeaponDraft {
  return {
    baseWeaponId,
    name: '',
    attack: '',
    affinity: '',
    elementType: null,
    elementValue: '',
    slots: SLOT_ROWS.map(() => null),
    seriesBonusId: null,
    groupBonusId: null,
  }
}

function paddedSlots(slots: (number | null)[]): (number | null)[] {
  return SLOT_ROWS.map((i) => slots[i] ?? null)
}

const draft = ref<WeaponDraft>(emptyDraft())
/** 付与スキルの Combobox の入力欄の文字 */
const seriesText = ref('')
const groupText = ref('')
const saving = ref(false)
/** 送信を試みたか（すべてのエラーを出す） */
const submitted = ref(false)
/** 触った項目（エラーを出してよい項目） */
const touched = reactive(new Set<string>())
const root = ref<HTMLElement | null>(null)

const isEditing = computed(() => props.editing !== null)

interface FieldError {
  key: string
  message: string
  /** フォーカスを移す要素の id */
  focusId: string
}

function errorKey(error: WeaponError): string {
  return error.field === 'slots' ? `slots:${error.index}` : error.field
}

function focusIdOf(error: WeaponError): string {
  switch (error.field) {
    case 'baseWeapon':
      return 'weapon-base'
    case 'name':
      return 'weapon-name'
    case 'attack':
      return 'weapon-attack'
    case 'affinity':
      return 'weapon-affinity'
    case 'element':
      return error.code === 'element-type' ? 'weapon-element-type' : 'weapon-element-value'
    case 'slots':
      return `weapon-slot-${error.index + 1}`
    case 'seriesBonus':
      return 'weapon-series'
    default:
      return 'weapon-group'
  }
}

const ORDER = [
  'baseWeapon',
  'name',
  'attack',
  'affinity',
  'element',
  'slots:0',
  'slots:1',
  'slots:2',
  'seriesBonus',
  'groupBonus',
]

/** Combobox に文字があるのに候補を選んでいない項目。 */
function pendingTextErrors(): FieldError[] {
  const rows = [
    {
      key: 'seriesBonus',
      id: draft.value.seriesBonusId,
      text: seriesText.value,
      label: 'シリーズ',
    },
    { key: 'groupBonus', id: draft.value.groupBonusId, text: groupText.value, label: 'グループ' },
  ]
  return rows
    .filter((row) => row.id === null && row.text.trim() !== '')
    .map((row) => ({
      key: row.key,
      message: `候補から${row.label}スキルを選んでください。`,
      focusId: row.key === 'seriesBonus' ? 'weapon-series' : 'weapon-group',
    }))
}

const allErrors = computed<FieldError[]>(() => {
  const pending = pendingTextErrors()
  const structural = validateWeapon(draft.value, { bundle: master.bundle!, nameOf: master.nameOf })
    .map((error) => ({ key: errorKey(error), message: error.message, focusId: focusIdOf(error) }))
    .filter((error) => !pending.some((item) => item.key === error.key))
  return [...pending, ...structural].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
})

function errorOf(key: string): string | null {
  if (!submitted.value && !touched.has(key)) return null
  return allErrors.value.find((error) => error.key === key)?.message ?? null
}

/** 属性の行の直下に出す。種類を選び直す・値の入力を同じ枠で扱う。 */
const elementError = computed(() => errorOf('element'))

/** 基の武器の選択肢。武器種の定数の並びで、グループの中はマスターの並び。 */
const baseGroups = computed(() =>
  WEAPON_TYPES.map((type) => ({
    id: type.id,
    name: type.name,
    items: (master.bundle?.weapons ?? []).filter(
      (weapon) => weapon.weaponType === type.id && isArtiaWeapon(weapon, master.nameOf),
    ),
  })).filter((group) => group.items.length > 0),
)

const baseTypeText = computed(() => {
  if (draft.value.baseWeaponId === null) return null
  const base = master.weaponById.get(draft.value.baseWeaponId)
  return base === undefined ? null : `武器種: ${weaponTypeName(base.weaponType)}`
})

function bonusName(id: SetBonusId | null): string {
  const bonus = master.bundle?.setBonuses.find((item) => item.id === id)
  return bonus === undefined ? '' : master.nameOf(bonus.skillId)
}

function loadEditing(weapon: StoredWeapon | null, previous?: StoredWeapon | null): void {
  touched.clear()
  submitted.value = false
  if (weapon === null) {
    // 編集を終えたら、登録のモードに戻して入力を空にする（基の武器は残す）
    if (previous) resetKeepingBase()
    return
  }
  const loaded = payloadToDraft(weapon.payload)
  loaded.slots = paddedSlots(loaded.slots)
  draft.value = loaded
  seriesText.value = bonusName(loaded.seriesBonusId)
  groupText.value = bonusName(loaded.groupBonusId)
  // 編集で読み込んだ武器の違反は、すぐに示す
  submitted.value = true
}

watch(() => props.editing, loadEditing, { immediate: true })

function resetKeepingBase(): void {
  draft.value = emptyDraft(draft.value.baseWeaponId)
  seriesText.value = ''
  groupText.value = ''
  touched.clear()
  submitted.value = false
}

function resetAll(): void {
  draft.value = emptyDraft()
  seriesText.value = ''
  groupText.value = ''
  touched.clear()
  submitted.value = false
}

function touch(key: string): void {
  touched.add(key)
}

function setBase(value: unknown): void {
  if (typeof value !== 'string' || value === '') return
  draft.value.baseWeaponId = value as WeaponId
  touch('baseWeapon')
}

function setElementType(value: unknown): void {
  draft.value.elementType = value === 'none' || typeof value !== 'string' ? null : value
  if (draft.value.elementType === null) draft.value.elementValue = ''
  touch('element')
}

function setSlot(index: number, value: unknown): void {
  const level = value === 'none' ? null : Number(value)
  draft.value.slots = draft.value.slots.map((current, i) => (i === index ? level : current))
  // 空の行の下に入力がある違反は、どの行を変えても一度に示す
  SLOT_ROWS.forEach((i) => touch(`slots:${i}`))
}

function setSeries(id: SetBonusId): void {
  draft.value.seriesBonusId = id
  seriesText.value = bonusName(id)
  touch('seriesBonus')
}

function setGroup(id: SetBonusId): void {
  draft.value.groupBonusId = id
  groupText.value = bonusName(id)
  touch('groupBonus')
}

function clearSeries(): void {
  draft.value.seriesBonusId = null
  seriesText.value = ''
  touch('seriesBonus')
}

function clearGroup(): void {
  draft.value.groupBonusId = null
  groupText.value = ''
  touch('groupBonus')
}

function focusById(id: string): void {
  void nextTick(() => document.getElementById(id)?.focus())
}

/** 基の武器にフォーカスを移す。 */
function focusBase(): void {
  const target = document.getElementById('weapon-base')
  target?.focus()
  target?.scrollIntoView?.({ block: 'center' })
}

defineExpose({ focusBase })

async function onSubmit(): Promise<void> {
  if (props.disabled || saving.value) return
  submitted.value = true
  const first = allErrors.value[0]
  if (first !== undefined) {
    focusById(first.focusId)
    return
  }
  saving.value = true
  const ok = await weapons.save(draftToPayload(draft.value), props.editing ?? undefined)
  saving.value = false
  if (!ok) return
  if (isEditing.value) {
    emit('saved')
    return
  }
  resetKeepingBase()
  focusById('weapon-name')
}

// Combobox で Enter を押したときは、候補を選ぶだけで送信しない
function onEnter(event: KeyboardEvent): void {
  if (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'combobox') {
    event.preventDefault()
  }
}

const NAME_HELP_ID = 'weapon-name-help'
const nameDescribedBy = computed(() =>
  errorOf('name') === null ? NAME_HELP_ID : `${NAME_HELP_ID} weapon-name-error`,
)
</script>

<template>
  <Card class="gap-3 py-4">
    <h2 class="px-4 text-base leading-snug font-semibold">
      {{ isEditing ? '武器を編集' : '武器を登録' }}
    </h2>
    <CardContent class="px-4">
      <p v-if="disabled" class="text-destructive mb-3 text-sm">{{ disabledMessage }}</p>
      <form
        ref="root"
        class="flex flex-col gap-4"
        novalidate
        @submit.prevent="onSubmit"
        @keydown.enter="onEnter"
      >
        <fieldset class="flex flex-col gap-4" :disabled="disabled">
          <legend class="sr-only">武器の性能</legend>

          <div class="flex flex-col gap-1">
            <Label for="weapon-base" class="flex items-center gap-2 text-sm">
              基の武器 <Badge variant="outline">必須</Badge>
            </Label>
            <Select :model-value="draft.baseWeaponId ?? ''" @update:model-value="setBase">
              <SelectTrigger
                id="weapon-base"
                class="h-11 w-full"
                :aria-invalid="errorOf('baseWeapon') !== null"
                aria-describedby="weapon-base-type weapon-base-error"
              >
                <SelectValue placeholder="基の武器を選ぶ" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup v-for="group in baseGroups" :key="group.id">
                  <SelectLabel>{{ group.name }}</SelectLabel>
                  <SelectItem v-for="item in group.items" :key="item.id" :value="item.id">
                    {{ master.nameOf(item.id) }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <p
              v-if="baseTypeText !== null"
              id="weapon-base-type"
              class="text-muted-foreground text-xs"
            >
              {{ baseTypeText }}
            </p>
            <p
              v-if="errorOf('baseWeapon') !== null"
              id="weapon-base-error"
              class="text-destructive text-sm"
            >
              {{ errorOf('baseWeapon') }}
            </p>
          </div>

          <div class="flex flex-col gap-1">
            <Label for="weapon-name" class="text-sm">名前</Label>
            <Input
              id="weapon-name"
              v-model="draft.name"
              :aria-invalid="errorOf('name') !== null"
              :aria-describedby="nameDescribedBy"
              class="h-11"
              @blur="touch('name')"
            />
            <p :id="NAME_HELP_ID" class="text-muted-foreground text-xs">
              空なら基の武器の名前で表示します。{{ WEAPON_NAME_MAX }} 文字まで。
            </p>
            <p
              v-if="errorOf('name') !== null"
              id="weapon-name-error"
              class="text-destructive text-sm"
            >
              {{ errorOf('name') }}
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div class="flex flex-col gap-1">
              <Label for="weapon-attack" class="flex items-center gap-2 text-sm">
                攻撃力 <Badge variant="outline">必須</Badge>
              </Label>
              <Input
                id="weapon-attack"
                v-model="draft.attack"
                inputmode="numeric"
                :aria-invalid="errorOf('attack') !== null"
                aria-describedby="weapon-attack-error"
                class="h-11 tabular-nums"
                @blur="touch('attack')"
              />
            </div>
            <div class="flex flex-col gap-1">
              <Label for="weapon-affinity" class="flex items-center gap-2 text-sm">
                会心率 <Badge variant="outline">必須</Badge>
              </Label>
              <div class="flex items-center gap-1">
                <Input
                  id="weapon-affinity"
                  v-model="draft.affinity"
                  :aria-invalid="errorOf('affinity') !== null"
                  aria-describedby="weapon-affinity-error"
                  class="h-11 tabular-nums"
                  @blur="touch('affinity')"
                />
                <span aria-hidden="true">%</span>
              </div>
            </div>
          </div>
          <p
            v-if="errorOf('attack') !== null"
            id="weapon-attack-error"
            class="text-destructive -mt-3 text-sm"
          >
            {{ errorOf('attack') }}
          </p>
          <p
            v-if="errorOf('affinity') !== null"
            id="weapon-affinity-error"
            class="text-destructive -mt-3 text-sm"
          >
            {{ errorOf('affinity') }}
          </p>

          <div class="flex flex-col gap-1">
            <Label for="weapon-element-type" class="text-sm">属性</Label>
            <div class="flex items-center gap-2">
              <Select
                :model-value="draft.elementType ?? 'none'"
                @update:model-value="setElementType"
              >
                <SelectTrigger
                  id="weapon-element-type"
                  class="h-11 min-w-[130px] shrink-0"
                  :aria-invalid="elementError !== null"
                  aria-describedby="weapon-element-error"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">なし</SelectItem>
                  <SelectItem v-for="type in ELEMENT_TYPES" :key="type.id" :value="type.id">
                    {{ type.name }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Input
                id="weapon-element-value"
                v-model="draft.elementValue"
                inputmode="numeric"
                aria-label="属性値"
                :disabled="draft.elementType === null"
                :aria-invalid="elementError !== null"
                aria-describedby="weapon-element-error"
                class="h-11 min-w-[100px] tabular-nums"
                @blur="touch('element')"
              />
            </div>
            <p
              v-if="elementError !== null"
              id="weapon-element-error"
              class="text-destructive text-sm"
            >
              {{ elementError }}
            </p>
          </div>

          <div v-for="i in SLOT_ROWS" :key="i" class="flex flex-col gap-1">
            <Label :for="`weapon-slot-${i + 1}`" class="text-sm">スロット{{ i + 1 }}</Label>
            <Select
              :model-value="draft.slots[i] === null ? 'none' : String(draft.slots[i])"
              @update:model-value="setSlot(i, $event)"
            >
              <SelectTrigger
                :id="`weapon-slot-${i + 1}`"
                class="h-11 w-full"
                :aria-invalid="errorOf(`slots:${i}`) !== null"
                :aria-describedby="`weapon-slot-${i + 1}-error`"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in SLOT_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p
              v-if="errorOf(`slots:${i}`) !== null"
              :id="`weapon-slot-${i + 1}-error`"
              class="text-destructive text-sm"
            >
              {{ errorOf(`slots:${i}`) }}
            </p>
          </div>

          <WeaponBonusRow
            v-model:text="seriesText"
            kind="series"
            :bonus-id="draft.seriesBonusId"
            :disabled="disabled"
            :error="errorOf('seriesBonus')"
            @select="setSeries"
            @clear="clearSeries"
            @blur="touch('seriesBonus')"
          />
          <WeaponBonusRow
            v-model:text="groupText"
            kind="group"
            :bonus-id="draft.groupBonusId"
            :disabled="disabled"
            :error="errorOf('groupBonus')"
            @select="setGroup"
            @clear="clearGroup"
            @blur="touch('groupBonus')"
          />
        </fieldset>

        <div class="flex flex-wrap gap-2">
          <Button type="submit" class="h-11 min-w-24" :disabled="disabled || saving">
            {{ saving ? '保存中…' : isEditing ? '保存' : '登録' }}
          </Button>
          <Button
            v-if="isEditing"
            type="button"
            variant="outline"
            class="h-11"
            @click="emit('cancel')"
          >
            キャンセル
          </Button>
          <Button
            v-else
            type="button"
            variant="outline"
            class="h-11"
            :disabled="disabled"
            @click="resetAll"
          >
            入力を空にする
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
