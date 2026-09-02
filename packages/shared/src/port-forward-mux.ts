// Port-forward mux: many TCP connections over one relay stream.
//
// The desktop opens a single WebSocket per (host, workspace) — spliced
// through the relay exactly like a terminal stream — and every forwarded TCP
// connection becomes a numbered stream inside it. The relay never parses any
// of this; both endpoints are ours. Establishing a connection therefore costs
// one OPEN frame on a warm pipe instead of a full relay dial-back.
//
// Framing (big-endian):
//   [type u8][streamId u32][payload]
//
// Stream ids are allocated by the desktop only, starting at 1. Id 0 is the
// session itself (HELLO, PING, PONG).
//
// Flow control is per-stream, credit-based: each direction may have at most
// INITIAL_WINDOW bytes of DATA in flight; the receiver returns WINDOW(delta)
// as it hands bytes to its local socket. Control frames are never subject to
// flow control — a starved WINDOW is the classic mux deadlock.

export const MUX_PROTOCOL_VERSION = 1;

/** Largest DATA payload. Well under the relay's 1 MiB per-message ceiling. */
export const MUX_MAX_DATA_BYTES = 256 * 1024;

/** Per-stream, per-direction in-flight byte budget. */
export const MUX_INITIAL_WINDOW_BYTES = 1024 * 1024;

/** Concurrent streams one session will admit; OPEN beyond it is refused. */
export const MUX_MAX_STREAMS = 128;

/** Session keepalive cadence; Cloudflare idles silent WebSockets out. */
export const MUX_PING_INTERVAL_MS = 30_000;

/** A session with no PONG for this long is presumed dead. */
export const MUX_PONG_TIMEOUT_MS = 90_000;

export const MUX_SESSION_STREAM_ID = 0;

export const MuxFrameType = {
	hello: 0x00,
	open: 0x01,
	opened: 0x02,
	openFail: 0x03,
	data: 0x04,
	eof: 0x05,
	close: 0x06,
	window: 0x07,
	ping: 0x08,
	pong: 0x09,
} as const;

export type MuxFrameTypeValue =
	(typeof MuxFrameType)[keyof typeof MuxFrameType];

export const MuxOpenFailCode = {
	portNotOwned: 1,
	connectFailed: 2,
	streamLimit: 3,
} as const;

export type MuxOpenFailCodeValue =
	(typeof MuxOpenFailCode)[keyof typeof MuxOpenFailCode];

export interface MuxFrame {
	type: MuxFrameTypeValue;
	streamId: number;
	payload: Uint8Array;
}

const HEADER_BYTES = 5;

const KNOWN_TYPES = new Set<number>(Object.values(MuxFrameType));

function frame(
	type: MuxFrameTypeValue,
	streamId: number,
	payload?: Uint8Array,
): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(
		new ArrayBuffer(HEADER_BYTES + (payload?.byteLength ?? 0)),
	);
	const view = new DataView(out.buffer);
	view.setUint8(0, type);
	view.setUint32(1, streamId);
	if (payload) out.set(payload, HEADER_BYTES);
	return out;
}

export function encodeHello(): Uint8Array<ArrayBuffer> {
	return frame(
		MuxFrameType.hello,
		MUX_SESSION_STREAM_ID,
		Uint8Array.of(MUX_PROTOCOL_VERSION),
	);
}

export function encodeOpen(
	streamId: number,
	port: number,
): Uint8Array<ArrayBuffer> {
	const payload = new Uint8Array(2);
	new DataView(payload.buffer).setUint16(0, port);
	return frame(MuxFrameType.open, streamId, payload);
}

export function encodeOpened(streamId: number): Uint8Array<ArrayBuffer> {
	return frame(MuxFrameType.opened, streamId);
}

export function encodeOpenFail(
	streamId: number,
	code: MuxOpenFailCodeValue,
	message: string,
): Uint8Array<ArrayBuffer> {
	const text = new TextEncoder().encode(message);
	const payload = new Uint8Array(1 + text.byteLength);
	payload[0] = code;
	payload.set(text, 1);
	return frame(MuxFrameType.openFail, streamId, payload);
}

export function encodeData(
	streamId: number,
	bytes: Uint8Array,
): Uint8Array<ArrayBuffer> {
	return frame(MuxFrameType.data, streamId, bytes);
}

export function encodeEof(streamId: number): Uint8Array<ArrayBuffer> {
	return frame(MuxFrameType.eof, streamId);
}

export function encodeClose(streamId: number): Uint8Array<ArrayBuffer> {
	return frame(MuxFrameType.close, streamId);
}

export function encodeWindow(
	streamId: number,
	delta: number,
): Uint8Array<ArrayBuffer> {
	const payload = new Uint8Array(4);
	new DataView(payload.buffer).setUint32(0, delta);
	return frame(MuxFrameType.window, streamId, payload);
}

export function encodePing(): Uint8Array<ArrayBuffer> {
	return frame(MuxFrameType.ping, MUX_SESSION_STREAM_ID);
}

export function encodePong(): Uint8Array<ArrayBuffer> {
	return frame(MuxFrameType.pong, MUX_SESSION_STREAM_ID);
}

/** Returns null for anything malformed; the endpoint treats that as fatal. */
export function decodeMuxFrame(data: Uint8Array): MuxFrame | null {
	if (data.byteLength < HEADER_BYTES) return null;
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	const type = view.getUint8(0);
	if (!KNOWN_TYPES.has(type)) return null;
	return {
		type: type as MuxFrameTypeValue,
		streamId: view.getUint32(1),
		payload: data.subarray(HEADER_BYTES),
	};
}

export function decodeHelloVersion(f: MuxFrame): number | null {
	const version = f.payload[0];
	return f.payload.byteLength === 1 && version !== undefined ? version : null;
}

export function decodeOpenPort(f: MuxFrame): number | null {
	if (f.payload.byteLength !== 2) return null;
	const port = new DataView(
		f.payload.buffer,
		f.payload.byteOffset,
		2,
	).getUint16(0);
	return port > 0 ? port : null;
}

export function decodeOpenFail(f: MuxFrame): {
	code: number;
	message: string;
} {
	const code = f.payload[0];
	if (code === undefined) return { code: 0, message: "open failed" };
	return {
		code,
		message: new TextDecoder().decode(f.payload.subarray(1)) || "open failed",
	};
}

export function decodeWindowDelta(f: MuxFrame): number | null {
	if (f.payload.byteLength !== 4) return null;
	const delta = new DataView(
		f.payload.buffer,
		f.payload.byteOffset,
		4,
	).getUint32(0);
	return delta > 0 ? delta : null;
}
