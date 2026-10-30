<script setup lang="ts">
import { ref } from 'vue'
import { Copy } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { copyUrlWithToast } from '@/lib/shares/copy'

/** 共有の URL の表示（枠の中に全文）と「URL をコピー」。入力欄にはしない。 */
const props = defineProps<{ url: string }>()

const urlBox = ref<HTMLElement | null>(null)
const root = ref<HTMLElement | null>(null)

function focusCopy(): void {
  const element = root.value?.querySelector<HTMLElement>('button')
  element?.focus()
}
defineExpose({ focusCopy })
</script>

<template>
  <div ref="root" class="flex flex-col gap-1">
    <p class="text-xs">共有の URL</p>
    <p
      ref="urlBox"
      class="border-input rounded-sm border px-3 py-2 text-sm break-all select-all"
      data-share-url
    >
      {{ url }}
    </p>
    <Button
      type="button"
      variant="outline"
      class="mt-1 h-10 w-full gap-1 md:w-fit"
      @click="copyUrlWithToast(props.url, urlBox)"
    >
      <Copy class="size-4" aria-hidden="true" />
      URL をコピー
    </Button>
  </div>
</template>
