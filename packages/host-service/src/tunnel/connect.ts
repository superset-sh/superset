import { getHostId, getHostName } from "@superset/shared/host-info";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { JwtApiAuthProvider } from "../providers/auth/JwtAuthProvider/JwtAuthProvider";
import type { ApiClient } from "../types";
import { TunnelClient } from "./tunnel-client";

export interface ConnectRelayOptions {
	api: ApiClient;
	relayUrl: string;
	localPort: number;
	organizationId: string;
	authProvider: JwtApiAuthProvider;
	hostServiceSecret: string;
}

export async function connectRelay(
	options: ConnectRelayOptions,
): Promise<TunnelClient | null> {
	try {
		const host = await options.api.host.ensure.mutate({
			organizationId: options.organizationId,
			machineId: getHostId(),
			name: getHostName(),
		});
		console.log(`[host-service] registered as host ${host.machineId}`);

		const tunnel = new TunnelClient({
			relayUrl: options.relayUrl,
			hostId: buildHostRoutingKey(options.organizationId, host.machineId),
			getAuthToken: () => options.authProvider.getJwt(),
			localPort: options.localPort,
			hostServiceSecret: options.hostServiceSecret,
		});
		void tunnel.connect();
		return tunnel;
	} catch (error) {
		console.error("[host-service] failed to register/connect relay:", error);
		return null;
	}
}
