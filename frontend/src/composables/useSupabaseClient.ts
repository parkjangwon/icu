import { getCurrentInstance } from 'vue';
import { SupabaseClient } from '@supabase/supabase-js';

export function useSupabaseClient(): SupabaseClient {
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error('useSupabaseClient must be used within a setup function.');
  }
  return instance.appContext.config.globalProperties.$supabase;
}
