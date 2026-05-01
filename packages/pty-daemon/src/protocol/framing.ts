// Length-prefixed binary frames over a SOCK_STREAM socket.
//
// Wire: [u32 BE length][JSON UTF-8 payload of that length]

const HEADER_BYTES = 4;
const MAX_FRAME_BYTES = 8 * 1024 * 1024; // 8 MB hard cap; abort the connection above this.

export function encodeFrame(message: unknown): Buffer {
	const json = JSON.stringify(message);
	const payload = Buffer.from(json, "utf8");
	const header = Buffer.alloc(HEADER_BYTES);
	header.writeUInt32BE(payload.byteLength, 0);
	return Buffer.concat([header, payload]);
}

/**
 * Streaming decoder. Feed bytes via `push`; iterate completed frames via `drain`.
 * Throws on oversized frames so a malformed peer can't exhaust memory.
 */
export class FrameDecoder {
	private buf: Buffer = Buffer.alloc(0);

	push(chunk: Buffer): void {
		this.buf = this.buf.length === 0 ? chunk : Buffer.concat([this.buf, chunk]);
	}

	drain(): unknown[] {
		const out: unknown[] = [];
		while (this.buf.length >= HEADER_BYTES) {
			const len = this.buf.readUInt32BE(0);
			if (len > MAX_FRAME_BYTES) {
				throw new Error(`frame too large: ${len} bytes`);
			}
			if (this.buf.length < HEADER_BYTES + len) break;
			const payload = this.buf.subarray(HEADER_BYTES, HEADER_BYTES + len);
			out.push(JSON.parse(payload.toString("utf8")));
			this.buf = this.buf.subarray(HEADER_BYTES + len);
		}
		return out;
	}
}

/**
 * One-shot decode of a buffer that contains exactly one complete frame.
 * Used by tests; production reads use FrameDecoder.
 */
export function decodeFrame(buf: Buffer): unknown {
	if (buf.length < HEADER_BYTES) throw new Error("short frame");
	const len = buf.readUInt32BE(0);
	if (buf.length !== HEADER_BYTES + len) {
		throw new Error(
			`frame length mismatch: header=${len} buf=${buf.length - HEADER_BYTES}`,
		);
	}
	return JSON.parse(buf.subarray(HEADER_BYTES).toString("utf8"));
}
