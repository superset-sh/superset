import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface FAQItem {
	/** Stable key for React lists and anchor ids, never the translated text. */
	id: string;
	question: MessageDescriptor;
	answer: MessageDescriptor;
	link?: {
		href: string;
		label: MessageDescriptor;
	};
}

// The source English of a descriptor, for the machine-facing feeds
// (llms.txt, index.md, JSON-LD) that stay English regardless of locale.
export function faqSourceText(descriptor: MessageDescriptor): string {
	return descriptor.message ?? descriptor.id;
}

export const FAQ_ITEMS: FAQItem[] = [
	{
		id: "vsTerminal",
		question: msg({
			id: "marketing.faq.vsTerminal.question",
			message:
				"How is Superset different from just running Claude Code in a terminal?",
		}),
		answer: msg({
			id: "marketing.faq.vsTerminal.answer",
			message:
				"Claude Code, Codex, and OpenCode are the agents; Superset is where you run many of them at once. Each task gets its own isolated Git worktree, so ten agents can work on ten branches simultaneously while you monitor, review, and merge from one place.",
		}),
		link: {
			href: "/compare",
			label: msg({
				id: "marketing.faq.vsTerminal.link",
				message: "See how Superset compares to other tools",
			}),
		},
	},
	{
		id: "existingIde",
		question: msg({
			id: "marketing.faq.existingIde.question",
			message: "I already use an IDE like Cursor, is this for me?",
		}),
		answer: msg({
			id: "marketing.faq.existingIde.answer",
			message:
				"Superset is designed to work with your existing tool, we natively support deep-linking to IDEs like Cursor so you can open your workspaces and files in your IDE.",
		}),
	},
	{
		id: "supportedAgents",
		question: msg({
			id: "marketing.faq.supportedAgents.question",
			message: "Which AI coding agents are supported?",
		}),
		answer: msg({
			id: "marketing.faq.supportedAgents.answer",
			message:
				"Superset works with any CLI-based coding agent, including Claude Code, OpenCode, OpenAI Codex, and more. Choose a different agent for every task without changing your workspace or review flow.",
		}),
	},
	{
		id: "parallelAgents",
		question: msg({
			id: "marketing.faq.parallelAgents.question",
			message: "How does the parallel agent system work?",
		}),
		answer: msg({
			id: "marketing.faq.parallelAgents.answer",
			message:
				"Every agent runs in its own Git worktree, so ten agents can work on ten branches of one repo without conflicts. You watch, review, and merge them all from one window.",
		}),
		link: {
			href: "/parallel-coding-agents",
			label: msg({
				id: "marketing.faq.parallelAgents.link",
				message: "Read the guide to parallel coding agents",
			}),
		},
	},
	{
		id: "freeToUse",
		question: msg({
			id: "marketing.faq.freeToUse.question",
			message: "Is Superset free to use?",
		}),
		answer: msg({
			id: "marketing.faq.freeToUse.answer",
			message:
				"Superset has a free tier. The source code is available on GitHub under Elastic License 2.0 (ELv2), so you can inspect and self-host it subject to the license terms.",
		}),
	},
	{
		id: "ownApiKeys",
		question: msg({
			id: "marketing.faq.ownApiKeys.question",
			message: "Can I use my own API keys?",
		}),
		answer: msg({
			id: "marketing.faq.ownApiKeys.answer",
			message:
				"Absolutely. Superset doesn't proxy any API calls. You use your own API keys directly with whatever AI providers you choose. This means you have full control over costs and usage.",
		}),
	},
	{
		id: "openSource",
		question: msg({
			id: "marketing.faq.openSource.question",
			message: "Is Superset open source?",
		}),
		answer: msg({
			id: "marketing.faq.openSource.answer",
			message:
				"Superset is source-available: the code is public on GitHub under Elastic License 2.0 (ELv2), which lets you inspect and self-host it subject to the license terms, but is not OSI-approved open source. Superset is unrelated to Apache Superset, the business-intelligence tool.",
		}),
	},
	{
		id: "platforms",
		question: msg({
			id: "marketing.faq.platforms.question",
			message: "What platforms does Superset run on?",
		}),
		answer: msg({
			id: "marketing.faq.platforms.answer",
			message:
				"The desktop app runs on macOS, with an experimental Linux AppImage; Windows is not yet available. Beyond the desktop app there's a CLI, a TypeScript SDK, and an MCP server, so you can drive Superset from scripts, terminals, and other agents.",
		}),
	},
	{
		id: "wrapper",
		question: msg({
			id: "marketing.faq.wrapper.question",
			message: "Is Superset just a wrapper around Claude Code?",
		}),
		answer: msg({
			id: "marketing.faq.wrapper.answer",
			message:
				"No. Your agents stay independent; Superset is the orchestration layer around them. Each task gets an isolated Git worktree, persistent sessions, diff review, and scheduled runs without tying the workflow to one provider.",
		}),
	},
];
