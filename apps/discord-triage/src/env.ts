import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const csv = z
	.string()
	.min(1)
	.transform((v) =>
		v
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean),
	);

const bool = z.enum(["true", "false"]).transform((v) => v === "true");

export const env = createEnv({
	server: {
		DISCORD_BOT_TOKEN: z.string().min(1),
		/** Comma-separated channel IDs to watch (text and/or forum channels). */
		DISCORD_CHANNEL_IDS: csv,
		/** Bot display name; applied at boot when it differs from the current one. */
		DISCORD_BOT_NAME: z.string().min(1).optional(),
		/** PNG/JPEG URL for the bot avatar; applied once per URL. */
		DISCORD_BOT_AVATAR_URL: z.string().url().optional(),
		/** Enables Claude summarization/enhancement of tickets; skipped when unset. */
		ANTHROPIC_API_KEY: z.string().min(1).optional(),
		/** File every new report into Linear Triage (the original behavior). */
		LINEAR_FILING_ENABLED: bool.default(true),
		LINEAR_API_KEY: z.string().min(1).optional(),
		LINEAR_TEAM_KEY: z.string().min(1).default("SUPER"),
		/** Label applied to every ingested issue. Must exist on the team. */
		LINEAR_SOURCE_LABEL: z.string().min(1).default("Discord"),
		/** Signing secret for the Linear webhook; endpoint is disabled when unset. */
		LINEAR_WEBHOOK_SECRET: z.string().min(1).optional(),
		/** Mirror reports into Plain over email and relay support replies back. */
		PLAIN_BRIDGE_ENABLED: bool.default(false),
		/** Plain's inbound email address for the support@ channel. */
		PLAIN_INBOUND_ADDRESS: z.string().email().optional(),
		RESEND_API_KEY: z.string().min(1).optional(),
		/** Resend domain with receiving enabled; synthetic customer addresses live here. */
		BRIDGE_EMAIL_DOMAIN: z.string().min(1).optional(),
		/** Signing secret of the Resend `email.received` webhook (whsec_...). */
		RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
		/** SQLite file for the Discord thread <-> email thread map. In-memory when unset. */
		BRIDGE_DB_PATH: z.string().min(1).optional(),
		PORT: z.coerce.number().default(8080),
	},
	runtimeEnv: process.env,
	emptyStringAsUndefined: true,
});

export const linearEnabled = env.LINEAR_FILING_ENABLED && !!env.LINEAR_API_KEY;

export const bridgeEnabled =
	env.PLAIN_BRIDGE_ENABLED &&
	!!env.PLAIN_INBOUND_ADDRESS &&
	!!env.RESEND_API_KEY &&
	!!env.BRIDGE_EMAIL_DOMAIN;

if (env.PLAIN_BRIDGE_ENABLED && !bridgeEnabled) {
	throw new Error(
		"PLAIN_BRIDGE_ENABLED needs PLAIN_INBOUND_ADDRESS, RESEND_API_KEY and BRIDGE_EMAIL_DOMAIN",
	);
}
if (env.LINEAR_FILING_ENABLED && !env.LINEAR_API_KEY) {
	throw new Error("LINEAR_FILING_ENABLED needs LINEAR_API_KEY");
}
