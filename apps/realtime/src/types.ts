import type { OrgHub } from "./org-hub";
import type { PageHub } from "./page-hub";

export interface RealtimeEnv {
	NEXT_PUBLIC_API_URL: string;
	NUDGE_SECRET: string;
	/** Optional; Sentry capture is a no-op until the secret is set. */
	SENTRY_DSN?: string;
	USERCONTENT_URL: string;
	OrgHub: DurableObjectNamespace<OrgHub>;
	PageHub: DurableObjectNamespace<PageHub>;
	PRIVATE: R2Bucket;
}
