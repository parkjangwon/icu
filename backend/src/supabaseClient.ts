import { createClient } from '@supabase/supabase-js';
import config from './config';

// Client with service role key for server-side operations (bypasses RLS)
export const supabaseServiceRole = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

// Alias for backward compatibility
export const supabase = supabaseServiceRole;
