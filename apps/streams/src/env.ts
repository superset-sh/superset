import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		PORT: z.coerce.number().default(8080),
		INTERNAL_PORT: z.coerce.number().default(8081),
		CLAUDE_AGENT_PORT: z.coerce.number().default(9090),
		DURABLE_STREAMS_URL: z.string().optional(),
		DURABLE_STREAMS_DATA_DIR: z.string().optional(),
		STREAMS_SECRET: z.string().min(1),
		ANTHROPIC_API_KEY: z.string().min(1),
		CLAUDE_BINARY_PATH: z.string().optional(),
		CLAUDE_MODEL: z.string().optional(),
	},
	clientPrefix: "PUBLIC_",
	client: {},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
