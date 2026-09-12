import type { OrgHub } from "./org-hub";

export interface RealtimeEnv {
	NEXT_PUBLIC_API_URL: string;
	/** Shared with the API, which presents it on every emit. */
	NUDGE_SECRET: string;
	/** Optional; Sentry capture is a no-op until the secret is set. */
	SENTRY_DSN?: string;
	OrgHub: DurableObjectNamespace<OrgHub>;
}
