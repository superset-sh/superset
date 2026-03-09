import {
	DEFAULT_VOCABULARY_HINTS,
	VOICE_CONSTANTS,
} from "../config";
import type {
	SttMode,
	VocabularyHints,
	WhisperModel,
} from "../types";

// ─── Transcriber Interface ───────────────────────────────────────────────────

export interface TranscriberOptions {
	model?: WhisperModel;
	mode?: SttMode;
	/** Path to the Whisper model binary */
	modelPath?: string;
}

export interface TranscriptionResult {
	text: string;
	durationMs: number;
	mode: SttMode;
}

export interface VocabularyHintProvider {
	getVocabularyHints(): VocabularyHints;
}

/**
 * Whisper-based transcriber with dynamic vocabulary priming.
 *
 * Supports two modes:
 * - `batch`: Collects all audio then transcribes (reliable, higher latency)
 * - `streaming`: Feeds frames incrementally (lower latency, requires binding support)
 *
 * Vocabulary priming via Whisper's `initial_prompt` parameter biases recognition
 * toward project-specific terms (workspace names, branch names, technical vocabulary)
 * with near-zero latency cost.
 */
export class WhisperTranscriber {
	private readonly model: WhisperModel;
	private readonly preferredMode: SttMode;
	private readonly modelPath: string | undefined;
	private actualMode: SttMode;
	private streamingSupported: boolean | null = null;
	private audioBuffer: Int16Array[] = [];
	private hintProvider: VocabularyHintProvider | null = null;

	// Metrics
	private modeFailbackCount = 0;

	constructor(options: TranscriberOptions = {}) {
		this.model = options.model ?? "base.en";
		this.preferredMode = options.mode ?? "batch";
		this.modelPath = options.modelPath;
		this.actualMode = this.preferredMode;
	}

	setHintProvider(provider: VocabularyHintProvider): void {
		this.hintProvider = provider;
	}

	/**
	 * Feed an audio frame for incremental processing.
	 * In batch mode, frames are buffered. In streaming mode, they're processed live.
	 */
	feed(frame: Int16Array): void {
		this.audioBuffer.push(frame);
	}

	/**
	 * Finalize transcription after VAD signals end-of-utterance.
	 * In batch mode, processes the full buffer. In streaming mode, finalizes partial.
	 */
	async finalize(): Promise<TranscriptionResult> {
		const startMs = Date.now();

		// Build vocabulary priming prompt
		const primingPrompt = this.buildPrimingPrompt();

		// Merge buffered frames into single PCM array
		const audio = mergeFrames(this.audioBuffer);
		this.audioBuffer = [];

		// Attempt streaming if preferred, fall back to batch on failure
		if (this.actualMode === "streaming" && this.streamingSupported !== false) {
			try {
				const text = await this.transcribeStreaming(audio, primingPrompt);
				return {
					text,
					durationMs: Date.now() - startMs,
					mode: "streaming",
				};
			} catch (error) {
				console.warn(
					"[voice:stt] Streaming transcription failed, falling back to batch:",
					error,
				);
				this.streamingSupported = false;
				this.actualMode = "batch";
				this.modeFailbackCount++;
			}
		}

		const text = await this.transcribeBatch(audio, primingPrompt);
		return {
			text,
			durationMs: Date.now() - startMs,
			mode: "batch",
		};
	}

	/**
	 * Build a bounded vocabulary priming prompt from the hint provider.
	 * Truncates to MAX_PRIMING_PROMPT_CHARS to avoid degrading Whisper quality.
	 */
	buildPrimingPrompt(): string {
		const hints = this.hintProvider?.getVocabularyHints()
			?? DEFAULT_VOCABULARY_HINTS;

		const parts: string[] = ["Superset voice control."];

		const workspaceNames = dedupeAndClean(hints.workspaceNames);
		if (workspaceNames.length > 0) {
			parts.push(`Workspaces: ${workspaceNames.join(", ")}.`);
		}

		const branchNames = dedupeAndClean(hints.branchNames);
		if (branchNames.length > 0) {
			parts.push(`Branches: ${branchNames.join(", ")}.`);
		}

		const terms = dedupeAndClean(hints.technicalTerms);
		if (terms.length > 0) {
			parts.push(`Common terms: ${terms.join(", ")}.`);
		}

		let prompt = parts.join(" ");

		// Truncate to max chars, cutting at last space before limit
		if (prompt.length > VOICE_CONSTANTS.MAX_PRIMING_PROMPT_CHARS) {
			prompt = truncateAtWord(
				prompt,
				VOICE_CONSTANTS.MAX_PRIMING_PROMPT_CHARS,
			);
		}

		return prompt;
	}

	reset(): void {
		this.audioBuffer = [];
	}

	getMetrics(): { modeFailbackCount: number; primingPromptChars: number } {
		return {
			modeFailbackCount: this.modeFailbackCount,
			primingPromptChars: this.buildPrimingPrompt().length,
		};
	}

	getActualMode(): SttMode {
		return this.actualMode;
	}

	// ─── Private ──────────────────────────────────────────────────────────────

	private async transcribeBatch(
		audio: Int16Array,
		initialPrompt: string,
	): Promise<string> {
		const whisper = await loadWhisperBinding();
		return whisper.transcribe(audio, {
			model: this.model,
			modelPath: this.modelPath,
			initialPrompt,
			language: "en",
		});
	}

	private async transcribeStreaming(
		audio: Int16Array,
		initialPrompt: string,
	): Promise<string> {
		const whisper = await loadWhisperBinding();

		if (!whisper.transcribeStreaming) {
			throw new Error("Streaming not supported by current Whisper binding");
		}

		return whisper.transcribeStreaming(audio, {
			model: this.model,
			modelPath: this.modelPath,
			initialPrompt,
			language: "en",
		});
	}
}

// ─── Whisper binding adapter ─────────────────────────────────────────────────

interface WhisperBinding {
	transcribe(
		audio: Int16Array,
		options: {
			model: string;
			modelPath?: string;
			initialPrompt: string;
			language: string;
		},
	): Promise<string>;
	transcribeStreaming?(
		audio: Int16Array,
		options: {
			model: string;
			modelPath?: string;
			initialPrompt: string;
			language: string;
		},
	): Promise<string>;
}

async function loadWhisperBinding(): Promise<WhisperBinding> {
	try {
		// Attempt to load whisper.cpp Node bindings
		const binding = await import("whisper-node");
		return binding as unknown as WhisperBinding;
	} catch (error) {
		throw new Error(
			`[voice:stt] Whisper binding unavailable. Ensure whisper-node is installed. ${error}`,
		);
	}
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mergeFrames(frames: Int16Array[]): Int16Array {
	if (frames.length === 0) return new Int16Array(0);
	if (frames.length === 1) return frames[0];

	const totalLength = frames.reduce((sum, f) => sum + f.length, 0);
	const merged = new Int16Array(totalLength);

	let offset = 0;
	for (const frame of frames) {
		merged.set(frame, offset);
		offset += frame.length;
	}

	return merged;
}

function dedupeAndClean(items: string[]): string[] {
	const seen = new Set<string>();
	const result: string[] = [];

	for (const item of items) {
		const cleaned = item.trim();
		if (cleaned && !seen.has(cleaned.toLowerCase())) {
			seen.add(cleaned.toLowerCase());
			result.push(cleaned);
		}
	}

	return result;
}

function truncateAtWord(text: string, maxChars: number): string {
	if (text.length <= maxChars) return text;

	const truncated = text.slice(0, maxChars);
	const lastSpace = truncated.lastIndexOf(" ");

	if (lastSpace > 0) {
		return truncated.slice(0, lastSpace);
	}

	return truncated;
}
