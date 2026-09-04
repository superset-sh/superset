import { getHostId, getHostName } from "@superset/shared/host-info";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import type { JwtApiAuthProvider } from "../providers/auth/JwtAuthProvider/JwtAuthProvider";
import type { ApiClient } from "../types";
import {
	recordRegistrationFailure,
	recordRegistrationSuccess,
} from "./registration-state";
import { TunnelClient } from "./tunnel-client";

export interface ConnectRelayOptions {
	api: ApiClient;
	/** Fallback when the API can't be reached; the API's answer wins. */
	relayUrl: string;
	localPort: number;
	organizationId: string;
	authProvider: JwtApiAuthProvider;
	hostServiceSecret: string;
}

// The API decides which relay this host belongs on, and it is asked here —
// with the host's own credentials, at connect time — rather than resolved by
// whatever spawned us. A spawner that resolves it first has to win a race
// against its own analytics identification, and when it loses it silently
// picks the default, stranding the host on a different relay than its
// clients with no way to tell from either side.
async function resolveRelayUrl(
	api: ApiClient,
	fallback: string,
): Promise<string> {
	try {
		const endpoint = await api.host.relayEndpoint.query();
		if (endpoint?.url) return endpoint.url;
	} catch (error) {
		console.warn(
			"[host-service] relay endpoint lookup failed, using fallback:",
			error instanceof Error ? error.message : error,
		);
	}
	return fallback;
}

const REGISTER_RETRY_BASE_MS = 30_000;
const REGISTER_RETRY_MAX_MS = 5 * 60_000;

export async function connectRelay(
	options: ConnectRelayOptions,
): Promise<TunnelClient | null> {
	// Registration is what makes this host exist server-side (hosts list,
	// automations, relay routing). A one-shot attempt left a transient API
	// failure at boot permanently stranding the host as locally-healthy but
	// cloud-invisible (issue #6415) — so retry with backoff until it lands,
	// and record the outcome where health.check can report it.
	for (let attempt = 0; ; attempt++) {
		try {
			const host = await options.api.host.ensure.mutate({
				organizationId: options.organizationId,
				machineId: getHostId(),
				name: getHostName(),
			});
			recordRegistrationSuccess();
			console.log(`[host-service] registered as host ${host.machineId}`);

			const relayUrl = await resolveRelayUrl(options.api, options.relayUrl);
			console.log(`[host-service] relay: ${relayUrl}`);

			const clientOptions = {
				relayUrl,
				hostId: buildHostRoutingKey(options.organizationId, host.machineId),
				getAuthToken: () => options.authProvider.getJwt(),
				localPort: options.localPort,
				hostServiceSecret: options.hostServiceSecret,
				resolveRelayUrl: () => resolveRelayUrl(options.api, options.relayUrl),
			};

			const tunnel = new TunnelClient(clientOptions);
			void tunnel.connect();
			return tunnel;
		} catch (error) {
			recordRegistrationFailure(error);
			const delay = Math.min(
				REGISTER_RETRY_BASE_MS * 2 ** attempt,
				REGISTER_RETRY_MAX_MS,
			);
			console.error(
				`[host-service] failed to register/connect relay (retrying in ${Math.round(delay / 1000)}s):`,
				error,
			);
			// unref: the HTTP server keeps the process alive between retries;
			// this timer must not stall shutdown once the server closes.
			await new Promise((resolve) => setTimeout(resolve, delay).unref());
		}
	}
}
