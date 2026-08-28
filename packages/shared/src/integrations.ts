import {
	enabledTriggerKinds,
	type TriggerConfigInput,
} from "./automation-triggers";

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
	/** The trigger kinds a connection to this provider feeds. */
	triggerKinds: readonly TriggerConfigInput["kind"][];
	/**
	 * Powers something besides automations — repositories and pull requests,
	 * the Slack app, tasks — so it is offered whether or not its trigger kinds
	 * are. Everything else is offered only where at least one of its kinds is
	 * in the AUTOMATION_EVENT_TRIGGERS payload: a connection nothing can use
	 * is not worth a Connect button.
	 */
	standalone?: boolean;
}

export const INTEGRATIONS = [
	{
		provider: "linear",
		label: "Linear",
		description: "Sync issues bidirectionally with Linear.",
		category: "Task Management",
		webPath: "/integrations/linear",
		triggerKinds: ["linear"],
		standalone: true,
	},
	{
		provider: "github",
		label: "GitHub",
		description: "Connect repos and sync pull requests.",
		category: "Version Control",
		webPath: "/integrations/github",
		triggerKinds: ["github"],
		standalone: true,
	},
	{
		provider: "slack",
		label: "Slack",
		description: "Manage tasks from Slack conversations.",
		category: "Communication",
		webPath: "/integrations/slack",
		triggerKinds: ["slack"],
		standalone: true,
	},
	{
		provider: "notion",
		label: "Notion",
		description: "Run automations on data source and comment activity.",
		category: "Knowledge",
		webPath: "/integrations/notion",
		triggerKinds: ["notion"],
	},
	{
		provider: "microsoft_teams",
		label: "Microsoft Teams",
		description: "Trigger automations from Teams channel messages.",
		category: "Communication",
		webPath: "/integrations/microsoft-teams",
		triggerKinds: ["microsoft_teams"],
	},
	{
		provider: "sentry",
		label: "Sentry",
		description: "Run automations when Sentry issues change.",
		category: "Monitoring",
		webPath: "/integrations/sentry",
		triggerKinds: ["sentry"],
	},
	{
		provider: "google",
		label: "Google",
		description: "Trigger automations from Google Calendar and Gmail.",
		category: "Productivity",
		webPath: "/integrations/google",
		triggerKinds: ["google_calendar", "gmail"],
	},
] as const satisfies readonly Integration[];

export type IntegrationProvider = (typeof INTEGRATIONS)[number]["provider"];

/**
 * The integrations to offer, given the AUTOMATION_EVENT_TRIGGERS payload — the
 * same value that decides the Add Trigger menu, so a provider never shows a
 * Connect button its triggers can't follow, or a trigger nothing can connect.
 */
export function offeredIntegrations(triggerFlagPayload: unknown) {
	const kinds = enabledTriggerKinds(triggerFlagPayload);
	return INTEGRATIONS.filter(
		(integration: Integration) =>
			integration.standalone === true ||
			integration.triggerKinds.some((kind) => kinds.has(kind)),
	);
}

export function isIntegrationOffered(
	provider: IntegrationProvider,
	triggerFlagPayload: unknown,
): boolean {
	return offeredIntegrations(triggerFlagPayload).some(
		(integration) => integration.provider === provider,
	);
}
