import { createClient } from '@supabase/supabase-js';
import config from './config';

// Client with anon key for JWT token verification (respects RLS)
export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

// Client with service role key for server-side operations (bypasses RLS)
export const supabaseServiceRole = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);
