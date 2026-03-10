import { z } from "zod";

const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3002),
  APP_URL: z.string().url().default("https://atlas.com"),
  EMAIL_PROVIDER: z.enum(["resend", "ses", "smtp"]).default("resend"),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Atlas <noreply@atlas.com>"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export const serverEnv = serverEnvSchema.parse(process.env);
