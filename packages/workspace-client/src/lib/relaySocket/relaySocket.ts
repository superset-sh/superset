import { WebSocket as ReconnectingWebSocket } from "partysocket";
import {
	primeRelayAffinity,
	type RelayAffinityProbe,
} from "../primeRelayAffinity";
import { createOutageReporter } from "./outageReporter";

export interface RelaySocketOptions {
	/** Label attached to telemetry events so consumers are distinguishable. */
	name?: string;
	/** URL for this attempt, WITHOUT the auth token — the wrapper signs it. */
	buildUrl: () => string | Promise<string>;
	/** Fresh token per attempt (user JWT for relay hosts, PSK for local). */
	getToken: () => string | null | Promise<string | null>;
	/**
	 * Definitive access denial: the `_whoowns` preflight returned 403 (the
	 * relay only 403s a verified-valid token, so retrying with a fresher one
	 * can't change the answer; expired tokens surface as 401 and self-heal via
	 * `getToken`). Without `accessDeniedRetryMs` the socket closes permanently
	 * — call `reconnect()` to try again after access changes.
	 */
	onAccessDenied?: () => void;
	/** Keep re-probing at this cadence after a 403 instead of closing. */
	accessDeniedRetryMs?: number;
	/**
	 * Called with the `_whoowns` preflight result before every WS attempt (null
	 * when the URL isn't relay-routed or the relay is unreachable). Lets callers
	 * surface *why* a stream is down — host offline (503), unauthorized (401),
	 * relay routing (502/200) — which the WS upgrade status otherwise hides.
	 */
	onProbe?: (probe: RelayAffinityProbe | null) => void;
	minReconnectionDelay?: number;
	maxReconnectionDelay?: number;
	maxRetries?: number;
	connectionTimeout?: number;
	/** Defaults to 0: send() is a no-op unless the socket is open. Opt into
	 * partysocket's buffer-and-replay only when stale sends are safe. */
	maxEnqueuedMessages?: number;
}

export type RelaySocket = ReconnectingWebSocket;

// Accepts http(s) host URLs and converts to ws(s), so consumers can pass
// their host URL straight through without scheme juggling.
function signUrl(url: string, token: string | null): string {
	const u = new URL(url);
	if (u.protocol === "http:") u.protocol = "ws:";
	if (u.protocol === "https:") u.protocol = "wss:";
	if (token) u.searchParams.set("token", token);
	return u.toString();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Reconnecting WebSocket for host-service endpoints (direct or relay-fronted).
 * partysocket evaluates the async URL provider before EVERY attempt, so each
 * dial carries a fresh token — the class of bug where a reconnect loop reuses
 * a URL signed with an hourly-rotated JWT (PR #5628) can't recur here. The
 * provider also runs the `_whoowns` preflight (fly edge affinity + the only
 * place a browser client can observe the upgrade's real HTTP status).
 */
export function createRelaySocket(opts: RelaySocketOptions): RelaySocket {
	let socket: ReconnectingWebSocket | null = null;
	const reporter = createOutageReporter(opts.name ?? "relay");
	// retryCount is the 0-based ordinal of the current dial and only resets
	// after minUptime of stable connection. When reporting a failure the dial
	// counts itself, hence +1; at open time it already equals the failures
	// that preceded the successful dial.
	const failuresSoFar = () => (socket?.retryCount ?? 0) + 1;

	// Per-dial epoch so a slow preflight from a superseded dial (URL swap,
	// reconnect) can't publish its probe after a newer dial has started —
	// otherwise a stale probe could make the diagnosis describe the prior endpoint.
	let probeEpoch = 0;

	const provider = async (): Promise<string> => {
		const epoch = ++probeEpoch;
		const url = signUrl(await opts.buildUrl(), await opts.getToken());
		const probe = await primeRelayAffinity(url);
		reporter.attempt(url, probe);
		if (epoch === probeEpoch) opts.onProbe?.(probe);
		if (probe?.status === 403) {
			reporter.accessDenied(failuresSoFar());
			opts.onAccessDenied?.();
			if (opts.accessDeniedRetryMs == null) {
				socket?.close(1000, "relay access denied");
			} else {
				await sleep(opts.accessDeniedRetryMs);
			}
			// Rejecting aborts this attempt; partysocket surfaces it as an error
			// event and re-enters its backoff loop (no-op once close() was called).
			throw new Error("relay access denied");
		}
		return url;
	};

	socket = new ReconnectingWebSocket(provider, [], {
		minReconnectionDelay: opts.minReconnectionDelay,
		maxReconnectionDelay: opts.maxReconnectionDelay,
		maxRetries: opts.maxRetries,
		connectionTimeout: opts.connectionTimeout,
		maxEnqueuedMessages: opts.maxEnqueuedMessages ?? 0,
	});

	socket.addEventListener("close", (event) => {
		// Only count real server closes. partysocket also dispatches synthetic
		// close events (deliberate close(), and echoes of dial errors that the
		// error listener already counts); its browser cloneEvent mangles those —
		// code becomes the string "close" — which is how we can tell them apart.
		if (typeof event.code !== "number") return;
		// 1000 = deliberate close (cleanup, access-denied shutdown), not a failure.
		if (event.code === 1000) return;
		reporter.failed(failuresSoFar(), {
			code: event.code,
			reason: typeof event.reason === "string" ? event.reason : "",
		});
	});
	socket.addEventListener("error", () => reporter.failed(failuresSoFar()));
	socket.addEventListener("open", () =>
		reporter.opened(socket?.retryCount ?? 0),
	);

	return socket;
}
