import type { WSContext } from "hono/ws";

// Loop guard: a hop marked with this on a non-owning node is failed, not re-proxied.
export const PROXY_HOP_PARAM = "_rlp";

// Owning instance's 6PN address; plain ws:// is fine on Fly's encrypted network.
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

// Remap only unsendable codes to 1011; never to 1000, which the client reads as
// a clean exit and stops reconnecting.
const NON_SENDABLE_CLOSE_CODES = new Set([1004, 1005, 1006, 1015]);

export function safeCloseCode(code: number | undefined): number {
	if (code == null || NON_SENDABLE_CLOSE_CODES.has(code)) return 1011;
	if (
		code === 1000 ||
		(code >= 1001 && code <= 1014) ||
		(code >= 3000 && code <= 4999)
	) {
		return code;
	}
	return 1011;
}

// Buffer cap for client frames that arrive before the upstream WS is open.
const MAX_PENDING_FRAMES = 512;

// Tear the bridge down if the upstream never opens (dead peer still in DNS).
const UPSTREAM_OPEN_TIMEOUT_MS = 10_000;

type WsEventHandlers = {
	onOpen: (evt: unknown, ws: WSContext) => void;
	onMessage: (evt: { data: unknown }) => void;
	onClose: () => void;
	onError: () => void;
};

// Bridge a client WS to the owning relay instance over 6PN, preserving framing
// (client→host text, host→client binary/text). `connect`/`openTimeoutMs` are
// injectable for tests.
export function createProxyBridge(
	target: string,
	connect: (url: string) => WebSocket = (url) => new WebSocket(url),
	openTimeoutMs: number = UPSTREAM_OPEN_TIMEOUT_MS,
): WsEventHandlers {
	let upstream: WebSocket | null = null;
	let clientClosed = false;
	let openTimer: ReturnType<typeof setTimeout> | null = null;
	const pending: string[] = [];

	const clearOpenTimer = () => {
		if (openTimer != null) {
			clearTimeout(openTimer);
			openTimer = null;
		}
	};

	return {
		onOpen: (_evt, ws) => {
			try {
				upstream = connect(target);
			} catch {
				ws.close(1011, "Upstream connect failed");
				return;
			}
			upstream.binaryType = "arraybuffer";
			openTimer = setTimeout(() => {
				openTimer = null;
				if (clientClosed) return;
				try {
					upstream?.close();
				} catch {
					// already closed
				}
				if (ws.readyState === 1) ws.close(1011, "Upstream connect timeout");
			}, openTimeoutMs);
			upstream.addEventListener("open", () => {
				clearOpenTimer();
				for (const frame of pending) upstream?.send(frame);
				pending.length = 0;
			});
			upstream.addEventListener("message", (event) => {
				if (ws.readyState !== 1) return;
				ws.send(event.data as string | ArrayBuffer);
			});
			upstream.addEventListener("close", (event) => {
				clearOpenTimer();
				if (!clientClosed && ws.readyState === 1) {
					ws.close(safeCloseCode(event.code), "Upstream closed");
				}
			});
			upstream.addEventListener("error", () => {
				clearOpenTimer();
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
			clearOpenTimer();
			try {
				upstream?.close();
			} catch {
				// already closed
			}
		},
		onError: () => {
			clientClosed = true;
			clearOpenTimer();
			try {
				upstream?.close();
			} catch {
				// already closed
			}
		},
	};
}
