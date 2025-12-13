import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod";

export const env = createEnv({
	extends: [vercel()],
	shared: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
	},

	server: {
		DATABASE_URL: z.string().url(),
		DATABASE_URL_UNPOOLED: z.string().url(),
		AUTH0_SECRET: z.string(),
		AUTH0_ISSUER_BASE_URL: z.string().url(),
		AUTH0_CLIENT_ID: z.string(),
		AUTH0_CLIENT_SECRET: z.string(),
	},

	client: {
		NEXT_PUBLIC_API_URL: z.string().url(),
		NEXT_PUBLIC_WEB_URL: z.string().url(),
	},

	experimental__runtimeEnv: {
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
	},

	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
