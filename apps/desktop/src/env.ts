import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		NEXT_PUBLIC_API_URL: z.url().default("https://api.superset.sh"),
		NEXT_PUBLIC_WEB_URL: z.url().default("https://app.superset.sh"),
	},

	runtimeEnv: {
		...process.env,
		// Vite's define replaces this at build time, ensuring correct env in packaged apps
		NODE_ENV: process.env.NODE_ENV,
	},
	emptyStringAsUndefined: true,

	// Electron runs in a trusted environment - treat renderer as server context
	isServer: true,
});
