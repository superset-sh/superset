// Auth
export const AUTH_PROVIDERS = ["github", "google"] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export const ORGANIZATION_HEADER = "x-superset-organization-id";

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
	LINKEDIN_URL: "https://www.linkedin.com/company/superset-sh",
	YOUTUBE_URL: "https://www.youtube.com/@superset-sh",
	MAIL_TO: "mailto:founders@superset.sh",
	REPORT_ISSUE_URL: "https://github.com/superset-sh/superset/issues/new",
	DISCORD_URL: "https://discord.gg/cZeD9WYcV7",
	STATUS_URL: "https://status.superset.sh",
	TRUST_URL: "https://trust.superset.sh",
	CAREERS_URL: "https://www.ycombinator.com/companies/superset/jobs",
} as const;

// Theme
export const THEME_STORAGE_KEY = "superset-theme";

// Download URLs
export const DOWNLOAD_URL_MAC_ARM64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Superset-arm64.dmg`;
export const DOWNLOAD_URL_MAC_X64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Superset-x64.dmg`;

// Auth token configuration
export const TOKEN_CONFIG = {
	/** Access token lifetime in seconds (1 hour) */
	ACCESS_TOKEN_EXPIRY: 60 * 60,
	/** Refresh token lifetime in seconds (30 days) */
	REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60,
	/** Refresh access token when this many seconds remain (5 minutes) */
	REFRESH_THRESHOLD: 5 * 60,
} as const;

// Workspace teardown
export const TEARDOWN_TIMEOUT_MS = 60_000;

// PostHog
export const POSTHOG_COOKIE_NAME = "superset";

// v2-only users have the v1↔v2 surface switch hidden and v2 cloud forced on.
// Two windows of account-creation time qualify (stored as ISO strings so the
// values are identical on server, desktop renderer, web, and admin):
//   [V2_ONLY_USER_CUTOFF, V2_NEW_USER_V1_EXPERIMENT_START) — the original v2-only
//     cohort.
//   [V2_NEW_USER_V2_DEFAULT_START, ∞) — new users now default to v2.
// The gap [V2_NEW_USER_V1_EXPERIMENT_START, V2_NEW_USER_V2_DEFAULT_START) is the
// new-users-v1 experiment cohort; they started in v1 and stay there — flipping
// the default must never pull existing v1 users into v2. Pre-cutoff users keep
// the existing opt-in toggle.
// 2026-05-15 14:00 UTC = Fri 07:00 PDT / 10:00 EDT.
export const V2_ONLY_USER_CUTOFF = "2026-05-15T14:00:00.000Z";
// 2026-06-08 06:59 UTC = Sun 23:59 PDT (11:59pm Pacific).
export const V2_NEW_USER_V1_EXPERIMENT_START = "2026-06-08T06:59:00.000Z";
// Rollout boundary: accounts created at/after this default to v2. Set to the
// 2026-07-09 release cutover, 10:00 AM Pacific (PDT, UTC-7) = 17:00 UTC. Everyone
// who signed up before the cutover stays on v1, so no existing v1 user flips.
// Bump this if the release slips.
export const V2_NEW_USER_V2_DEFAULT_START = "2026-07-09T17:00:00.000Z";

export const FEATURE_FLAGS = {
	/** Gates access to experimental Electric SQL tasks feature. */
	ELECTRIC_TASKS_ACCESS: "electric-tasks-access",
	/** Gates access to the experimental mobile-first agents UI on web. */
	WEB_AGENTS_UI_ACCESS: "web-agents-ui-access",
	/** Gates access to GitHub integration (currently buggy, internal only). */
	GITHUB_INTEGRATION_ACCESS: "github-integration-access",
	/** Gates access to Cloud features (environment variables, sandboxes). */
	CLOUD_ACCESS: "cloud-access",
	/** When enabled, blocks remote agent execution on the desktop (e.g., for enterprise orgs). */
	DISABLE_REMOTE_AGENT: "disable-remote-agent",
	/**
	 * Routes the Slack agent to the v2 MCP server (`@superset/mcp-v2`)
	 * instead of v1 (`@superset/mcp`). Evaluated against the linking
	 * user's id (the Superset user behind the Slack mention) so it
	 * piggybacks on the existing All Access cohort. Off → v1.
	 */
	SLACK_MCP_V2: "slack-mcp-v2",
	/**
	 * Per-user override for the relay base URL. Payload shape:
	 * `{ "url": "https://..." }`. When set, both the host-service tunnel and
	 * the desktop renderer's client-side WS opens route through this URL
	 * instead of `env.RELAY_URL`. Lets us A/B-test alternative relay
	 * implementations (e.g. Cloudflare Durable Objects) without changing
	 * defaults for other users.
	 */
	RELAY_URL_OVERRIDE: "relay-url-override",
} as const;

// Terminal identity presented to shell programs via TERM_PROGRAM. vscode, not
// kitty: agent TUIs (claude-code especially) tune wheel-scroll compensation
// and terminal quirks per TERM_PROGRAM, and the vscode assumptions match our
// xterm.js terminals — notably that they send ~one throttled scroll event per
// wheel notch, so TUIs apply their own scroll multiplier. Kitty *keyboard
// protocol* support is advertised separately via the CSI-u capability probe.
export const TERMINAL_TERM_PROGRAM = "vscode";
// A plausible VS Code version: TUIs version-gate quirk handling against real
// VS Code releases, so keep this roughly current when touching terminal code.
export const TERMINAL_TERM_PROGRAM_VERSION = "1.128.0";
