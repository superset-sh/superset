// Length-prefixed binary frames over a SOCK_STREAM socket.
//
// Wire layout:
//
//   [u32 BE totalLen] [u32 BE jsonLen] [json bytes (UTF-8)] [payload bytes]
//                     └────── totalLen counts everything from here ──────┘
//
// `payloadLen = totalLen - 4 - jsonLen` (implicit). A frame with `jsonLen
// === totalLen - 4` carries no payload — every control message looks
// exactly like that.
//
// PTY input/output bytes ride in the payload tail rather than being
// base64-stuffed inside the JSON. ~33% less wire for high-volume PTY
// output, and zero encode/decode passes per chunk on either side.

const HEADER_BYTES = 4;
const INNER_JSON_LEN_BYTES = 4;
const MAX_FRAME_BYTES = 8 * 1024 * 1024; // 8 MB hard cap; abort the connection above this.

export interface DecodedFrame {
	message: unknown;
	/** Optional binary tail — `null` when the frame carries only JSON. */
	payload: Uint8Array | null;
}

export function encodeFrame(message: unknown, payload?: Uint8Array): Buffer {
	const json = JSON.stringify(message);
	const jsonBytes = Buffer.from(json, "utf8");
	const payloadLen = payload?.byteLength ?? 0;
	const totalLen = INNER_JSON_LEN_BYTES + jsonBytes.byteLength + payloadLen;

	const out = Buffer.alloc(HEADER_BYTES + totalLen);
	out.writeUInt32BE(totalLen, 0);
	out.writeUInt32BE(jsonBytes.byteLength, HEADER_BYTES);
	jsonBytes.copy(out, HEADER_BYTES + INNER_JSON_LEN_BYTES);
	if (payload && payload.byteLength > 0) {
		out.set(
			payload,
			HEADER_BYTES + INNER_JSON_LEN_BYTES + jsonBytes.byteLength,
		);
	}
	return out;
}

/**
 * Streaming decoder. Feed bytes via `push`; iterate completed frames via `drain`.
 * Throws on oversized or malformed frames so a misbehaving peer can't
 * exhaust memory or trick the receiver into reading off the end.
 */
export class FrameDecoder {
	private buf: Buffer = Buffer.alloc(0);

	push(chunk: Buffer): void {
		this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
	}

	drain(): DecodedFrame[] {
		const out: DecodedFrame[] = [];
		while (this.buf.length >= HEADER_BYTES) {
			const totalLen = this.buf.readUInt32BE(0);
			if (totalLen > MAX_FRAME_BYTES) {
				throw new Error(`frame too large: ${totalLen} bytes`);
			}
			if (totalLen < INNER_JSON_LEN_BYTES) {
				throw new Error(`frame too small: ${totalLen} bytes (need ≥4)`);
			}
			if (this.buf.length < HEADER_BYTES + totalLen) break;

			const jsonLen = this.buf.readUInt32BE(HEADER_BYTES);
			if (jsonLen > totalLen - INNER_JSON_LEN_BYTES) {
				throw new Error(
					`frame jsonLen ${jsonLen} exceeds frame body ${totalLen - INNER_JSON_LEN_BYTES}`,
				);
			}

			const jsonStart = HEADER_BYTES + INNER_JSON_LEN_BYTES;
			const payloadStart = jsonStart + jsonLen;
			const frameEnd = HEADER_BYTES + totalLen;

			const message = JSON.parse(
				this.buf.subarray(jsonStart, payloadStart).toString("utf8"),
			);
			let payload: Uint8Array | null = null;
			if (payloadStart < frameEnd) {
				// Copy the payload out of the streaming buffer so advancing
				// past this frame can't strand the slice's underlying memory
				// and so callers see a stable view they can hold onto.
				const view = this.buf.subarray(payloadStart, frameEnd);
				payload = new Uint8Array(view.length);
				payload.set(view, 0);
			}
			out.push({ message, payload });
			this.buf = this.buf.subarray(frameEnd);
		}
		return out;
	}
}

/**
 * One-shot decode of a buffer that contains exactly one complete frame.
 * Used by tests; production reads use FrameDecoder.
 */
export function decodeFrame(buf: Buffer): DecodedFrame {
	if (buf.length < HEADER_BYTES + INNER_JSON_LEN_BYTES) {
		throw new Error("short frame");
	}
	const totalLen = buf.readUInt32BE(0);
	if (buf.length !== HEADER_BYTES + totalLen) {
		throw new Error(
			`frame length mismatch: header=${totalLen} buf=${buf.length - HEADER_BYTES}`,
		);
	}
	const jsonLen = buf.readUInt32BE(HEADER_BYTES);
	if (jsonLen > totalLen - INNER_JSON_LEN_BYTES) {
		throw new Error(
			`frame jsonLen ${jsonLen} exceeds frame body ${totalLen - INNER_JSON_LEN_BYTES}`,
		);
	}
	const jsonStart = HEADER_BYTES + INNER_JSON_LEN_BYTES;
	const payloadStart = jsonStart + jsonLen;
	const message = JSON.parse(
		buf.subarray(jsonStart, payloadStart).toString("utf8"),
	);
	let payload: Uint8Array | null = null;
	if (payloadStart < buf.length) {
		const view = buf.subarray(payloadStart);
		payload = new Uint8Array(view.length);
		payload.set(view, 0);
	}
	return { message, payload };
}
