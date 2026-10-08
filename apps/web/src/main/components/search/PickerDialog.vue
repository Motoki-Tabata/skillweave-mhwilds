<script setup lang="ts">
import { X } from '@lucide/vue'
import { DialogContent, DialogOverlay, DialogPortal } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogDescription, DialogTitle } from '@/components/ui/dialog'

export interface PickerDialogProps {
  open: boolean
  title: string
  /** 画面には出さない説明（読み上げ用）。画面に出す説明は本文のスロットに書く。 */
  description: string
}

defineProps<PickerDialogProps>()

const emit = defineEmits<{
  'update:open': [open: boolean]
  closeAutoFocus: [event: Event]
}>()
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogPortal>
      <!-- 基準幅では、ヘッダー（48px）とクレジットのバー（32px）を覆わない -->
      <DialogOverlay
        class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-x-0 top-12 bottom-8 z-50 bg-black/60 md:inset-y-0"
      />
      <DialogContent
        class="bg-background fixed inset-x-0 top-12 bottom-8 z-50 flex flex-col outline-none md:inset-auto md:top-1/2 md:left-1/2 md:max-h-[calc(100vh-6rem)] md:w-[720px] md:max-w-[calc(100vw-3rem)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:shadow-lg"
        @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)"
      >
        <div class="flex shrink-0 items-center justify-between gap-2 border-b py-1 pr-2 pl-4">
          <DialogTitle class="text-base leading-snug font-semibold">{{ title }}</DialogTitle>
          <DialogClose as-child>
            <Button variant="ghost" size="icon" class="size-11" aria-label="閉じる">
              <X />
            </Button>
          </DialogClose>
        </div>
        <DialogDescription class="sr-only">{{ description }}</DialogDescription>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          <slot />
        </div>
        <div v-if="$slots.footer" class="shrink-0 border-t p-4">
          <slot name="footer" />
        </div>
      </DialogContent>
    </DialogPortal>
  </Dialog>
</template>
