import os from "node:os";
import { setTimeout as wait } from "node:timers/promises";
import { getHostId, getHostName } from "@superset/shared/host-info";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { getHostInstallSource, HOST_SERVICE_VERSION } from "../install-source";
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
	signal?: AbortSignal;
	requestTimeoutMs?: number;
	retryBaseDelayMs?: number;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function requestWithTimeout<T>(
	request: (signal: AbortSignal) => Promise<T>,
	operation: string,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<T> {
	const controller = new AbortController();
	const abort = () => controller.abort(signal?.reason);
	signal?.addEventListener("abort", abort, { once: true });
	if (signal?.aborted) abort();
	const timer = setTimeout(() => {
		controller.abort(new Error(`${operation} timed out after ${timeoutMs}ms`));
	}, timeoutMs);
	timer.unref();
	let rejectOnAbort: (() => void) | undefined;
	try {
		controller.signal.throwIfAborted();
		const aborted = new Promise<never>((_, reject) => {
			rejectOnAbort = () => reject(controller.signal.reason);
			controller.signal.addEventListener("abort", rejectOnAbort, {
				once: true,
			});
		});
		// tRPC cannot abort a request while its async auth headers are unresolved.
		return await Promise.race([aborted, request(controller.signal)]);
	} finally {
		clearTimeout(timer);
		signal?.removeEventListener("abort", abort);
		if (rejectOnAbort) {
			controller.signal.removeEventListener("abort", rejectOnAbort);
		}
	}
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
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<string> {
	try {
		const endpoint = await requestWithTimeout(
			(requestSignal) =>
				api.host.relayEndpoint.query(undefined, { signal: requestSignal }),
			"Relay endpoint lookup",
			timeoutMs,
			signal,
		);
		if (endpoint?.url) return endpoint.url;
	} catch (error) {
		if (signal?.aborted) throw error;
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
	const requestTimeoutMs = options.requestTimeoutMs ?? REQUEST_TIMEOUT_MS;
	const retryBaseDelayMs = options.retryBaseDelayMs ?? REGISTER_RETRY_BASE_MS;
	// Registration is what makes this host exist server-side (hosts list,
	// automations, relay routing). A one-shot attempt left a transient API
	// failure at boot permanently stranding the host as locally-healthy but
	// cloud-invisible (issue #6415) — so retry with backoff until it lands,
	// and record the outcome where health.check can report it.
	for (let attempt = 0; !options.signal?.aborted; attempt++) {
		try {
			const host = await requestWithTimeout(
				(signal) =>
					options.api.host.ensure.mutate(
						{
							organizationId: options.organizationId,
							machineId: getHostId(),
							name: getHostName(),
							// Registration runs once per process and a restart re-registers,
							// so the cloud remembers the last build that reported its version.
							version: HOST_SERVICE_VERSION,
							platform: `${os.platform()}-${os.arch()}`,
							installSource: getHostInstallSource(),
						},
						{ signal },
					),
				"Host registration",
				requestTimeoutMs,
				options.signal,
			);
			if (options.signal?.aborted) return null;
			recordRegistrationSuccess();
			console.log(`[host-service] registered as host ${host.machineId}`);

			const relayUrl = await resolveRelayUrl(
				options.api,
				options.relayUrl,
				requestTimeoutMs,
				options.signal,
			);
			if (options.signal?.aborted) return null;
			console.log(`[host-service] relay: ${relayUrl}`);

			const clientOptions = {
				relayUrl,
				hostId: buildHostRoutingKey(options.organizationId, host.machineId),
				getAuthToken: () => options.authProvider.getJwt(),
				localPort: options.localPort,
				hostServiceSecret: options.hostServiceSecret,
				resolveRelayUrl: () =>
					resolveRelayUrl(
						options.api,
						options.relayUrl,
						requestTimeoutMs,
						options.signal,
					),
			};

			const tunnel = new TunnelClient(clientOptions);
			void tunnel.connect();
			return tunnel;
		} catch (error) {
			if (options.signal?.aborted) return null;
			recordRegistrationFailure(error);
			const delay = Math.min(
				retryBaseDelayMs * 2 ** attempt,
				REGISTER_RETRY_MAX_MS,
			);
			console.error(
				`[host-service] failed to register/connect relay (retrying in ${Math.round(delay / 1000)}s):`,
				error,
			);
			// unref: the HTTP server keeps the process alive between retries;
			// this timer must not stall shutdown once the server closes.
			await wait(delay, undefined, {
				signal: options.signal,
				ref: false,
			}).catch(() => {});
		}
	}
	return null;
}
