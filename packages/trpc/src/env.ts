import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		CLERK_SECRET_KEY: z.string().min(1),
		BLOB_READ_WRITE_TOKEN: z.string().min(1),
		POSTHOG_API_KEY: z.string(),
		POSTHOG_PROJECT_ID: z.string(),
		QSTASH_TOKEN: z.string().min(1),
		NEXT_PUBLIC_API_URL: z.string().url(),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
