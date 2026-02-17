import type { ModelOption } from "./types";

/** Default model used when no selection has been made */
export const DEFAULT_MODEL: ModelOption = {
	id: "anthropic/claude-sonnet-4-5",
	name: "claude-sonnet-4-5",
	provider: "Anthropic",
};

/** Hardcoded fallback until models come from Mastra gateway via durable stream */
export const DEFAULT_AVAILABLE_MODELS: ModelOption[] = [
	{
		id: "anthropic/claude-haiku-4-5",
		name: "claude-haiku-4-5",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-sonnet-4-5",
		name: "claude-sonnet-4-5",
		provider: "Anthropic",
	},
	{
		id: "anthropic/claude-opus-4-6",
		name: "claude-opus-4-6",
		provider: "Anthropic",
	},
	{ id: "openai/gpt-5.2-codex", name: "gpt-5.2-codex", provider: "Codex" },
];

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
