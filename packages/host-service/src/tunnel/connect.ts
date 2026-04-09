import { getDeviceName, getHashedDeviceId } from "@superset/shared/device-info";
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
		const host = await options.api.device.ensureV2Host.mutate({
			organizationId: options.organizationId,
			machineId: getHashedDeviceId(),
			name: getDeviceName(),
		});
		console.log(`[host-service] registered as host ${host.id}`);

		const tunnel = new TunnelClient({
			relayUrl: options.relayUrl,
			hostId: host.id,
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
