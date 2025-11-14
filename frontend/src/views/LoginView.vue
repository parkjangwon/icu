<template>
  <div class="flex items-center justify-center min-h-screen bg-gray-100">
    <Card class="w-[350px]">
      <CardHeader>
        <CardTitle class="text-center">Welcome to ICU</CardTitle>
        <CardDescription class="text-center">Sign in to monitor your URLs</CardDescription>
      </CardHeader>
      <CardContent>
        <div class="grid w-full items-center gap-4">
          <Button @click="signInWithGoogle" class="w-full">
            <img src="/google-icon.svg" alt="Google icon" class="w-5 h-5 mr-2" />
            Sign in with Google
          </Button>
        </div>
      </CardContent>
      <CardFooter class="flex justify-between">
        <!-- Optional: Add links for privacy policy, terms of service, etc. -->
      </CardFooter>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useSupabaseClient } from '../composables/useSupabaseClient'; // Custom composable for Supabase client
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

const router = useRouter();
const supabase = useSupabaseClient(); // Use the composable

const signInWithGoogle = async () => {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback', // Redirect to a callback page
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
/* Add any specific styles for the login page here */
</style>
