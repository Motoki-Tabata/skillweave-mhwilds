<script setup lang="ts">
import { nextTick, ref, useId, watch } from 'vue'
import BuildDialogFrame from '@/components/builds/BuildDialogFrame.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BUILD_NAME_MAX, validateBuildName } from '@/lib/builds/name'

const props = defineProps<{
  open: boolean
  title: string
  description: string
  /** 開いたときに入力欄へ入れる名前 */
  initialName: string
  /** 応答待ち。送信とキャンセル・閉じる操作を止める */
  saving: boolean
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  /** 検証を通った名前（前後の空白を除いたもの） */
  submit: [name: string]
  closeAutoFocus: [event: Event]
}>()

const inputId = useId()
const helpId = useId()
const errorId = useId()
const name = ref(props.initialName)
const error = ref<string | null>(null)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.initialName
    error.value = null
  },
)

function validate(): string | null {
  const check = validateBuildName(name.value)
  error.value = check.ok ? null : check.message
  return check.ok ? check.name : null
}

function onSubmit(): void {
  if (props.saving) return
  const checked = validate()
  if (checked !== null) emit('submit', checked)
}

function onUpdateOpen(value: boolean): void {
  // 応答を待つあいだは閉じない
  if (!value && props.saving) return
  emit('update:open', value)
}

/** 開いたら入力欄にフォーカスを置き、全文を選択する。 */
function onOpenAutoFocus(event: Event): void {
  event.preventDefault()
  void nextTick(() => {
    const input = document.getElementById(inputId) as HTMLInputElement | null
    input?.focus()
    input?.select()
  })
}
</script>

<template>
  <BuildDialogFrame
    :open="open"
    :title="title"
    :description="description"
    @update:open="onUpdateOpen"
    @open-auto-focus="onOpenAutoFocus"
    @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)"
  >
    <form class="flex flex-col gap-4" novalidate @submit.prevent="onSubmit">
      <div class="flex flex-col gap-1">
        <Label :for="inputId" class="text-sm"> 名前 <Badge variant="outline">必須</Badge> </Label>
        <Input
          :id="inputId"
          v-model="name"
          class="h-11"
          :aria-invalid="error !== null"
          :aria-describedby="error === null ? helpId : `${helpId} ${errorId}`"
          :disabled="saving"
          @blur="validate"
        />
        <p :id="helpId" class="text-muted-foreground text-xs">
          {{ BUILD_NAME_MAX }}文字まで。同じ名前の構成も保存できます。
        </p>
        <p v-if="error !== null" :id="errorId" class="text-destructive text-sm">{{ error }}</p>
      </div>
      <div class="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          class="h-11"
          :disabled="saving"
          @click="onUpdateOpen(false)"
        >
          キャンセル
        </Button>
        <Button type="submit" class="h-11" :disabled="saving">
          {{ saving ? '保存中…' : '保存' }}
        </Button>
      </div>
    </form>
  </BuildDialogFrame>
</template>
