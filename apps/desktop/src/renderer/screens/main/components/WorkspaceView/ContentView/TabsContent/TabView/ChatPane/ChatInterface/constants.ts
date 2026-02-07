import type { ModelOption } from "./types";

export const MODELS: ModelOption[] = [
	{
		id: "claude-opus-4-6",
		name: "Claude Opus 4.6",
		description: "Most capable — complex tasks, deep reasoning",
	},
	{
		id: "claude-sonnet-4-5-20250929",
		name: "Claude Sonnet 4.5",
		description: "Balanced — fast and capable",
	},
	{
		id: "claude-haiku-4-5-20251001",
		name: "Claude Haiku 4.5",
		description: "Fastest — quick tasks, low cost",
	},
];

export const SUGGESTIONS = [
	"Explain this codebase",
	"Fix the failing tests",
	"Write tests for auth",
	"Refactor to async/await",
];
