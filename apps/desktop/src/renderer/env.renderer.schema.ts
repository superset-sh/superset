import { z } from "zod/v4";

export type RendererEnvInput = {
	NODE_ENV?: string;
	NEXT_PUBLIC_API_URL?: string;
	NEXT_PUBLIC_WEB_URL?: string;
	NEXT_PUBLIC_MARKETING_URL?: string;
	NEXT_PUBLIC_ELECTRIC_URL?: string;
	NEXT_PUBLIC_POSTHOG_KEY?: string;
	NEXT_PUBLIC_POSTHOG_HOST?: string;
	SENTRY_DSN_DESKTOP?: string;
	SUPERSET_PROFILE?: string;
	RELAY_URL?: string;
};

const deploymentProfileSchema = z
	.enum(["cloud", "local", "ci", "internal"])
	.optional();

function emptyStringAsUndefined(rawEnv: RendererEnvInput): RendererEnvInput {
	return Object.fromEntries(
		Object.entries(rawEnv).map(([key, value]) => [
			key,
			value === "" ? undefined : value,
		]),
	) as RendererEnvInput;
}

function createRendererEnvSchema(isLocalDevelopment: boolean) {
	return z.object({
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		// Local contributor builds default to localhost. Internal dev keeps the
		// existing hosted fallback unless the profile is explicitly local.
		NEXT_PUBLIC_API_URL: z
			.url()
			.default(
				isLocalDevelopment
					? "http://localhost:4641"
					: "https://api.superset.sh",
			),
		NEXT_PUBLIC_WEB_URL: z
			.url()
			.default(
				isLocalDevelopment
					? "http://localhost:4640"
					: "https://app.superset.sh",
			),
		NEXT_PUBLIC_MARKETING_URL: z.url().default("https://superset.sh"),
		NEXT_PUBLIC_ELECTRIC_URL: z
			.url()
			.default(
				isLocalDevelopment
					? "https://localhost:4650"
					: "https://electric-proxy.avi-6ac.workers.dev",
			),
		NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
		NEXT_PUBLIC_POSTHOG_HOST: z.string().default("https://us.i.posthog.com"),
		SENTRY_DSN_DESKTOP: z.string().optional(),
		SUPERSET_PROFILE: deploymentProfileSchema,
		RELAY_URL: z
			.url()
			.default(
				isLocalDevelopment
					? "http://localhost:4653"
					: "https://relay.superset.sh",
			),
	});
}

export function parseRendererEnv(rawEnv: RendererEnvInput) {
	const normalizedEnv = emptyStringAsUndefined(rawEnv);
	if (
		normalizedEnv.NODE_ENV === "production" &&
		normalizedEnv.SUPERSET_PROFILE === "local"
	) {
		normalizedEnv.SUPERSET_PROFILE = undefined;
	}
	const isLocalDevelopment =
		normalizedEnv.NODE_ENV === "development" &&
		normalizedEnv.SUPERSET_PROFILE === "local";

	return createRendererEnvSchema(isLocalDevelopment).parse(normalizedEnv);
}

export type RendererEnv = ReturnType<typeof parseRendererEnv>;
