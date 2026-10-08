import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type StepId = "install" | "connect" | "mention" | "run";

interface PluginsItem {
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export interface CatalogPlugin {
	name: string;
	displayName: string;
	description: MessageDescriptor;
	installed?: boolean;
}

export const CATALOG: {
	category: MessageDescriptor;
	plugins: CatalogPlugin[];
}[] = [
	{
		category: msg({ message: "Productivity" }),
		plugins: [
			{
				name: "linear",
				displayName: "Linear",
				description: msg({ message: "File and update issues" }),
				installed: true,
			},
			{
				name: "notion",
				displayName: "Notion",
				description: msg({ message: "Search and write pages" }),
			},
			{
				name: "google-calendar",
				displayName: "Google Calendar",
				description: msg({ message: "Schedule meetings" }),
			},
			{
				name: "granola",
				displayName: "Granola",
				description: msg({ message: "Search your meeting notes" }),
			},
			{
				name: "circleback",
				displayName: "Circleback",
				description: msg({ message: "Work the action items from a call" }),
			},
			{
				name: "ynab",
				displayName: "YNAB",
				description: msg({ message: "Track budgets and spending" }),
			},
		],
	},
	{
		category: msg({ message: "Communication" }),
		plugins: [
			{
				name: "slack",
				displayName: "Slack",
				description: msg({ message: "Search and post in channels" }),
				installed: true,
			},
			{
				name: "gmail",
				displayName: "Gmail",
				description: msg({ message: "Read and send mail" }),
			},
			{
				name: "superhuman",
				displayName: "Superhuman",
				description: msg({ message: "Triage mail and draft replies" }),
			},
		],
	},
	{
		category: msg({ message: "Developer tools" }),
		plugins: [
			{
				name: "github",
				displayName: "GitHub",
				description: msg({ message: "Triage issues and failing CI" }),
				installed: true,
			},
			{
				name: "sentry",
				displayName: "Sentry",
				description: msg({ message: "Debug with production stack traces" }),
				installed: true,
			},
			{
				name: "vercel",
				displayName: "Vercel",
				description: msg({ message: "Read deployment and build logs" }),
			},
		],
	},
	{
		category: msg({ message: "Data & APIs" }),
		plugins: [
			{
				name: "neon",
				displayName: "Neon",
				description: msg({ message: "Inspect branches and run SQL" }),
			},
			{
				name: "posthog",
				displayName: "PostHog",
				description: msg({ message: "Query events and feature flags" }),
			},
			{
				name: "stripe",
				displayName: "Stripe",
				description: msg({ message: "Trace charges and subscriptions" }),
			},
		],
	},
];

export const STEPS: (PluginsItem & { id: StepId })[] = [
	{
		id: "install",
		title: msg({ message: "Install." }),
		description: msg({
			message:
				"Open Plugins in the Superset app and pick one. The install is saved to your account.",
		}),
	},
	{
		id: "connect",
		title: msg({ message: "Connect." }),
		description: msg({
			message:
				"Sign in to the app once. Superset keeps the connection for you.",
		}),
	},
	{
		id: "mention",
		title: msg({ message: "Mention." }),
		description: msg({
			message: "Type @linear in a prompt to point the agent at the plugin.",
		}),
	},
	{
		id: "run",
		title: msg({ message: "Run." }),
		description: msg({
			message:
				"The agent follows the plugin's skills and calls its tools. The issue shows up in Linear.",
		}),
	},
];

export const FEATURES: PluginsItem[] = [
	{
		title: msg({ message: "On every machine you sign into" }),
		description: msg({
			message:
				"Install a plugin once. Superset adds its skills on each machine where you use your account.",
		}),
	},
	{
		title: msg({ message: "Tokens stay off your machine" }),
		description: msg({
			message:
				"Superset stores each connection encrypted. Tool calls go out from Superset, so the agent never sees a token.",
		}),
	},
	{
		title: msg({ message: "Works with Claude Code and Codex" }),
		description: msg({
			message:
				"Superset puts plugin skills and tools where these agents look for them.",
		}),
	},
	{
		title: msg({ message: "Install from the terminal" }),
		description: msg({
			message:
				"Run superset plugins install linear from any shell. The plugin shows up in the app too.",
		}),
	},
];
