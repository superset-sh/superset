export interface SamplePrompt {
	id: string;
	text: string;
}

export const SAMPLE_PROMPTS: SamplePrompt[] = [
	{
		id: "get-started",
		text: "Help me get started working with Superset",
	},
	{
		id: "explain-repo",
		text: "Explain to me how this repository works",
	},
	{
		id: "fix-small-bug",
		text: "Find a small bug in this codebase and fix it",
	},
];
