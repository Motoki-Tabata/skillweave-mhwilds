<script setup lang="ts">
import { nextTick, ref } from 'vue'
import { useRoute } from 'vue-router'
import { LogIn } from '@lucide/vue'
import BuildDialogFrame from '@/components/builds/BuildDialogFrame.vue'
import { Button } from '@/components/ui/button'
import { LOGIN_PATH, saveLoginReturn } from '@/lib/auth/loginReturn'
import type { LoginRequiredReason } from '@/stores/builds'

defineProps<{ open: boolean; reason: LoginRequiredReason }>()
const emit = defineEmits<{
  'update:open': [open: boolean]
  closeAutoFocus: [event: Event]
}>()

const MESSAGES: Record<LoginRequiredReason, string> = {
  unauthenticated:
    '構成を保存するには、Discord でログインしてください。ログインするとこのページを離れるため、いまの検索結果は消えます。ログインした後に、もう一度検索してから保存してください。',
  unavailable:
    'ログインの状態を確認できなかったため、構成を保存できません。Discord でログインしてください。ログインするとこのページを離れるため、いまの検索結果は消えます。',
}

const route = useRoute()
const closeButton = ref<InstanceType<typeof Button> | null>(null)

/** 開いたら「閉じる」にフォーカスを置く（ページを離れる操作を既定にしない）。 */
function onOpenAutoFocus(event: Event): void {
  event.preventDefault()
  void nextTick(() => (closeButton.value?.$el as HTMLElement | undefined)?.focus())
}
</script>

<template>
  <BuildDialogFrame
    :open="open"
    title="構成の保存にはログインが必要です"
    :description="MESSAGES[reason]"
    @update:open="(value: boolean) => emit('update:open', value)"
    @open-auto-focus="onOpenAutoFocus"
    @close-auto-focus="(event: Event) => emit('closeAutoFocus', event)"
  >
    <div class="flex justify-end gap-2">
      <Button
        ref="closeButton"
        type="button"
        variant="outline"
        class="h-11"
        @click="emit('update:open', false)"
      >
        閉じる
      </Button>
      <Button as-child class="h-11">
        <a :href="LOGIN_PATH" @click="saveLoginReturn(route.fullPath)">
          <LogIn class="size-4" aria-hidden="true" />
          Discord でログイン
        </a>
      </Button>
    </div>
  </BuildDialogFrame>
</template>
