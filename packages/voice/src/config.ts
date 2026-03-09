import type { VoiceConfig, VocabularyHints } from "./types";

export const DEFAULT_VOICE_CONFIG: VoiceConfig = {
	enabled: false,
	proactiveAlerts: true,
	wakeWordSensitivity: 0.5,
	whisperModel: "base.en",
	conversationTimeoutMs: 8_000,
	commandTimeoutMs: 15_000,
	ttsProvider: "macos",
	sttMode: "batch",
	voiceTraceEnabled: true,
	voiceTraceMaxEntries: 100,
	voiceTraceTtlMs: 30 * 60 * 1_000, // 30 minutes
};

export const VOICE_CONSTANTS = {
	/** Max characters for Whisper initial_prompt vocabulary priming */
	MAX_PRIMING_PROMPT_CHARS: 500,

	/** VAD silence threshold for wake mode (ms) */
	VAD_SILENCE_WAKE_MS: 1_500,

	/** VAD silence threshold for conversational mode (ms) */
	VAD_SILENCE_CONVERSATIONAL_MS: 700,

	/** Speculative TTS cache TTL (ms) */
	SPECULATIVE_TTL_MS: 25_000,

	/** State cache refresh interval (ms) */
	STATE_CACHE_REFRESH_MS: 10_000,

	/** Audio sample rate for capture (Hz) */
	AUDIO_SAMPLE_RATE: 16_000,

	/** Audio frame length for Porcupine (samples) */
	AUDIO_FRAME_LENGTH: 512,

	/** Ring buffer size per pane for terminal output (lines) */
	TERMINAL_RING_BUFFER_LINES: 200,

	/** Alert cooldown between same-type events (ms) */
	ALERT_COOLDOWN_MS: 30_000,

	/** Max conversation exchanges before auto-reset */
	MAX_CONVERSATION_EXCHANGES: 10,
} as const;

export const DEFAULT_VOCABULARY_HINTS: VocabularyHints = {
	workspaceNames: [],
	branchNames: [],
	technicalTerms: [
		"Superset",
		"Claude",
		"Codex",
		"Mastra",
		"tRPC",
		"Drizzle",
		"worktree",
		"pane",
		"workspace",
		"terminal",
	],
};

/** Latency SLO targets (ms to first audio) */
export const LATENCY_SLOS = {
	statusQuery: { p50: 1_500, p95: 2_500 },
	conversationalFollowUp: { p50: 1_200, p95: 2_000 },
	proactiveAlert: { p50: 600, p95: 1_200 },
} as const;
