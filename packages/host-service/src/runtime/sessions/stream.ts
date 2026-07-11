import type { NodeWebSocket } from "@hono/node-ws";
import type { SessionEventEnvelope } from "@superset/session-protocol";
import type { Hono } from "hono";
import { SessionNotFoundError } from "./sessions";

/**
 * The structural slice of SessionManager needed by the WebSocket route.
 * Tests inject a journal-backed stub without constructing SessionManager.
 */
export interface SessionStreamSource {
	subscribe(input: {
		sessionId: string;
		since?: number;
		onEnvelope: (envelope: SessionEventEnvelope) => void;
	}): () => void;
}

interface RegisterSessionStreamRouteOptions {
	app: Hono;
	sessions: SessionStreamSource;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

const SOCKET_OPEN = 1;

// There is no application-level ACK flow control. Once a client stops
// draining, continuing to enqueue frames would grow the host's send buffer
// without bound. Closing is safe because the client reconnects with its cursor
// and the journal replays everything it missed.
const WS_SEND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;

// Structural slice of hono/ws's WSContext. `raw` is the underlying node `ws`
// socket and exposes bufferedAmount for the back-pressure guard.
type StreamSocket = {
	send: (data: string) => void;
	close: (code?: number, reason?: string) => void;
	readyState: number;
	raw?: { readonly bufferedAmount?: number };
};

/**
 * Undefined means live-only; null means the supplied cursor is invalid.
 */
function parseSince(raw: string | undefined): number | undefined | null {
	if (raw === undefined) return undefined;
	if (!/^(0|[1-9][0-9]*)$/.test(raw)) return null;
	const value = Number(raw);
	return Number.isSafeInteger(value) ? value : null;
}

function sendReset(
	socket: StreamSocket,
	sessionId: string,
	reason: string,
	latestSeq?: number,
): void {
	if (socket.readyState !== SOCKET_OPEN) return;
	const envelope: SessionEventEnvelope = {
		seq: 0,
		sessionId,
		ts: Date.now(),
		frame: {
			kind: "reset",
			reason,
			...(latestSeq === undefined ? {} : { latestSeq }),
		},
	};
	try {
		socket.send(JSON.stringify(envelope));
	} catch {
		// The ready-state check and send are not atomic. A disconnect in between
		// is expected and the client will repair from its cursor on reconnect.
	}
}

function closeSocket(socket: StreamSocket, code: number, reason: string): void {
	try {
		socket.close(code, reason);
	} catch {
		// Close can race the peer or a prior terminal path.
	}
}

/**
 * `/sessions/:sessionId/stream?since=<seq>` emits one SessionEventEnvelope per
 * WebSocket message. A cursor replays the retained journal tail before the
 * source attaches live delivery. Invalid, missing-session, evicted, and
 * cursor-ahead cases terminate with a reset so subscribeToSession can perform
 * its state/history repair path without entering a reconnect loop.
 */
export function registerSessionStreamRoute({
	app,
	sessions,
	upgradeWebSocket,
}: RegisterSessionStreamRouteOptions): void {
	app.get(
		"/sessions/:sessionId/stream",
		upgradeWebSocket((context) => {
			const sessionId = context.req.param("sessionId") ?? "";
			const sinceRaw = context.req.query("since") ?? undefined;
			let unsubscribe: (() => void) | null = null;
			let terminal = false;

			const detach = () => {
				const current = unsubscribe;
				unsubscribe = null;
				current?.();
			};

			return {
				onOpen: (_event, ws) => {
					const socket = ws as StreamSocket;
					const since = parseSince(sinceRaw);
					if (since === null) {
						sendReset(socket, sessionId, "invalid_since");
						closeSocket(socket, 1008, "invalid since cursor");
						return;
					}

					try {
						const attached = sessions.subscribe({
							sessionId,
							since,
							onEnvelope: (envelope) => {
								if (terminal) return;
								if (socket.readyState !== SOCKET_OPEN) {
									detach();
									return;
								}
								if (
									(socket.raw?.bufferedAmount ?? 0) > WS_SEND_BUFFER_CAP_BYTES
								) {
									terminal = true;
									detach();
									closeSocket(socket, 1013, "stream back-pressure");
									return;
								}

								try {
									socket.send(JSON.stringify(envelope));
								} catch {
									// A send can race a socket close, and an unexpected SDK
									// payload can fail serialization. Either way, journal replay
									// repairs delivery after reconnect; never let this escape into
									// the shared Query pump.
									terminal = true;
									detach();
									closeSocket(socket, 1011, "stream send error");
									return;
								}
								if (envelope.frame.kind === "reset") {
									terminal = true;
									detach();
									closeSocket(socket, 1000, "cursor reset");
								}
							},
						});

						// Replay is synchronous, so a reset/back-pressure callback can run
						// before subscribe returns its detach function.
						if (terminal) {
							attached();
						} else {
							unsubscribe = attached;
						}
					} catch (error) {
						if (error instanceof SessionNotFoundError) {
							terminal = true;
							sendReset(socket, sessionId, "session_not_found");
							closeSocket(socket, 1008, "session not found");
							return;
						}
						console.error(
							"[sessions] unexpected error attaching stream",
							error,
						);
						closeSocket(socket, 1011, "stream attach error");
					}
				},

				onMessage: () => {
					// Server-to-client stream; commands use the sessions RPC router.
				},

				onClose: () => detach(),

				onError: () => detach(),
			};
		}),
	);
}
