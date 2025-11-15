import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase URL and Anon Key must be provided in environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY).');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // PKCE는 OAuth 제공자(구글 등) 사용 시 권장됩니다.
    flowType: 'pkce',
    // 브라우저 로컬스토리지에 세션을 저장/유지
    persistSession: true,
    // 액세스 토큰 만료 시 자동으로 새로고침
    autoRefreshToken: true,
    // OAuth 리다이렉트 URL에서 세션 파라미터 감지(암묵적/PKCE 모두 대응)
    detectSessionInUrl: true,
  },
});
