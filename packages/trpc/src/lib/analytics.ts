import { PostHog } from "posthog-node";
import { env } from "../env";

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

// Singleton — all server-side product event captures go through this client.
// Lazy-init so a missing NEXT_PUBLIC_POSTHOG_KEY doesn't crash module load.
// flushAt: 1, flushInterval: 0 mirrors apps/api/src/lib/analytics.ts so we
// don't lose events on short-lived processes (Vercel functions, edge handlers).
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
