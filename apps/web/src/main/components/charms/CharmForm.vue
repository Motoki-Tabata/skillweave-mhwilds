<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { SkillLevel, Slot } from '@swv/data'
import CharmMatchResult from '@/components/charms/CharmMatchResult.vue'
import CharmSkillRow from '@/components/charms/CharmSkillRow.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  CHARM_MAX_SKILLS,
  CHARM_MAX_SLOTS,
  CHARM_RARITIES,
  CHARM_SLOT_OPTIONS,
} from '@/constants/charms'
import { matchCharm } from '@/lib/charms/match'
import type { StoredCharm } from '@/lib/charms/storage'
import type { CharmDraft, CharmPayload } from '@/lib/charms/types'
import { validateCharm } from '@/lib/charms/validate'
import { useCharmsStore } from '@/stores/charms'
import { useMasterStore } from '@/stores/master'

const props = defineProps<{
  /** 編集中の護石。無ければ登録のモード */
  editing: StoredCharm | null
  /** 端末に保存できないあいだ、フォーム全体を無効にする */
  disabled: boolean
  disabledMessage: string
}>()
const emit = defineEmits<{
  saved: []
  cancel: []
  /** 更新が 409・404・401 で終わった（一覧の読み直し・端末への切り替えは store が済ませている） */
  rejected: [result: 'conflict' | 'notFound' | 'expired']
}>()

const master = useMasterStore()
const charms = useCharmsStore()

const SKILL_ROWS = Array.from({ length: CHARM_MAX_SKILLS }, (_, i) => i)
const SLOT_ROWS = Array.from({ length: CHARM_MAX_SLOTS }, (_, i) => i)

function emptyList<T>(length: number): (T | null)[] {
  return Array.from({ length }, () => null)
}

const rarity = ref<number | null>(null)
const skills = ref<(SkillLevel | null)[]>(emptyList(CHARM_MAX_SKILLS))
const slots = ref<(Slot | null)[]>(emptyList(CHARM_MAX_SLOTS))
/** Combobox の入力欄の文字（行ごと） */
const texts = ref<string[]>(SKILL_ROWS.map(() => ''))
const confirmed = ref(false)
const saving = ref(false)
/** 送信を試みたか（すべてのエラーを出す） */
const submitted = ref(false)
/** 触った行（エラーを出してよい行）。`rarity`・`skills:<i>`・`slots:<i>` */
const touched = reactive(new Set<string>())
const confirmError = ref(false)
const root = ref<HTMLElement | null>(null)

const isEditing = computed(() => props.editing !== null)
const draft = computed<CharmDraft>(() => ({
  rarity: rarity.value,
  skills: skills.value,
  slots: slots.value,
}))

interface FieldError {
  key: string
  message: string
  /** フォーカスを移す要素の id */
  focusId: string
}

/** Combobox に文字があるのに候補を選んでいない行。 */
function pendingTextErrors(): FieldError[] {
  return SKILL_ROWS.filter((i) => skills.value[i] === null && texts.value[i].trim() !== '').map(
    (i) => ({
      key: `skills:${i}`,
      message: '候補からスキルを選んでください。',
      focusId: `charm-skill-${i + 1}`,
    }),
  )
}

function focusIdOf(field: 'rarity' | 'skills' | 'slots', index: number): string {
  if (field === 'rarity') return 'charm-rarity'
  return field === 'skills' ? `charm-skill-${index + 1}` : `charm-slot-${index + 1}`
}

const allErrors = computed<FieldError[]>(() => {
  const pending = pendingTextErrors()
  const structural = validateCharm(draft.value, { bundle: master.bundle!, nameOf: master.nameOf })
    .map((error) => ({
      key: error.field === 'rarity' ? 'rarity' : `${error.field}:${error.index}`,
      message: error.message,
      focusId: focusIdOf(error.field, error.index),
    }))
    .filter((error) => !pending.some((item) => item.key === error.key))
  return [...pending, ...structural].sort((a, b) => orderOf(a.key) - orderOf(b.key))
})

function orderOf(key: string): number {
  if (key === 'rarity') return 0
  const [field, index] = key.split(':')
  return (field === 'skills' ? 10 : 20) + Number(index)
}

function visible(key: string): boolean {
  return submitted.value || touched.has(key)
}

function errorOf(key: string): string | null {
  const found = allErrors.value.find((error) => error.key === key)
  return found !== undefined && visible(key) ? found.message : null
}

/** 照合の結果は、エラーが無く、レア度を選んでいるときだけ出す。 */
const payload = computed<CharmPayload | null>(() => {
  if (allErrors.value.length > 0 || rarity.value === null) return null
  return {
    rarity: rarity.value,
    skills: skills.value.filter((skill): skill is SkillLevel => skill !== null),
    slots: slots.value.filter((slot): slot is Slot => slot !== null),
  }
})
const match = computed(() =>
  payload.value === null ? null : matchCharm(payload.value, master.bundle!, master.nameOf),
)

// 入力を変えたら、確認のチェックは外す
watch(
  [rarity, skills, slots],
  () => {
    confirmed.value = false
    confirmError.value = false
  },
  { deep: true },
)

function touchUpTo(field: 'skills' | 'slots', index: number): void {
  for (let i = 0; i <= index; i += 1) touched.add(`${field}:${i}`)
}

function loadDraft(charm: StoredCharm | null, previous?: StoredCharm | null): void {
  touched.clear()
  submitted.value = false
  confirmError.value = false
  if (charm === null) {
    // 編集を終えたら、登録のモードに戻して入力を空にする（レア度は残す）
    if (previous) clearSkillsAndSlots()
    return
  }
  rarity.value = charm.payload.rarity
  skills.value = SKILL_ROWS.map((i) => charm.payload.skills[i] ?? null)
  slots.value = SLOT_ROWS.map((i) => charm.payload.slots[i] ?? null)
  texts.value = SKILL_ROWS.map((i) =>
    charm.payload.skills[i] === undefined ? '' : master.nameOf(charm.payload.skills[i].skillId),
  )
  // 編集で読み込んだ護石の違反は、すぐに示す
  submitted.value = true
  confirmed.value = false
}

watch(() => props.editing, loadDraft, { immediate: true })

function clearSkillsAndSlots(): void {
  skills.value = emptyList(CHARM_MAX_SKILLS)
  slots.value = emptyList(CHARM_MAX_SLOTS)
  texts.value = SKILL_ROWS.map(() => '')
  touched.clear()
  submitted.value = false
  confirmed.value = false
  confirmError.value = false
}

function resetAll(): void {
  rarity.value = null
  clearSkillsAndSlots()
}

function setSkill(index: number, skillId: string): void {
  skills.value = skills.value.map((skill, i) =>
    i === index ? { skillId: skillId as SkillLevel['skillId'], level: 1 } : skill,
  )
  touchUpTo('skills', index)
}

function setLevel(index: number, level: number): void {
  skills.value = skills.value.map((skill, i) =>
    i === index && skill ? { ...skill, level } : skill,
  )
}

function clearSkill(index: number): void {
  skills.value = skills.value.map((skill, i) => (i === index ? null : skill))
  texts.value = texts.value.map((text, i) => (i === index ? '' : text))
  touchUpTo('skills', index)
}

function slotValue(slot: Slot | null): string {
  return slot === null ? 'none' : `${slot.target}:${slot.level}`
}

function setSlot(index: number, value: unknown): void {
  const option = CHARM_SLOT_OPTIONS.find((item) => item.value === value)
  if (option === undefined) return
  slots.value = slots.value.map((slot, i) => (i === index ? option.slot : slot))
  touchUpTo('slots', index)
}

function setRarity(value: unknown): void {
  rarity.value = Number(value)
  touched.add('rarity')
}

function focusById(id: string): void {
  void nextTick(() => document.getElementById(id)?.focus())
}

/** レア度の選択肢（選んでいる選択肢か、無ければ先頭）にフォーカスを移す。 */
function focusRarity(): void {
  const radios = Array.from(root.value?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])
  const target = radios.find((radio) => radio.dataset.state === 'checked') ?? radios[0]
  target?.focus()
  target?.scrollIntoView?.({ block: 'center' })
}

defineExpose({ focusRarity })

async function onSubmit(): Promise<void> {
  if (props.disabled || saving.value) return
  submitted.value = true
  const first = allErrors.value[0]
  if (first !== undefined) {
    if (first.key === 'rarity') focusRarity()
    else focusById(first.focusId)
    return
  }
  if (payload.value === null) return
  if (match.value?.status === 'mismatch' && !confirmed.value) {
    confirmError.value = true
    focusById('charm-confirm')
    return
  }
  saving.value = true
  const result = await charms.save(payload.value, props.editing ?? undefined)
  saving.value = false
  if (result === 'conflict' || result === 'notFound' || result === 'expired') {
    emit('rejected', result)
    return
  }
  if (result !== 'saved') return
  if (isEditing.value) {
    emit('saved')
    return
  }
  clearSkillsAndSlots()
  focusById('charm-skill-1')
}

// Combobox で Enter を押したときは、候補を選ぶだけで送信しない
function onEnter(event: KeyboardEvent): void {
  if (event.target instanceof HTMLElement && event.target.getAttribute('role') === 'combobox') {
    event.preventDefault()
  }
}
</script>

<template>
  <Card class="gap-3 py-4">
    <h2 class="px-4 text-base leading-snug font-bold">
      {{ isEditing ? '護石を編集' : '護石を登録' }}
    </h2>
    <CardContent class="px-4">
      <p v-if="disabled && disabledMessage" class="text-destructive mb-3 text-sm">
        {{ disabledMessage }}
      </p>
      <form
        ref="root"
        class="flex flex-col gap-4"
        novalidate
        @submit.prevent="onSubmit"
        @keydown.enter="onEnter"
      >
        <fieldset class="flex flex-col gap-1" :disabled="disabled">
          <legend class="mb-1 flex items-center gap-2 text-sm font-medium">
            レア度 <Badge variant="outline">必須</Badge>
          </legend>
          <RadioGroup
            id="charm-rarity"
            :model-value="rarity === null ? '' : String(rarity)"
            orientation="horizontal"
            class="grid grid-cols-4 gap-2"
            aria-label="レア度"
            :aria-invalid="errorOf('rarity') !== null"
            aria-describedby="charm-rarity-error"
            @update:model-value="setRarity"
          >
            <Label
              v-for="value in CHARM_RARITIES"
              :key="value"
              :for="`charm-rarity-${value}`"
              class="has-[[data-state=checked]]:border-foreground flex min-h-11 items-center justify-center gap-2 rounded-md border px-2 text-base tabular-nums"
            >
              <RadioGroupItem :id="`charm-rarity-${value}`" :value="String(value)" />
              {{ value }}
            </Label>
          </RadioGroup>
          <p
            v-if="errorOf('rarity') !== null"
            id="charm-rarity-error"
            class="text-destructive text-sm"
          >
            {{ errorOf('rarity') }}
          </p>
        </fieldset>

        <fieldset class="flex flex-col gap-3" :disabled="disabled">
          <legend class="sr-only">スキル</legend>
          <CharmSkillRow
            v-for="i in SKILL_ROWS"
            :key="i"
            v-model:text="texts[i]"
            :row="i + 1"
            :skill="skills[i]"
            :disabled="disabled"
            :error="errorOf(`skills:${i}`)"
            @select="setSkill(i, $event)"
            @level="setLevel(i, $event)"
            @clear="clearSkill(i)"
            @blur="touchUpTo('skills', i)"
          />
        </fieldset>

        <fieldset class="flex flex-col gap-3" :disabled="disabled">
          <legend class="sr-only">スロット</legend>
          <div v-for="i in SLOT_ROWS" :key="i" class="flex flex-col gap-1">
            <Label :for="`charm-slot-${i + 1}`" class="text-sm">スロット{{ i + 1 }}</Label>
            <Select
              :model-value="slotValue(slots[i])"
              :disabled="disabled"
              @update:model-value="setSlot(i, $event)"
            >
              <SelectTrigger
                :id="`charm-slot-${i + 1}`"
                class="h-11 w-full"
                :aria-invalid="errorOf(`slots:${i}`) !== null"
                :aria-describedby="`charm-slot-${i + 1}-error`"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in CHARM_SLOT_OPTIONS"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p
              v-if="errorOf(`slots:${i}`) !== null"
              :id="`charm-slot-${i + 1}-error`"
              class="text-destructive text-sm"
            >
              {{ errorOf(`slots:${i}`) }}
            </p>
          </div>
        </fieldset>

        <CharmMatchResult
          v-if="match !== null && rarity !== null"
          v-model:confirmed="confirmed"
          :match="match"
          :rarity="rarity"
          :confirm-error="confirmError"
        />

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
