import { PostHog } from "posthog-node";
import { env } from "@/env";

let client: PostHog | null = null;

// Disabled stub — accepts any args, returns the right shape for each method.
const disabled = {
	capture: (..._args: unknown[]) => {},
	identify: (..._args: unknown[]) => {},
	alias: (..._args: unknown[]) => {},
	groupIdentify: (..._args: unknown[]) => {},
	shutdown: (..._args: unknown[]) => Promise.resolve(),
	flush: (..._args: unknown[]) => Promise.resolve(),
	getFeatureFlag: (..._args: unknown[]) => Promise.resolve(undefined),
	getFeatureFlagPayload: (..._args: unknown[]) => Promise.resolve(undefined),
	isFeatureEnabled: (..._args: unknown[]) => Promise.resolve(undefined),
} as unknown as PostHog;

// Lazy-init: if NEXT_PUBLIC_POSTHOG_KEY is missing, return a no-op surface
// so analytics calls don't crash the API at module load.
export const posthog = new Proxy({} as PostHog, {
	get(_target, prop) {
		if (!env.NEXT_PUBLIC_POSTHOG_KEY) return Reflect.get(disabled, prop);
		if (!client) {
			client = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
				host: env.NEXT_PUBLIC_POSTHOG_HOST,
				flushAt: 1,
				flushInterval: 0,
			});
		}
		const value = Reflect.get(client, prop);
		return typeof value === "function" ? value.bind(client) : value;
	},
});
