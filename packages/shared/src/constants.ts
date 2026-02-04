// Auth
export const AUTH_PROVIDERS = ["github", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

// Deep link protocol schemes (used for desktop OAuth callbacks)
export const PROTOCOL_SCHEMES = {
	DEV: "superset-dev",
	PROD: "superset",
} as const;

// Company
export const COMPANY = {
	NAME: "Superset",
	DOMAIN: "superset.sh",
	EMAIL_DOMAIN: "@superset.sh",
	GITHUB_URL: "https://github.com/superset-sh/superset",
	DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL || "https://docs.superset.sh",
	MARKETING_URL: process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh",
	TERMS_URL: `${process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh"}/terms`,
	PRIVACY_URL:
		(process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh") +
		"/privacy",
	CHANGELOG_URL:
		(process.env.NEXT_PUBLIC_MARKETING_URL || "https://superset.sh") +
		"/changelog",
	X_URL: "https://x.com/superset_sh",
	MAIL_TO: "mailto:founders@superset.sh",
	REPORT_ISSUE_URL: "https://github.com/superset-sh/superset/issues/new",
	DISCORD_URL: "https://discord.gg/cZeD9WYcV7",
} as const;

// Theme
export const THEME_STORAGE_KEY = "superset-theme";

// Download URLs
export const DOWNLOAD_URL_MAC_ARM64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Superset-arm64.dmg`;

// Auth token configuration
export const TOKEN_CONFIG = {
	/** Access token lifetime in seconds (1 hour) */
	ACCESS_TOKEN_EXPIRY: 60 * 60,
	/** Refresh token lifetime in seconds (30 days) */
	REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60,
	/** Refresh access token when this many seconds remain (5 minutes) */
	REFRESH_THRESHOLD: 5 * 60,
} as const;

// PostHog
export const POSTHOG_COOKIE_NAME = "superset";

export const FEATURE_FLAGS = {
	/** Gates access to experimental Electric SQL tasks feature. */
	ELECTRIC_TASKS_ACCESS: "electric-tasks-access",
	/** Gates access to billing features. */
	BILLING_ENABLED: "billing-enabled",
	/** Gates access to GitHub integration (currently buggy, internal only). */
	GITHUB_INTEGRATION_ACCESS: "github-integration-access",
	/** Gates access to AI chat (@superset.sh internal only). */
	AI_CHAT: "ai-chat",
	/** Gates access to Slack integration (internal only). */
	SLACK_INTEGRATION_ACCESS: "slack-integration-access",
} as const;
