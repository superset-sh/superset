import type { HostTunnel } from "./host-tunnel";

export interface RelayEnv {
	NEXT_PUBLIC_API_URL: string;
	/** Optional; Sentry capture is a no-op until the secret is set. */
	SENTRY_DSN?: string;
	/** Optional; overrides the default Sazabi DSN Sentry events are copied to. */
	SAZABI_SENTRY_DSN?: string;
	HostTunnel: DurableObjectNamespace<HostTunnel>;
	/** Host → tunnel object placement records; see placement.ts. */
	PLACEMENT: KVNamespace;
}
