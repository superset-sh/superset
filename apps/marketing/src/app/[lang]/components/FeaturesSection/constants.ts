import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface Feature {
	id: string;
	tag: MessageDescriptor;
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const FEATURES: Feature[] = [
	{
		id: "agent-independence",
		tag: msg({
			message: "Agent Independence",
		}),
		title: msg({
			message: "Switch agents. Keep your workflow",
		}),
		description: msg({
			message:
				"Use Claude Code, Codex, OpenCode, or any coding agent for each task. Your workspaces, branches, and review flow stay the same.",
		}),
	},
	{
		id: "parallel-execution",
		tag: msg({
			message: "Parallel Execution",
		}),
		title: msg({
			message: "Scale from two agents to 100+",
		}),
		description: msg({
			message:
				"Launch agents across features, bug fixes, and refactors, all in parallel. Status at a glance shows which agents are working, which are blocked, and which are waiting on you.",
		}),
	},
	{
		id: "automations",
		tag: msg({
			message: "Automations",
		}),
		title: msg({
			message: "Put recurring work on a schedule",
		}),
		description: msg({
			message:
				"Turn chores into scheduled agents: issue triage, changelog drafts, dependency bumps. They run on their own and open PRs for you to review.",
		}),
	},
	{
		id: "isolation",
		tag: msg({
			message: "Isolation",
		}),
		title: msg({
			message: "Changes are isolated",
		}),
		description: msg({
			message:
				"Each agent runs in its own isolated Git worktree. No merge conflicts, no stepping on each other's changes. Review and merge work when you're ready.",
		}),
	},
	{
		id: "remote-access",
		tag: msg({
			message: "Remote Access",
		}),
		title: msg({
			message: "Run workspaces anywhere",
		}),
		description: msg({
			message:
				"Add any machine as a host. Workspaces keep running when your laptop sleeps, and you can check in from wherever you are.",
		}),
	},
	{
		id: "cli-sdk",
		tag: msg({
			message: "CLI & SDK",
		}),
		title: msg({
			message: "Drive it from the terminal",
		}),
		description: msg({
			message:
				"Everything is scriptable. Spawn workspaces and agents from the CLI, wire Superset into CI with the SDK, or let your agent drive it over MCP.",
		}),
	},
	{
		id: "open-anywhere",
		tag: msg({
			message: "Open Anywhere",
		}),
		title: msg({
			message: "Open in any IDE",
		}),
		description: msg({
			message:
				"Jump into your favorite editor with one click. VS Code, Cursor, Xcode, JetBrains IDEs, or any terminal: open worktrees exactly where you need them.",
		}),
	},
];
