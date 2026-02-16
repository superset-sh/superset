import type { ModelOption } from "./types";

/** Default model used when no selection has been made */
export const DEFAULT_MODEL: ModelOption = {
	id: "anthropic/claude-sonnet-4-5",
	name: "claude-sonnet-4-5",
	provider: "anthropic",
};

export const SUGGESTIONS = [
	"Explain this codebase",
	"Fix the failing tests",
	"Write tests for auth",
	"Refactor to async/await",
];

export const READ_ONLY_TOOLS = new Set([
	"mastra_workspace_read_file",
	"mastra_workspace_list_files",
	"mastra_workspace_file_stat",
	"mastra_workspace_search",
	"mastra_workspace_index",
]);
