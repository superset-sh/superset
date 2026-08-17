import type {
	TriggerActor as TriggerConfigActor,
	TriggerConfigInput,
	TriggerScope as TriggerConfigScope,
} from "@superset/shared/automation-triggers";

export type LinearConfig = {
	provider: "linear";
	newTasksTeamId?: string;
};

export type SlackConfig = {
	provider: "slack";
};

export type IntegrationConfig = LinearConfig | SlackConfig;

/**
 * The trigger config column, typed from the zod schema that validates every
 * write to it. Derived rather than restated: a hand-written copy here had
 * already drifted (`events: string[]` where the schema says `event: string`,
 * an `"org_members"` actor the schema never had), and the only thing keeping
 * it from a runtime mismatch was an `as never` at the read site.
 */
export type TriggerConfig = TriggerConfigInput;
export type TriggerScope = TriggerConfigScope;
export type TriggerActor = TriggerConfigActor;

export type ScheduleTriggerConfig = Extract<
	TriggerConfig,
	{ kind: "schedule" }
>;
export type WebhookTriggerConfig = Extract<TriggerConfig, { kind: "webhook" }>;
export type GithubTriggerConfig = Extract<TriggerConfig, { kind: "github" }>;
export type SlackTriggerConfig = Extract<TriggerConfig, { kind: "slack" }>;
export type LinearTriggerConfig = Extract<TriggerConfig, { kind: "linear" }>;
export type SentryTriggerConfig = Extract<TriggerConfig, { kind: "sentry" }>;

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
