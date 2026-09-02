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
			id: "marketing.features.agentIndependence.tag",
			message: "Agent Independence",
		}),
		title: msg({
			id: "marketing.features.agentIndependence.title",
			message: "Switch agents. Keep your workflow",
		}),
		description: msg({
			id: "marketing.features.agentIndependence.description",
			message:
				"Use Claude Code, Codex, OpenCode, or any coding agent for each task. Your workspaces, branches, and review flow stay the same.",
		}),
	},
	{
		id: "parallel-execution",
		tag: msg({
			id: "marketing.features.parallelExecution.tag",
			message: "Parallel Execution",
		}),
		title: msg({
			id: "marketing.features.parallelExecution.title",
			message: "Scale from two agents to 100+",
		}),
		description: msg({
			id: "marketing.features.parallelExecution.description",
			message:
				"Launch agents across features, bug fixes, and refactors, all in parallel. Status at a glance shows which agents are working, which are blocked, and which are waiting on you.",
		}),
	},
	{
		id: "automations",
		tag: msg({
			id: "marketing.features.automations.tag",
			message: "Automations",
		}),
		title: msg({
			id: "marketing.features.automations.title",
			message: "Put recurring work on a schedule",
		}),
		description: msg({
			id: "marketing.features.automations.description",
			message:
				"Turn chores into scheduled agents: issue triage, changelog drafts, dependency bumps. They run on their own and open PRs for you to review.",
		}),
	},
	{
		id: "isolation",
		tag: msg({
			id: "marketing.features.isolation.tag",
			message: "Isolation",
		}),
		title: msg({
			id: "marketing.features.isolation.title",
			message: "Changes are isolated",
		}),
		description: msg({
			id: "marketing.features.isolation.description",
			message:
				"Each agent runs in its own isolated Git worktree. No merge conflicts, no stepping on each other's changes. Review and merge work when you're ready.",
		}),
	},
	{
		id: "remote-access",
		tag: msg({
			id: "marketing.features.remoteAccess.tag",
			message: "Remote Access",
		}),
		title: msg({
			id: "marketing.features.remoteAccess.title",
			message: "Run workspaces anywhere",
		}),
		description: msg({
			id: "marketing.features.remoteAccess.description",
			message:
				"Add any machine as a host. Workspaces keep running when your laptop sleeps, and you can check in from wherever you are.",
		}),
	},
	{
		id: "cli-sdk",
		tag: msg({
			id: "marketing.features.cliSdk.tag",
			message: "CLI & SDK",
		}),
		title: msg({
			id: "marketing.features.cliSdk.title",
			message: "Drive it from the terminal",
		}),
		description: msg({
			id: "marketing.features.cliSdk.description",
			message:
				"Everything is scriptable. Spawn workspaces and agents from the CLI, wire Superset into CI with the SDK, or let your agent drive it over MCP.",
		}),
	},
	{
		id: "open-anywhere",
		tag: msg({
			id: "marketing.features.openAnywhere.tag",
			message: "Open Anywhere",
		}),
		title: msg({
			id: "marketing.features.openAnywhere.title",
			message: "Open in any IDE",
		}),
		description: msg({
			id: "marketing.features.openAnywhere.description",
			message:
				"Jump into your favorite editor with one click. VS Code, Cursor, Xcode, JetBrains IDEs, or any terminal: open worktrees exactly where you need them.",
		}),
	},
];
