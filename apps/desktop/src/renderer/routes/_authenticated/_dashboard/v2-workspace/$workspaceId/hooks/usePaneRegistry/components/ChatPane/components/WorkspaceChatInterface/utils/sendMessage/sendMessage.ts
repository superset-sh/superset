import type { ThinkingLevel } from "@superset/ui/ai-elements/thinking-toggle";

export type ChatSendMessageInput = {
	payload: {
		content: string;
		files?: Array<{
			data: string;
			mediaType: string;
			filename?: string;
		}>;
	};
	metadata: {
		model?: string;
		thinkingLevel?: ThinkingLevel;
	};
};

function toBaseErrorMessage(error: unknown): string {
	if (typeof error === "string" && error.trim().length > 0) return error;
	if (error instanceof Error && error.message.trim().length > 0) {
		return error.message;
	}
	return "Failed to send message";
}

function toNumericStatus(value: unknown): number | null {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value !== "string") return null;
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? null : parsed;
}

function getErrorStatusCode(error: unknown): number | null {
	if (!error || typeof error !== "object") return null;
	const candidate = error as {
		status?: unknown;
		statusCode?: unknown;
		code?: unknown;
		data?: { status?: unknown; statusCode?: unknown };
		response?: {
			status?: unknown;
			data?: { status?: unknown; statusCode?: unknown };
		};
	};
	const statusCandidates = [
		candidate.status,
		candidate.statusCode,
		candidate.response?.status,
		candidate.data?.status,
		candidate.data?.statusCode,
		candidate.response?.data?.status,
		candidate.response?.data?.statusCode,
		candidate.code,
	];
	for (const statusCandidate of statusCandidates) {
		const parsed = toNumericStatus(statusCandidate);
		if (parsed !== null) return parsed;
	}
	return null;
}

export function toSendFailureMessage(error: unknown): string {
	const baseMessage = toBaseErrorMessage(error);
	const statusCode = getErrorStatusCode(error);
	if (statusCode !== 401 && statusCode !== 403) return baseMessage;
	return "Model authentication failed. Reconnect OAuth or set an API key in the model picker, then retry.";
}
