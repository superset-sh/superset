import { VOICE_CONSTANTS } from "../config";

export interface MicrophoneCaptureOptions {
	sampleRate?: number;
	frameLength?: number;
	deviceIndex?: number;
}

export type FrameHandler = (frame: Int16Array) => void;

/**
 * Wraps PvRecorder for 16kHz mono PCM frame capture on macOS.
 *
 * Emits fixed-size Int16Array frames suitable for both Porcupine wake-word
 * detection and Whisper STT feeding. Recovery logic handles device disconnects
 * by attempting re-initialization after a backoff.
 */
export class MicrophoneCapture {
	private recorder: PvRecorderLike | null = null;
	private frameHandlers: FrameHandler[] = [];
	private running = false;
	private readonly sampleRate: number;
	private readonly frameLength: number;
	private readonly deviceIndex: number;

	constructor(options: MicrophoneCaptureOptions = {}) {
		this.sampleRate =
			options.sampleRate ?? VOICE_CONSTANTS.AUDIO_SAMPLE_RATE;
		this.frameLength =
			options.frameLength ?? VOICE_CONSTANTS.AUDIO_FRAME_LENGTH;
		this.deviceIndex = options.deviceIndex ?? -1;
	}

	onFrame(handler: FrameHandler): () => void {
		this.frameHandlers.push(handler);
		return () => {
			this.frameHandlers = this.frameHandlers.filter((h) => h !== handler);
		};
	}

	async start(): Promise<void> {
		if (this.running) return;

		this.recorder = await createPvRecorder(
			this.frameLength,
			this.deviceIndex,
		);
		this.running = true;
		this.recorder.start();
		this.captureLoop();
	}

	async stop(): Promise<void> {
		this.running = false;
		if (this.recorder) {
			this.recorder.stop();
			this.recorder.release();
			this.recorder = null;
		}
	}

	isRunning(): boolean {
		return this.running;
	}

	private async captureLoop(): Promise<void> {
		while (this.running && this.recorder) {
			try {
				const frame = await this.recorder.read();
				for (const handler of this.frameHandlers) {
					handler(frame);
				}
			} catch (error) {
				if (!this.running) break;
				console.error("[voice:mic] Frame read error, attempting recovery:", error);
				await this.attemptRecovery();
			}
		}
	}

	private async attemptRecovery(): Promise<void> {
		const BACKOFF_MS = 1_000;
		const MAX_RETRIES = 3;

		for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
			try {
				if (this.recorder) {
					try {
						this.recorder.stop();
						this.recorder.release();
					} catch {
						// Ignore cleanup errors during recovery
					}
				}

				await sleep(BACKOFF_MS * (attempt + 1));
				this.recorder = await createPvRecorder(
					this.frameLength,
					this.deviceIndex,
				);
				this.recorder.start();
				console.log("[voice:mic] Recovery successful on attempt", attempt + 1);
				return;
			} catch (error) {
				console.error(
					`[voice:mic] Recovery attempt ${attempt + 1} failed:`,
					error,
				);
			}
		}

		console.error("[voice:mic] All recovery attempts failed, stopping capture");
		this.running = false;
	}
}

// ─── PvRecorder adapter interface ────────────────────────────────────────────
// Allows dependency injection for testing without native bindings.

export interface PvRecorderLike {
	start(): void;
	stop(): void;
	read(): Promise<Int16Array>;
	release(): void;
}

/**
 * Creates a PvRecorder instance. Lazily imports the native module to avoid
 * crashing on platforms where it isn't available.
 */
async function createPvRecorder(
	frameLength: number,
	deviceIndex: number,
): Promise<PvRecorderLike> {
	try {
		const { PvRecorder } = await import("@picovoice/pvrecorder-node");
		return new PvRecorder(frameLength, deviceIndex);
	} catch (error) {
		throw new Error(
			`[voice:mic] PvRecorder unavailable. Ensure @picovoice/pvrecorder-node is installed. ${error}`,
		);
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
