import { PostHog } from "posthog-node";
import { env } from "../env";

// Singleton — all server-side product event captures go through this client.
// flushAt: 1, flushInterval: 0 mirrors apps/api/src/lib/analytics.ts so we
// don't lose events on short-lived processes (Vercel functions, edge handlers).
export const posthog = new PostHog(env.NEXT_PUBLIC_POSTHOG_KEY, {
	host: env.NEXT_PUBLIC_POSTHOG_HOST,
	flushAt: 1,
	flushInterval: 0,
});

export interface ProductEventParams {
	userId: string;
	source: string;
	event: string;
	activeOrganizationId?: string | null;
	plan?: string | null;
	properties?: Record<string, unknown>;
}

export function captureProductEvent(params: ProductEventParams): void {
	posthog.capture({
		distinctId: params.userId,
		event: params.event,
		properties: {
			...(params.properties ?? {}),
			source: params.source,
			plan: params.plan ?? null,
			active_organization_id: params.activeOrganizationId ?? null,
		},
		groups: params.activeOrganizationId
			? { organization: params.activeOrganizationId }
			: undefined,
	});
}
