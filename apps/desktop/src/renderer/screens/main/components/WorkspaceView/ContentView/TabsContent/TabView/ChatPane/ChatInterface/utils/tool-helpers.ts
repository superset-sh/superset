import type { ToolDisplayState } from "@superset/ui/ai-elements/tool";
import type { UIMessage } from "ai";

// Extract tool part type from UIMessage
type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }>;

export type { ToolPart };

const TOOL_NAME_ALIASES: Record<string, string> = {
	// Mastra Code built-ins
	execute_command: "mastra_workspace_execute_command",
	run_command: "mastra_workspace_execute_command",
	run_terminal_cmd: "mastra_workspace_execute_command",
	write_file: "mastra_workspace_write_file",
	string_replace_lsp: "mastra_workspace_edit_file",
	edit_file: "mastra_workspace_edit_file",
	read_file: "mastra_workspace_read_file",
	view: "mastra_workspace_read_file",
	list_files: "mastra_workspace_list_files",
	find_files: "mastra_workspace_list_files",
	file_stat: "mastra_workspace_file_stat",
	search: "mastra_workspace_search",
	search_content: "mastra_workspace_search",
	index: "mastra_workspace_index",
	mkdir: "mastra_workspace_mkdir",
	delete: "mastra_workspace_delete",
	web_extract: "web_fetch",
	ask_user: "ask_user_question",

	// Keep explicit passthroughs for newer Mastra tool names
	ast_smart_edit: "ast_smart_edit",
	request_sandbox_access: "request_sandbox_access",
	task_write: "task_write",
	task_check: "task_check",
	submit_plan: "submit_plan",
};

export function normalizeToolName(toolName: string): string {
	return TOOL_NAME_ALIASES[toolName] ?? toolName;
}

export function toToolDisplayState(part: ToolPart): ToolDisplayState {
	switch (part.state) {
		case "input-streaming":
			return "input-streaming";
		case "input-available":
			return "input-complete";
		case "output-error":
			return "output-error";
		case "output-available":
			return "output-available";
		default:
			return "input-available";
	}
}

export function getArgs(part: ToolPart): Record<string, unknown> {
	const input = part.input;
	if (typeof input === "object" && input !== null) {
		return input as Record<string, unknown>;
	}
	if (typeof input === "string") {
		try {
			return JSON.parse(input);
		} catch {
			return {};
		}
	}
	return {};
}

export function getResult(part: ToolPart): Record<string, unknown> {
	const output = part.output;
	if (typeof output === "object" && output !== null) {
		return output as Record<string, unknown>;
	}
	if (typeof output === "string") {
		try {
			return JSON.parse(output);
		} catch {
			return { text: output };
		}
	}
	return {};
}

type ToolStateUnion =
	| "input-streaming"
	| "input-available"
	| "output-available"
	| "output-error";

// Map part.state to the 4-value union expected by UI tool components
export function toWsToolState(part: ToolPart): ToolStateUnion {
	switch (part.state) {
		case "input-streaming":
			return "input-streaming";
		case "output-available":
			return "output-available";
		case "output-error":
			return "output-error";
		default:
			return "input-available";
	}
}
