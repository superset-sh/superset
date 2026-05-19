/**
 * Environment variables for the MAIN PROCESS (Node.js context).
 *
 * This file uses t3-env with process.env which works at runtime in Node.js.
 * Only import this file in src/main/ code - never in renderer or shared code.
 *
 * For renderer process env vars, use src/renderer/env.renderer.ts instead.
 */
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

// NOTE: deployment-profile checks are inlined here rather than imported from
// @superset/shared/deployment-profile because electron.vite.config.ts does
// `await import("./src/main/env.main")` at config-load time, which Node's ESM
// loader handles directly (no Vite transform) — and Node can't load `.ts`
// files from sibling workspace packages. Keep this in sync with shared/.
function isTruthyFlag(value: string | undefined): boolean {
	return value === "1" || value === "true";
}

type MainDeploymentProfile = "cloud" | "local" | "ci" | "internal";
const VALID_PROFILES: MainDeploymentProfile[] = [
	"cloud",
	"local",
	"ci",
	"internal",
];

function getExplicitProfile(): MainDeploymentProfile | undefined {
	const explicitProfile = process.env.SUPERSET_PROFILE;
	if (!explicitProfile) return undefined;
	if (VALID_PROFILES.includes(explicitProfile as MainDeploymentProfile)) {
		return explicitProfile as MainDeploymentProfile;
	}
	throw new Error(
		`Invalid SUPERSET_PROFILE="${explicitProfile}". Expected one of: ${VALID_PROFILES.join(
			", ",
		)}.`,
	);
}

function getDeploymentProfile(): MainDeploymentProfile {
	if (isTruthyFlag(process.env.VERCEL) || process.env.VERCEL_ENV) {
		return "cloud";
	}
	const explicitProfile = getExplicitProfile();
	if (explicitProfile) return explicitProfile;
	if (isTruthyFlag(process.env.CI)) return "ci";
	return "internal";
}

export const deploymentProfile = getDeploymentProfile();
const isStrict =
	deploymentProfile === "cloud" || deploymentProfile === "internal";
const skipValidation =
	!isStrict || isTruthyFlag(process.env.SKIP_ENV_VALIDATION);

export const env = createEnv({
	server: {
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		// In dev builds (NODE_ENV=development) the URL defaults switch to
		// localhost so fresh-clone local contributors never silently sync
		// against hosted production endpoints.
		NEXT_PUBLIC_API_URL: z
			.url()
			.default(
				process.env.NODE_ENV === "development"
					? "http://localhost:4641"
					: "https://api.superset.sh",
			),
		NEXT_PUBLIC_STREAMS_URL: z
			.url()
			.default(
				process.env.NODE_ENV === "development"
					? "http://localhost:4647"
					: "https://streams.superset.sh",
			),
		NEXT_PUBLIC_ELECTRIC_URL: z
			.url()
			.default(
				process.env.NODE_ENV === "development"
					? "https://localhost:4650"
					: "https://electric-proxy.avi-6ac.workers.dev",
			),
		NEXT_PUBLIC_WEB_URL: z
			.url()
			.default(
				process.env.NODE_ENV === "development"
					? "http://localhost:4640"
					: "https://app.superset.sh",
			),
		NEXT_PUBLIC_MARKETING_URL: z.url().default("https://superset.sh"),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
		NEXT_PUBLIC_POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
		SENTRY_DSN_DESKTOP: z.string().optional(),
		STREAMS_URL: z
			.url()
			.default(
				process.env.NODE_ENV === "development"
					? "http://localhost:4647"
					: "https://superset-stream.fly.dev",
			),
		RELAY_URL: z
			.url()
			.default(
				process.env.NODE_ENV === "development"
					? "http://localhost:4653"
					: "https://relay.superset.sh",
			),
	},

	runtimeEnv: {
		...process.env,
		// Explicitly list env vars so Vite can replace them at build time
		// (spreading process.env only works at runtime, not for bundled apps)
		NODE_ENV: process.env.NODE_ENV,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_STREAMS_URL: process.env.NEXT_PUBLIC_STREAMS_URL,
		NEXT_PUBLIC_ELECTRIC_URL: process.env.NEXT_PUBLIC_ELECTRIC_URL,
		NEXT_PUBLIC_WEB_URL: process.env.NEXT_PUBLIC_WEB_URL,
		NEXT_PUBLIC_MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL,
		NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
		NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
		SENTRY_DSN_DESKTOP: process.env.SENTRY_DSN_DESKTOP,
		STREAMS_URL: process.env.STREAMS_URL,
		RELAY_URL: process.env.RELAY_URL,
	},
	emptyStringAsUndefined: true,
	skipValidation,

	// Main process runs in trusted Node.js environment
	isServer: true,
});
