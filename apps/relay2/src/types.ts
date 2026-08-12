import type { HostTunnel } from "./host-tunnel";

export interface RelayEnv {
	NEXT_PUBLIC_API_URL: string;
	HostTunnel: DurableObjectNamespace<HostTunnel>;
}
