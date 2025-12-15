// Auth
export const AUTH_PROVIDERS = ["github", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

// Company
export const COMPANY = {
	NAME: "Superset",
	DOMAIN: "superset.sh",
	EMAIL_DOMAIN: "@superset.sh",
	GITHUB_URL: "https://github.com/superset-sh/superset",
	TERMS_URL: "https://superset.sh/terms",
	PRIVACY_URL: "https://superset.sh/privacy",
	CONTACT_URL: "https://x.com/superset_sh",
	REPORT_ISSUE_URL: "https://github.com/superset-sh/superset/issues/new",
	DISCORD_URL: "https://discord.gg/cZeD9WYcV7",
	SCRIPTS_URL: "https://superset.sh/scripts",
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

// PostHog Feature Flags
export const FEATURE_FLAGS = {
	/** When enabled, users must sign in to use the desktop app */
	REQUIRE_DESKTOP_AUTH: "require-desktop-auth",
} as const;
