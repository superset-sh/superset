import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (typeof window === "undefined") {
    throw new Error("Supabase client is only available on the client side");
  }

  if (!supabase) {
    supabase = createClient(
      env.VITE_SUPABASE_URL,
      env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
    );
  }

  return supabase;
}
