export interface FAQItem {
	question: string;
	answer: string;
}

export const FAQ_ITEMS: FAQItem[] = [
	{
		question: "I already use an IDE like Cursor, is this for me?",
		answer:
			"Superset is designed to work with your existing tool, we natively support deep-linking to IDEs like Cursor so you can open your workspaces and files in your IDE.",
	},
	{
		question: "Which AI coding agents are supported?",
		answer:
			"Superset works with any CLI-based coding agent including Claude Code, OpenCode, OpenAI Codex, and more. If it runs in a terminal, it runs in Superset.",
	},
	{
		question: "How does the parallel agent system work?",
		answer:
			"Each agent runs in its own isolated Git worktree, which means they can work on different branches or features simultaneously without conflicts. You can monitor all agents in real-time and switch between them instantly.",
	},
	{
		question: "Is Superset free to use?",
		answer:
			"Yes, Superset is completely free and open source. You can self-host it, modify it, and use it however you like. The source code is available on GitHub under a permissive license.",
	},
	{
		question: "Can I use my own API keys?",
		answer:
			"Absolutely. Superset doesn't proxy any API calls. You use your own API keys directly with whatever AI providers you choose. This means you have full control over costs and usage.",
	},
];
