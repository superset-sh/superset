export enum PtySubprocessIpcType {
	// Daemon -> subprocess commands
	Spawn = 1,
	Write = 2,
	Resize = 3,
	Kill = 4,
	Dispose = 5,
	Signal = 6, // Send signal without marking as terminating (e.g., SIGINT)

	// Subprocess -> daemon events
	Ready = 101,
	Spawned = 102,
	Data = 103,
	Exit = 104,
	Error = 105,
}

export interface PtySubprocessFrame {
	type: PtySubprocessIpcType;
	payload: Buffer;
}

const HEADER_BYTES = 5;
const EMPTY_PAYLOAD = Buffer.alloc(0);

// Hard cap to avoid OOM if the stream is corrupted.
// PTY data is untrusted input in practice (terminal apps can emit arbitrarily).
const MAX_FRAME_BYTES = 64 * 1024 * 1024; // 64MB

export function createFrameHeader(
	type: PtySubprocessIpcType,
	payloadLength: number,
): Buffer {
	const header = Buffer.allocUnsafe(HEADER_BYTES);
	header.writeUInt8(type, 0);
	header.writeUInt32LE(payloadLength, 1);
	return header;
}

export function writeFrame(
	writable: NodeJS.WritableStream,
	type: PtySubprocessIpcType,
	payload?: Buffer,
): boolean {
	const payloadBuffer = payload ?? EMPTY_PAYLOAD;
	const header = createFrameHeader(type, payloadBuffer.length);

	let canWrite = writable.write(header);

	// Always write payload even if the header write returns false.
	// Backpressure is represented by the return value + 'drain' events.
	if (payloadBuffer.length > 0) {
		canWrite = writable.write(payloadBuffer) && canWrite;
	}

	return canWrite;
}

export class PtySubprocessFrameDecoder {
	private header = Buffer.allocUnsafe(HEADER_BYTES);
	private headerOffset = 0;
	private frameType: PtySubprocessIpcType | null = null;
	private payload: Buffer | null = null;
	private payloadOffset = 0;

	push(chunk: Buffer): PtySubprocessFrame[] {
		const frames: PtySubprocessFrame[] = [];

		let offset = 0;
		while (offset < chunk.length) {
			if (this.payload === null) {
				const headerNeeded = HEADER_BYTES - this.headerOffset;
				const available = chunk.length - offset;
				const toCopy = Math.min(headerNeeded, available);

				chunk.copy(this.header, this.headerOffset, offset, offset + toCopy);
				this.headerOffset += toCopy;
				offset += toCopy;

				if (this.headerOffset < HEADER_BYTES) {
					continue;
				}

				const type = this.header.readUInt8(0) as PtySubprocessIpcType;
				const payloadLength = this.header.readUInt32LE(1);

				if (payloadLength > MAX_FRAME_BYTES) {
					throw new Error(
						`PtySubprocess IPC frame too large: ${payloadLength} bytes`,
					);
				}

				this.frameType = type;
				this.payload =
					payloadLength > 0 ? Buffer.allocUnsafe(payloadLength) : null;
				this.payloadOffset = 0;
				this.headerOffset = 0;

				if (payloadLength === 0) {
					frames.push({ type, payload: EMPTY_PAYLOAD });
					this.frameType = null;
				}
			} else {
				const payloadNeeded = this.payload.length - this.payloadOffset;
				const available = chunk.length - offset;
				const toCopy = Math.min(payloadNeeded, available);

				chunk.copy(this.payload, this.payloadOffset, offset, offset + toCopy);
				this.payloadOffset += toCopy;
				offset += toCopy;

				if (this.payloadOffset < this.payload.length) {
					continue;
				}

				const type = this.frameType ?? PtySubprocessIpcType.Error;
				const payload = this.payload;

				this.frameType = null;
				this.payload = null;
				this.payloadOffset = 0;

				frames.push({ type, payload });
			}
		}

		return frames;
	}
}
