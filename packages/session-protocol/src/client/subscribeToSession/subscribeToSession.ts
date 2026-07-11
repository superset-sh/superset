import {
	type SessionEventEnvelope,
	sessionEventEnvelopeSchema,
} from "../../events";

/** Browser, React Native, Bun, and test fakes all satisfy this small surface. */
export interface WebSocketLike {
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose: ((event: { code?: number; reason?: string }) => void) | null;
	onerror: ((event: unknown) => void) | null;
	close(code?: number, reason?: string): void;
}

export type StreamStatus = "connecting" | "open" | "reconnecting" | "stopped";

type StreamUrlFactory = () => string | Promise<string>;

export interface SubscribeToSessionOptions {
	/**
	 * A fixed endpoint or a factory invoked for every connection attempt. Use a
	 * factory when the URL contains a short-lived auth token.
	 */
	streamUrl: string | StreamUrlFactory;
	/** Replay journal frames with seq > since. Omit for live-from-now. */
	since?: number;
	/** Reject a valid envelope accidentally routed from another session. */
	sessionId?: string;
	onEnvelope: (envelope: SessionEventEnvelope) => void;
	/** Reset is terminal; caller resyncs state/history and starts a new stream. */
	onReset?: (reason: string, latestSeq?: number) => void;
	onStatus?: (status: StreamStatus) => void;
	onGap?: (info: { expected: number; received: number }) => void;
	onInvalidEnvelope?: (reason: string) => void;
	createWebSocket?: (url: string) => WebSocketLike;
	reconnectDelayMs?: number;
}

export interface SessionSubscription {
	close(): void;
	readonly lastSeq: number;
}

const MAX_RECONNECT_DELAY_MS = 10_000;

export function subscribeToSession(
	options: SubscribeToSessionOptions,
): SessionSubscription {
	if (
		options.since !== undefined &&
		(!Number.isSafeInteger(options.since) || options.since < 0)
	) {
		throw new Error(`invalid stream cursor: ${options.since}`);
	}

	const {
		onEnvelope,
		onReset,
		onStatus,
		onGap,
		onInvalidEnvelope,
		reconnectDelayMs = 250,
	} = options;
	const createWebSocket =
		options.createWebSocket ??
		((url: string) => new WebSocket(url) as unknown as WebSocketLike);

	let lastSeq = options.since ?? 0;
	let hasCursor = options.since !== undefined;
	let stopped = false;
	let attempts = 0;
	let socket: WebSocketLike | null = null;
	let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	let connectionGeneration = 0;
	let receivedOnConnection = false;

	function stop(): void {
		if (stopped) return;
		stopped = true;
		connectionGeneration += 1;
		if (reconnectTimer !== null) clearTimeout(reconnectTimer);
		reconnectTimer = null;
		closeCurrentSocket();
		onStatus?.("stopped");
	}

	function closeCurrentSocket(): void {
		const current = socket;
		socket = null;
		if (!current) return;
		current.onclose = null;
		current.onmessage = null;
		current.onerror = null;
		current.onopen = null;
		current.close();
	}

	function scheduleReconnect(): void {
		if (stopped || reconnectTimer !== null) return;
		onStatus?.("reconnecting");
		const delay = Math.min(
			reconnectDelayMs * 2 ** attempts,
			MAX_RECONNECT_DELAY_MS,
		);
		attempts += 1;
		reconnectTimer = setTimeout(connect, delay);
	}

	function reconnectCurrentSocket(reason?: string): void {
		if (reason) onInvalidEnvelope?.(reason);
		closeCurrentSocket();
		scheduleReconnect();
	}

	function handleEnvelope(envelope: SessionEventEnvelope): void {
		if (options.sessionId && envelope.sessionId !== options.sessionId) {
			reconnectCurrentSocket(
				`expected session ${options.sessionId}, received ${envelope.sessionId}`,
			);
			return;
		}

		// Reset is deliberately handled before seq checks: terminal reset frames
		// may use nominal seq 0 even when the client's cursor is far in the future.
		if (envelope.frame.kind === "reset") {
			const { reason, latestSeq } = envelope.frame;
			stop();
			onReset?.(reason, latestSeq);
			return;
		}

		if (hasCursor) {
			if (envelope.seq < lastSeq && !receivedOnConnection) {
				// Under `(since, latest]` replay semantics the first frame can never
				// precede the requested cursor. Treat it like the host's cursor-ahead
				// reset instead of silently wedging forever.
				stop();
				onReset?.("cursor_ahead", envelope.seq);
				return;
			}
			if (envelope.seq <= lastSeq) {
				receivedOnConnection = true;
				return;
			}
			if (envelope.seq > lastSeq + 1) {
				onGap?.({ expected: lastSeq + 1, received: envelope.seq });
				reconnectCurrentSocket();
				return;
			}
		}

		receivedOnConnection = true;
		lastSeq = envelope.seq;
		hasCursor = true;
		onEnvelope(envelope);
	}

	function attachSocket(url: string, generation: number): void {
		if (stopped || generation !== connectionGeneration) return;
		const ws = createWebSocket(withSince(url, hasCursor ? lastSeq : undefined));
		socket = ws;
		receivedOnConnection = false;

		ws.onopen = () => {
			if (socket !== ws) return;
			attempts = 0;
			onStatus?.("open");
		};
		ws.onmessage = (event) => {
			let decoded: unknown;
			try {
				decoded = JSON.parse(String(event.data));
			} catch {
				reconnectCurrentSocket("session stream frame was not valid JSON");
				return;
			}
			const parsed = sessionEventEnvelopeSchema.safeParse(decoded);
			if (!parsed.success) {
				reconnectCurrentSocket(
					`session stream frame failed validation: ${parsed.error.issues[0]?.message ?? "unknown error"}`,
				);
				return;
			}
			handleEnvelope(parsed.data);
		};
		ws.onerror = () => {
			// Browser/RN WebSockets follow with close; reconnect there once.
		};
		ws.onclose = () => {
			if (socket !== ws) return;
			socket = null;
			scheduleReconnect();
		};
	}

	function connect(): void {
		if (stopped) return;
		reconnectTimer = null;
		onStatus?.(attempts === 0 ? "connecting" : "reconnecting");
		const generation = ++connectionGeneration;
		let resolved: string | Promise<string>;
		try {
			resolved =
				typeof options.streamUrl === "function"
					? options.streamUrl()
					: options.streamUrl;
		} catch (error) {
			onInvalidEnvelope?.(
				`failed to resolve session stream URL: ${error instanceof Error ? error.message : String(error)}`,
			);
			scheduleReconnect();
			return;
		}
		if (typeof resolved === "string") {
			attachSocket(resolved, generation);
			return;
		}
		void resolved.then(
			(url) => attachSocket(url, generation),
			(error: unknown) => {
				if (stopped || generation !== connectionGeneration) return;
				onInvalidEnvelope?.(
					`failed to resolve session stream URL: ${error instanceof Error ? error.message : String(error)}`,
				);
				scheduleReconnect();
			},
		);
	}

	connect();

	return {
		close: stop,
		get lastSeq() {
			return lastSeq;
		},
	};
}

function withSince(streamUrl: string, since: number | undefined): string {
	if (since === undefined) return streamUrl;
	const hashIndex = streamUrl.indexOf("#");
	const beforeHash =
		hashIndex === -1 ? streamUrl : streamUrl.slice(0, hashIndex);
	const hash = hashIndex === -1 ? "" : streamUrl.slice(hashIndex);
	if (/(?:\?|&)since=/.test(beforeHash)) {
		return `${beforeHash.replace(/([?&])since=[^&]*/, `$1since=${since}`)}${hash}`;
	}
	const separator = beforeHash.includes("?") ? "&" : "?";
	return `${beforeHash}${separator}since=${since}${hash}`;
}
