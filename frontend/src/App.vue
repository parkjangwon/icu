<script setup lang="ts">
import { RouterView, useRouter, useRoute } from 'vue-router';
import { useSupabaseClient } from '@/composables/useSupabaseClient';
import { ref, onMounted, computed } from 'vue';
import type { User } from '@supabase/supabase-js';
import Footer from '@/components/Footer.vue';

const supabase = useSupabaseClient();
const router = useRouter();
const route = useRoute();

const user = ref<User | null>(null);

const isLoginPage = computed(() => route.path === '/login');

const navigateToHome = () => router.push('/');
const navigateToUrlList = () => router.push('/urls');
const navigateToNotifications = () => router.push('/notifications');

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
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('sb-')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
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
    <!-- Logged-in Layout -->
    <div v-if="!isLoginPage">
      <!-- Desktop Layout: Fixed Sidebar + Main Content -->
      <div class="hidden md:block">
        <aside class="fixed left-0 top-0 h-full w-64 bg-white border-r border-gray-200 flex flex-col">
          <div class="p-8">
            <a href="#" @click.prevent="navigateToHome" class="text-3xl font-bold transition-opacity hover:opacity-80">
              ICU
            </a>
          </div>
          <nav class="flex-1 px-6 space-y-2">
            <a href="#" @click.prevent="navigateToUrlList" class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">URL List</a>
            <a href="#" @click.prevent="navigateToNotifications" class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">Notification</a>
          </nav>
          <div class="px-6 py-4 mt-auto">
            <a href="#" @click.prevent="signOut" class="block w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md">Logout</a>
          </div>
        </aside>
        <main class="flex-1 md:ml-64">
          <div class="border-b border-gray-200 px-8 py-4 flex justify-end items-center">
            <p v-if="user" class="text-sm text-gray-800">{{ user.email }}</p>
          </div>
          <div class="p-4 sm:p-6 lg:p-8">
            <RouterView />
          </div>
          <Footer />
        </main>
      </div>

      <!-- Mobile Layout: 3-Tier Vertical -->
      <div class="md:hidden flex flex-col min-h-screen">
        <header class="p-4 border-b border-gray-200 text-center">
          <a href="#" @click.prevent="navigateToHome" class="text-2xl font-bold">ICU</a>
        </header>
        <nav class="p-4 border-b border-gray-200">
          <div class="flex justify-around items-center">
            <a href="#" @click.prevent="navigateToUrlList" class="text-gray-700 hover:text-black">URL List</a>
            <a href="#" @click.prevent="navigateToNotifications" class="text-gray-700 hover:text-black">Notification</a>
            <a href="#" @click.prevent="signOut" class="text-gray-700 hover:text-black">Logout</a>
          </div>
          <div v-if="user" class="text-center mt-2 text-sm text-gray-600">
            {{ user.email }}
          </div>
        </nav>
        <main class="flex-grow p-4">
          <RouterView />
        </main>
        <Footer />
      </div>
    </div>

    <!-- Login Page (Full Screen) -->
    <div v-else class="flex flex-col min-h-screen">
      <div class="flex-grow flex items-center justify-center">
        <RouterView />
      </div>
      <Footer />
    </div>
  </div>
</template>
