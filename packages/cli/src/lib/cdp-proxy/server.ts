import { timingSafeEqual } from "node:crypto";
import type { ServerWebSocket } from "bun";

export const CDP_PROXY_IDLE_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_BYTES = 4 * 1024 * 1024;

interface Connection {
	upstream?: WebSocket;
	pending: Array<string | Buffer>;
	bytes: number;
	closed: boolean;
	timer?: ReturnType<typeof setTimeout>;
}

export function startCdpProxy(options: {
	id: string;
	token: string;
	stopToken: string;
	upstreamUrl: string;
	getToken: (signal: AbortSignal) => Promise<string>;
	idleTimeoutMs?: number;
	connectTimeoutMs?: number;
	maxPendingBytes?: number;
	maxBufferedBytes?: number;
}) {
	const connections = new Set<ServerWebSocket<Connection>>();
	const lifetime = new AbortController();
	const maxBytes = options.maxPendingBytes ?? MAX_PENDING_BYTES;
	const maxBufferedBytes = options.maxBufferedBytes ?? 64 * 1024 * 1024;
	let idleTimer: ReturnType<typeof setTimeout>;
	let stopped = false;
	let resolveClosed: () => void;
	const closed = new Promise<void>((resolve) => {
		resolveClosed = resolve;
	});

	function authenticated(actual: string | null, expected: string) {
		return (
			actual !== null &&
			Buffer.byteLength(actual) === Buffer.byteLength(expected) &&
			timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
		);
	}

	function close(ws: ServerWebSocket<Connection>, code = 1000, reason = "") {
		if (ws.data.closed) return;
		ws.data.closed = true;
		clearTimeout(ws.data.timer);
		ws.data.pending.length = 0;
		ws.data.upstream?.terminate();
		ws.close(code, reason);
		connections.delete(ws);
		if (!stopped && connections.size === 0) armIdle();
	}

	function armIdle() {
		clearTimeout(idleTimer);
		idleTimer = setTimeout(stop, options.idleTimeoutMs ?? CDP_PROXY_IDLE_MS);
	}

	function stop() {
		if (stopped) return;
		stopped = true;
		lifetime.abort();
		clearTimeout(idleTimer);
		for (const ws of connections) close(ws, 1001, "CDP proxy stopped");
		server.stop(true);
		resolveClosed();
	}

	const server = Bun.serve<Connection>({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request, server) {
			if (
				request.headers.get("origin") !== null ||
				request.headers.get("host") !== `127.0.0.1:${server.port}`
			)
				return new Response(null, { status: 403 });
			const url = new URL(request.url);
			if (url.pathname === "/health" || url.pathname === "/stop") {
				if (
					!authenticated(
						request.headers.get("authorization"),
						`Bearer ${options.stopToken}`,
					)
				)
					return new Response(null, { status: 401 });
				if (url.pathname === "/health" && request.method === "GET")
					return Response.json({ id: options.id, pid: process.pid });
				if (url.pathname === "/stop" && request.method === "POST") {
					setTimeout(stop, 0);
					return Response.json({ stopping: true });
				}
				return new Response(null, { status: 405 });
			}
			if (url.pathname !== "/cdp" || request.method !== "GET")
				return new Response(null, { status: 404 });
			if (!authenticated(url.searchParams.get("token"), options.token))
				return new Response(null, { status: 401 });
			if (connections.size >= 16) return new Response(null, { status: 503 });
			if (
				server.upgrade(request, {
					data: { pending: [], bytes: 0, closed: false },
				})
			)
				return;
			return new Response(null, { status: 426 });
		},
		websocket: {
			maxPayloadLength: maxBufferedBytes,
			backpressureLimit: maxBufferedBytes,
			closeOnBackpressureLimit: true,
			idleTimeout: 0,
			open(ws) {
				connections.add(ws);
				clearTimeout(idleTimer);
				ws.data.timer = setTimeout(
					() => close(ws, 1011, "CDP connection timed out"),
					options.connectTimeoutMs ?? 10_000,
				);
				void options
					.getToken(lifetime.signal)
					.then((token) => {
						if (ws.data.closed || stopped) return;
						const url = new URL(options.upstreamUrl);
						url.searchParams.set("token", token);
						const upstream = new WebSocket(url);
						ws.data.upstream = upstream;
						upstream.binaryType = "arraybuffer";
						upstream.onopen = () => {
							clearTimeout(ws.data.timer);
							if (ws.data.closed) {
								upstream.terminate();
								return;
							}
							for (const message of ws.data.pending) upstream.send(message);
							ws.data.pending.length = 0;
							ws.data.bytes = 0;
						};
						upstream.onmessage = (event) => {
							if (!ws.data.closed) ws.send(event.data);
						};
						upstream.onclose = () => close(ws);
						upstream.onerror = () =>
							close(ws, 1011, "CDP upstream connection failed");
					})
					.catch(() => close(ws, 1011, "CDP authentication failed"));
			},
			message(ws, message) {
				const size = Buffer.byteLength(message);
				if (ws.data.upstream?.readyState === WebSocket.OPEN) {
					if (ws.data.upstream.bufferedAmount + size > maxBufferedBytes) {
						close(ws, 1009, "CDP buffer limit exceeded");
						return;
					}
					ws.data.upstream.send(message);
					return;
				}
				if (ws.data.pending.length >= 64 || ws.data.bytes + size > maxBytes) {
					close(ws, 1009, "CDP buffer limit exceeded");
					return;
				}
				ws.data.pending.push(message);
				ws.data.bytes += size;
			},
			close(ws) {
				close(ws);
			},
		},
	});
	armIdle();
	return { endpoint: server.url.origin, stop, closed };
}
