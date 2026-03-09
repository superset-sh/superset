import { VOICE_CONSTANTS } from "../config";

export interface VadOptions {
	/** Silence threshold in ms before end-of-utterance is signaled */
	silenceThresholdMs?: number;
	/** RMS energy threshold below which a frame is considered silent */
	energyThreshold?: number;
}

export type VadEvent = "speech-start" | "speech-end";
export type VadEventHandler = (event: VadEvent) => void;

/**
 * Energy-based Voice Activity Detector for end-of-utterance detection.
 *
 * Operates on the same 16kHz mono Int16Array frames as MicrophoneCapture.
 * Uses RMS energy to distinguish speech from silence, then signals
 * end-of-utterance after a configurable silence duration.
 *
 * The silence threshold is mode-dependent:
 * - Wake mode: 1.5s (user is initiating, may pause between thoughts)
 * - Conversational mode: 0.7s (faster back-and-forth expected)
 */
export class VoiceActivityDetector {
	private handlers: VadEventHandler[] = [];
	private isSpeaking = false;
	private silenceStartMs: number | null = null;
	private silenceThresholdMs: number;
	private readonly energyThreshold: number;

	constructor(options: VadOptions = {}) {
		this.silenceThresholdMs =
			options.silenceThresholdMs ?? VOICE_CONSTANTS.VAD_SILENCE_WAKE_MS;
		this.energyThreshold = options.energyThreshold ?? 500;
	}

	onEvent(handler: VadEventHandler): () => void {
		this.handlers.push(handler);
		return () => {
			this.handlers = this.handlers.filter((h) => h !== handler);
		};
	}

	/**
	 * Set silence threshold for mode transitions.
	 * Call this when switching between wake and conversational modes.
	 */
	setSilenceThreshold(ms: number): void {
		this.silenceThresholdMs = ms;
	}

	/**
	 * Process a single audio frame. Returns the current VAD state.
	 */
	process(frame: Int16Array): { speaking: boolean; silenceDurationMs: number } {
		const energy = computeRmsEnergy(frame);
		const now = Date.now();

		if (energy >= this.energyThreshold) {
			// Speech detected
			this.silenceStartMs = null;

			if (!this.isSpeaking) {
				this.isSpeaking = true;
				this.emit("speech-start");
			}
		} else {
			// Silence detected
			if (this.isSpeaking) {
				if (this.silenceStartMs === null) {
					this.silenceStartMs = now;
				}

				const silenceDuration = now - this.silenceStartMs;
				if (silenceDuration >= this.silenceThresholdMs) {
					this.isSpeaking = false;
					this.silenceStartMs = null;
					this.emit("speech-end");
				}
			}
		}

		const silenceDurationMs =
			this.silenceStartMs !== null ? Date.now() - this.silenceStartMs : 0;

		return { speaking: this.isSpeaking, silenceDurationMs };
	}

	/**
	 * Returns a promise that resolves when end-of-utterance is detected.
	 * Useful for pipeline sequencing.
	 */
	waitForEnd(abortSignal?: AbortSignal): Promise<void> {
		return new Promise((resolve, reject) => {
			if (abortSignal?.aborted) {
				reject(new Error("Aborted"));
				return;
			}

			const unsubscribe = this.onEvent((event) => {
				if (event === "speech-end") {
					unsubscribe();
					if (abortSignal) {
						abortSignal.removeEventListener("abort", onAbort);
					}
					resolve();
				}
			});

			const onAbort = () => {
				unsubscribe();
				reject(new Error("Aborted"));
			};

			abortSignal?.addEventListener("abort", onAbort, { once: true });
		});
	}

	reset(): void {
		this.isSpeaking = false;
		this.silenceStartMs = null;
	}

	private emit(event: VadEvent): void {
		for (const handler of this.handlers) {
			handler(event);
		}
	}
}

/**
 * Compute RMS (root-mean-square) energy for a 16-bit PCM frame.
 * Higher values indicate louder audio / more likely speech.
 */
function computeRmsEnergy(frame: Int16Array): number {
	if (frame.length === 0) return 0;

	let sum = 0;
	for (let i = 0; i < frame.length; i++) {
		sum += frame[i] * frame[i];
	}

	return Math.sqrt(sum / frame.length);
}
