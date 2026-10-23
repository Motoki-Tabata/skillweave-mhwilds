<script setup lang="ts">
import { ref } from 'vue'
import { Moon, Sun } from '@lucide/vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { currentTheme, toggleTheme } from '@/lib/theme'
import type { Theme } from '@/lib/theme'

const theme = ref<Theme>(currentTheme())

function onToggle(): void {
  theme.value = toggleTheme()
}
</script>

<template>
  <header
    class="bg-background sticky top-0 z-40 flex h-12 items-center gap-2 border-b px-4 md:px-6"
  >
    <span class="text-base font-bold">SkillWeave</span>
    <Badge variant="outline">非公式の二次創作</Badge>
    <Button
      type="button"
      variant="ghost"
      class="ml-auto size-11"
      :aria-label="theme === 'dark' ? 'ライトテーマに切り替える' : 'ダークテーマに切り替える'"
      :title="theme === 'dark' ? 'ライトテーマに切り替える' : 'ダークテーマに切り替える'"
      @click="onToggle"
    >
      <Sun v-if="theme === 'dark'" class="size-5" aria-hidden="true" />
      <Moon v-else class="size-5" aria-hidden="true" />
    </Button>
    <!-- 将来の認証導線を1か所にまとめるための空き（009） -->
    <div data-slot="header-auth" />
  </header>
</template>
