<script setup lang="ts">
import { Github } from 'lucide-vue-next';
</script>
<template>
  <footer class="text-center py-8 mt-8">
    <div class="flex items-center justify-center gap-3 mb-2">
      <p class="text-sm text-gray-600">
        © 2025 parkjangwon
      </p>
      <a
        href="https://github.com/parkjangwon"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 hover:bg-gray-700 transition-colors"
        aria-label="GitHub"
      >
        <Github class="w-5 h-5 text-white" :stroke-width="2" />
      </a>
    </div>
  </footer>
</template>
