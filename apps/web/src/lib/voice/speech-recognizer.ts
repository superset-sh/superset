/**
 * Speech recognition abstraction for Whisperflow
 *
 * Uses Web Speech API as primary, with fallback support for cloud transcription.
 */

export interface SpeechRecognizerOptions {
	language?: string;
	continuous?: boolean;
	interimResults?: boolean;
}

export interface SpeechRecognizerEvents {
	onStart?: () => void;
	onEnd?: () => void;
	onResult?: (result: { transcript: string; isFinal: boolean }) => void;
	onError?: (error: Error) => void;
}

export interface SpeechRecognizer {
	start(): void;
	stop(): void;
	abort(): void;
	isListening(): boolean;
	isSupported(): boolean;
}

// Type definitions for Web Speech API
interface SpeechRecognitionEvent extends Event {
	resultIndex: number;
	results: SpeechRecognitionResultList;
}

interface SpeechRecognitionResultList {
	length: number;
	item(index: number): SpeechRecognitionResult;
	[index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
	isFinal: boolean;
	length: number;
	item(index: number): SpeechRecognitionAlternative;
	[index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
	transcript: string;
	confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
	error: string;
	message: string;
}

interface SpeechRecognitionConstructor {
	new (): SpeechRecognitionInstance;
}

interface SpeechRecognitionInstance extends EventTarget {
	continuous: boolean;
	interimResults: boolean;
	lang: string;
	start(): void;
	stop(): void;
	abort(): void;
	onstart: ((event: Event) => void) | null;
	onend: ((event: Event) => void) | null;
	onresult: ((event: SpeechRecognitionEvent) => void) | null;
	onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

declare global {
	interface Window {
		SpeechRecognition?: SpeechRecognitionConstructor;
		webkitSpeechRecognition?: SpeechRecognitionConstructor;
	}
}

/**
 * Web Speech API implementation
 */
export class WebSpeechRecognizer implements SpeechRecognizer {
	private recognition: SpeechRecognitionInstance | null = null;
	private listening = false;

	constructor(
		private options: SpeechRecognizerOptions = {},
		private events: SpeechRecognizerEvents = {},
	) {
		this.initRecognition();
	}

	private initRecognition() {
		const SpeechRecognition =
			window.SpeechRecognition || window.webkitSpeechRecognition;

		if (!SpeechRecognition) {
			console.warn("[voice] Web Speech API not supported");
			return;
		}

		this.recognition = new SpeechRecognition();
		this.recognition.continuous = this.options.continuous ?? false;
		this.recognition.interimResults = this.options.interimResults ?? true;
		this.recognition.lang = this.options.language ?? "en-US";

		this.recognition.onstart = () => {
			this.listening = true;
			this.events.onStart?.();
		};

		this.recognition.onend = () => {
			this.listening = false;
			this.events.onEnd?.();
		};

		this.recognition.onresult = (event: SpeechRecognitionEvent) => {
			const result = event.results[event.resultIndex];
			const alternative = result?.[0];
			if (result && alternative) {
				this.events.onResult?.({
					transcript: alternative.transcript,
					isFinal: result.isFinal,
				});
			}
		};

		this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
			this.listening = false;
			this.events.onError?.(new Error(event.error));
		};
	}

	start(): void {
		if (!this.recognition) {
			this.events.onError?.(new Error("Speech recognition not supported"));
			return;
		}

		if (this.listening) {
			return;
		}

		try {
			this.recognition.start();
		} catch (err) {
			// Recognition might already be started
			console.error("[voice] Start error:", err);
		}
	}

	stop(): void {
		if (this.recognition && this.listening) {
			this.recognition.stop();
		}
	}

	abort(): void {
		if (this.recognition) {
			this.recognition.abort();
			this.listening = false;
		}
	}

	isListening(): boolean {
		return this.listening;
	}

	isSupported(): boolean {
		return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
	}
}

/**
 * Create a speech recognizer with automatic API selection
 */
export function createSpeechRecognizer(
	options: SpeechRecognizerOptions = {},
	events: SpeechRecognizerEvents = {},
): SpeechRecognizer {
	// For now, always use Web Speech API
	// Cloud fallback can be added later
	return new WebSpeechRecognizer(options, events);
}

/**
 * Check if speech recognition is supported in the current browser
 */
export function isSpeechRecognitionSupported(): boolean {
	return !!(
		typeof window !== "undefined" &&
		(window.SpeechRecognition || window.webkitSpeechRecognition)
	);
}
