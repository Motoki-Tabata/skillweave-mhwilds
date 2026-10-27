<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView, useRouter } from 'vue-router'
import AppHeader from '@/components/common/AppHeader.vue'
import AppNav from '@/components/common/AppNav.vue'
import AppToaster from '@/components/common/AppToaster.vue'
import CreditBar from '@/components/common/CreditBar.vue'
import { restoreAfterLogin } from '@/lib/auth/loginReturn'
import { useAuthStore } from '@/stores/auth'
import { useToastStore } from '@/stores/toast'

const router = useRouter()
const auth = useAuthStore()
const toast = useToastStore()

// 起動のときに認証状態を1回だけ取り、ログインからの戻りを処理する
onMounted(() => restoreAfterLogin(router, auth, toast))
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <AppNav />
    <!-- 下端に固定したクレジットのバー（高さ 32px）に隠れないよう、下に余白を取る -->
    <main class="flex-1 pb-14">
      <RouterView />
    </main>
    <CreditBar />
    <AppToaster />
  </div>
</template>
