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

defineProps<{ open: boolean; summary: string }>()
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
        <AlertDialogTitle>護石を削除しますか？</AlertDialogTitle>
        <AlertDialogDescription>{{ summary }}。削除すると元に戻せません。</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel class="h-11">キャンセル</AlertDialogCancel>
        <AlertDialogAction
          class="text-destructive border-destructive hover:text-destructive h-11 border bg-transparent hover:bg-transparent"
          @click="emit('confirm')"
        >
          削除
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
