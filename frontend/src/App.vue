<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router';
import { useTheme } from '@/composables/useTheme';
import { useSupabaseClient } from '@/composables/useSupabaseClient';
import { ref, onMounted, computed } from 'vue';
import type { User } from '@supabase/supabase-js';

const { theme, toggleTheme } = useTheme();
const supabase = useSupabaseClient();
const router = useRouter();
const route = useRoute();

const user = ref<User | null>(null);

const isLoginPage = computed(() => route.path === '/login');

const navigateToHome = () => {
  router.push('/');
};

const navigateToUrlList = () => {
  router.push('/urls');
};

const navigateToNotifications = () => {
  router.push('/notifications');
};

const handleAuthStateChange = (event: string, session: any) => {
  user.value = session?.user || null;
  if (!user.value && !isLoginPage.value) {
    router.push('/login');
  } else if (user.value && isLoginPage.value) {
    router.push('/');
  }
};

const signOut = async () => {
  try {
    // 네트워크 호출 없이 순수 로컬 세션 데이터만 정리 (환경별 403 방지)
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        // Supabase JS가 사용하는 키들은 sb- 접두사를 가집니다.
        if (k.startsWith('sb-')) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}

    // 라우팅
    await router.push('/login');
  } catch {
    await router.push('/login');
  }
};

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  user.value = session?.user || null;

  supabase.auth.onAuthStateChange(handleAuthStateChange);
});
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-gray-200 font-sans">
    <!-- Layout: Left Menu + Main Content -->
    <div v-if="!isLoginPage" class="flex" style="min-height: 100vh;">
      <!-- Left Fixed Menu -->
      <aside class="w-64 bg-transparent border-r border-gray-200 dark:border-gray-700 flex flex-col" style="position: fixed; height: 100vh; overflow-y: auto;">
        <!-- ICU Logo -->
        <div class="p-8 pt-10">
          <button 
            @click="navigateToHome"
            class="text-5xl font-bold bg-transparent border-0 p-0 focus:outline-none focus:ring-0 transition-opacity hover:opacity-80"
            style="margin-top: 10px; margin-bottom: 10px; color: #ffffff !important;"
          >
            Home
          </button>
        </div>

        <!-- Menu Items -->
        <nav class="flex-1 px-6 space-y-2 mt-4">
          <button
            @click="navigateToUrlList"
            class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm bg-transparent border-0 focus:outline-none transition-opacity hover:opacity-80"
            style="color: #ffffff !important;"
          >
            <span class="font-medium" style="color: #ffffff !important;">URL</span>
          </button>
          <button
            @click="navigateToNotifications"
            class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm bg-transparent border-0 focus:outline-none transition-opacity hover:opacity-80"
            style="margin-top: 10px; margin-bottom: 10px;  margin-right: 10px; color: #ffffff !important;"
          >
            <span class="font-medium" style="color: #ffffff !important;">Notification</span>
          </button>
        </nav>

        <!-- Logout Button -->
        <div v-if="user" class="px-6 py-8 mb-4 mt-auto pb-10 ">
          <button
            @click="signOut"
            class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm bg-transparent border-0 focus:outline-none transition-opacity hover:opacity-80"
            style="color: #ffffff !important; margin-bottom: 20px;"
          >
            <span class="font-medium" style="color: #ffffff !important;">Logout</span>
          </button>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main class="flex-1 overflow-y-auto flex flex-col" style="margin-left: 256px;">
        <!-- Top Bar with User Email -->
        <div class="bg-transparent border-b border-gray-200 dark:border-gray-700 px-8 py-5 flex justify-end items-center">
          <p v-if="user" class="text-base text-gray-700 dark:text-gray-300 font-medium">
            {{ user.email }}
          </p>
        </div>

        <!-- Page Content -->
        <div class="flex-1 p-8">
          <RouterView />
        </div>
      </main>
    </div>

    <!-- Login Page (Full Screen) -->
    <div v-else class="flex items-center justify-center min-h-screen">
      <RouterView />
    </div>
  </div>
</template>

<style>
.dark .bg-gray-100 {
  background-color: #111827;
}
.dark .bg-gray-200 {
  background-color: #374151;
}
</style>