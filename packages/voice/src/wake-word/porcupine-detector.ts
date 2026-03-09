import { VOICE_CONSTANTS } from "../config";

export interface PorcupineDetectorOptions {
	accessKey: string;
	sensitivity?: number;
	/** Path to custom wake-word model (.ppn). Uses built-in "superset" if omitted. */
	keywordPath?: string;
}

export type WakeHandler = () => void;

/**
 * Wraps Porcupine for wake-word detection on 16kHz mono PCM frames.
 *
 * Accepts the same Int16Array frames emitted by MicrophoneCapture and fires
 * a callback when the wake phrase is detected. Sensitivity is configurable
 * via VoiceConfig.wakeWordSensitivity.
 */
export class PorcupineDetector {
	private porcupine: PorcupineLike | null = null;
	private wakeHandlers: WakeHandler[] = [];
	private readonly options: PorcupineDetectorOptions;

	constructor(options: PorcupineDetectorOptions) {
		this.options = options;
	}

	onWake(handler: WakeHandler): () => void {
		this.wakeHandlers.push(handler);
		return () => {
			this.wakeHandlers = this.wakeHandlers.filter((h) => h !== handler);
		};
	}

	async init(): Promise<void> {
		this.porcupine = await createPorcupine(this.options);
	}

	/**
	 * Process a single audio frame. Call this from MicrophoneCapture.onFrame().
	 * Returns true if wake word was detected in this frame.
	 */
	process(frame: Int16Array): boolean {
		if (!this.porcupine) {
			throw new Error("[voice:wake] Porcupine not initialized. Call init() first.");
		}

		const keywordIndex = this.porcupine.process(frame);

		if (keywordIndex >= 0) {
			for (const handler of this.wakeHandlers) {
				handler();
			}
			return true;
		}

		return false;
	}

	async release(): Promise<void> {
		if (this.porcupine) {
			this.porcupine.release();
			this.porcupine = null;
		}
	}

	get frameLength(): number {
		return this.porcupine?.frameLength ?? VOICE_CONSTANTS.AUDIO_FRAME_LENGTH;
	}
}

// ─── Porcupine adapter interface ─────────────────────────────────────────────

export interface PorcupineLike {
	process(frame: Int16Array): number;
	release(): void;
	frameLength: number;
}

async function createPorcupine(
	options: PorcupineDetectorOptions,
): Promise<PorcupineLike> {
	try {
		const { Porcupine } = await import("@picovoice/porcupine-node");

		if (options.keywordPath) {
			return new Porcupine(
				options.accessKey,
				[options.keywordPath],
				[options.sensitivity ?? 0.5],
			);
		}

		// Use built-in keyword — "computer" as default until custom model is trained
		const {
			COMPUTER,
		} = await import("@picovoice/porcupine-node/builtin_keywords");
		return new Porcupine(
			options.accessKey,
			[COMPUTER],
			[options.sensitivity ?? 0.5],
		);
	} catch (error) {
		throw new Error(
			`[voice:wake] Porcupine unavailable. Ensure @picovoice/porcupine-node is installed. ${error}`,
		);
	}
}
