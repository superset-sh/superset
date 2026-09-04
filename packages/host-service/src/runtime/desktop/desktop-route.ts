import { connect, type Socket } from "node:net";
import type { NodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";

const VNC_PORT = 5900;

const VNC_HOST = "127.0.0.1";

const MAX_PENDING_FRAMES = 64;
const MAX_PENDING_BYTES = 4 * 1024 * 1024;

export interface RegisterDesktopRouteOptions {
	app: Hono;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

function toBytes(data: unknown): Uint8Array | null {
	if (data instanceof ArrayBuffer) return new Uint8Array(data);
	if (ArrayBuffer.isView(data)) {
		return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	}
	return null;
}

export function registerDesktopRoute({
	app,
	upgradeWebSocket,
}: RegisterDesktopRouteOptions) {
	app.get(
		"/desktop/vnc",
		upgradeWebSocket(() => {
			let upstream: Socket | null = null;
			let open = false;
			const pending: Uint8Array[] = [];
			let pendingBytes = 0;

			return {
				onOpen: (_event, ws) => {
					const socket = connect(VNC_PORT, VNC_HOST);
					upstream = socket;
					socket.on("connect", () => {
						open = true;
						for (const frame of pending) socket.write(frame);
						pending.length = 0;
						pendingBytes = 0;
					});
					socket.on("data", (chunk: Buffer) => {
						ws.send(new Uint8Array(chunk));
					});
					socket.on("error", () => {
						ws.close(1011, "No desktop session on this host");
					});
					socket.on("close", () => {
						open = false;
						ws.close(1000, "Desktop session ended");
					});
				},
				onMessage: (event, ws) => {
					const bytes = toBytes(event.data);
					if (!bytes) {
						ws.close(1003, "Desktop expects binary frames");
						return;
					}
					if (upstream && open) {
						upstream.write(bytes);
						return;
					}
					pendingBytes += bytes.byteLength;
					if (
						pending.length >= MAX_PENDING_FRAMES ||
						pendingBytes > MAX_PENDING_BYTES
					) {
						ws.close(1009, "Desktop frame backlog exceeded");
						upstream?.destroy();
						upstream = null;
						pending.length = 0;
						pendingBytes = 0;
						return;
					}
					pending.push(bytes);
				},
				onClose: () => {
					upstream?.destroy();
					upstream = null;
				},
				onError: () => {
					upstream?.destroy();
					upstream = null;
				},
			};
		}),
	);
}
