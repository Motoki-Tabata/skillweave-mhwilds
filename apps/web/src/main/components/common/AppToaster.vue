<script setup lang="ts">
import { computed } from 'vue'
import { X } from '@lucide/vue'
import { ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { TOAST_DURATION_MS } from '@/constants/search'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useToastStore, type ToastItem } from '@/stores/toast'

const toast = useToastStore()
const appUpdate = useAppUpdateStore()

type Entry = { kind: 'toast'; item: ToastItem } | { kind: 'update' }

/** トーストと新しい版の通知を、出た順の1つの並びにする。 */
const entries = computed<Entry[]>(() => {
  const list: Entry[] = []
  let placed = !appUpdate.visible
  for (const item of toast.items) {
    if (!placed && item.id > appUpdate.afterToastId) {
      list.push({ kind: 'update' })
      placed = true
    }
    list.push({ kind: 'toast', item })
  }
  if (!placed) list.push({ kind: 'update' })
  return list
})

function onOpenChange(id: number, open: boolean): void {
  if (!open) toast.dismiss(id)
}

function onUpdateOpenChange(open: boolean): void {
  if (!open) appUpdate.dismiss()
}
</script>

<template>
  <ToastProvider label="通知" :duration="TOAST_DURATION_MS">
    <template v-for="entry in entries" :key="entry.kind === 'toast' ? entry.item.id : 'app-update'">
      <ToastRoot
        v-if="entry.kind === 'toast'"
        type="background"
        :data-tone="entry.item.tone"
        class="bg-card text-card-foreground data-[tone=destructive]:border-destructive data-[tone=destructive]:text-destructive rounded-md border px-4 py-3 text-sm"
        @update:open="(open: boolean) => onOpenChange(entry.item.id, open)"
      >
        <ToastTitle>{{ entry.item.message }}</ToastTitle>
      </ToastRoot>
      <ToastRoot
        v-else
        type="background"
        :duration="Infinity"
        data-slot="app-update"
        class="bg-card text-card-foreground relative rounded-md border py-3 pr-14 pl-4 text-sm"
        @update:open="onUpdateOpenChange"
      >
        <ToastTitle class="text-sm font-medium">新しい版があります</ToastTitle>
        <ToastDescription class="text-muted-foreground mt-1 text-xs">
          再読み込みすると新しい版に切り替わります。保存していない入力は消えます。
        </ToastDescription>
        <Button
          type="button"
          variant="outline"
          class="mt-3 h-10"
          :disabled="appUpdate.reloading"
          @click="appUpdate.reload()"
        >
          {{ appUpdate.reloading ? '再読み込み中…' : '再読み込み' }}
        </Button>
        <Button
          type="button"
          variant="ghost"
          class="absolute top-0 right-0 size-11"
          aria-label="通知を閉じる"
          title="通知を閉じる"
          @click="appUpdate.dismiss()"
        >
          <X class="size-5" aria-hidden="true" />
        </Button>
      </ToastRoot>
    </template>
    <ToastViewport
      class="fixed top-14 right-4 z-[60] m-0 flex w-80 max-w-[calc(100vw-2rem)] list-none flex-col gap-2 p-0 outline-none"
    />
  </ToastProvider>
</template>
