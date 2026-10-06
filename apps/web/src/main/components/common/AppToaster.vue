<script setup lang="ts">
import { ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'
import { TOAST_DURATION_MS } from '@/constants/search'
import { useToastStore } from '@/stores/toast'

const toast = useToastStore()

function onOpenChange(id: number, open: boolean): void {
  if (!open) toast.dismiss(id)
}
</script>

<template>
  <ToastProvider label="通知" :duration="TOAST_DURATION_MS">
    <ToastRoot
      v-for="item in toast.items"
      :key="item.id"
      type="background"
      class="bg-card text-card-foreground rounded-md border px-4 py-3 text-sm shadow-md"
      @update:open="(open: boolean) => onOpenChange(item.id, open)"
    >
      <ToastTitle>{{ item.message }}</ToastTitle>
    </ToastRoot>
    <ToastViewport
      class="fixed top-14 right-4 z-[60] m-0 flex w-80 max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none"
    />
  </ToastProvider>
</template>
