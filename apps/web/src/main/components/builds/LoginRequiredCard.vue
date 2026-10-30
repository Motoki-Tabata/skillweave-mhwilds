<script setup lang="ts">
import { useRoute } from 'vue-router'
import { LogIn } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LOGIN_PATH, saveLoginReturn } from '@/lib/auth/loginReturn'
import type { LoginRequiredReason } from '@/stores/builds'

const DEFAULT_MESSAGES: Record<LoginRequiredReason, string> = {
  unauthenticated: '保存した構成を見るには、Discord でログインしてください。',
  unavailable:
    'ログインの状態を確認できませんでした。保存した構成を見るには、Discord でログインしてください。',
}

/** `messages` で本文を差し替えられる（省略すると保存した構成の画面の文言） */
const props = defineProps<{
  reason: LoginRequiredReason
  messages?: Record<LoginRequiredReason, string>
}>()

const route = useRoute()
</script>

<template>
  <Card class="items-start gap-3 p-4">
    <h2 class="text-base leading-snug font-bold">ログインが必要です</h2>
    <p class="text-sm">{{ (props.messages ?? DEFAULT_MESSAGES)[props.reason] }}</p>
    <Button as-child class="h-10">
      <a :href="LOGIN_PATH" @click="saveLoginReturn(route.fullPath)">
        <LogIn class="size-4" aria-hidden="true" />
        Discord でログイン
      </a>
    </Button>
  </Card>
</template>
