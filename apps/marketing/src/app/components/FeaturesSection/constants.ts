export interface Feature {
	tag: string;
	title: string;
	description: string;
}

export const FEATURES: Feature[] = [
	{
		tag: "Parallel Execution",
		title: "Run 100+ agents without losing track",
		description:
			"Launch agents across features, bug fixes, and refactors, all in parallel. Status at a glance shows which agents are working, which are blocked, and which are waiting on you.",
	},
	{
		tag: "Automations",
		title: "Put recurring work on a schedule",
		description:
			"Turn chores into scheduled agents: issue triage, changelog drafts, dependency bumps. They run on their own and open PRs for you to review.",
	},
	{
		tag: "Universal Compatibility",
		title: "Works with any CLI agent",
		description:
			"Superset is agent-agnostic. Use Claude Code, OpenCode, Cursor, or any CLI-based coding tool. Switch agents whenever you want.",
	},
	{
		tag: "Isolation",
		title: "Changes are isolated",
		description:
			"Each agent runs in its own isolated Git worktree. No merge conflicts, no stepping on each other's changes. Review and merge work when you're ready.",
	},
	{
		tag: "Remote Workspaces",
		title: "Run workspaces anywhere",
		description:
			"Add any machine as a host. Workspaces keep running when your laptop sleeps, and you can check in from wherever you are.",
	},
	{
		tag: "CLI & SDK",
		title: "Drive it from the terminal",
		description:
			"Everything is scriptable. Spawn workspaces and agents from the CLI, wire Superset into CI with the SDK, or let your agent drive it over MCP.",
	},
	{
		tag: "Open Anywhere",
		title: "Open in any IDE",
		description:
			"Jump into your favorite editor with one click. VS Code, Cursor, Xcode, JetBrains IDEs, or any terminal: open worktrees exactly where you need them.",
	},
];
