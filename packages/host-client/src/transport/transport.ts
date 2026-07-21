import SuperJSON from "superjson";

/**
 * Framework-free client transport for talking to a host-service through the
 * relay (`/hosts/:routingKey/...`). The relay proxies tRPC as plain HTTP and
 * WebSockets as raw sockets, so this is fetch + SuperJSON, not a tRPC client:
 * consumers type the boundary via @superset/session-protocol (or
 * `import type { AppRouter } from "@superset/host-service/router"`) instead of
 * dragging host-only modules into their type-check.
 *
 * Environment and auth stay app-owned and are injected via HostClientConfig —
 * this package must work identically in React Native, web, and node.
 */
export interface HostClientConfig {
	/** Relay base URL without a trailing slash. Throw when unconfigured. */
	getRelayUrl(): string;
	/**
	 * Short-lived JWT for host access. The transport asks with `forceRefresh`
	 * exactly once after a 401, so app-side caches must honor it.
	 */
	getToken(options?: { forceRefresh?: boolean }): Promise<string>;
	/** Injectable for tests / non-global fetch environments. */
	fetch?: typeof fetch;
}

export interface HostCallOptions {
	routingKey: string;
	/** Dotted tRPC path, e.g. "acpSessions.list". */
	procedure: string;
	input?: unknown;
	method: "GET" | "POST";
}

export interface HostTransport {
	/** One tRPC procedure call over the relay's generic HTTP proxy. */
	call<TOutput>(options: HostCallOptions): Promise<TOutput>;
	/**
	 * WS URL factory for a host stream endpoint (`path` is relative to
	 * `/hosts/:routingKey/`). WebSocket clients cannot set an authorization
	 * header, so the JWT rides as a query param (the relay accepts either).
	 * Returns a factory rather than a string so every reconnect mints a fresh
	 * token instead of replaying an expired one forever.
	 */
	streamUrl(options: {
		routingKey: string;
		path: string;
	}): () => Promise<string>;
}

export function createHostTransport(config: HostClientConfig): HostTransport {
	const relayUrl = () => config.getRelayUrl().replace(/\/$/, "");
	const doFetch: typeof fetch = (...args) => (config.fetch ?? fetch)(...args);

	async function call<TOutput>(
		options: HostCallOptions,
		retryOnAuthFailure = true,
		tokenOverride?: string,
	): Promise<TOutput> {
		const { routingKey, procedure, input, method } = options;
		const token = tokenOverride ?? (await config.getToken());
		const base = `${relayUrl()}/hosts/${routingKey}/trpc/${procedure}`;
		const encoded =
			input === undefined ? undefined : SuperJSON.serialize(input);
		const url =
			method === "GET" && encoded !== undefined
				? `${base}?input=${encodeURIComponent(JSON.stringify(encoded))}`
				: base;

		const response = await doFetch(url, {
			method,
			headers: {
				authorization: `Bearer ${token}`,
				...(method === "POST" ? { "content-type": "application/json" } : {}),
			},
			body:
				method === "POST" && encoded !== undefined
					? JSON.stringify(encoded)
					: undefined,
		});
		if (response.status === 401 && retryOnAuthFailure) {
			// Use the refreshed token directly — a provider that doesn't mutate
			// its cache as a side effect would otherwise hand back the stale one.
			const fresh = await config.getToken({ forceRefresh: true });
			return call<TOutput>(options, false, fresh);
		}
		if (!response.ok) {
			// tRPC error bodies carry the real message (SuperJSON envelope):
			// { error: { json: { message, code, data } } }
			let message = `host ${procedure} failed (${response.status})`;
			try {
				const body = (await response.json()) as {
					error?: { json?: { message?: string } };
				};
				const detail = body.error?.json?.message;
				if (detail) message = detail;
			} catch {
				// Non-JSON body (relay/proxy error page) — keep the status message.
			}
			throw new Error(message);
		}

		const parsed = (await response.json()) as { result?: { data?: unknown } };
		if (!parsed.result) {
			throw new Error(`host ${procedure}: malformed relay response`);
		}
		if (parsed.result.data === undefined) {
			// Void procedures (cancel/setMode/...) have no payload to deserialize.
			return undefined as TOutput;
		}
		return SuperJSON.deserialize(parsed.result.data as never) as TOutput;
	}

	return {
		call: (options) => call(options),
		streamUrl({ routingKey, path }) {
			const wsBase = relayUrl().replace(/^http/, "ws");
			const base = `${wsBase}/hosts/${routingKey}/${path}`;
			return async () => {
				const token = encodeURIComponent(await config.getToken());
				return `${base}?token=${token}`;
			};
		},
	};
}
