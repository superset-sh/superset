import type { SessionUpdateEnvelope } from "../../envelope";

/**
 * The subset of the WebSocket API the stream client uses. Matches browser,
 * React Native, and bun WebSockets; tests inject a fake.
 */
export interface WebSocketLike {
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: { code?: number; reason?: string }) => void) | null;
	onerror: ((event: unknown) => void) | null;
	close(code?: number, reason?: string): void;
}

export type StreamStatus = "connecting" | "open" | "reconnecting" | "stopped";

export interface SubscribeToSessionOptions {
	/**
	 * WS endpoint, e.g. wss://host/acp-sessions/<id>/stream. Pass a function
	 * when the URL embeds short-lived credentials (a JWT query param): it is
	 * called before every connection attempt, so reconnects after token expiry
	 * mint a fresh URL instead of replaying a dead one forever.
	 */
	streamUrl: string | (() => string | Promise<string>);
	/**
	 * Replay from this seq (exclusive): server sends journaled envelopes with
	 * seq > since, then goes live. Omit to accept the live stream from wherever
	 * it currently is.
	 */
	since?: number;
	onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	/**
	 * A reset frame means the server cannot serve our cursor (journal evicted,
	 * session restarted). The subscription stops; the caller must resync
	 * (get + getMessages) and subscribe again.
	 */
	onReset?: (reason: string) => void;
	onStatus?: (status: StreamStatus) => void;
	/** Fired when a seq gap is detected, right before auto-reconnect. */
	onGap?: (info: { expected: number; received: number }) => void;
	/** Injectable for tests / non-global WebSocket environments. */
	createWebSocket?: (url: string) => WebSocketLike;
	/** Base reconnect delay; doubles per consecutive failure, capped at 10s. */
	reconnectDelayMs?: number;
}

export interface SessionSubscription {
	close(): void;
	/** Seq of the last envelope delivered to onEnvelope. */
	readonly lastSeq: number;
}

const MAX_RECONNECT_DELAY_MS = 10_000;

/**
 * Structural check on a parsed frame. JSON.parse only proves syntax; a
 * proxy/relay error payload is valid JSON but would crash the fold — treat it
 * like a corrupt frame (resync from cursor) instead.
 */
function isEnvelope(value: unknown): value is SessionUpdateEnvelope {
	if (typeof value !== "object" || value === null) return false;
	const candidate = value as { seq?: unknown; frame?: unknown };
	return (
		typeof candidate.seq === "number" &&
		typeof candidate.frame === "object" &&
		candidate.frame !== null &&
		typeof (candidate.frame as { kind?: unknown }).kind === "string"
	);
}

export function subscribeToSession(
	options: SubscribeToSessionOptions,
): SessionSubscription {
	const {
		streamUrl,
		onEnvelope,
		onReset,
		onStatus,
		onGap,
		reconnectDelayMs = 250,
	} = options;
	const createWebSocket =
		options.createWebSocket ??
		((url: string) => new WebSocket(url) as unknown as WebSocketLike);

	// lastSeq doubles as the dedup floor and the reconnect cursor. When the
	// caller gave no `since`, we accept the first live envelope at any seq.
	let lastSeq = options.since ?? 0;
	let hasCursor = options.since !== undefined;
	let stopped = false;
	let attempts = 0;
	let socket: WebSocketLike | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

	function withCursor(base: string): string {
		if (!hasCursor) return base;
		const separator = base.includes("?") ? "&" : "?";
		return `${base}${separator}since=${lastSeq}`;
	}

	function stop(status: StreamStatus = "stopped"): void {
		if (stopped) return;
		stopped = true;
		if (reconnectTimer !== null) clearTimeout(reconnectTimer);
		const current = socket;
		socket = null;
		if (current) {
			// Detach first so the close event can't schedule a reconnect.
			current.onclose = null;
			current.onmessage = null;
			current.onerror = null;
			current.onopen = null;
			current.close();
		}
		onStatus?.(status);
	}

	function scheduleReconnect(): void {
		if (stopped) return;
		onStatus?.("reconnecting");
		const delay = Math.min(
			reconnectDelayMs * 2 ** attempts,
			MAX_RECONNECT_DELAY_MS,
		);
		attempts += 1;
		reconnectTimer = setTimeout(connect, delay);
	}

	function handleEnvelope(envelope: SessionUpdateEnvelope): void {
		if (envelope.frame.kind === "reset") {
			const reason = envelope.frame.reason;
			stop();
			onReset?.(reason);
			return;
		}
		if (hasCursor) {
			if (envelope.seq <= lastSeq) return; // at-least-once dedup
			if (envelope.seq > lastSeq + 1) {
				onGap?.({ expected: lastSeq + 1, received: envelope.seq });
				reconnectCurrentSocket();
				return;
			}
		}
		lastSeq = envelope.seq;
		hasCursor = true;
		onEnvelope(envelope);
	}

	function reconnectCurrentSocket(): void {
		const current = socket;
		socket = null;
		if (current) {
			current.onclose = null;
			current.onmessage = null;
			current.onerror = null;
			current.onopen = null;
			current.close();
		}
		scheduleReconnect();
	}

	function connect(): void {
		if (stopped) return;
		reconnectTimer = null;
		onStatus?.(attempts === 0 ? "connecting" : "reconnecting");
		// Static URLs (and sync factories) connect synchronously — only a
		// promise-returning factory (token minting) defers the socket.
		let base: string | Promise<string>;
		try {
			base = typeof streamUrl === "function" ? streamUrl() : streamUrl;
		} catch {
			scheduleReconnect();
			return;
		}
		if (typeof base === "string") {
			openSocket(withCursor(base));
			return;
		}
		base.then(
			(url) => {
				if (stopped) return;
				openSocket(withCursor(url));
			},
			() => {
				// URL/token minting failed (offline, auth hiccup) — retry with the
				// same backoff as a dropped socket.
				scheduleReconnect();
			},
		);
	}

	function openSocket(url: string): void {
		if (stopped) return;
		let ws: WebSocketLike;
		try {
			ws = createWebSocket(url);
		} catch {
			// A throwing constructor (malformed URL, platform hiccup) inside the
			// reconnect timer must not kill the retry loop — same backoff as a
			// dropped socket.
			scheduleReconnect();
			return;
		}
		socket = ws;
		ws.onopen = () => {
			attempts = 0;
			onStatus?.("open");
		};
		ws.onmessage = (event) => {
			let parsed: unknown;
			try {
				parsed = JSON.parse(String(event.data));
			} catch {
				// Corrupt frame: resync from the last good cursor.
				reconnectCurrentSocket();
				return;
			}
			if (!isEnvelope(parsed)) {
				reconnectCurrentSocket();
				return;
			}
			handleEnvelope(parsed);
		};
		ws.onerror = () => {
			// The close event follows; reconnect is handled there.
		};
		ws.onclose = () => {
			if (socket !== ws) return;
			socket = null;
			scheduleReconnect();
		};
	}

	connect();

	return {
		close: () => stop(),
		get lastSeq() {
			return lastSeq;
		},
	};
}
