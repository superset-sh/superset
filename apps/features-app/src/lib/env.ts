import { z } from "zod";

const clientEnvSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: z.string().min(1),
  VITE_API_URL: z.string().url().optional(),
});

export const env = clientEnvSchema.parse({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY:
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY,
  VITE_API_URL: import.meta.env.VITE_API_URL,
});
