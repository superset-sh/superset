import net from "node:net";
import type { NodeWebSocket } from "@hono/node-ws";
import type { DetectedPort } from "@superset/port-scanner";
import type { Hono } from "hono";

export interface RegisterTcpForwardRouteOptions {
	app: Hono;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	getPortsByWorkspace: (workspaceId: string) => DetectedPort[];
}

// Frames the client sends before the TCP socket connects. Bounded so a
// client can't grow host memory while the upstream stalls.
const MAX_PENDING_FRAMES = 64;
const MAX_PENDING_BYTES = 4 * 1024 * 1024;
// Pause the TCP socket when the WebSocket has this much unsent data queued;
// resume when it drains. Keeps a slow relay leg from buffering unbounded.
const HIGH_WATER_BYTES = 8 * 1024 * 1024;
const DRAIN_POLL_MS = 50;

/**
 * Bridges one client WebSocket to one TCP connection on 127.0.0.1:<port>.
 * Only ports the port scanner attributes to the requested workspace are
 * reachable: a workspace can forward what it started, nothing else on the host.
 *
 * Every frame is binary and stays under 1 MiB (Node `net` chunks are at most
 * 64 KiB), which is the relay's per-message ceiling.
 */
export function registerTcpForwardRoute({
	app,
	upgradeWebSocket,
	getPortsByWorkspace,
}: RegisterTcpForwardRouteOptions) {
	app.get(
		"/tcp/:port",
		upgradeWebSocket((c) => {
			const port = Number.parseInt(c.req.param("port") ?? "", 10);
			const workspaceId = c.req.query("workspaceId") ?? "";
			let socket: net.Socket | null = null;
			let connected = false;
			const pending: Buffer[] = [];
			let pendingBytes = 0;
			let drainTimer: ReturnType<typeof setInterval> | null = null;

			const teardown = () => {
				if (drainTimer) clearInterval(drainTimer);
				drainTimer = null;
				socket?.destroy();
				socket = null;
				pending.length = 0;
			};

			return {
				onOpen: (_event, ws) => {
					if (!workspaceId) {
						ws.close(1008, "workspaceId is required");
						return;
					}
					if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
						ws.close(1008, "invalid port");
						return;
					}
					const owned = getPortsByWorkspace(workspaceId).some(
						(p) => p.port === port,
					);
					if (!owned) {
						ws.close(1008, "port not owned by workspace");
						return;
					}

					const upstream = net.connect({ host: "127.0.0.1", port });
					socket = upstream;
					upstream.on("connect", () => {
						connected = true;
						for (const chunk of pending) upstream.write(chunk);
						pending.length = 0;
						pendingBytes = 0;
					});
					upstream.on("data", (chunk: Buffer) => {
						ws.send(asFrame(chunk));
						const queued = ws.raw?.bufferedAmount ?? 0;
						if (queued > HIGH_WATER_BYTES && !drainTimer) {
							upstream.pause();
							drainTimer = setInterval(() => {
								if ((ws.raw?.bufferedAmount ?? 0) <= HIGH_WATER_BYTES / 2) {
									if (drainTimer) clearInterval(drainTimer);
									drainTimer = null;
									upstream.resume();
								}
							}, DRAIN_POLL_MS);
						}
					});
					upstream.on("close", () => {
						teardown();
						ws.close(1000, "upstream closed");
					});
					upstream.on("error", (err: NodeJS.ErrnoException) => {
						const reason = connected
							? "upstream error"
							: `upstream connect failed: ${err.code ?? err.message}`;
						teardown();
						ws.close(1011, reason);
					});
				},
				onMessage: (event, ws) => {
					if (typeof event.data === "string") {
						ws.close(1003, "text frames not supported");
						teardown();
						return;
					}
					const chunk = toBuffer(event.data);
					if (socket && connected) {
						socket.write(chunk);
						return;
					}
					pendingBytes += chunk.byteLength;
					if (
						pending.length >= MAX_PENDING_FRAMES ||
						pendingBytes > MAX_PENDING_BYTES
					) {
						ws.close(1009, "frame backlog exceeded");
						teardown();
						return;
					}
					pending.push(chunk);
				},
				onClose: teardown,
				onError: teardown,
			};
		}),
	);
}

// Node's Buffer is typed over ArrayBufferLike; the ws send signature wants a
// plain ArrayBuffer view. Socket chunks never sit on a SharedArrayBuffer, so
// the view is the same bytes with a narrower type — no copy.
function asFrame(chunk: Buffer): Uint8Array<ArrayBuffer> {
	return chunk as Uint8Array<ArrayBuffer>;
}

function toBuffer(data: ArrayBufferLike | Blob | Uint8Array): Buffer {
	if (Buffer.isBuffer(data)) return data;
	if (ArrayBuffer.isView(data)) {
		return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
	}
	if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
		return Buffer.from(data);
	}
	// @hono/node-ws never hands out a Blob; refuse rather than read it async.
	throw new Error("Unsupported WebSocket frame type");
}
