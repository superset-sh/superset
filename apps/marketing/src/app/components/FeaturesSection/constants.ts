export interface Feature {
	tag: string;
	title: string;
	description: string;
	colors: readonly [string, string, string, string];
	rarity: "common" | "uncommon" | "rare" | "epic" | "legendary";
}

export const FEATURES: Feature[] = [
	{
		tag: "Parallel Execution",
		title: "Run dozens of agents at once",
		description:
			"Launch multiple AI coding agents across different tasks. Work on features, fix bugs, and refactor code — all in parallel.",
		colors: ["#8B2020", "#6B1515", "#4A0E0E", "#2C1A0E"],
		rarity: "legendary",
	},
	{
		tag: "Universal Compatibility",
		title: "Works with any CLI agent",
		description:
			"Superset is agent-agnostic. Use Claude Code, OpenCode, Cursor, or any CLI-based coding tool. Switch between agents seamlessly.",
		colors: ["#3D7A3D", "#2D5E2D", "#1E4A1E", "#2C1A0E"],
		rarity: "uncommon",
	},
	{
		tag: "Isolation",
		title: "Changes are isolated",
		description:
			"Each agent runs in its own isolated Git worktree. No merge conflicts, no stepping on each other's changes. Review and merge work when you're ready.",
		colors: ["#2A6B8A", "#1E4F6B", "#153A50", "#2C1A0E"],
		rarity: "rare",
	},
	{
		tag: "Open Anywhere",
		title: "Open in any IDE",
		description:
			"Jump into your favorite editor with one click. VS Code, Cursor, Xcode, JetBrains IDEs, or any terminal — open worktrees exactly where you need them.",
		colors: ["#6B3FA0", "#502D80", "#3A1F60", "#2C1A0E"],
		rarity: "epic",
	},
];
