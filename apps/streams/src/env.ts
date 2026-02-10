import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		STREAMS_PORT: z.coerce.number(),
		STREAMS_INTERNAL_PORT: z.coerce.number(),
		STREAMS_INTERNAL_URL: z.string().url(),
		STREAMS_DATA_DIR: z.string().min(1),
		DATABASE_URL: z.string().url(),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
