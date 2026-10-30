<script setup lang="ts">
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

/** 汎用の削除確認。開いたらフォーカスは「キャンセル」に置かれる。 */
withDefaults(
  defineProps<{ open: boolean; title: string; description: string; confirmLabel?: string }>(),
  { confirmLabel: '削除' },
)
const emit = defineEmits<{
  'update:open': [open: boolean]
  confirm: []
  closeAutoFocus: [event: Event]
}>()
</script>

<template>
  <AlertDialog :open="open" @update:open="(value: boolean) => emit('update:open', value)">
    <AlertDialogContent @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)">
      <AlertDialogHeader>
        <AlertDialogTitle class="text-base">{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel class="h-11">キャンセル</AlertDialogCancel>
        <AlertDialogAction
          class="text-destructive border-destructive hover:text-destructive h-11 border bg-transparent hover:bg-transparent"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
