<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useSupabaseClient } from '@/composables/useSupabaseClient';

const router = useRouter();
const supabase = useSupabaseClient();
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
    errorMessage.value = 'Please enter a valid URL';
    return;
  }

  isLoading.value = true;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      errorMessage.value = 'You must be logged in';
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
      setTimeout(() => {
        router.push(`/${resultUniqueId.value}`);
      }, 800);
    }
  } catch (error: any) {
    errorMessage.value = error.response?.data?.error || 'An error occurred';
  } finally {
    isLoading.value = false;
  }
};
</script>

<template>
  <div class="flex items-center justify-center min-h-[calc(100vh-200px)] px-4">
    <div style="width: 400px; max-width: 100%;">
      <div class="text-center mb-10">
        <h1 class="text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-3">
          ICU
        </h1>
        <p class="text-lg text-gray-600 dark:text-gray-300">
          Start monitoring your website
        </p>
      </div>

      <Card class="shadow-xl">
        <CardContent class="px-8 py-10">
          <form @submit.prevent="registerUrl" class="space-y-6">
            <div>
              <Input
                id="target-url"
                v-model="targetUrl"
                type="url"
                placeholder="https://example.com"
                :disabled="isLoading"
                style="height: 44px; font-size: 15px;"
              />
            </div>

            <Button
              type="submit"
              :disabled="isLoading || !targetUrl"
              class="w-full text-base font-semibold"
              style="height: 44px;"
            >
              {{ isLoading ? 'Setting up...' : 'Start Monitoring' }}
            </Button>

            <!-- Error Message -->
            <p v-if="errorMessage" class="text-sm text-red-600 dark:text-red-400 text-center">
              {{ errorMessage }}
            </p>

            <!-- Success Message -->
            <p v-if="resultUniqueId" class="text-sm text-green-600 dark:text-green-400 text-center">
              ✓ Success! Redirecting...
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>