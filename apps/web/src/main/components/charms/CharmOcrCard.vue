<script setup lang="ts">
import { computed, ref } from 'vue'
import { ImagePlus, Loader2 } from '@lucide/vue'
import ResultAlert from '@/components/search/ResultAlert.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { OcrFailure, OcrPhase, OcrRoute, SkippedImage } from '@/lib/ocr/useCharmOcrQueue'

const props = defineProps<{
  /** フォームが無効（護石を読み込めない・端末に保存できない）のあいだ true */
  disabled: boolean
  phase: OcrPhase
  progress: { k: number; n: number }
  /** 次の1件を入れた・待ち列を終えたときの進み具合の文言 */
  notice: string
  skipped: SkippedImage[]
  /** 21 枚目以降で読み取らなかった枚数 */
  overflow: number
  failure: OcrFailure | null
  queueCount: number
}>()
const emit = defineEmits<{
  accept: [files: File[], route: OcrRoute]
  clear: []
}>()

const input = ref<HTMLInputElement | null>(null)
const pickButton = ref<InstanceType<typeof Button> | null>(null)
const box = ref<HTMLElement | null>(null)
const dragging = ref(false)

const busy = computed(() => props.phase !== 'idle')

const progressText = computed(() => {
  if (props.phase === 'preparing') return '読み取りの準備をしています…'
  if (props.phase === 'reading') {
    return `画像を読み取っています（${props.progress.k} / ${props.progress.n} 枚）…`
  }
  return props.notice
})

const skippedCount = computed(() => props.skipped.length + props.overflow)

function reasonText(item: SkippedImage): string {
  return item.reason === 'notWide'
    ? `${item.name}: 16:9 の画像ではないため、読み取りませんでした。`
    : `${item.name}: 画像として開けないため、読み取りませんでした。`
}

const failureText = computed(() => {
  const failure = props.failure
  if (failure === null) return ''
  if (failure.kind === 'prepare') {
    return '読み取りに使うデータを読み込めませんでした。通信状況を確かめて、もう一度画像を渡してください。手入力での登録はそのまま使えます。'
  }
  return `${failure.index} 枚目の読み取りの途中で失敗したため、残りの画像は読み取っていません。読み取れた分は待ち列に入れました。残りの画像は、もう一度渡してください。手入力での登録はそのまま使えます。`
})

function focusPick(): void {
  ;(pickButton.value?.$el as HTMLElement | undefined)?.focus()
}
defineExpose({ focusPick })

function openPicker(): void {
  if (busy.value || props.disabled) return
  input.value?.click()
}

function onPicked(event: Event): void {
  const target = event.target as HTMLInputElement
  const files = Array.from(target.files ?? [])
  // 同じファイルをもう一度選べるように、値を空にする
  target.value = ''
  if (files.length > 0) emit('accept', files, 'pick')
}

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}

function onDragOver(event: DragEvent): void {
  if (!hasFiles(event)) return
  event.preventDefault()
  dragging.value = !props.disabled
}

function onDragLeave(event: DragEvent): void {
  if (event.relatedTarget instanceof Node && box.value?.contains(event.relatedTarget)) return
  dragging.value = false
}

function onDrop(event: DragEvent): void {
  if (!hasFiles(event)) return
  event.preventDefault()
  dragging.value = false
  if (props.disabled) return
  const files = Array.from(event.dataTransfer?.files ?? [])
  if (files.length > 0) emit('accept', files, 'drop')
}
</script>

<template>
  <Card class="gap-3 py-4">
    <h2 class="px-4 text-base leading-snug font-bold">画像から読み取る</h2>
    <CardContent class="flex flex-col gap-3 px-4">
      <div
        ref="box"
        data-testid="ocr-drop-zone"
        class="border-input flex flex-col items-start gap-3 rounded border p-4"
        :class="dragging ? 'border-ring bg-muted' : ''"
        @dragover="onDragOver"
        @dragleave="onDragLeave"
        @drop="onDrop"
      >
        <p class="text-sm">
          {{
            busy
              ? '読み取り中です。読み終えてから、続きの画像を渡してください。'
              : 'PC 版の護石の詳細画面のスクリーンショットを、ここへドラッグ＆ドロップするか、この画面で貼り付けてください。1回に 20 枚まで読み取れます。'
          }}
        </p>
        <input
          ref="input"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          aria-label="読み取る画像のファイル"
          @change="onPicked"
        />
        <Button
          ref="pickButton"
          type="button"
          variant="outline"
          class="h-11 aria-disabled:opacity-50"
          :disabled="disabled"
          :aria-disabled="busy ? 'true' : undefined"
          @click="openPicker"
        >
          <Loader2 v-if="busy" class="size-4 animate-spin" aria-hidden="true" />
          <ImagePlus v-else class="size-4" aria-hidden="true" />
          {{ busy ? '読み取り中…' : '画像を選ぶ' }}
        </Button>
      </div>
      <p class="text-muted-foreground text-xs">
        画像はこのブラウザの中だけで読み取り、送信も保存もしません。
      </p>
      <output class="block text-sm">{{ progressText }}</output>
      <ResultAlert
        v-if="skippedCount > 0"
        tone="warning"
        :title="`読み取らなかった画像があります（${skippedCount} 枚）`"
      >
        <ul class="flex flex-col gap-1">
          <li v-for="(item, index) in skipped" :key="index" class="break-all">
            {{ reasonText(item) }}
          </li>
          <li v-if="overflow > 0">
            1回に読み取れるのは 20 枚までのため、21 枚目以降の {{ overflow }}
            枚は読み取りませんでした。続きは、待ち列を終えてから渡してください。
          </li>
        </ul>
      </ResultAlert>
      <ResultAlert v-if="failure !== null" tone="error" title="画像を読み取れませんでした">
        <p>{{ failureText }}</p>
      </ResultAlert>
      <Button
        v-if="queueCount > 0"
        type="button"
        variant="outline"
        class="h-11 self-start"
        @click="emit('clear')"
      >
        待ち列を空にする
      </Button>
    </CardContent>
  </Card>
</template>
