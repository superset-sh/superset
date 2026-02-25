export interface MastraChatEventEnvelope {
	kind: "submit" | "harness";
	sessionId: string;
	timestamp: string;
	sequenceHint: number;
	payload: unknown;
}

export type MastraChatEventRow = MastraChatEventEnvelope & { id: string };

export interface MastraChatUsage {
	promptTokens: number;
	completionTokens: number;
	totalTokens: number;
}

export interface MastraChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	text: string;
	createdAt: string;
	status: "submitted" | "streaming" | "complete";
	source: "submit" | "harness";
}

export interface MastraChatControlSubmission {
	action: string;
	submittedAt: string;
	wasRunning: boolean;
}

export interface MastraChatError {
	message: string;
	timestamp: string;
	raw: unknown;
}

export interface MastraChatMaterializedState {
	sessionId: string | null;
	epoch: number;
	sequenceResetCount: number;
	isRunning: boolean;
	lastAgentEndReason?: string;
	messages: MastraChatMessage[];
	usage?: MastraChatUsage;
	controls: MastraChatControlSubmission[];
	errors: MastraChatError[];
	auxiliaryEvents: Array<{ timestamp: string; type: string; raw: unknown }>;
}
