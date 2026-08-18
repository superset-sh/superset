export type LinearConfig = {
	provider: "linear";
	newTasksTeamId?: string;
};

export type SlackConfig = {
	provider: "slack";
};

export type IntegrationConfig = LinearConfig | SlackConfig;

/**
 * A trigger scope slot. `null` is unconfigured and never matches; it is
 * deliberately distinct from `{ mode: "any" }` so a half-filled trigger cannot
 * act on everything. Tagged rather than type-discriminated because ids are
 * user-defined strings, and a GitHub label named "any" is legal.
 */
export type TriggerScope =
	| null
	| { mode: "any" }
	| { mode: "list"; ids: string[] };

export type TriggerActor = "anyone" | "org_members" | { ids: string[] };

export type ScheduleTriggerConfig = {
	kind: "schedule";
	rrule: string;
	dtstart: string;
	timezone: string;
};

export type WebhookTriggerConfig = { kind: "webhook" };

export type GithubTriggerConfig = {
	kind: "github";
	events: string[];
	repositories: TriggerScope;
	branches: TriggerScope;
	labels: TriggerScope;
	actor: TriggerActor;
	includeForks: false;
};

export type SlackTriggerConfig = {
	kind: "slack";
	events: string[];
	channels: TriggerScope;
	emoji: TriggerScope;
	actor: TriggerActor;
	keyword?: string;
};

export type LinearTriggerConfig = {
	kind: "linear";
	events: string[];
	teams: TriggerScope;
	projects: TriggerScope;
};

export type SentryTriggerConfig = {
	kind: "sentry";
	events: string[];
	projects: TriggerScope;
	level: TriggerScope;
};

export type TriggerConfig =
	| ScheduleTriggerConfig
	| WebhookTriggerConfig
	| GithubTriggerConfig
	| SlackTriggerConfig
	| LinearTriggerConfig
	| SentryTriggerConfig;

/**
 * Provider-specific extras on a user identity.
 *
 * A union rather than a free jsonb blob: each provider declares what it may
 * store, so growth is visible in the type instead of hidden in the column. When
 * a provider's entry stops being a couple of fields, that is the signal to give
 * it a table.
 */
export type UserIdentityMetadata =
	| { provider: "slack"; modelPreference?: string }
	| { provider: "github" }
	| { provider: "google" };
