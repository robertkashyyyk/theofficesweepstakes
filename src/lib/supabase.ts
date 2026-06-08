import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

// A single shared client. If env is missing we still construct a dummy so the
// app can render a "not configured" notice rather than crashing at import.
export const supabase = createClient(
  url ?? "http://localhost:54321",
  anon ?? "public-anon-key",
  { auth: { persistSession: true, autoRefreshToken: true } }
);
