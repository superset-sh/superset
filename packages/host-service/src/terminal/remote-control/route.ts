import type { NodeWebSocket } from "@hono/node-ws";
import {
	capabilitiesForMode,
	REMOTE_CONTROL_INPUT_RATE_PER_SEC,
	REMOTE_CONTROL_RESIZE_RATE_PER_SEC,
	REMOTE_CONTROL_TOKEN_PARAM,
	type RemoteControlClientMessage,
	type RemoteControlErrorCode,
	type RemoteControlServerMessage,
} from "@superset/shared/remote-control-protocol";
import type { Hono } from "hono";
import {
	attachTerminalViewer,
	type TerminalViewerHandle,
	type TerminalViewerListener,
} from "../terminal.ts";
import {
	addViewer,
	authenticateSession,
	onRevoke,
	removeViewer,
} from "./session-manager.ts";

interface RemoteControlSocket {
	send: (data: string) => void;
	close: (code?: number, reason?: string) => void;
	readyState: number;
}

const SOCKET_OPEN = 1;

interface TokenBucket {
	tokens: number;
	lastRefillMs: number;
	ratePerSec: number;
}

function makeBucket(ratePerSec: number): TokenBucket {
	return { tokens: ratePerSec, lastRefillMs: Date.now(), ratePerSec };
}

function consume(bucket: TokenBucket): boolean {
	const now = Date.now();
	const elapsed = (now - bucket.lastRefillMs) / 1000;
	if (elapsed > 0) {
		bucket.tokens = Math.min(
			bucket.ratePerSec,
			bucket.tokens + elapsed * bucket.ratePerSec,
		);
		bucket.lastRefillMs = now;
	}
	if (bucket.tokens < 1) return false;
	bucket.tokens -= 1;
	return true;
}

function bytesToBase64(bytes: Uint8Array): string {
	const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return buf.toString("base64");
}

function base64ToBytes(s: string): Uint8Array {
	return new Uint8Array(Buffer.from(s, "base64"));
}

function send(ws: RemoteControlSocket, msg: RemoteControlServerMessage): void {
	if (ws.readyState !== SOCKET_OPEN) return;
	try {
		ws.send(JSON.stringify(msg));
	} catch (err) {
		console.warn("[remote-control] send failed:", err);
	}
}

function sendError(
	ws: RemoteControlSocket,
	code: RemoteControlErrorCode,
	message: string,
): void {
	send(ws, { type: "error", code, message });
}

export interface RegisterRemoteControlRouteOptions {
	app: Hono;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
}

export function registerRemoteControlRoute(
	options: RegisterRemoteControlRouteOptions,
): void {
	const { app, upgradeWebSocket } = options;

	app.get(
		"/remote-control/:sessionId",
		upgradeWebSocket((c) => {
			const sessionId = c.req.param("sessionId") ?? "";
			const token = c.req.query(REMOTE_CONTROL_TOKEN_PARAM) ?? "";

			const ctx: {
				viewer: TerminalViewerHandle | null;
				listener: TerminalViewerListener | null;
				viewerSocket: { close: () => void } | null;
				unsubscribeRevoke: (() => void) | null;
				inputBucket: TokenBucket;
				resizeBucket: TokenBucket;
			} = {
				viewer: null,
				listener: null,
				viewerSocket: null,
				unsubscribeRevoke: null,
				inputBucket: makeBucket(REMOTE_CONTROL_INPUT_RATE_PER_SEC),
				resizeBucket: makeBucket(REMOTE_CONTROL_RESIZE_RATE_PER_SEC),
			};

			return {
				onOpen: (_event, ws) => {
					if (!sessionId) {
						sendError(ws, "session-not-found", "Missing sessionId");
						ws.close(1011, "Missing sessionId");
						return;
					}
					if (!token) {
						sendError(ws, "invalid-token", "Missing token");
						ws.close(1011, "Missing token");
						return;
					}

					const auth = authenticateSession(sessionId, token);
					if (!auth.ok) {
						const code: RemoteControlErrorCode =
							auth.reason === "session-not-found"
								? "session-not-found"
								: auth.reason === "session-expired"
									? "session-expired"
									: "invalid-token";
						console.warn(`[remote-control] auth failed: ${auth.reason}`);
						sendError(ws, code, auth.reason);
						ws.close(1008, auth.reason);
						return;
					}

					const listener: TerminalViewerListener = {
						onData(bytes, sequence) {
							send(ws, {
								type: "data",
								data: bytesToBase64(bytes),
								outputSequence: sequence,
							});
						},
						onTitle(title) {
							send(ws, { type: "title", title });
						},
						onResize(_cols, _rows) {
							// Host-driven resize is not propagated to viewers in `full`
							// mode — viewer's own size wins (see plan OQ-2).
						},
						onExit(exitCode, signal) {
							send(ws, { type: "exit", exitCode, signal });
						},
					};

					const handle = attachTerminalViewer({
						terminalId: auth.terminalId,
						workspaceId: auth.workspaceId,
						listener,
					});
					if (!handle) {
						sendError(
							ws,
							"session-not-found",
							"Terminal session is no longer active",
						);
						ws.close(1011, "terminal-not-found");
						return;
					}
					ctx.viewer = handle;
					ctx.listener = listener;

					const viewerSocket = {
						close: () => {
							try {
								ws.close(1000, "revoked");
							} catch {
								// best-effort
							}
						},
					};
					ctx.viewerSocket = viewerSocket;
					const added = addViewer(sessionId, viewerSocket);
					if (!added.ok) {
						console.warn(
							`[remote-control] viewer cap reached for ${sessionId}`,
						);
						sendError(ws, "max-viewers", "Maximum viewers reached");
						handle.detach();
						ctx.viewer = null;
						ws.close(1013, "max-viewers");
						return;
					}

					const capabilities = capabilitiesForMode(auth.mode);
					const snap = handle.getSnapshot();
					send(ws, {
						type: "hello",
						sessionId,
						terminalId: auth.terminalId,
						mode: auth.mode,
						capabilities,
						cols: snap.cols,
						rows: snap.rows,
						title: snap.title,
					});
					if (snap.tail.byteLength > 0) {
						send(ws, {
							type: "snapshot",
							data: bytesToBase64(snap.tail),
							outputSequence: snap.outputSequence,
						});
					}
					if (snap.exited) {
						send(ws, {
							type: "exit",
							exitCode: snap.exitCode ?? 0,
							signal: snap.signal ?? 0,
						});
						ws.close(1000, "exited");
						return;
					}

					ctx.unsubscribeRevoke = onRevoke(sessionId, (reason) => {
						send(ws, { type: "revoked", reason });
						try {
							ws.close(1000, `revoked:${reason}`);
						} catch {
							// best-effort
						}
					});
				},

				onMessage: (event, ws) => {
					if (!ctx.viewer) return;
					let parsed: RemoteControlClientMessage;
					try {
						parsed = JSON.parse(
							String(event.data),
						) as RemoteControlClientMessage;
					} catch {
						sendError(ws, "internal", "Invalid message payload");
						return;
					}

					const auth = authenticateSession(sessionId, token);
					if (!auth.ok) {
						sendError(ws, "session-expired", "Session no longer valid");
						ws.close(1008, "session-expired");
						return;
					}
					const capabilities = capabilitiesForMode(auth.mode);

					switch (parsed.type) {
						case "ping":
							send(ws, { type: "pong", nonce: parsed.nonce });
							return;
						case "stop":
							ws.close(1000, "stop");
							return;
						case "input": {
							if (!capabilities.input) {
								sendError(
									ws,
									"capability-denied",
									"Input not allowed in this mode",
								);
								return;
							}
							if (!consume(ctx.inputBucket)) {
								sendError(ws, "rate-limited", "Input rate limit exceeded");
								return;
							}
							try {
								ctx.viewer.sendInput(base64ToBytes(parsed.data));
							} catch (err) {
								console.warn("[remote-control] sendInput failed:", err);
								sendError(ws, "internal", "Failed to forward input");
							}
							return;
						}
						case "resize": {
							if (!capabilities.resize) {
								sendError(
									ws,
									"capability-denied",
									"Resize not allowed in this mode",
								);
								return;
							}
							if (!consume(ctx.resizeBucket)) {
								sendError(ws, "rate-limited", "Resize rate limit exceeded");
								return;
							}
							ctx.viewer.resize(parsed.cols, parsed.rows);
							return;
						}
						case "runCommand": {
							if (!capabilities.runCommand) {
								sendError(ws, "capability-denied", "runCommand not allowed");
								return;
							}
							if (!consume(ctx.inputBucket)) {
								sendError(ws, "rate-limited", "Command rate limit exceeded");
								return;
							}
							ctx.viewer.runCommand(parsed.command);
							return;
						}
					}
				},

				onClose: (_event, _ws) => {
					if (ctx.unsubscribeRevoke) {
						try {
							ctx.unsubscribeRevoke();
						} catch {
							// best-effort
						}
						ctx.unsubscribeRevoke = null;
					}
					if (ctx.viewer) {
						try {
							ctx.viewer.detach();
						} catch {
							// best-effort
						}
						ctx.viewer = null;
					}
					if (ctx.viewerSocket) {
						removeViewer(sessionId, ctx.viewerSocket);
						ctx.viewerSocket = null;
					}
				},

				onError: (_event, _ws) => {
					if (ctx.viewer) {
						try {
							ctx.viewer.detach();
						} catch {
							// best-effort
						}
						ctx.viewer = null;
					}
				},
			};
		}),
	);
}
