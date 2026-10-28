<script setup lang="ts">
import { DialogContent, DialogOverlay, DialogPortal } from 'reka-ui'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

defineProps<{ open: boolean; title: string; description: string }>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  openAutoFocus: [event: Event]
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
        class="bg-background fixed top-[calc(50%+8px)] left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg outline-none md:top-1/2"
        @open-auto-focus="(event: Event) => emit('openAutoFocus', event)"
        @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)"
      >
        <DialogHeader>
          <DialogTitle class="text-base leading-snug font-semibold">{{ title }}</DialogTitle>
          <DialogDescription class="text-sm">{{ description }}</DialogDescription>
        </DialogHeader>
        <slot />
      </DialogContent>
    </DialogPortal>
  </Dialog>
</template>
