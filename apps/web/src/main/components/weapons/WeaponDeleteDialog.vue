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

defineProps<{
  open: boolean
  /** 削除する武器の要約（表示名・武器種・攻撃力・会心率） */
  summary: string
  /** 検索条件でこの武器を選んでいるか */
  selected: boolean
}>()
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
        <AlertDialogTitle class="text-base">個体差のある武器を削除しますか？</AlertDialogTitle>
        <AlertDialogDescription>
          {{ summary }}。削除すると元に戻せません。<template v-if="selected"
            >検索条件の武器の選択も外します。</template
          >
        </AlertDialogDescription>
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
