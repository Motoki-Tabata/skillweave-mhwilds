<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
</script>

<template>
  <div class="mx-auto w-full px-4 py-4 md:max-w-[720px] md:px-6 lg:max-w-[1280px]">
    <div class="flex max-w-[720px] flex-col gap-3">
      <h1 tabindex="-1" class="text-xl leading-snug font-bold outline-none">
        ページが見つかりません
      </h1>
      <div class="flex flex-col items-start gap-3">
        <p class="text-sm">
          URL が間違っているか、ページが移動または削除された可能性があります。URL
          を確かめるか、装備検索から使い始めてください。
        </p>
        <Button as-child variant="outline" class="h-10">
          <RouterLink to="/">装備検索へ</RouterLink>
        </Button>
      </div>
    </div>
  </div>
</template>
