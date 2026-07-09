import type { WSContext } from "hono/ws";

// Query marker on a relay-to-relay proxy hop. Guards against an infinite
// bridge loop when the directory is briefly stale: a hop that lands on a node
// which doesn't own the tunnel is failed rather than re-proxied.
export const PROXY_HOP_PARAM = "_rlp";

// Build the private-network URL for the relay instance that owns the tunnel.
// Fly resolves `<machine-id>.vm.<app>.internal` to that specific machine over
// the encrypted 6PN network, so plain `ws://` on the internal port is fine.
export function internalProxyUrl(
	owner: { machineId: string },
	hostId: string,
	pathAfterHost: string,
	search: string,
	opts: { appName: string; port: number },
): string {
	const base = `ws://${owner.machineId}.vm.${opts.appName}.internal:${opts.port}`;
	const sep = search ? "&" : "?";
	return `${base}/hosts/${hostId}${pathAfterHost}${search}${sep}${PROXY_HOP_PARAM}=1`;
}

// Only 1000 and the 3000-4999 app range may be sent on a WS close frame;
// anything else (1005/1006/1015, protocol codes) throws. Fall back to 1000.
export function safeCloseCode(code: number | undefined): number {
	return code === 1000 || (code != null && code >= 3000 && code <= 4999)
		? code
		: 1000;
}

// Buffer cap for client frames that arrive before the upstream WS is open.
const MAX_PENDING_FRAMES = 512;

type WsEventHandlers = {
	onOpen: (evt: unknown, ws: WSContext) => void;
	onMessage: (evt: { data: unknown }) => void;
	onClose: () => void;
	onError: () => void;
};

/**
 * Bridge a client terminal/events WebSocket to the relay instance that owns the
 * host tunnel, over Fly's private network. Frames are piped both ways with
 * framing preserved: client→host rides as text (the tunnel carries client
 * frames as strings and terminal input is JSON), host→client preserves binary
 * (PTY bytes) vs text (JSON control). The owning node runs the normal access
 * check + channel path on the far end.
 *
 * `connect` defaults to the global WebSocket; injectable so tests can point at
 * a local upstream without Fly 6PN.
 */
export function createProxyBridge(
	target: string,
	connect: (url: string) => WebSocket = (url) => new WebSocket(url),
): WsEventHandlers {
	let upstream: WebSocket | null = null;
	let clientClosed = false;
	const pending: string[] = [];

	return {
		onOpen: (_evt, ws) => {
			try {
				upstream = connect(target);
			} catch {
				ws.close(1011, "Upstream connect failed");
				return;
			}
			upstream.binaryType = "arraybuffer";
			upstream.addEventListener("open", () => {
				for (const frame of pending) upstream?.send(frame);
				pending.length = 0;
			});
			upstream.addEventListener("message", (event) => {
				if (ws.readyState !== 1) return;
				ws.send(event.data as string | ArrayBuffer);
			});
			upstream.addEventListener("close", (event) => {
				if (!clientClosed && ws.readyState === 1) {
					ws.close(safeCloseCode(event.code), "Upstream closed");
				}
			});
			upstream.addEventListener("error", () => {
				if (!clientClosed && ws.readyState === 1) {
					ws.close(1011, "Upstream error");
				}
			});
		},
		onMessage: (event) => {
			const frame = String(event.data);
			if (upstream?.readyState === 1) {
				upstream.send(frame);
			} else if (pending.length < MAX_PENDING_FRAMES) {
				pending.push(frame);
			}
		},
		onClose: () => {
			clientClosed = true;
			try {
				upstream?.close();
			} catch {
				// already closed
			}
		},
		onError: () => {
			clientClosed = true;
			try {
				upstream?.close();
			} catch {
				// already closed
			}
		},
	};
}
