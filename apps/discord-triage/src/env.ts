import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DISCORD_BOT_TOKEN: z.string().min(1),
		/** Comma-separated channel IDs to watch (text and/or forum channels). */
		DISCORD_CHANNEL_IDS: z
			.string()
			.min(1)
			.transform((v) =>
				v
					.split(",")
					.map((s) => s.trim())
					.filter(Boolean),
			),
		LINEAR_API_KEY: z.string().min(1),
		LINEAR_TEAM_KEY: z.string().min(1).default("SUPER"),
		/** Label applied to every ingested issue. Must exist on the team. */
		LINEAR_SOURCE_LABEL: z.string().min(1).default("Discord"),
		/** Signing secret for the Linear webhook; endpoint is disabled when unset. */
		LINEAR_WEBHOOK_SECRET: z.string().min(1).optional(),
		PORT: z.coerce.number().default(8080),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});
