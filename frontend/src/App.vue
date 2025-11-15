<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router';
import { useSupabaseClient } from '@/composables/useSupabaseClient';
import { ref, onMounted, computed } from 'vue';
import type { User } from '@supabase/supabase-js';

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
    // Clear local session data without making a network call to prevent 403 errors in some environments.
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        // Keys used by Supabase JS have an 'sb-' prefix.
        if (k.startsWith('sb-')) keysToRemove.push(k);
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}

    // Routing
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
  <div class="min-h-screen bg-white text-black font-sans">
    <!-- Layout: Left Menu + Main Content -->
    <div v-if="!isLoginPage" class="flex" style="min-height: 100vh;">
      <!-- Left Fixed Menu -->
      <aside class="w-64 bg-white border-r border-gray-200 flex flex-col" style="position: fixed; height: 100vh; overflow-y: auto;">
        <!-- ICU Logo -->
        <div class="p-8 pt-10">
          <button 
            @click="navigateToHome"
            class="text-5xl font-bold bg-transparent border-0 p-0 focus:outline-none focus:ring-0 transition-opacity hover:opacity-80"
            style="margin-top: 10px; margin-bottom: 10px; color: #000000 !important;"
          >
            Home
          </button>
        </div>

        <!-- Menu Items -->
        <nav class="flex-1 px-6 space-y-2 mt-4">
          <button
            @click="navigateToUrlList"
            class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm bg-transparent border-0 focus:outline-none transition-opacity hover:opacity-80"
            style="color: #000000 !important;"
          >
            <span class="font-medium" style="color: #000000 !important;">URL</span>
          </button>
          <button
            @click="navigateToNotifications"
            class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm bg-transparent border-0 focus:outline-none transition-opacity hover:opacity-80"
            style="margin-top: 10px; margin-bottom: 10px;  margin-right: 10px; color: #000000 !important;"
          >
            <span class="font-medium" style="color: #000000 !important;">Notification</span>
          </button>
        </nav>

        <!-- Logout Button -->
        <div v-if="user" class="px-6 py-8 mb-4 mt-auto pb-10 ">
          <button
            @click="signOut"
            class="w-full flex items-center gap-3 px-4 py-3 text-left text-sm bg-transparent border-0 focus:outline-none transition-opacity hover:opacity-80"
            style="color: #000000 !important; margin-bottom: 20px;"
          >
            <span class="font-medium" style="color: #000000 !important;">Logout</span>
          </button>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main class="flex-1 overflow-y-auto flex flex-col" style="margin-left: 256px;">
        <!-- Top Bar with User Email -->
        <div class="bg-white border-b border-gray-200 px-8 py-5 flex justify-end items-center">
          <p v-if="user" class="text-base text-black font-medium">
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
