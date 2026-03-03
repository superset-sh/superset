import type { ToolPart } from "../../../../utils/tool-helpers";

interface RequestExternalDirToolCallProps {
	part: ToolPart;
	args: Record<string, unknown>;
	result: Record<string, unknown>;
	outputObject?: Record<string, unknown>;
	nestedResultObject?: Record<string, unknown>;
	pendingApprovalToolCallId?: string | null;
	isApprovalSubmitting?: boolean;
	onApprovalRespond?: (
		decision: "approve" | "decline" | "always_allow_category",
		toolCallId?: string,
	) => Promise<void> | void;
	pendingQuestionId?: string | null;
	onQuestionRespond?: (
		questionId: string,
		answer: string,
	) => Promise<void> | void;
}

export function RequestExternalDirToolCall(
	_props: RequestExternalDirToolCallProps,
) {
	return null;
}
