<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/common/AppHeader.vue'
import AppToaster from '@/components/common/AppToaster.vue'
import CreditBar from '@/components/common/CreditBar.vue'
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <AppHeader />
    <!-- 下端に固定したクレジットのバー（高さ 32px）に隠れないよう、下に余白を取る -->
    <main class="flex-1 pb-14">
      <RouterView />
    </main>
    <CreditBar />
    <AppToaster />
  </div>
</template>
