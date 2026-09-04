import {
	describeRelayClose,
	type HttpDialFrame,
	type StreamDial,
	type StreamDialFailed,
} from "@superset/shared/tunnel-protocol";
import ReconnectingWebSocket from "partysocket/ws";

import { reportTunnelRescue } from "../sentry";

const PING_INTERVAL_MS = 30_000;
const INBOUND_SILENCE_TIMEOUT_MS = 75_000;
const WATCHDOG_INTERVAL_MS = 10_000;
// How long the control socket may sit outside OPEN before the watchdog kicks
// partysocket. Generous: covers its 5s max backoff plus 20s connect timeout.
// Partysocket owns retries, but a rejected url provider or a close handshake
// that never lands can kill its cycle with nothing left to revive it.
const STUCK_CONTROL_GRACE_MS = 60_000;
// Bound on the url provider's async work. Partysocket awaits the provider
// before it creates a socket, so its connectionTimeout cannot cover a hang
// here — an auth or resolve call that never settles stalls the reconnect
// cycle forever with no timer left running.
const URL_PROVIDER_STEP_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((resolve) => {
			setTimeout(
				() => resolve(fallback),
				URL_PROVIDER_STEP_TIMEOUT_MS,
			).unref?.();
		}),
	]);
}
// Each dial-back gets its own connect budget, kept inside the relay's
// DIAL_TIMEOUT_MS: two 3s attempts leave the relay time to hear the failure
// report and answer the client at once instead of after the 10s stream or 30s
// exchange window. A lost SYN or a slow resolver used to cost the whole window.
const DIAL_CONNECT_TIMEOUT_MS = 3_000;
const DIAL_ATTEMPTS = 2;
const MAX_BUFFERED_FRAMES = 256;
// Bodies are chunked below the Durable Object's per-message ceiling; large
// tRPC payloads (file contents, diffs) would otherwise fail outright.
const BODY_CHUNK_BYTES = 256 * 1024;
// fetch() transparently decompresses, so the upstream encoding/length headers
// no longer describe the bytes being forwarded.
const STRIPPED_RESPONSE_HEADERS = new Set([
	"content-encoding",
	"content-length",
	"transfer-encoding",
]);

export interface TunnelClientOptions {
	relayUrl: string;
	hostId: string;
	getAuthToken: () => Promise<string | null>;
	localPort: number;
	hostServiceSecret: string;
	/** Re-asked on every reconnect attempt so a server-side relay move is
	 * picked up without a process restart. On failure the last known URL is
	 * reused. */
	resolveRelayUrl?: () => Promise<string>;
}

function toWs(url: string): string {
	return url.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
}

// Tunnel host client. One reconnecting control WebSocket (partysocket owns
// backoff/jitter/retry); each proxied stream is a fresh dial-back socket piped
// byte-for-byte to the local host-service — no multiplexing, no envelopes.
export class TunnelClient {
	private readonly options: TunnelClientOptions;
	private control: ReconnectingWebSocket | null = null;
	private pingTimer: ReturnType<typeof setInterval> | null = null;
	private watchdogTimer: ReturnType<typeof setInterval> | null = null;
	private lastInboundAt = 0;
	private notOpenSince: number | null = null;
	private relayUrl: string;
	private closed = false;

	constructor(options: TunnelClientOptions) {
		this.options = options;
		this.relayUrl = options.relayUrl;
	}

	async connect(): Promise<void> {
		if (this.closed || this.control) return;

		// Re-invoked on every reconnect, picking up rotated tokens and relay
		// moves. It must never reject: a rejection kills partysocket's retry
		// cycle permanently, wedging the host until a process restart.
		const urlProvider = async (): Promise<string> => {
			if (this.options.resolveRelayUrl) {
				try {
					this.relayUrl = await withTimeout(
						this.options.resolveRelayUrl(),
						this.relayUrl,
					);
				} catch {
					// keep the last known URL
				}
			}
			let token: string | null = null;
			try {
				token = await withTimeout(this.options.getAuthToken(), null);
			} catch (error) {
				console.warn(
					"[host-service:tunnel] token fetch failed; connecting unauthenticated so the retry cycle survives:",
					error instanceof Error ? error.message : error,
				);
				reportTunnelRescue("token_fetch_failed", {
					message: error instanceof Error ? error.message.slice(0, 200) : "",
				});
			}
			const url = new URL("/v2/control", toWs(this.relayUrl));
			url.searchParams.set("hostId", this.options.hostId);
			url.searchParams.set("token", token ?? "");
			return url.toString();
		};

		const control = new ReconnectingWebSocket(urlProvider, [], {
			WebSocket: globalThis.WebSocket,
			maxReconnectionDelay: 5_000,
			minReconnectionDelay: 1_000,
			connectionTimeout: 20_000,
		});
		this.control = control;

		control.addEventListener("open", () => {
			this.lastInboundAt = Date.now();
			console.log(
				`[host-service:tunnel] control connected for ${this.options.hostId}`,
			);
		});

		control.addEventListener("message", (event) => {
			this.lastInboundAt = Date.now();
			let message: StreamDial | { type: "pong" };
			try {
				message = JSON.parse(String(event.data));
			} catch {
				return;
			}
			if (message.type === "stream:dial") {
				this.handleDial(message);
			}
		});

		control.addEventListener("close", (event) => {
			const described = describeRelayClose(event.code) ?? "";
			if (event.code === 1008 || described) {
				console.warn(
					`[host-service:tunnel] relay closed control (${event.code} ${described}): ${event.reason ?? ""}; partysocket will retry`,
				);
			}
		});

		this.pingTimer = setInterval(() => {
			if (control.readyState !== WebSocket.OPEN) return;
			control.send('{"type":"ping"}');
		}, PING_INTERVAL_MS);

		this.watchdogTimer = setInterval(() => {
			if (control.readyState === WebSocket.OPEN) {
				this.notOpenSince = null;
				const silentFor = Date.now() - this.lastInboundAt;
				if (silentFor > INBOUND_SILENCE_TIMEOUT_MS) {
					console.warn(
						`[host-service:tunnel] no inbound traffic for ${silentFor}ms, forcing reconnect`,
					);
					control.reconnect();
				}
				return;
			}
			this.notOpenSince ??= Date.now();
			const stuckFor = Date.now() - this.notOpenSince;
			if (stuckFor > STUCK_CONTROL_GRACE_MS) {
				// Reset the clock so a dead cycle gets kicked once per grace
				// window for as long as it stays down.
				this.notOpenSince = Date.now();
				console.warn(
					`[host-service:tunnel] control not open for ${stuckFor}ms, kicking reconnect`,
				);
				reportTunnelRescue("control_stuck", { stuckForMs: stuckFor });
				control.reconnect();
			}
		}, WATCHDOG_INTERVAL_MS);
	}

	close(): void {
		this.closed = true;
		if (this.pingTimer) clearInterval(this.pingTimer);
		if (this.watchdogTimer) clearInterval(this.watchdogTimer);
		this.pingTimer = null;
		this.watchdogTimer = null;
		this.control?.close(1000, "Shutting down");
		this.control = null;
	}

	private dialUrl(ticket: string): string {
		const url = new URL("/v2/dial", toWs(this.relayUrl));
		url.searchParams.set("hostId", this.options.hostId);
		url.searchParams.set("ticket", ticket);
		return url.toString();
	}

	private handleDial(dial: StreamDial): void {
		if (dial.kind === "http") {
			this.dialRelay(dial.ticket, (relayWs) => this.serveHttpDial(relayWs));
			return;
		}

		const localUrl = new URL(`ws://127.0.0.1:${this.options.localPort}`);
		localUrl.pathname = dial.path;
		localUrl.searchParams.set("token", this.options.hostServiceSecret);
		if (dial.query) {
			for (const [key, value] of new URLSearchParams(dial.query)) {
				if (key !== "token") localUrl.searchParams.set(key, value);
			}
		}
		this.dialRelay(dial.ticket, (relayWs) => {
			const localWs = new WebSocket(localUrl.toString());
			localWs.binaryType = "arraybuffer";
			pipe(relayWs, localWs);
			pipe(localWs, relayWs);
		});
	}

	// Opens the dial-back socket, retrying a connect that fails or stalls, and
	// hands the open socket over synchronously inside its open event so no
	// frame can land before the caller's handlers are attached. When every
	// attempt fails the relay is told, so the waiting client gets a fast 502
	// rather than the dial window.
	private dialRelay(
		ticket: string,
		attach: (relayWs: WebSocket) => void,
	): void {
		const attempt = (n: number) => {
			const ws = new WebSocket(this.dialUrl(ticket));
			ws.binaryType = "arraybuffer";
			const listeners = new AbortController();
			const retry = () => {
				if (n < DIAL_ATTEMPTS) attempt(n + 1);
				else this.reportDialFailed(ticket);
			};
			const timer = setTimeout(() => {
				listeners.abort();
				closeQuietly(ws, 1000, "Dial connect timed out");
				retry();
			}, DIAL_CONNECT_TIMEOUT_MS);
			ws.addEventListener(
				"open",
				() => {
					clearTimeout(timer);
					listeners.abort();
					attach(ws);
				},
				{ signal: listeners.signal },
			);
			// close always follows error
			ws.addEventListener(
				"close",
				() => {
					clearTimeout(timer);
					listeners.abort();
					retry();
				},
				{ signal: listeners.signal },
			);
		};
		attempt(1);
	}

	private reportDialFailed(ticket: string): void {
		console.warn(
			`[host-service:tunnel] dial-back failed after ${DIAL_ATTEMPTS} attempts; reporting to relay`,
		);
		if (this.control?.readyState !== WebSocket.OPEN) return;
		this.control.send(
			JSON.stringify({
				type: "stream:dial-failed",
				ticket,
			} satisfies StreamDialFailed),
		);
	}

	private serveHttpDial(relayWs: WebSocket): void {
		let header: {
			method: string;
			path: string;
			headers: Record<string, string>;
		} | null = null;
		const chunks: Uint8Array[] = [];

		relayWs.onmessage = (event) => {
			const data = event.data;
			if (typeof data === "string") {
				let frame: HttpDialFrame;
				try {
					frame = JSON.parse(data) as HttpDialFrame;
				} catch {
					return;
				}
				if (frame.type === "http:request") {
					header = frame;
				} else if (frame.type === "http:end") {
					void this.forwardHttp(relayWs, header, chunks);
				}
				return;
			}
			if (data instanceof ArrayBuffer) chunks.push(new Uint8Array(data));
		};
		relayWs.onerror = () => {
			try {
				relayWs.close();
			} catch {}
		};
	}

	private async forwardHttp(
		relayWs: WebSocket,
		header: {
			method: string;
			path: string;
			headers: Record<string, string>;
		} | null,
		chunks: Uint8Array[],
	): Promise<void> {
		if (!header) {
			relayWs.close(1011, "Missing request header");
			return;
		}
		try {
			const size = chunks.reduce((n, c) => n + c.byteLength, 0);
			const body = new Uint8Array(size);
			let offset = 0;
			for (const chunk of chunks) {
				body.set(chunk, offset);
				offset += chunk.byteLength;
			}
			const response = await fetch(
				`http://127.0.0.1:${this.options.localPort}${header.path}`,
				{
					method: header.method,
					headers: {
						...header.headers,
						Authorization: `Bearer ${this.options.hostServiceSecret}`,
					},
					body: size > 0 ? body : undefined,
				},
			);
			const responseHeaders: Record<string, string> = {};
			for (const [key, value] of response.headers.entries()) {
				if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
					responseHeaders[key] = value;
				}
			}
			relayWs.send(
				JSON.stringify({
					type: "http:response",
					status: response.status,
					headers: responseHeaders,
				}),
			);
			const responseBody = new Uint8Array(await response.arrayBuffer());
			for (
				let offset = 0;
				offset < responseBody.byteLength;
				offset += BODY_CHUNK_BYTES
			) {
				relayWs.send(
					responseBody.slice(offset, offset + BODY_CHUNK_BYTES).buffer,
				);
			}
			relayWs.send('{"type":"http:end"}');
		} catch (error) {
			console.error("[host-service:tunnel] HTTP proxy failed", error);
			relayWs.send(
				JSON.stringify({ type: "http:response", status: 502, headers: {} }),
			);
			relayWs.send('{"type":"http:end"}');
		}
	}
}

// One-directional splice with buffering until the destination opens. Close on
// either side tears down the other; error handlers defer to the close that
// always follows.
function pipe(from: WebSocket, to: WebSocket): void {
	const buffered: (string | ArrayBuffer)[] = [];

	from.addEventListener("message", (event) => {
		const data = event.data as string | ArrayBuffer;
		if (to.readyState === WebSocket.OPEN) {
			to.send(data);
			return;
		}
		if (to.readyState !== WebSocket.CONNECTING) return;
		// Overflow tears the stream down rather than silently dropping frames:
		// a terminal missing bytes is worse than one that reconnects.
		if (buffered.length >= MAX_BUFFERED_FRAMES) {
			buffered.length = 0;
			closeQuietly(from, 1011, "Peer too slow to connect");
			closeQuietly(to, 1011, "Peer too slow to connect");
			return;
		}
		buffered.push(data);
	});
	to.addEventListener("open", () => {
		for (const frame of buffered) to.send(frame);
		buffered.length = 0;
	});
	from.addEventListener("close", (event) => {
		// 1005/1006 are status codes the WebSocket API reports but forbids
		// sending; anything outside the sendable range becomes 1011.
		const code =
			event.code >= 3000 && event.code <= 4999
				? event.code
				: event.code === 1000
					? 1000
					: 1011;
		closeQuietly(to, code, "Peer closed");
	});
	from.addEventListener("error", () => {
		// close always follows error
	});
}

function closeQuietly(socket: WebSocket, code: number, reason: string): void {
	if (
		socket.readyState !== WebSocket.OPEN &&
		socket.readyState !== WebSocket.CONNECTING
	) {
		return;
	}
	try {
		socket.close(code, reason);
	} catch {
		try {
			socket.close();
		} catch {}
	}
}
