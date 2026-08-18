export interface FAQItem {
	question: string;
	answer: string;
	link?: {
		href: string;
		label: string;
	};
}

export const FAQ_ITEMS: FAQItem[] = [
	{
		question:
			"How is Superset different from just running Claude Code in a terminal?",
		answer:
			"Claude Code, Codex, and OpenCode are the agents; Superset is where you run many of them at once. Each task gets its own isolated Git worktree, so ten agents can work on ten branches simultaneously while you monitor, review, and merge from one place.",
		link: {
			href: "/compare",
			label: "See how Superset compares to other tools",
		},
	},
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
		link: {
			href: "/parallel-coding-agents",
			label: "Read the complete guide to parallel coding agents",
		},
	},
	{
		question: "Is Superset free to use?",
		answer:
			"Superset has a free tier. The source code is available on GitHub under Elastic License 2.0 (ELv2), so you can inspect and self-host it subject to the license terms.",
	},
	{
		question: "Can I use my own API keys?",
		answer:
			"Absolutely. Superset doesn't proxy any API calls. You use your own API keys directly with whatever AI providers you choose. This means you have full control over costs and usage.",
	},
	{
		question: "Is Superset open source?",
		answer:
			"Superset is source-available: the code is public on GitHub under Elastic License 2.0 (ELv2), which lets you inspect and self-host it subject to the license terms, but is not OSI-approved open source. Superset is unrelated to Apache Superset, the business-intelligence tool.",
	},
	{
		question: "What platforms does Superset run on?",
		answer:
			"The desktop app runs on macOS, with an experimental Linux AppImage; Windows is not yet available. Beyond the desktop app there's a CLI, a TypeScript SDK, and an MCP server, so you can drive Superset from scripts, terminals, and other agents.",
	},
	{
		question: "Is Superset just a wrapper around Claude Code?",
		answer:
			"No. The agents stay the agents; Superset is the orchestration layer around them: isolated Git worktrees per task, persistent terminal sessions, a diff review surface, scheduled automations, and an MCP server for programmatic control. It's the difference between one session in a terminal tab and a fleet you can actually manage.",
	},
];
