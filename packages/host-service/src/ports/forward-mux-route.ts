import net from "node:net";
import type { NodeWebSocket } from "@hono/node-ws";
import type { DetectedPort } from "@superset/port-scanner";
import {
	decodeMuxFrame,
	decodeOpenPort,
	decodeWindowDelta,
	encodeClose,
	encodeData,
	encodeEof,
	encodeHello,
	encodeOpened,
	encodeOpenFail,
	encodePong,
	encodeWindow,
	MUX_INITIAL_WINDOW_BYTES,
	MUX_MAX_DATA_BYTES,
	MUX_MAX_STREAMS,
	MuxFrameType,
	MuxOpenFailCode,
} from "@superset/shared/port-forward-mux";
import type { Hono } from "hono";
import type { WSContext } from "hono/ws";

export interface RegisterForwardMuxRouteOptions {
	app: Hono;
	upgradeWebSocket: NodeWebSocket["upgradeWebSocket"];
	getPortsByWorkspace: (workspaceId: string) => DetectedPort[];
}

interface StreamState {
	socket: net.Socket;
	connected: boolean;
	/** DATA that arrived before the upstream socket connected. Flow control
	 *  bounds it: the peer cannot have more than a window in flight. */
	preConnect: Buffer[];
	/** Bytes we may still send toward the desktop before it credits us. */
	sendWindow: number;
	/** Upstream chunks waiting for send-window; coalesced when drained. */
	sendQueue: Buffer[];
	sendQueuedBytes: number;
	/** Bytes written into the upstream socket but not yet credited back. */
	uncredited: number;
	creditScheduled: boolean;
}

/**
 * One WebSocket per (workspace) forward session, many TCP connections inside
 * it — see @superset/shared/port-forward-mux for the framing. The relay
 * splices this stream verbatim, exactly like a terminal: it never learns
 * multiplexing is happening, so it needs no changes and its single-use dial
 * tickets keep their existing lifetime.
 *
 * Only ports the port scanner attributes to the requested workspace are
 * reachable, checked per OPEN so a port that appears mid-session forwards
 * without a reconnect.
 */
export function registerForwardMuxRoute({
	app,
	upgradeWebSocket,
	getPortsByWorkspace,
}: RegisterForwardMuxRouteOptions) {
	app.get(
		"/fwd",
		upgradeWebSocket((c) => {
			const workspaceId = c.req.query("workspaceId") ?? "";
			const streams = new Map<number, StreamState>();
			let closed = false;

			const teardown = () => {
				closed = true;
				for (const state of streams.values()) state.socket.destroy();
				streams.clear();
			};

			const closeStream = (
				ws: WSContext,
				streamId: number,
				state: StreamState,
				notifyPeer: boolean,
			) => {
				streams.delete(streamId);
				state.socket.destroy();
				if (notifyPeer && !closed) ws.send(asFrame(encodeClose(streamId)));
			};

			// Credits are flushed once per tick so a burst of small writes
			// becomes one WINDOW frame instead of many.
			const scheduleCredit = (
				ws: WSContext,
				streamId: number,
				state: StreamState,
			) => {
				if (state.creditScheduled) return;
				state.creditScheduled = true;
				setImmediate(() => {
					state.creditScheduled = false;
					if (closed || !streams.has(streamId)) return;
					// A backed-up upstream socket holds credits until it drains, so
					// TCP backpressure on the host propagates to the desktop.
					if (state.socket.writableNeedDrain) return;
					if (state.uncredited > 0) {
						ws.send(asFrame(encodeWindow(streamId, state.uncredited)));
						state.uncredited = 0;
					}
				});
			};

			// Sending toward the desktop spends send-window; when it runs out the
			// upstream socket pauses. WINDOW credits drain the queue coalesced.
			const pumpSend = (
				ws: WSContext,
				streamId: number,
				state: StreamState,
			) => {
				while (state.sendQueue.length > 0 && state.sendWindow > 0) {
					const budget = Math.min(state.sendWindow, MUX_MAX_DATA_BYTES);
					let chunk = state.sendQueue.shift();
					if (!chunk) break;
					if (chunk.byteLength > budget) {
						state.sendQueue.unshift(chunk.subarray(budget));
						chunk = chunk.subarray(0, budget);
					} else {
						// Coalesce whole queued chunks into this frame while they fit.
						let next = state.sendQueue[0];
						while (next && chunk.byteLength + next.byteLength <= budget) {
							state.sendQueue.shift();
							chunk = Buffer.concat([chunk, next]);
							next = state.sendQueue[0];
						}
					}
					state.sendQueuedBytes -= chunk.byteLength;
					state.sendWindow -= chunk.byteLength;
					ws.send(asFrame(encodeData(streamId, chunk)));
				}
				if (state.sendQueuedBytes < MUX_INITIAL_WINDOW_BYTES) {
					state.socket.resume();
				}
			};

			const handleOpen = (ws: WSContext, streamId: number, port: number) => {
				if (streams.has(streamId)) {
					ws.close(1002, "stream id reused");
					teardown();
					return;
				}
				if (streams.size >= MUX_MAX_STREAMS) {
					ws.send(
						asFrame(
							encodeOpenFail(
								streamId,
								MuxOpenFailCode.streamLimit,
								"too many concurrent connections",
							),
						),
					);
					return;
				}
				const detected = getPortsByWorkspace(workspaceId).find(
					(p) => p.port === port,
				);
				if (!detected) {
					ws.send(
						asFrame(
							encodeOpenFail(
								streamId,
								MuxOpenFailCode.portNotOwned,
								"port not owned by workspace",
							),
						),
					);
					return;
				}

				const socket = net.connect({
					host: connectAddressFor(detected.address),
					port,
				});
				const state: StreamState = {
					socket,
					connected: false,
					preConnect: [],
					sendWindow: MUX_INITIAL_WINDOW_BYTES,
					sendQueue: [],
					sendQueuedBytes: 0,
					uncredited: 0,
					creditScheduled: false,
				};
				streams.set(streamId, state);

				socket.on("connect", () => {
					state.connected = true;
					for (const chunk of state.preConnect) {
						socket.write(chunk);
						state.uncredited += chunk.byteLength;
					}
					state.preConnect = [];
					if (state.uncredited > 0) scheduleCredit(ws, streamId, state);
					if (!closed) ws.send(asFrame(encodeOpened(streamId)));
				});
				socket.on("data", (chunk: Buffer) => {
					state.sendQueue.push(chunk);
					state.sendQueuedBytes += chunk.byteLength;
					pumpSend(ws, streamId, state);
					if (state.sendQueuedBytes >= MUX_INITIAL_WINDOW_BYTES) {
						socket.pause();
					}
				});
				socket.on("drain", () => scheduleCredit(ws, streamId, state));
				socket.on("end", () => {
					if (!closed && streams.has(streamId)) {
						ws.send(asFrame(encodeEof(streamId)));
					}
				});
				socket.on("close", () => {
					if (streams.has(streamId)) {
						closeStream(ws, streamId, state, true);
					}
				});
				socket.on("error", (err: NodeJS.ErrnoException) => {
					if (!state.connected && streams.has(streamId)) {
						streams.delete(streamId);
						if (!closed) {
							ws.send(
								asFrame(
									encodeOpenFail(
										streamId,
										MuxOpenFailCode.connectFailed,
										`connect failed: ${err.code ?? err.message}`,
									),
								),
							);
						}
					}
					socket.destroy();
				});
			};

			return {
				onOpen: (_event, ws) => {
					if (!workspaceId) {
						ws.close(1008, "workspaceId is required");
						return;
					}
					ws.send(asFrame(encodeHello()));
				},
				onMessage: (event, ws) => {
					if (typeof event.data === "string") {
						ws.close(1003, "text frames not supported");
						teardown();
						return;
					}
					const frame = decodeMuxFrame(toBuffer(event.data));
					if (!frame) {
						ws.close(1002, "malformed frame");
						teardown();
						return;
					}

					if (frame.type === MuxFrameType.ping) {
						ws.send(asFrame(encodePong()));
						return;
					}
					if (frame.type === MuxFrameType.open) {
						const port = decodeOpenPort(frame);
						if (port === null) {
							ws.close(1002, "malformed open");
							teardown();
							return;
						}
						handleOpen(ws, frame.streamId, port);
						return;
					}

					const state = streams.get(frame.streamId);
					// Frames for a stream we already tore down race with our CLOSE
					// in flight; drop them rather than error the session.
					if (!state) return;

					switch (frame.type) {
						case MuxFrameType.data: {
							const chunk = Buffer.from(
								frame.payload.buffer,
								frame.payload.byteOffset,
								frame.payload.byteLength,
							);
							if (state.connected) {
								state.socket.write(chunk);
								state.uncredited += chunk.byteLength;
								scheduleCredit(ws, frame.streamId, state);
							} else {
								state.preConnect.push(Buffer.from(chunk));
								const buffered = state.preConnect.reduce(
									(n, b) => n + b.byteLength,
									0,
								);
								// More than a window before OPENED is a protocol
								// violation, not congestion.
								if (buffered > MUX_INITIAL_WINDOW_BYTES) {
									closeStream(ws, frame.streamId, state, true);
								}
							}
							return;
						}
						case MuxFrameType.window: {
							const delta = decodeWindowDelta(frame);
							if (delta !== null) {
								state.sendWindow += delta;
								pumpSend(ws, frame.streamId, state);
							}
							return;
						}
						case MuxFrameType.eof: {
							state.socket.end();
							return;
						}
						case MuxFrameType.close: {
							closeStream(ws, frame.streamId, state, false);
							return;
						}
						default:
							return;
					}
				},
				onClose: teardown,
				onError: teardown,
			};
		}),
	);
}

// A server bound to the v6 loopback only (Vite 8's default `localhost` bind
// on some systems) refuses 127.0.0.1; dial the address the scanner actually
// saw. Wildcard binds accept loopback, so those map to 127.0.0.1.
function connectAddressFor(address: string): string {
	const normalized = address.toLowerCase();
	if (
		normalized === "" ||
		normalized === "*" ||
		normalized === "0.0.0.0" ||
		normalized === "localhost" ||
		normalized === "::" ||
		normalized === "0:0:0:0:0:0:0:0"
	) {
		return "127.0.0.1";
	}
	return address;
}

// Node's Buffer is typed over ArrayBufferLike; the ws send signature wants a
// plain ArrayBuffer view. These bytes never sit on a SharedArrayBuffer, so
// the view is the same bytes with a narrower type — no copy.
function asFrame(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
	return bytes as Uint8Array<ArrayBuffer>;
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
