import type { ChatRuntime, WsSinkSocket } from "@superset/chat-runtime";
import { createWsSink } from "@superset/chat-runtime";
import type { StreamSocket } from "../../client";
import type { Cursor } from "../../protocol/cursor";
import { parseCursor } from "../../protocol/cursor";
import type { DeltaChannel } from "../../protocol/envelope";
import { deltaChannelSchema } from "../../protocol/envelope";

type MemorySocket = {
	onopen: (() => void) | null;
	onmessage: ((event: { data: string }) => void) | null;
	onclose: (() => void) | null;
	onerror: (() => void) | null;
	close(): void;
};

export type MemoryConnection = {
	url: string;
	isOpen(): boolean;
	drop(): void;
};

export type MemoryStreamServer = {
	createSocket(url: string): StreamSocket;
	connections: MemoryConnection[];
	openConnections(): MemoryConnection[];
};

function parseSince(value: string | null): Cursor | undefined {
	if (!value) return undefined;
	return parseCursor(value);
}

function parseDeltas(value: string | null): DeltaChannel[] {
	return (value ?? "")
		.split(",")
		.filter(Boolean)
		.map((channel) => deltaChannelSchema.parse(channel));
}

export function createMemoryStreamServer(
	runtime: ChatRuntime,
): MemoryStreamServer {
	const connections: MemoryConnection[] = [];

	const createSocket = (url: string): StreamSocket => {
		const parsed = new URL(url);
		const match = /\/sessions\/([^/]+)\/stream$/.exec(parsed.pathname);
		const sessionId = decodeURIComponent(match?.[1] ?? "");
		const since = parseSince(parsed.searchParams.get("since"));
		const deltas = parseDeltas(parsed.searchParams.get("deltas"));

		let closed = false;
		let subscription: { unsubscribe(): void } | null = null;

		const socket: MemorySocket = {
			onopen: null,
			onmessage: null,
			onclose: null,
			onerror: null,
			close() {
				teardown();
			},
		};

		const teardown = () => {
			if (closed) return;
			closed = true;
			subscription?.unsubscribe();
			subscription = null;
			socket.onclose?.();
		};

		const serverSocket: WsSinkSocket = {
			send: (data) => {
				if (!closed) socket.onmessage?.({ data });
			},
			close: () => teardown(),
			onclose: null,
		};

		connections.push({
			url,
			isOpen: () => !closed,
			drop: () => teardown(),
		});

		queueMicrotask(() => {
			if (closed) return;
			socket.onopen?.();
			subscription = runtime.subscribe(
				sessionId,
				{ since, deltas },
				createWsSink(serverSocket),
			);
		});

		return socket;
	};

	return {
		createSocket,
		connections,
		openConnections: () =>
			connections.filter((connection) => connection.isOpen()),
	};
}
