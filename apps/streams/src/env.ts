import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		PORT: z.coerce.number().default(8080),
		STREAMS_INTERNAL_PORT: z.coerce.number().default(8081),
		STREAMS_AGENT_PORT: z.coerce.number().default(9090),
		STREAMS_INTERNAL_URL: z.string().optional(),
		STREAMS_DATA_DIR: z.string().optional(),
		STREAMS_SECRET: z.string().min(1),
		ANTHROPIC_API_KEY: z.string().min(1),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
