import type { NodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import type { BrowserBridgeConfig } from "../../types";

export interface RegisterBrowserCdpRouteOptions {
	app: Hono;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	/** Resolved per request; undefined on standalone hosts. */
	getBridge: () => BrowserBridgeConfig | undefined;
}

/**
 * Bridges a client CDP WebSocket to the desktop browser bridge's per-pane CDP
 * endpoint. Frames pass through verbatim in both directions, so this works
 * identically for a local client and one tunneled in over the relay.
 */
export function registerBrowserCdpRoute({
	app,
	upgradeWebSocket,
	getBridge,
}: RegisterBrowserCdpRouteOptions) {
	app.get(
		"/browser/:paneId/cdp",
		upgradeWebSocket((c) => {
			const paneId = c.req.param("paneId") ?? "";
			const workspaceId = c.req.query("workspaceId") ?? "";
			const bridge = getBridge();
			let upstream: WebSocket | null = null;
			// Frames the client sends before the upstream socket is open. Bounded
			// so a client can't grow host memory without limit if the upstream
			// stalls; overflow closes the socket (1009 = message too big).
			const pending: string[] = [];
			let pendingBytes = 0;
			const MAX_PENDING_FRAMES = 64;
			const MAX_PENDING_BYTES = 4 * 1024 * 1024;

			return {
				onOpen: (_event, ws) => {
					if (!bridge) {
						ws.close(1011, "No browser bridge on this host");
						return;
					}
					if (!workspaceId) {
						ws.close(1008, "workspaceId is required");
						return;
					}
					const wsUrl = bridge.url.replace(/^http/, "ws");
					upstream = new WebSocket(
						`${wsUrl}/panes/${encodeURIComponent(paneId)}/cdp?workspaceId=${encodeURIComponent(workspaceId)}&token=${encodeURIComponent(bridge.secret)}`,
					);
					upstream.addEventListener("open", () => {
						for (const msg of pending) upstream?.send(msg);
						pending.length = 0;
					});
					upstream.addEventListener("message", (evt) => {
						ws.send(typeof evt.data === "string" ? evt.data : String(evt.data));
					});
					upstream.addEventListener("close", (evt) => {
						ws.close(evt.code === 1005 ? 1000 : evt.code, evt.reason);
					});
					upstream.addEventListener("error", () => {
						ws.close(1011, "Bridge CDP connection failed");
					});
				},
				onMessage: (event, ws) => {
					const data =
						typeof event.data === "string" ? event.data : String(event.data);
					if (upstream && upstream.readyState === WebSocket.OPEN) {
						upstream.send(data);
						return;
					}
					pendingBytes += data.length;
					if (
						pending.length >= MAX_PENDING_FRAMES ||
						pendingBytes > MAX_PENDING_BYTES
					) {
						ws.close(1009, "CDP frame backlog exceeded");
						upstream?.close();
						upstream = null;
						pending.length = 0;
						return;
					}
					pending.push(data);
				},
				onClose: () => {
					upstream?.close();
					upstream = null;
				},
				onError: () => {
					upstream?.close();
					upstream = null;
				},
			};
		}),
	);
}
