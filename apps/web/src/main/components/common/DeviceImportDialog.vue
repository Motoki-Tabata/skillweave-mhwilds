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

/** 端末内のデータをアカウントへ取り込む確認。開いたらフォーカスは「キャンセル」に置かれる。 */
defineProps<{ open: boolean; noun: string; count: number }>()
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
        <AlertDialogTitle class="text-base"
          >{{ noun }}をアカウントに取り込みますか？</AlertDialogTitle
        >
        <AlertDialogDescription>
          この端末の{{ noun }} {{ count }} 件を、ログイン中のアカウントに取り込みます。取り込んだ{{
            noun
          }}はこの端末から消え、ログアウトしても表示しません。
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel class="h-11">キャンセル</AlertDialogCancel>
        <AlertDialogAction class="h-11" @click="emit('confirm')">取り込む</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
