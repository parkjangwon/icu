<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSupabaseClient } from '@/composables/useSupabaseClient'; // Import useSupabaseClient

const router = useRouter();
const supabase = useSupabaseClient(); // Get Supabase client instance
const targetUrl = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const resultUniqueId = ref('');

const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return url.includes('.');
  } catch (error) {
    return false;
  }
};

const registerUrl = async () => {
  errorMessage.value = '';
  resultUniqueId.value = '';

  if (!isValidUrl(targetUrl.value)) {
    errorMessage.value = 'Please enter a valid URL (e.g., https://example.com)';
    return;
  }

  isLoading.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      errorMessage.value = 'You must be logged in to register a URL.';
      isLoading.value = false;
      router.push('/login');
      return;
    }

    const response = await axios.post('/api/register-url', {
      url: targetUrl.value,
    }, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    
    if (response.data.unique_id) {
      resultUniqueId.value = response.data.unique_id;
      // Navigate to the new page after a short delay
      setTimeout(() => {
        router.push(`/${resultUniqueId.value}`);
      }, 1000);
    }
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'An unexpected error occurred. Please try again.';
  } finally {
    isLoading.value = false;
  }
};

const getMonitorUrl = () => {
  if (!resultUniqueId.value) return '';
  return `${window.location.origin}/${resultUniqueId.value}`;
};
</script>

<template>
  <div class="flex flex-col items-center justify-center min-h-screen">
    <Card class="w-full max-w-2xl">
      <CardHeader class="text-center">
        <CardTitle class="text-2xl font-bold">Welcome to ICU</CardTitle>
        <CardDescription>
          I'll keep an eye on your website or API for you. Just give me a URL to watch.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="registerUrl">
          <div class="flex flex-col sm:flex-row gap-2">
            <Input
              v-model="targetUrl"
              id="url-input"
              type="text"
              placeholder="https://your-website.com"
              :disabled="isLoading"
            />
            <Button
              type="submit"
              :disabled="isLoading"
            >
              <span v-if="!isLoading">Watch This URL</span>
              <span v-else>Analyzing...</span>
            </Button>
          </div>
        </form>

        <!-- Error Message -->
        <div v-if="errorMessage" class="mt-4 text-red-500">
          {{ errorMessage }}
        </div>

        <!-- Result Display -->
        <div v-if="resultUniqueId" class="mt-6 p-4 bg-green-100 dark:bg-green-900/50 border border-green-400 dark:border-green-700 rounded-lg">
          <h3 class="font-bold text-green-800 dark:text-green-200">Success! Your monitoring page is ready.</h3>
          <p class="text-sm text-gray-600 dark:text-gray-300 mt-1">Redirecting you now...</p>
          <a :href="getMonitorUrl()" target="_blank" class="mt-2 inline-block break-all text-blue-600 dark:text-blue-400 hover:underline">
            {{ getMonitorUrl() }}
          </a>
        </div>
      </CardContent>
    </Card>
  </div>
</template>