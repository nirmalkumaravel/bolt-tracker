import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://gmszgcnulbxewrgvqefi.supabase.co';
const supabaseAnonKey = 'sb_publishable_DW-pnTEu27VZI1dMusAQlA_wW0I7UD-';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
