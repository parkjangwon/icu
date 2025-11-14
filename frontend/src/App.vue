<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router';
import { useTheme } from '@/composables/useTheme';
import { useSupabaseClient } from '@/composables/useSupabaseClient';
import { ref, onMounted, onUnmounted, computed } from 'vue';
import type { User } from '@supabase/supabase-js';
import { Button } from '@/components/ui/button';

const { theme, toggleTheme } = useTheme();
const supabase = useSupabaseClient();
const router = useRouter();
const route = useRoute();

const user = ref<User | null>(null);

const isLoginPage = computed(() => route.path === '/login');

const handleAuthStateChange = (event: string, session: any) => {
  user.value = session?.user || null;
  if (!user.value && !isLoginPage.value) {
    router.push('/login');
  } else if (user.value && isLoginPage.value) {
    router.push('/');
  }
};

const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Error signing out:', error.message);
  } else {
    router.push('/login');
  }
};

onMounted(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  user.value = session?.user || null;

  supabase.auth.onAuthStateChange(handleAuthStateChange);
});

onUnmounted(() => {
  // Clean up the subscription if necessary, though onAuthStateChange returns a subscription object
  // For simplicity, we'll rely on Vue's component lifecycle for now.
});
</script>

<template>
  <div class="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-sans">
    <header v-if="!isLoginPage" class="p-4 flex justify-between items-center">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">
        ICU <span class="text-sm font-light">- I See You</span>
      </h1>
      <div class="flex items-center space-x-4">
        <span v-if="user" class="text-sm text-gray-600 dark:text-gray-300">{{ user.email }}</span>
        <Button v-if="user" @click="signOut" variant="outline" size="sm">Logout</Button>
        <button
          @click="toggleTheme"
          class="p-2 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          aria-label="Toggle theme"
        >
          <svg v-if="theme.value === 'light'" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
          </svg>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        </button>
      </div>
    </header>
    <main class="p-4">
      <RouterView />
    </main>
    <footer class="text-center p-4 text-xs text-gray-500">
      <!-- Ad placeholder as requested -->
      <!-- <div class="ad-banner">Your Ad Here</div> -->
      <p>&copy; {{ new Date().getFullYear() }} ICU. All rights reserved.</p>
    </footer>
  </div>
</template>

<style>
/* For a smoother transition */
.dark .bg-gray-100 {
  background-color: #111827; /* dark:bg-gray-900 */
}
.dark .bg-gray-200 {
  background-color: #374151; /* dark:bg-gray-700 */
}
/* Add other transition styles if needed */
</style>