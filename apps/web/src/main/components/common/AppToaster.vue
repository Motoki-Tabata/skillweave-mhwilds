<script setup lang="ts">
import { computed } from 'vue'
import { X } from '@lucide/vue'
import { ToastDescription, ToastProvider, ToastRoot, ToastTitle, ToastViewport } from 'reka-ui'
import { Button } from '@/components/ui/button'
import { TOAST_DURATION_MS } from '@/constants/search'
import { useAppUpdateStore } from '@/stores/appUpdate'
import { useChunkLoadStore } from '@/stores/chunkLoad'
import { useToastStore, type ToastItem } from '@/stores/toast'

const toast = useToastStore()
const appUpdate = useAppUpdateStore()
const chunkLoad = useChunkLoadStore()

type Notice = { kind: 'update' | 'chunk'; after: number }
type Entry = { kind: 'toast'; item: ToastItem } | { kind: 'update' } | { kind: 'chunk' }

/** 通知どうしの出た順。同じ位置なら、読み込み失敗が新しい版の通知の後に出たときだけ後ろ。 */
function compareNotices(a: Notice, b: Notice): number {
  if (a.after !== b.after) return a.after - b.after
  if (a.kind === b.kind) return 0
  const chunkAfterUpdate = chunkLoad.afterUpdate ? 1 : -1
  return a.kind === 'chunk' ? chunkAfterUpdate : -chunkAfterUpdate
}

function visibleNotices(): Notice[] {
  const notices: Notice[] = []
  if (appUpdate.visible) notices.push({ kind: 'update', after: appUpdate.afterToastId })
  if (chunkLoad.visible) notices.push({ kind: 'chunk', after: chunkLoad.afterToastId })
  return notices.sort(compareNotices)
}

/** トースト・新しい版の通知・読み込み失敗の通知を、出た順の1つの並びにする。 */
const entries = computed<Entry[]>(() => {
  const list: Entry[] = []
  const pending = visibleNotices()
  for (const item of toast.items) {
    while (pending.length > 0 && item.id > pending[0]!.after) {
      list.push({ kind: pending.shift()!.kind })
    }
    list.push({ kind: 'toast', item })
  }
  for (const notice of pending) list.push({ kind: notice.kind })
  return list
})

function entryKey(entry: Entry): string | number {
  if (entry.kind === 'toast') return entry.item.id
  return entry.kind === 'update' ? 'app-update' : 'chunk-load'
}

function onOpenChange(id: number, open: boolean): void {
  if (!open) toast.dismiss(id)
}

function onUpdateOpenChange(open: boolean): void {
  if (!open) appUpdate.dismiss()
}

function onChunkOpenChange(open: boolean): void {
  if (!open) chunkLoad.dismiss()
}
</script>

<template>
  <ToastProvider label="通知" :duration="TOAST_DURATION_MS">
    <template v-for="entry in entries" :key="entryKey(entry)">
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
        v-else-if="entry.kind === 'chunk'"
        type="foreground"
        :duration="Infinity"
        data-slot="chunk-load"
        class="bg-card text-card-foreground relative rounded-md border py-3 pr-14 pl-4 text-sm"
        @update:open="onChunkOpenChange"
      >
        <ToastTitle class="text-sm font-medium">画面を読み込めませんでした</ToastTitle>
        <ToastDescription class="text-muted-foreground mt-1 text-xs">
          新しい版が公開された可能性があります。再読み込みすると、開こうとした画面を開きます。保存していない入力は消えます。
        </ToastDescription>
        <Button
          type="button"
          variant="outline"
          class="mt-3 h-10"
          :disabled="chunkLoad.reloading"
          @click="chunkLoad.reload()"
        >
          {{ chunkLoad.reloading ? '再読み込み中…' : '再読み込み' }}
        </Button>
        <Button
          type="button"
          variant="ghost"
          class="absolute top-0 right-0 size-11"
          aria-label="通知を閉じる"
          title="通知を閉じる"
          @click="chunkLoad.dismiss()"
        >
          <X class="size-5" aria-hidden="true" />
        </Button>
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
