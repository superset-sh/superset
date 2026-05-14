import type { NodeWebSocket } from "@hono/node-ws";
import {
	capabilitiesForMode,
	REMOTE_CONTROL_INPUT_RATE_PER_SEC,
	REMOTE_CONTROL_RESIZE_RATE_PER_SEC,
	REMOTE_CONTROL_TOKEN_PARAM,
	type RemoteControlClientMessage,
	type RemoteControlErrorCode,
	type RemoteControlMode,
	type RemoteControlServerMessage,
} from "@superset/shared/remote-control-protocol";
import type { Hono } from "hono";
import { z } from "zod";
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

// Runtime validation for inbound WebSocket payloads. Without this, a
// malformed `runCommand` (no `command` field) or `resize` (string `cols`)
// would propagate as an uncaught exception out of `onMessage`. Mirrors
// `RemoteControlClientMessage` in `@superset/shared/remote-control-protocol`.
const clientMessageSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("ping"), nonce: z.string().optional() }),
	z.object({ type: z.literal("stop") }),
	z.object({ type: z.literal("input"), data: z.string() }),
	z.object({
		type: z.literal("resize"),
		cols: z.number().int().positive(),
		rows: z.number().int().positive(),
	}),
	z.object({
		type: z.literal("runCommand"),
		command: z.string(),
		commandId: z.string().optional(),
	}),
]);

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

function nowSec(): number {
	return Math.floor(Date.now() / 1000);
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
				// Cached at handshake — `authenticateSession` re-hashes the
				// HMAC every call, which we do NOT want at 200 msg/s/viewer.
				// Per-message handling now just checks `expiresAt` against now.
				authedMode: RemoteControlMode | null;
				expiresAt: number | null;
				cleaned: boolean;
			} = {
				viewer: null,
				listener: null,
				viewerSocket: null,
				unsubscribeRevoke: null,
				inputBucket: makeBucket(REMOTE_CONTROL_INPUT_RATE_PER_SEC),
				resizeBucket: makeBucket(REMOTE_CONTROL_RESIZE_RATE_PER_SEC),
				authedMode: null,
				expiresAt: null,
				cleaned: false,
			};

			// Single cleanup path. `onClose` and `onError` both delegate here —
			// `onError` may fire without a subsequent `onClose` on abrupt
			// teardown, so we cannot rely on `onClose` alone. `cleaned` makes
			// it idempotent.
			const cleanup = (): void => {
				if (ctx.cleaned) return;
				ctx.cleaned = true;
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
					ctx.authedMode = auth.mode;
					ctx.expiresAt = auth.expiresAt;

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
					if (!ctx.viewer || ctx.authedMode === null) return;
					let raw: unknown;
					try {
						raw = JSON.parse(String(event.data));
					} catch {
						sendError(ws, "internal", "Invalid message payload");
						return;
					}
					const validated = clientMessageSchema.safeParse(raw);
					if (!validated.success) {
						sendError(ws, "internal", "Invalid message payload");
						return;
					}
					const parsed: RemoteControlClientMessage = validated.data;

					// Lightweight expiry check — handshake already verified the
					// HMAC + token-hash. Re-running them per message at 200/s
					// is wasted CPU.
					if (ctx.expiresAt !== null && ctx.expiresAt <= nowSec()) {
						sendError(ws, "session-expired", "Session expired");
						ws.close(1008, "session-expired");
						return;
					}
					const capabilities = capabilitiesForMode(ctx.authedMode);

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
							try {
								ctx.viewer.resize(parsed.cols, parsed.rows);
							} catch (err) {
								console.warn("[remote-control] resize failed:", err);
								sendError(ws, "internal", "Failed to resize");
							}
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
							try {
								ctx.viewer.runCommand(parsed.command);
							} catch (err) {
								console.warn("[remote-control] runCommand failed:", err);
								sendError(ws, "internal", "Failed to run command");
							}
							return;
						}
					}
				},

				onClose: (_event, _ws) => {
					cleanup();
				},

				onError: (_event, _ws) => {
					cleanup();
				},
			};
		}),
	);
}
