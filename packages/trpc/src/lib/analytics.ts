import type { EventMessage } from "posthog-node";
import { PostHog } from "posthog-node";
import { env } from "../env";

type FeatureFlagValue = Parameters<PostHog["getFeatureFlagPayload"]>[2];
type FeatureFlagOptions = Parameters<PostHog["getFeatureFlag"]>[2];
type FeatureFlagPayloadOptions = Parameters<
	PostHog["getFeatureFlagPayload"]
>[3];
type FeatureFlagResult = Awaited<ReturnType<PostHog["getFeatureFlag"]>>;
type FeatureFlagPayload = Awaited<ReturnType<PostHog["getFeatureFlagPayload"]>>;

interface AnalyticsClient {
	capture: (props: EventMessage) => void;
	getFeatureFlag: (
		key: string,
		distinctId: string,
		options?: FeatureFlagOptions,
	) => Promise<FeatureFlagResult>;
	getFeatureFlagPayload: (
		key: string,
		distinctId: string,
		matchValue?: FeatureFlagValue,
		options?: FeatureFlagPayloadOptions,
	) => Promise<FeatureFlagPayload>;
}

const disabled: AnalyticsClient = {
	capture: () => {},
	getFeatureFlag: async () => undefined,
	getFeatureFlagPayload: async () => undefined,
};

function createAnalyticsClient(): AnalyticsClient {
	if (!env.NEXT_PUBLIC_POSTHOG_KEY) return disabled;
	return new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
		host: env.NEXT_PUBLIC_POSTHOG_HOST,
		flushAt: 1,
		flushInterval: 0,
	});
}

// Singleton — all server-side product event captures go through this client.
// flushAt: 1, flushInterval: 0 mirrors apps/api/src/lib/analytics.ts so we
// don't lose events on short-lived processes (Vercel functions, edge handlers).
export const posthog = createAnalyticsClient();
