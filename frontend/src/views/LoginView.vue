<template>
  <div class="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 px-4">
    <div class="w-[420px]">
      <Card class="shadow-xl border-0">
        <CardHeader class="space-y-3 pt-10 pb-6 px-8">
          <div class="text-center">
            <CardTitle class="text-4xl font-bold text-gray-900 dark:text-white mb-2">
              ICU
            </CardTitle>
            <CardDescription class="text-base text-gray-600 dark:text-gray-300">
              Monitor your website
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent class="px-8 pb-10">
          <button
            @click="signInWithGoogle"
            class="google-signin-button"
          >
            <img src="/google-icon.svg" alt="Google" class="w-[18px] h-[18px]" />
            <span>Sign in with Google</span>
          </button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useSupabaseClient } from '../composables/useSupabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const router = useRouter();
const supabase = useSupabaseClient();

const signInWithGoogle = async () => {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback',
      },
    });

    if (error) {
      console.error('Error signing in with Google:', error.message);
      alert('Error signing in with Google: ' + error.message);
    }
  } catch (error: any) {
    console.error('Unexpected error during Google sign-in:', error.message);
    alert('Unexpected error during Google sign-in: ' + error.message);
  }
};
</script>

<style scoped>
.google-signin-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  height: 48px;
  background-color: #ffffff;
  border: 1px solid #dadce0;
  border-radius: 4px;
  color: #3c4043;
  font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.25px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 2px 0 rgba(60, 64, 67, 0.1);
}

.google-signin-button:hover {
  background-color: #f8f9fa;
  border-color: #d2d4d6;
  box-shadow: 0 1px 3px 0 rgba(60, 64, 67, 0.15);
}

.google-signin-button:active {
  background-color: #f1f3f4;
  border-color: #dadce0;
  box-shadow: 0 1px 2px 0 rgba(60, 64, 67, 0.1);
}

.google-signin-button:focus {
  outline: none;
  box-shadow: 0 0 0 3px rgba(66, 133, 244, 0.2);
}

/* Dark mode support */
.dark .google-signin-button {
  background-color: #ffffff;
  border-color: #dadce0;
  color: #3c4043;
}

.dark .google-signin-button:hover {
  background-color: #f8f9fa;
}
</style>
