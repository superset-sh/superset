export type MessageRole = "user" | "assistant" | "system";

export interface ToolCall {
	id: string;
	name: string;
	state: "input-available" | "output-available" | "output-error";
	input: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
	approval?:
		| { id: string }
		| { id: string; approved: true; reason?: string }
		| { id: string; approved: false; reason?: string };
}

export interface PlanData {
	title: string;
	description: string;
	steps: Array<{ label: string; done: boolean }>;
}

export interface TaskData {
	title: string;
	files: string[];
}

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	reasoning?: string;
	toolCalls?: ToolCall[];
	plan?: PlanData;
	codeBlocks?: Array<{ code: string; language: string }>;
	tasks?: TaskData[];
	checkpoint?: string;
}

export interface ModelOption {
	id: string;
	name: string;
	description: string;
}
