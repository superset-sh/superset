import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const DEFAULT_PORT = 8080;
const DEFAULT_INTERNAL_PORT = 8081;

export const env = createEnv({
	server: {
		STREAMS_PORT: z.coerce.number().default(DEFAULT_PORT),
		STREAMS_INTERNAL_PORT: z.coerce.number().default(DEFAULT_INTERNAL_PORT),
		STREAMS_INTERNAL_URL: z.string().url().optional(),
		STREAMS_DATA_DIR: z.string().min(1).default("./data"),
		DATABASE_URL: z.string().url(),
		CORS_ORIGINS: z.string().optional(),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
