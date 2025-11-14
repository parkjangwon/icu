/// <reference types="node" />

import { User as SupabaseUser } from '@supabase/supabase-js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: SupabaseUser;
  }
}

declare global {
  namespace Express {
    interface User extends SupabaseUser {}
  }
}
