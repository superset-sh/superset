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

/**
 * A member's own GitHub account, connected through the GitHub App's user
 * authorization. Per member, unlike the installation, which is the org's.
 */
export type GithubConfig = {
	provider: "github";
	login: string;
	githubUserId: string;
	avatarUrl?: string;
};

/**
 * One Graph change-notification subscription this connection holds. Kept on
 * the connection because it is the connection's: renewed by the cron, replaced
 * on reconnect, deleted on disconnect.
 */
export type MicrosoftTeamsSubscription = {
	id: string;
	expiresAt: string;
};

export type MicrosoftTeamsConfig = {
	provider: "microsoft_teams";
	tenantId: string;
	// Graph echoes this in every notification; it is the only thing that says a
	// POST to the notify route came from Graph and not from anyone with the URL.
	clientState: string;
	subscriptions: {
		channelMessages?: MicrosoftTeamsSubscription;
		channels?: MicrosoftTeamsSubscription;
	};
};

/**
 * A public Sentry integration is one app with one client secret (an env var),
 * so unlike Linear/Slack there is no per-connection secret here. What is per
 * connection is the installation uuid: it is how an inbound webhook, which
 * names no Superset org, finds the connection it belongs to. Never select
 * `config` into a client-facing response.
 */
export type SentryConfig = {
	provider: "sentry";
	/** Sentry's per-install id; the webhook's only link back to this row. */
	installationUuid?: string;
	/** The org's region API origin, e.g. https://us.sentry.io. */
	regionUrl?: string;
};

/**
 * One watched calendar's sync state. Google's push carries no payload, only
 * "something changed"; the sync token is what turns that into a diff, and the
 * channel is what has to be renewed before it expires.
 */
export type GoogleCalendarWatchState = {
	summary?: string;
	syncToken?: string;
	/** When the calendar was first synced; earlier events are never "created". */
	watchedSince?: string;
	channelId?: string;
	resourceId?: string;
	/**
	 * SHA-256 of the token Google echoes back as `X-Goog-Channel-Token`. A
	 * hash because this column is read by every member's client through
	 * `integration.list`; the token itself is what authenticates a push.
	 */
	channelTokenHash?: string;
	/** Epoch milliseconds, as Google reports it. */
	channelExpiresAt?: number;
};

export type GoogleConfig = {
	provider: "google";
	calendars?: Record<string, GoogleCalendarWatchState>;
	gmail?: {
		/** Where the next history.list starts. */
		historyId?: string;
		/** Epoch milliseconds; users.watch lasts seven days at most. */
		watchExpiresAt?: number;
	};
};

export type IntegrationConfig =
	| LinearConfig
	| SlackConfig
	| MicrosoftTeamsConfig
	| SentryConfig
	| GoogleConfig
	| GithubConfig;

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
export type MicrosoftTeamsTriggerConfig = Extract<
	TriggerConfig,
	{ kind: "microsoft_teams" }
>;
export type GoogleCalendarTriggerConfig = Extract<
	TriggerConfig,
	{ kind: "google_calendar" }
>;
export type GmailTriggerConfig = Extract<TriggerConfig, { kind: "gmail" }>;

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
	// The external id is the account address, since that is what calendar
	// events and mail headers name people by; the stable subject id rides here.
	| { provider: "google"; sub?: string };
