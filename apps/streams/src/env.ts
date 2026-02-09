import { z } from "zod";

const envSchema = z.object({
	PORT: z.coerce.number().default(8080),
	INTERNAL_PORT: z.coerce.number().default(8081),
	CLAUDE_AGENT_PORT: z.coerce.number().default(9090),
	DURABLE_STREAMS_URL: z.string().optional(),
	DURABLE_STREAMS_DATA_DIR: z.string().optional(),
	DURABLE_STREAM_AUTH_TOKEN: z.string(),
	ANTHROPIC_API_KEY: z.string(),
});

export const env = envSchema.parse(process.env);
