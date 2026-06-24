export type LinearConfig = {
	provider: "linear";
	newTasksTeamId?: string;
};

export type SlackConfig = {
	provider: "slack";
};

export type GitLabConfig = {
	provider: "gitlab";
	/** Instance host, e.g. "gitlab.com" or a self-managed host. */
	host: string;
	/** How the connection authenticates: OAuth flow vs a pasted Group Access Token. */
	authMode: "oauth" | "token";
	/** Full path of the connected group (e.g. "acme/platform"), for display + API calls. */
	groupPath?: string;
	/**
	 * Shared secret for per-project webhooks (sent as `X-Gitlab-Token`, verified
	 * constant-time). Generated lazily on first sync; absent until then.
	 */
	webhookSecret?: string;
};

export type IntegrationConfig = LinearConfig | SlackConfig | GitLabConfig;
