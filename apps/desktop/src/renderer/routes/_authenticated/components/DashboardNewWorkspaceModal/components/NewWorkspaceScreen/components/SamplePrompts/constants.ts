export interface SamplePrompt {
	id: string;
	/** Short row label shown in the UI. */
	label: string;
	/** Full instruction inserted into the composer on click. */
	prompt: string;
}

export const SAMPLE_PROMPTS: SamplePrompt[] = [
	{
		id: "set-up-project",
		label: "Set up this project for Superset",
		prompt: `Set up this repository to work well with Superset workspaces. Read https://docs.superset.sh/setup-teardown-scripts and create a .superset/config.json with: setup commands that install dependencies and copy untracked files (like .env) from "$SUPERSET_ROOT_PATH" into new workspaces, teardown commands that stop anything setup starts, and a run command that launches the dev server. If parallel workspaces would collide on dev-server ports, make the scripts pick a free port per workspace (see https://docs.superset.sh/ports). When you're done, summarize what you configured and how to use it.`,
	},
	{
		id: "explain-repo",
		label: "Explain to me how this repository works",
		prompt:
			"Explain how this repository works: the overall architecture, the main entry points, how to run it locally, and what I should read first to get productive. Keep it practical and concrete.",
	},
	{
		id: "fix-small-bug",
		label: "Find a small bug in this codebase and fix it",
		prompt:
			"Find a small, low-risk bug or papercut in this codebase and fix it. Keep the change minimal, explain what the bug was, and describe how you verified the fix.",
	},
];
