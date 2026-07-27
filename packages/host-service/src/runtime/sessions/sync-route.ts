import type { NodeWebSocket } from "@hono/node-ws";
import { SESSIONS_SYNC_PATH } from "@superset/host-service-sync/protocol";
import type { Hono } from "hono";
import type {
	SessionsSyncConnection,
	SessionsSyncHub,
	SyncSocket,
} from "./sync-hub";

export interface RegisterSessionsSyncRouteOptions {
	app: Hono;
	hub: SessionsSyncHub;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	/** Test/embedding hook; production uses the protocol's canonical path. */
	path?: string;
}

/**
 * `/sessions/sync` — the Host Sessions synchronization WebSocket
 * (plans/host-sessions-sync.md). All framing, handshake, and
 * subscription logic lives in {@link SessionsSyncHub}; this route only
 * adapts hono/node-ws sockets onto it. Auth is the same `wsAuth` guard
 * app.ts applies to the other WS surfaces.
 */
export function registerSessionsSyncRoute({
	app,
	hub,
	upgradeWebSocket,
	path = SESSIONS_SYNC_PATH,
}: RegisterSessionsSyncRouteOptions) {
	app.get(
		path,
		upgradeWebSocket(() => {
			let connection: SessionsSyncConnection | null = null;
			return {
				onOpen: (_event, ws) => {
					connection = hub.connect(ws as SyncSocket);
				},
				onMessage: (event) => {
					// The protocol is JSON text frames; String() folds the rare
					// Buffer delivery into the same parse path, where non-JSON is
					// answered with INVALID_PACKET.
					void connection?.handleMessage(String(event.data));
				},
				onClose: () => {
					connection?.dispose();
					connection = null;
				},
				onError: () => {
					connection?.dispose();
					connection = null;
				},
			};
		}),
	);
}
