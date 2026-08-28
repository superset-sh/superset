export interface HowItWorksStep {
	number: string;
	title: string;
	description: string;
}

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
	{
		number: "01",
		title: "Start with the work.",
		description:
			"Describe what you need. Superset creates an isolated workspace and clean branch for the task.",
	},
	{
		number: "02",
		title: "Pick the best agent.",
		description:
			"Use Claude Code, Codex, or any coding agent. Choose per task or run several side by side.",
	},
	{
		number: "03",
		title: "Review the result.",
		description:
			"See what changed, give feedback, and merge the work when it's ready.",
	},
];
