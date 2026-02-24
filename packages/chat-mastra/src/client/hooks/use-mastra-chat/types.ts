import type {
	MastraChatControlSubmission,
	MastraChatError,
	MastraChatMaterializedState,
	MastraChatMessage,
	MastraChatUsage,
} from "./materialize";

// TODO(chat-mastra): replace this shim with
// `import type { HarnessDisplayState } from "@mastra/core/harness"`
// once the published @mastra/core version in this repo exposes getDisplayState().
export type OMStatus = "idle" | "observing" | "reflecting";
export type OMBufferedStatus = "idle" | "running" | "complete";

export interface OMProgressState {
	status: OMStatus;
	pendingTokens: number;
	threshold: number;
	thresholdPercent: number;
	observationTokens: number;
	reflectionThreshold: number;
	reflectionThresholdPercent: number;
	buffered: {
		observations: {
			status: OMBufferedStatus;
			chunks: number;
			messageTokens: number;
			projectedMessageRemoval: number;
			observationTokens: number;
		};
		reflection: {
			status: OMBufferedStatus;
			inputObservationTokens: number;
			observationTokens: number;
		};
	};
	generationCount: number;
	stepNumber: number;
	cycleId?: string;
	startTime?: number;
}

export interface ActiveToolState {
	name: string;
	args: unknown;
	status: "streaming_input" | "running" | "completed" | "error";
	partialResult?: string;
	result?: unknown;
	isError?: boolean;
	shellOutput?: string;
}

export interface ActiveSubagentToolCall {
	name: string;
	isError: boolean;
}

export interface ActiveSubagentState {
	agentType: string;
	task: string;
	modelId?: string;
	toolCalls: ActiveSubagentToolCall[];
	textDelta: string;
	status: "running" | "completed" | "error";
	durationMs?: number;
	result?: string;
}

export interface PendingApprovalState {
	toolCallId: string;
	toolName: string;
	args: unknown;
}

export interface PendingQuestionOption {
	label: string;
	description?: string;
}

export interface PendingQuestionState {
	questionId: string;
	question: string;
	options?: PendingQuestionOption[];
}

export interface PendingPlanApprovalState {
	planId: string;
	title?: string;
	plan: string;
}

export interface ModifiedFileState {
	operations: string[];
	firstModified: Date;
}

export interface TaskState {
	content: string;
	status: "pending" | "in_progress" | "completed";
	activeForm: string;
}

/**
 * Compatibility target for `HarnessDisplayState` from upstream Mastra.
 * Keep this contract stable even if our internal materializer implementation changes.
 */
export interface MastraDisplayStateContract {
	isRunning: boolean;
	currentMessage: MastraChatMessage | null;
	tokenUsage: MastraChatUsage;
	activeTools: Map<string, ActiveToolState>;
	toolInputBuffers: Map<string, { text: string; toolName: string }>;
	pendingApproval: PendingApprovalState | null;
	pendingQuestion: PendingQuestionState | null;
	pendingPlanApproval: PendingPlanApprovalState | null;
	activeSubagents: Map<string, ActiveSubagentState>;
	omProgress: OMProgressState;
	bufferingMessages: boolean;
	bufferingObservations: boolean;
	modifiedFiles: Map<string, ModifiedFileState>;
	tasks: TaskState[];
	previousTasks: TaskState[];
}

export interface UseMastraChatState {
	/**
	 * Raw durable-stream materialization state.
	 * This remains available for debugging and replay correctness assertions.
	 */
	materialized: MastraChatMaterializedState;
	/**
	 * UI-oriented state contract that should mirror Mastra `HarnessDisplayState`.
	 */
	display: MastraDisplayStateContract;
}

export interface UseMastraChatMessageInputFile {
	url: string;
	mediaType: string;
	filename?: string;
}

export interface UseMastraChatMessageInputMetadata {
	model?: string;
	permissionMode?: string;
	thinkingEnabled?: boolean;
}

export interface UseMastraChatSendMessageInput {
	content?: string;
	files?: UseMastraChatMessageInputFile[];
	metadata?: UseMastraChatMessageInputMetadata;
	clientMessageId?: string;
}

export interface UseMastraChatControlInput {
	action: "stop" | "abort";
}

export interface UseMastraChatApprovalInput {
	decision: "approve" | "deny";
	toolCallId?: string;
}

export interface UseMastraChatQuestionInput {
	questionId: string;
	answer: string;
}

export interface UseMastraChatPlanInput {
	planId: string;
	action: "accept" | "reject" | "revise";
	feedback?: string;
}

export interface UseMastraChatReturn {
	ready: boolean;
	error: MastraChatError | null;
	state: UseMastraChatState;
	messages: MastraChatMessage[];
	controls: MastraChatControlSubmission[];
	sendMessage: (input: UseMastraChatSendMessageInput) => Promise<void>;
	control: (input: UseMastraChatControlInput) => Promise<void>;
	respondToApproval: (input: UseMastraChatApprovalInput) => Promise<void>;
	respondToQuestion: (input: UseMastraChatQuestionInput) => Promise<void>;
	respondToPlan: (input: UseMastraChatPlanInput) => Promise<void>;
}

export interface UseMastraDisplayStateOptions {
	sessionId: string;
	enabled?: boolean;
	fps?: number;
}

export interface UseMastraDisplayStateReturn {
	ready: boolean;
	displayState: MastraDisplayStateContract | null;
	reason: string | null;
	isLoading: boolean;
	error: unknown;
	refetch: () => Promise<unknown>;
}
