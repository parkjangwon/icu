<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-100">
    <p>Loading...</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useSupabaseClient } from '../composables/useSupabaseClient';

const router = useRouter();
const route = useRoute();
const supabase = useSupabaseClient();

onMounted(async () => {
  // Handle Supabase OAuth callback (PKCE or implicit)
  // 1) If provider returned an error in query string, go back to login
  const error = route.query.error as string | undefined;
  if (error) {
    console.error('OAuth callback error:', error, route.query.error_description);
    await router.replace('/login');
    return;
  }

  // 2) PKCE flow: exchange authorization code for a session
  const code = route.query.code as string | undefined;
  if (code) {
    try {
      const { error: exchError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchError) {
        console.error('Failed to exchange code for session:', exchError.message);
        await router.replace('/login');
        return;
      }
    } catch (e: any) {
      console.error('Unexpected error during code exchange:', e?.message || e);
      await router.replace('/login');
      return;
    }
  }

  // 3) For implicit flow (hash-based) or after exchange, check for session
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    await router.replace('/');
  } else {
    await router.replace('/login');
  }
});
</script>
