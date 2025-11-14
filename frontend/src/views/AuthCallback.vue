<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-100">
    <p>Loading...</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useSupabaseClient } from '../composables/useSupabaseClient';

const router = useRouter();
const supabase = useSupabaseClient();

onMounted(async () => {
  // This component is primarily for handling the redirect from Supabase OAuth.
  // Supabase client automatically handles session storage from the URL hash.
  // We just need to redirect the user to the appropriate page.

  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    // User is logged in, redirect to home or a dashboard
    router.push('/');
  } else {
    // No session found, redirect to login
    router.push('/login');
  }
});
</script>
