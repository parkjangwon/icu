<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import axios from 'axios';
import { Card, CardContent } from '@/components/ui/card';
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
        router.push({ name: 'monitor', params: { uniqueId: resultUniqueId.value } });
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
  <div class="max-w-4xl mx-auto flex items-center justify-center w-full" style="min-height: 70vh;">
    <div class="w-full mx-auto px-4" style="max-width: 250px;">
      <div class="text-center mb-8">
        <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight text-black mb-2">
          ICU
        </h1>
        <p class="text-base sm:text-lg text-gray-600">
          Start monitoring your website
        </p>
      </div>

      <Card class="shadow-lg border-gray-200">
        <CardContent class="px-6 sm:px-8 py-10">
          <form @submit.prevent="registerUrl" class="space-y-6">
            <div>
              <Input
                id="target-url"
                v-model="targetUrl"
                type="url"
                placeholder="https://example.com"
                :disabled="isLoading"
                class="h-12 text-base"
              />
            </div>

            <Button
              type="submit"
              :disabled="isLoading || !targetUrl"
              class="w-full h-12 text-base font-semibold"
            >
              {{ isLoading ? 'Setting up...' : 'Start Monitoring' }}
            </Button>

            <p v-if="errorMessage" class="text-sm text-red-600 text-center">
              {{ errorMessage }}
            </p>

            <p v-if="resultUniqueId" class="text-sm text-green-600 text-center">
              ✓ Success! Redirecting...
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
