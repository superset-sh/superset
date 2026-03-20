import { posthog } from "renderer/lib/posthog";

interface ReportChatErrorInput {
	operation: string;
	error: unknown;
	sessionId?: string | null;
	workspaceId?: string;
	paneId?: string;
	cwd?: string;
	organizationId?: string | null;
}

function errorDetails(error: unknown): { name: string; message: string } {
	if (error instanceof Error) {
		return { name: error.name, message: error.message };
	}
	if (typeof error === "string") {
		return { name: "Error", message: error };
	}
	return { name: "UnknownError", message: "Unknown chat error" };
}

export function reportChatError(input: ReportChatErrorInput): void {
	const details = errorDetails(input.error);
	console.error(`[chat] ${input.operation}`, input.error);
	posthog.capture("chat_error", {
		operation: input.operation,
		error_name: details.name,
		error_message: details.message,
		session_id: input.sessionId ?? null,
		workspace_id: input.workspaceId ?? null,
		pane_id: input.paneId ?? null,
		cwd: input.cwd ?? null,
		organization_id: input.organizationId ?? null,
	});
}
