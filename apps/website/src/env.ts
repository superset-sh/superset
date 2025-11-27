import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets";
import { z } from "zod";

export const env = createEnv({
	extends: [vercel()],
	server: {
		DATABASE_URL: z.string().url(),
		DATABASE_URL_UNPOOLED: z.string().url().optional(),
		MOCK_USER_ID: z.string().uuid().optional(),
	},
	client: {},
	/**
	 * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
	 */
	experimental__runtimeEnv: {},
	emptyStringAsUndefined: true,
	// Skip validation during build if env vars aren't available
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
