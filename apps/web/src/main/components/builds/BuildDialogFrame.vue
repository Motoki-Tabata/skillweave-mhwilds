<script setup lang="ts">
import { DialogContent, DialogPortal } from 'reka-ui'
import AppDialogOverlay from '@/components/common/AppDialogOverlay.vue'
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

defineProps<{
  open: boolean
  title: string
  description: string
  /** 説明文を画面に出さず、読み上げだけにするか（本文を別の要素で出すとき） */
  descriptionSrOnly?: boolean
}>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  openAutoFocus: [event: Event]
  closeAutoFocus: [event: Event]
}>()
</script>

<template>
  <Dialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <DialogPortal>
      <AppDialogOverlay />
      <DialogContent
        class="bg-background fixed top-[calc(50%+8px)] left-1/2 z-50 grid w-[calc(100%-2rem)] max-w-[480px] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 outline-none md:top-1/2"
        @open-auto-focus="(event: Event) => emit('openAutoFocus', event)"
        @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)"
      >
        <DialogHeader>
          <DialogTitle class="text-base leading-snug font-bold">{{ title }}</DialogTitle>
          <DialogDescription :class="descriptionSrOnly ? 'sr-only' : 'text-sm'">{{
            description
          }}</DialogDescription>
        </DialogHeader>
        <slot />
      </DialogContent>
    </DialogPortal>
  </Dialog>
</template>
