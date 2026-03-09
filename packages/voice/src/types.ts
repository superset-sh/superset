// ─── Voice Pipeline State ────────────────────────────────────────────────────

export type VoicePipelineState =
	| "idle"
	| "listening-for-wake"
	| "listening-for-command"
	| "conversational"
	| "transcribing"
	| "thinking"
	| "speaking";

// ─── Source Event Model (proactive path) ─────────────────────────────────────

export interface VoiceSourceEvent {
	kind: "agent-state" | "permission-request" | "agent-error" | "terminal-exit";
	eventId: string;
	paneId?: string;
	workspaceId?: string;
	receivedAt: number;
}

// ─── Proactive Alert Model ───────────────────────────────────────────────────

export type AlertPriority = "high" | "normal";

export interface ProactiveAlert {
	type: "agent-complete" | "permission-request" | "agent-error";
	workspaceId: string;
	workspaceName: string;
	summary: string;
	priority: AlertPriority;
	sourceEventId: string;
}

// ─── Voice Config and Secrets ────────────────────────────────────────────────

export type WhisperModel = "base.en" | "small.en";
export type TtsProvider = "elevenlabs" | "macos";
export type SttMode = "batch" | "streaming";

export interface VoiceConfig {
	enabled: boolean;
	proactiveAlerts: boolean;
	wakeWordSensitivity: number;
	whisperModel: WhisperModel;
	conversationTimeoutMs: number;
	commandTimeoutMs: number;
	ttsProvider: TtsProvider;
	sttMode: SttMode;
	voiceTraceEnabled: boolean;
	voiceTraceMaxEntries: number;
	voiceTraceTtlMs: number;
}

export interface VoiceSecrets {
	elevenLabsApiKey?: string;
	picovoiceAccessKey?: string;
}

// ─── Tool Contract (pane-safe) ───────────────────────────────────────────────

export interface WorkspaceSummary {
	workspaceId: string;
	name: string;
	agentStatus: AgentStatusValue;
	pendingNotifications: number;
}

export interface NotificationSummary {
	id: string;
	type: string;
	workspaceId?: string;
	message: string;
	receivedAt: number;
}

export type AgentStatusValue =
	| "running"
	| "idle"
	| "error"
	| "waiting-permission";

export interface AgentStatus {
	status: AgentStatusValue;
	workspaceId: string;
	currentTask?: string;
	lastActivityAt: number;
}

export interface VoiceAgentTools {
	listWorkspaces(): Promise<WorkspaceSummary[]>;
	listNotifications(): Promise<NotificationSummary[]>;
	getAgentStatus(workspaceId: string): Promise<AgentStatus>;
	readTerminalOutput(input: {
		workspaceId?: string;
		paneId?: string;
		lines?: number;
	}): Promise<string>;
	summarizeTerminal(input: {
		workspaceId?: string;
		paneId?: string;
	}): Promise<string>;
	focusWorkspace(workspaceId: string): Promise<void>;
	bringToFront(): Promise<void>;
	sendText(paneId: string, text: string): Promise<void>;
	sendKeystroke(paneId: string, key: string): Promise<void>;
	createWorkspace(input: {
		projectId: string;
		name?: string;
		prompt?: string;
	}): Promise<{ workspaceId: string }>;
	closeWorkspace(workspaceId: string): Promise<void>;
	killWorkspaceAgents(
		workspaceId: string,
	): Promise<{ killed: number; failed: number }>;
	speak(text: string): Promise<void>;
}

// ─── Guarded Tool-Trace JIT Models ──────────────────────────────────────────

export type TraceRisk = "safe" | "destructive";

export interface TraceSlotBinding {
	key: "workspace" | "pane" | "time_range" | "confirmation";
	source: "utterance" | "conversation_context" | "state_cache";
	required: boolean;
}

export interface TraceStep {
	tool: string;
	argsTemplate: Record<string, unknown>;
}

export interface CompiledToolTrace {
	id: string;
	signature: string;
	createdAt: number;
	lastUsedAt: number;
	ttlMs: number;
	risk: TraceRisk;
	slotBindings: TraceSlotBinding[];
	steps: TraceStep[];
	guards: string[];
}

export interface TraceMatchResult {
	trace: CompiledToolTrace;
	confidence: number;
	args: Record<string, unknown>;
}

// ─── Cached Agent State and Vocabulary Priming ──────────────────────────────

export interface CachedWorkspaceState {
	workspaceId: string;
	workspaceName: string;
	paneId?: string;
	branchName?: string;
	agentStatus: AgentStatusValue;
	pendingNotifications: number;
	terminalSummary?: string;
	lastActivityAt: number;
}

export interface VocabularyHints {
	workspaceNames: string[];
	branchNames: string[];
	technicalTerms: string[];
}

export interface CachedAgentState {
	workspaces: CachedWorkspaceState[];
	vocabularyHints: VocabularyHints;
	lastUpdatedAt: number;
}

// ─── Speculative TTS Cache ──────────────────────────────────────────────────

export type FollowUpClass = "affirmative" | "negative" | "clarify";

export interface SpeculativeKey {
	conversationId: string;
	contextHash: string;
	followUpClass: FollowUpClass;
}

export interface SpeculativeAudioEntry {
	key: SpeculativeKey;
	text: string;
	audioPath: string;
	createdAt: number;
	expiresAt: number;
}

// ─── Voice Agent Response Metadata ──────────────────────────────────────────

export type ExecutionPath = "trace" | "claude" | "fallback";

export interface VoiceAgentResponse {
	text: string;
	executionPath: ExecutionPath;
	durationMs: number;
	traceId?: string;
}

// ─── Telemetry ──────────────────────────────────────────────────────────────

export type LatencyPath = "wake" | "conversation" | "proactive";

export interface VoiceLatencyEvent {
	path: LatencyPath;
	captureEndMs: number;
	sttFinalMs: number;
	llmFirstTokenMs: number;
	ttsFirstAudioMs: number;
	playbackStartMs: number;
}
