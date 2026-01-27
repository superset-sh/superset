import { z } from "zod";

const envSchema = z.object({
	NODE_ENV: z
		.enum(["development", "production", "test"])
		.default("development"),
	EXPO_PUBLIC_API_URL: z.url(),
	EXPO_PUBLIC_WEB_URL: z.url().optional(),
	EXPO_PUBLIC_STREAMS_URL: z.url().optional(),
	EXPO_PUBLIC_DEEP_LINK_SCHEME: z.string().default("superset"),
	EXPO_PUBLIC_DEEP_LINK_DOMAIN: z.string().optional(),
});

export const env = envSchema.parse({
	NODE_ENV: process.env.NODE_ENV as unknown,
	EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL as unknown,
	EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL as unknown,
	EXPO_PUBLIC_STREAMS_URL: process.env.EXPO_PUBLIC_STREAMS_URL as unknown,
	EXPO_PUBLIC_DEEP_LINK_SCHEME: process.env
		.EXPO_PUBLIC_DEEP_LINK_SCHEME as unknown,
	EXPO_PUBLIC_DEEP_LINK_DOMAIN: process.env
		.EXPO_PUBLIC_DEEP_LINK_DOMAIN as unknown,
});
