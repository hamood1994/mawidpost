import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
// Supabase now calls this the "publishable" key; older projects call it the "anon" key. Either works.
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** False until the Supabase values are set in .env.local */
export const configured = Boolean(url && key);

export const supabase = createClient(url ?? "http://localhost:54321", key ?? "missing-key");
