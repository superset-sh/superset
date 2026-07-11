import type {
	PendingPermissionRequest,
	SDKUserMessage,
	SessionPermissionResult,
} from "@superset/session-protocol";

export interface AskUserQuestionOption {
	label: string;
	description?: string;
}

export interface AskUserQuestion {
	question: string;
	header?: string;
	options: AskUserQuestionOption[];
	multiSelect: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createUserMessage(text: string): SDKUserMessage {
	return {
		type: "user",
		message: {
			role: "user",
			content: [{ type: "text", text }],
		},
		parent_tool_use_id: null,
	};
}

export function parseAskUserQuestions(
	request: PendingPermissionRequest,
): AskUserQuestion[] | null {
	if (request.toolName !== "AskUserQuestion") return null;
	const rawQuestions = request.input.questions;
	if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return null;

	const questions: AskUserQuestion[] = [];
	for (const value of rawQuestions) {
		if (!isRecord(value) || typeof value.question !== "string") return null;
		const rawOptions = value.options;
		if (!Array.isArray(rawOptions) || rawOptions.length === 0) return null;
		const options: AskUserQuestionOption[] = [];
		for (const rawOption of rawOptions) {
			if (!isRecord(rawOption) || typeof rawOption.label !== "string") {
				return null;
			}
			options.push({
				label: rawOption.label,
				...(typeof rawOption.description === "string"
					? { description: rawOption.description }
					: {}),
			});
		}
		questions.push({
			question: value.question,
			...(typeof value.header === "string" ? { header: value.header } : {}),
			options,
			multiSelect: value.multiSelect === true,
		});
	}
	return questions;
}

export function createQuestionResponse(
	request: PendingPermissionRequest,
	answers: Record<string, string>,
): SessionPermissionResult {
	return {
		behavior: "allow",
		updatedInput: { ...request.input, answers },
		toolUseID: request.toolUseID,
		decisionClassification: "user_temporary",
	};
}
