import {
	enabledTriggerKinds,
	type TriggerConfigInput,
} from "./automation-triggers";
import { i18n } from "./i18n";

/**
 * The integration roster every surface renders from: the web integrations
 * index, the desktop settings pane, and desktop settings search. Icons and
 * accent colors stay per-app; `provider` matches the integration_provider
 * database enum.
 */
export interface Integration {
	provider: string;
	/** Brand name — never translated (see packages/i18n/glossary.md). */
	label: string;
	/**
	 * Display-only, localized at call time: packages/shared is imported by the
	 * CLI and host-service, so these stay functions rather than macro
	 * descriptors and are resolved where they are rendered.
	 */
	description: () => string;
	category: () => string;
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
		description: () =>
			i18n._({
				id: "shared.integrations.linear.description",
				message: "Sync issues bidirectionally with Linear.",
			}),
		category: () =>
			i18n._({
				id: "shared.integrations.category.taskManagement",
				message: "Task Management",
			}),
		webPath: "/integrations/linear",
		triggerKinds: ["linear"],
		standalone: true,
	},
	{
		provider: "github",
		label: "GitHub",
		description: () =>
			i18n._({
				id: "shared.integrations.github.description",
				message: "Connect repos and sync pull requests.",
			}),
		category: () =>
			i18n._({
				id: "shared.integrations.category.versionControl",
				message: "Version Control",
			}),
		webPath: "/integrations/github",
		triggerKinds: ["github"],
		standalone: true,
	},
	{
		provider: "slack",
		label: "Slack",
		description: () =>
			i18n._({
				id: "shared.integrations.slack.description",
				message: "Manage tasks from Slack conversations.",
			}),
		category: () =>
			i18n._({
				id: "shared.integrations.category.communication",
				message: "Communication",
			}),
		webPath: "/integrations/slack",
		triggerKinds: ["slack"],
		standalone: true,
	},
	{
		provider: "notion",
		label: "Notion",
		description: () =>
			i18n._({
				id: "shared.integrations.notion.description",
				message: "Run automations on data source and comment activity.",
			}),
		category: () =>
			i18n._({
				id: "shared.integrations.category.knowledge",
				message: "Knowledge",
			}),
		webPath: "/integrations/notion",
		triggerKinds: ["notion"],
	},
	{
		provider: "microsoft_teams",
		label: "Microsoft Teams",
		description: () =>
			i18n._({
				id: "shared.integrations.microsoft_teams.description",
				message: "Trigger automations from Teams channel messages.",
			}),
		category: () =>
			i18n._({
				id: "shared.integrations.category.communication",
				message: "Communication",
			}),
		webPath: "/integrations/microsoft-teams",
		triggerKinds: ["microsoft_teams"],
	},
	{
		provider: "sentry",
		label: "Sentry",
		description: () =>
			i18n._({
				id: "shared.integrations.sentry.description",
				message: "Run automations when Sentry issues change.",
			}),
		category: () =>
			i18n._({
				id: "shared.integrations.category.monitoring",
				message: "Monitoring",
			}),
		webPath: "/integrations/sentry",
		triggerKinds: ["sentry"],
	},
	{
		provider: "google",
		label: "Google",
		description: () =>
			i18n._({
				id: "shared.integrations.google.description",
				message: "Trigger automations from Google Calendar and Gmail.",
			}),
		category: () =>
			i18n._({
				id: "shared.integrations.category.productivity",
				message: "Productivity",
			}),
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
