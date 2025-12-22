export interface Feature {
	tag: string;
	title: string;
	description: string;
	colors: readonly [string, string, string, string];
}

export const FEATURES: Feature[] = [
	{
		tag: "Parallel Execution",
		title: "Run dozens of agents at once",
		description:
			"Launch multiple AI coding agents simultaneously across different tasks. Work on features, fix bugs, and refactor code — all in parallel. Each agent runs independently while you maintain full visibility.",
		colors: ["#7f1d1d", "#991b1b", "#450a0a", "#1a1a2e"],
	},
	{
		tag: "Universal Compatibility",
		title: "Works with any CLI agent",
		description:
			"Superset is agent-agnostic. Use Claude Code, OpenCode, Cursor, or any CLI-based coding tool. Switch between agents seamlessly without changing your workflow.",
		colors: ["#047857", "#065f46", "#064e3b", "#1a1a2e"],
	},
	{
		tag: "Isolation",
		title: "Changes are isolated",
		description:
			"Each agent runs in its own isolated Git worktree. No merge conflicts, no stepping on each other's changes. Review and merge work when you're ready.",
		colors: ["#1e40af", "#1e3a8a", "#172554", "#1a1a2e"],
	},
];
