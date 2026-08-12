export interface HowItWorksStep {
	number: string;
	title: string;
	description: string;
}

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
	{
		number: "01",
		title: "Start a task.",
		description:
			"Describe what you want built. Superset spins up a workspace in an isolated Git worktree, so every task starts on a clean branch.",
	},
	{
		number: "02",
		title: "Agents do the work.",
		description:
			"Run Claude Code, Codex, or any CLI agent in parallel, each in its own workspace. No conflicts, no waiting on a single session.",
	},
	{
		number: "03",
		title: "Review and ship.",
		description:
			"Jump in when an agent needs you. Review the changes, open them in your IDE, and commit, push, and merge PRs without leaving the app.",
	},
];
