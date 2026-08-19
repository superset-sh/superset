/**
 * The integration roster every surface renders from: the web integrations
 * index, the desktop settings pane, and desktop settings search. Icons and
 * accent colors stay per-app; `provider` matches the integration_provider
 * database enum.
 */
export interface Integration {
	provider: string;
	label: string;
	description: string;
	category: string;
	webPath: string;
}

export const INTEGRATIONS = [
	{
		provider: "linear",
		label: "Linear",
		description: "Sync issues bidirectionally with Linear.",
		category: "Task Management",
		webPath: "/integrations/linear",
	},
	{
		provider: "github",
		label: "GitHub",
		description: "Connect repos and sync pull requests.",
		category: "Version Control",
		webPath: "/integrations/github",
	},
	{
		provider: "slack",
		label: "Slack",
		description: "Manage tasks from Slack conversations.",
		category: "Communication",
		webPath: "/integrations/slack",
	},
	{
		provider: "notion",
		label: "Notion",
		description: "Run automations on data source and comment activity.",
		category: "Knowledge",
		webPath: "/integrations/notion",
	},
	{
		provider: "microsoft_teams",
		label: "Microsoft Teams",
		description: "Trigger automations from Teams channel messages.",
		category: "Communication",
		webPath: "/integrations/microsoft-teams",
	},
	{
		provider: "sentry",
		label: "Sentry",
		description: "Run automations when Sentry issues change.",
		category: "Monitoring",
		webPath: "/integrations/sentry",
	},
	{
		provider: "google",
		label: "Google",
		description: "Trigger automations from Google Calendar and Gmail.",
		category: "Productivity",
		webPath: "/integrations/google",
	},
] as const satisfies readonly Integration[];

export type IntegrationProvider = (typeof INTEGRATIONS)[number]["provider"];
