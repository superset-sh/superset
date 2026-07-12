import type { NodeWebSocket } from "@hono/node-ws";
import type { SessionUpdateEnvelope } from "@superset/session-protocol";
import type { Hono } from "hono";
import { AcpSessionNotFoundError } from "./acp-sessions";

/**
 * The slice of `AcpSessionManager` the stream route needs. Tests inject a
 * stub backed by a bare `SessionJournal`; app.ts passes the real manager.
 */
export interface AcpSessionStreamSource {
	subscribe(input: {
		sessionId: string;
		since?: number;
		onEnvelope: (envelope: SessionUpdateEnvelope) => void;
	}): () => void;
	/**
	 * Resurrect a persisted-but-offline session before attaching (the manager
	 * implements this; journal-backed test stubs may omit it). Resolving
	 * without effect for live/dead/unknown ids is expected — `subscribe`
	 * raises its own NotFound for the unknown case.
	 */
	ensureLive?(sessionId: string): Promise<void>;
}

interface RegisterAcpSessionStreamRouteOptions {
	app: Hono;
	sessions: AcpSessionStreamSource;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	/** Test/embedding hook; production uses the host-local default path. */
	path?: string;
}

const SOCKET_OPEN = 1;
// Same rationale as the terminal route: with no ACK flow control, a client
// that stops draining would grow the host's send buffer without bound.
// Envelopes are small, so blowing past this means the client is effectively
// gone — drop it; reconnect-with-cursor replays what it missed. The drop
// path is intentionally untested: forcing 8MB of unread kernel buffer in a
// test is flaky-by-construction, and a false trip only costs a reconnect.
const WS_SEND_BUFFER_CAP_BYTES = 8 * 1024 * 1024;

// Structural slice of hono/ws's WSContext; `raw` is the underlying `ws`
// socket (present for node-ws), read for `bufferedAmount` back-pressure.
type StreamSocket = {
	send: (data: string) => void;
	close: (code?: number, reason?: string) => void;
	readyState: number;
	raw?: { readonly bufferedAmount?: number };
};

/**
 * `undefined` when the query param is absent (subscribe live from now),
 * `null` when present but not a non-negative integer.
 */
function parseSince(raw: string | undefined): number | undefined | null {
	if (raw === undefined) return undefined;
	// Digits only: Number("") and Number(" ") are 0, which would silently turn
	// a malformed cursor into a full-journal replay.
	if (!/^\d+$/.test(raw)) return null;
	const value = Number(raw);
	if (!Number.isSafeInteger(value)) return null;
	return value;
}

/**
 * Terminal frames for cursors the server can't serve. The client stops on any
 * `reset` before seq validation, so the nominal seq 0 is never inspected.
 */
function sendReset(socket: StreamSocket, sessionId: string, reason: string) {
	if (socket.readyState !== SOCKET_OPEN) return;
	const envelope: SessionUpdateEnvelope = {
		seq: 0,
		sessionId,
		ts: Date.now(),
		frame: { kind: "reset", reason },
	};
	socket.send(JSON.stringify(envelope));
}

/**
 * `/acp-sessions/:sessionId/stream?since=<seq>` — one JSON
 * `SessionUpdateEnvelope` per WS message (docs/acp-sessions.md).
 * With `since`, the retained journal tail is replayed before going live; an
 * unservable cursor gets a single `reset` frame and the socket closes — the
 * client resyncs via get/getMessages and reconnects. The route is
 * server-to-client only; client messages are ignored. Auth is the same
 * `wsAuth` guard app.ts applies to `/terminal/*`.
 */
export function registerAcpSessionStreamRoute({
	app,
	sessions,
	upgradeWebSocket,
	path = "/acp-sessions/:sessionId/stream",
}: RegisterAcpSessionStreamRouteOptions) {
	app.get(
		path,
		upgradeWebSocket((c) => {
			const sessionId = c.req.param("sessionId") ?? "";
			const sinceRaw = c.req.query("since") ?? undefined;
			let unsubscribe: (() => void) | null = null;
			let closed = false;
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
						socket.close(1008, "invalid since cursor");
						return;
					}
					const attach = () => {
						try {
							unsubscribe = sessions.subscribe({
								sessionId,
								since,
								onEnvelope: (envelope) => {
									if (socket.readyState !== SOCKET_OPEN) {
										detach();
										return;
									}
									if (
										(socket.raw?.bufferedAmount ?? 0) > WS_SEND_BUFFER_CAP_BYTES
									) {
										detach();
										try {
											socket.close(1013, "stream back-pressure");
										} catch {
											// best-effort; close may race an already-closing socket
										}
										return;
									}
									socket.send(JSON.stringify(envelope));
									// The manager emits `reset` when the cursor was evicted; the
									// client stops on it, so free the server side too.
									if (envelope.frame.kind === "reset") {
										detach();
										socket.close(1000, "cursor reset");
									}
								},
							});
						} catch (error) {
							if (error instanceof AcpSessionNotFoundError) {
								sendReset(socket, sessionId, "session_not_found");
								socket.close(1008, "session not found");
								return;
							}
							console.error(
								"[acp-sessions] unexpected error attaching stream",
								error,
							);
							socket.close(1011, "stream attach error");
						}
					};
					if (!sessions.ensureLive) {
						attach();
						return;
					}
					// Resurrect before attaching so a stream opened right after a
					// host restart replays the loaded transcript instead of dying on
					// session_not_found. onOpen can't await, so attach in the
					// continuation — `closed` guards the socket going away meanwhile.
					void sessions.ensureLive(sessionId).then(
						() => {
							if (closed || socket.readyState !== SOCKET_OPEN) return;
							attach();
						},
						(error) => {
							if (closed || socket.readyState !== SOCKET_OPEN) return;
							// The client resyncs over tRPC, where the load error is
							// visible instead of swallowed by a socket close.
							console.warn(
								"[acp-sessions] stream attach: session/load failed",
								error,
							);
							sendReset(socket, sessionId, "session_load_failed");
							socket.close(1011, "session load failed");
						},
					);
				},

				onMessage: () => {
					// Server-to-client stream; inputs ride the tRPC router.
				},

				onClose: () => {
					closed = true;
					detach();
				},

				onError: () => {
					closed = true;
					detach();
				},
			};
		}),
	);
}
