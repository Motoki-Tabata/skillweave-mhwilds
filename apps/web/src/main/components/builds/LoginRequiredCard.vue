<script setup lang="ts">
import { useRoute } from 'vue-router'
import { LogIn } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { LOGIN_PATH, saveLoginReturn } from '@/lib/auth/loginReturn'
import type { LoginRequiredReason } from '@/stores/builds'

defineProps<{ reason: LoginRequiredReason }>()

const MESSAGES: Record<LoginRequiredReason, string> = {
  unauthenticated: '保存した構成を見るには、Discord でログインしてください。',
  unavailable:
    'ログインの状態を確認できませんでした。保存した構成を見るには、Discord でログインしてください。',
}

const route = useRoute()
</script>

<template>
  <Card class="items-start gap-3 p-4">
    <h2 class="text-base leading-snug font-bold">ログインが必要です</h2>
    <p class="text-sm">{{ MESSAGES[reason] }}</p>
    <Button as-child class="h-10">
      <a :href="LOGIN_PATH" @click="saveLoginReturn(route.fullPath)">
        <LogIn class="size-4" aria-hidden="true" />
        Discord でログイン
      </a>
    </Button>
  </Card>
</template>
