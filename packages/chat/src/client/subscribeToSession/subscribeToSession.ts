import type { Cursor } from "../../protocol/cursor";
import { serializeCursor } from "../../protocol/cursor";
import type { DeltaChannel, Envelope } from "../../protocol/envelope";
import {
	envelopeSchema,
	isDurableEnvelope,
	isResetEnvelope,
} from "../../protocol/envelope";

export type StreamSocket = {
	onopen: ((...args: never[]) => unknown) | null;
	onmessage: ((...args: never[]) => unknown) | null;
	onclose: ((...args: never[]) => unknown) | null;
	onerror: ((...args: never[]) => unknown) | null;
	close(): void;
};

export type StreamSocketFactory = (url: string) => StreamSocket;

export type Wait = (callback: () => void, delayMs: number) => () => void;

export type StreamStatus = "connecting" | "open" | "closed";

export type SubscribeToSessionOptions = {
	createSocket: StreamSocketFactory;
	url(since: Cursor | null): string;
	since?: Cursor | null;
	onEnvelope(envelope: Envelope): void;
	onReset?(reason: string): void;
	onStatusChange?(status: StreamStatus): void;
	backoffInitialMs?: number;
	backoffMaxMs?: number;
	wait?: Wait;
};

export type SessionStream = {
	close(): void;
	cursor(): Cursor | null;
};

export const DEFAULT_BACKOFF_INITIAL_MS = 250;
export const DEFAULT_BACKOFF_MAX_MS = 10_000;

const defaultWait: Wait = (callback, delayMs) => {
	const timer = setTimeout(callback, delayMs);
	return () => clearTimeout(timer);
};

export type StreamUrlParams = {
	baseUrl: string;
	sessionId: string;
	deltas: readonly DeltaChannel[];
	since: Cursor | null;
};

export function buildStreamUrl(params: StreamUrlParams): string {
	const base = params.baseUrl.endsWith("/")
		? params.baseUrl.slice(0, -1)
		: params.baseUrl;
	const query: string[] = [];
	if (params.since) {
		query.push(`since=${encodeURIComponent(serializeCursor(params.since))}`);
	}
	if (params.deltas.length > 0) {
		query.push(`deltas=${params.deltas.join(",")}`);
	}
	const suffix = query.length > 0 ? `?${query.join("&")}` : "";
	return `${base}/sessions/${encodeURIComponent(params.sessionId)}/stream${suffix}`;
}

export function subscribeToSession(
	options: SubscribeToSessionOptions,
): SessionStream {
	const wait = options.wait ?? defaultWait;
	const initialMs = options.backoffInitialMs ?? DEFAULT_BACKOFF_INITIAL_MS;
	const maxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;

	let since: Cursor | null = options.since ?? null;
	let attempts = 0;
	let closed = false;
	let socket: StreamSocket | null = null;
	let cancelReconnect: (() => void) | null = null;

	const setStatus = (status: StreamStatus) => {
		options.onStatusChange?.(status);
	};

	const handleFrame = (data: unknown) => {
		if (typeof data !== "string") return;
		let raw: unknown;
		try {
			raw = JSON.parse(data);
		} catch {
			return;
		}
		const parsed = envelopeSchema.safeParse(raw);
		if (!parsed.success) return;
		const envelope = parsed.data;
		if (isDurableEnvelope(envelope)) since = envelope.cursor;
		if (isResetEnvelope(envelope)) {
			since = null;
			options.onReset?.(envelope.reset.reason);
		}
		options.onEnvelope(envelope);
	};

	const scheduleReconnect = () => {
		if (closed) return;
		attempts += 1;
		const delayMs = Math.min(initialMs * 2 ** (attempts - 1), maxMs);
		cancelReconnect = wait(() => {
			cancelReconnect = null;
			connect();
		}, delayMs);
	};

	function connect(): void {
		if (closed) return;
		setStatus("connecting");
		let next: StreamSocket;
		try {
			next = options.createSocket(options.url(since));
		} catch {
			scheduleReconnect();
			return;
		}
		socket = next;
		next.onopen = () => {
			if (socket !== next) return;
			attempts = 0;
			setStatus("open");
		};
		next.onmessage = (event: { data: unknown }) => {
			if (socket !== next) return;
			handleFrame(event.data);
		};
		next.onclose = () => {
			if (socket !== next) return;
			socket = null;
			setStatus("closed");
			scheduleReconnect();
		};
		next.onerror = () => {};
	}

	connect();

	return {
		close() {
			if (closed) return;
			closed = true;
			cancelReconnect?.();
			cancelReconnect = null;
			const current = socket;
			socket = null;
			current?.close();
			setStatus("closed");
		},
		cursor: () => since,
	};
}
