import type { TriggerConfigInput } from "./automation-triggers";

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
// Root domain flips the whole brand at cutover. Default keeps superset.sh so
// nothing changes until NEXT_PUBLIC_ROOT_DOMAIN is set (e.g. boid.so). All
// domain-derived URLs below build off this; social handles / GitHub / Discord
// are external identities and are updated by hand on rebrand.
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "superset.sh";
const MARKETING_URL =
	process.env.NEXT_PUBLIC_MARKETING_URL || `https://${ROOT_DOMAIN}`;

export const COMPANY = {
	NAME: "Superset",
	DOMAIN: ROOT_DOMAIN,
	EMAIL_DOMAIN: `@${ROOT_DOMAIN}`,
	GITHUB_URL: "https://github.com/superset-sh/superset",
	DOCS_URL: process.env.NEXT_PUBLIC_DOCS_URL || `https://docs.${ROOT_DOMAIN}`,
	MARKETING_URL,
	TERMS_URL: `${MARKETING_URL}/terms`,
	PRIVACY_URL: `${MARKETING_URL}/privacy`,
	CHANGELOG_URL: `${MARKETING_URL}/changelog`,
	X_URL: "https://x.com/superset_sh",
	LINKEDIN_URL: "https://www.linkedin.com/company/superset-sh",
	YOUTUBE_URL: "https://www.youtube.com/@superset-sh",
	MAIL_TO: `mailto:support@${ROOT_DOMAIN}`,
	FOUNDERS_EMAIL: `founders@${ROOT_DOMAIN}`,
	FOUNDERS_MAIL_TO: `mailto:founders@${ROOT_DOMAIN}`,
	REPORT_ISSUE_URL: "https://github.com/superset-sh/superset/issues/new",
	DISCORD_URL: "https://discord.gg/cZeD9WYcV7",
	APP_STORE_URL: "https://apps.apple.com/app/id6788926383",
	STATUS_URL: `https://status.${ROOT_DOMAIN}`,
	TRUST_URL: `https://trust.${ROOT_DOMAIN}`,
	JOIN_US_URL: `${MARKETING_URL}/join-us`,
	/** The formal YC listing; product surfaces link here. `JOIN_US_URL` is our own marketing page. */
	CAREERS_URL: "https://www.ycombinator.com/companies/superset/jobs",
} as const;

export const OPEN_ROLES = [
	{
		title: "Founding Engineer",
		location: "San Francisco, CA",
		url: "https://www.ycombinator.com/companies/superset/jobs/Nd9luiP-founding-engineer",
	},
] as const;

// Theme
export const THEME_STORAGE_KEY = "superset-theme";

// Download URLs
export const DOWNLOAD_URL_MAC_ARM64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Superset-arm64.dmg`;
export const DOWNLOAD_URL_MAC_X64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Superset-x64.dmg`;
export const DOWNLOAD_URL_LINUX_X64 = `${COMPANY.GITHUB_URL}/releases/latest/download/Superset-x86_64.AppImage`;

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

/** Days a pending-deletion account stays recoverable before it may be purged. */
export const ACCOUNT_DELETION_GRACE_DAYS = 30;

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
	/** Gates access to Cloud features (environment variables, sandboxes). */
	CLOUD_ACCESS: "cloud-access",
	/** When enabled, blocks remote agent execution on the desktop (e.g., for enterprise orgs). */
	DISABLE_REMOTE_AGENT: "disable-remote-agent",
	/**
	 * Paces the v1→v2 auto-migration rollout (percentage ramp + high-profile
	 * org exclusions). Gates only NEW migrations on the v1 surface — post-flip
	 * catch-up passes are ungated so flipped machines always finish. Off,
	 * unloaded, or offline all mean "don't migrate yet" (stays on v1).
	 */
	V1_AUTO_MIGRATION: "v1-auto-migration",
	/**
	 * Shows the "We're Hiring" card in the dashboard sidebar. Targets a static
	 * PostHog cohort of users who have created 10+ workspaces all-time, which is
	 * the only place that history exists — workspace rows are hard-deleted, so a
	 * lifetime count can't be derived from the DB. The cohort is a frozen
	 * snapshot because PostHog rejects behavioral cohorts in flags; re-populate
	 * it to reach users who cross the threshold later.
	 */
	HIRING_BANNER: "hiring-banner",
	/** Shows the "Star Superset on GitHub" sidebar card once a user crosses the workspace-count threshold. Lets us kill the nag instantly without a release if it reads as annoying. */
	STAR_NAG_CARD: "star-nag-card",
	/**
	 * Which trigger providers the Add Trigger menu offers. Payload is a JSON
	 * array of provider kinds, e.g. `["github", "slack"]`; Scheduled is always
	 * offered. Off, unloaded, offline, or a payload that isn't an array all
	 * mean Scheduled only — the event providers exist on main ahead of their
	 * credentials being provisioned, and each is exposed by adding its kind.
	 *
	 * The same payload decides which integrations the settings and web
	 * integrations pages offer: one that only feeds automations is shown when
	 * one of its kinds is enabled (`offeredIntegrations` in
	 * `@superset/shared/integrations`), so a provider is connectable exactly
	 * when its triggers are.
	 */
	AUTOMATION_EVENT_TRIGGERS: "automation-event-triggers",
	/**
	 * Experiment flag (control/test): renders the new-workspace surface as a
	 * full-screen view with sample prompts instead of the dense modal.
	 * Eligibility (new accounts only) is a release condition on the flag —
	 * `created_at` person property, sent with flag requests at identify time —
	 * and the flag is only evaluated when the surface opens, so
	 * `$feature_flag_called` exposure matches the experiment population.
	 */
	NEW_WORKSPACE_SCREEN: "new-workspace-screen",
	/**
	 * Boolean override that forces the new-workspace screen (test-arm UI)
	 * without evaluating the experiment flag — no exposure event, so team
	 * members and dev accounts can use the screen without contaminating the
	 * experiment. Checked before eligibility and before the experiment flag.
	 */
	NEW_WORKSPACE_SCREEN_OVERRIDE: "new-workspace-screen-override",
	/**
	 * Three-arm experiment flag nested inside the shipped new-workspace screen,
	 * testing form factor only: `control` keeps the inline sample-prompt rows,
	 * `cards2` shows two cards above the composer, `cards4` shows four in a 2x2
	 * grid. Every arm slices a nested prefix of one fixed prompt pool and shares
	 * the same selection rule, so content is identical and only layout and count
	 * vary. Evaluated when the screen opens, like NEW_WORKSPACE_SCREEN, so
	 * exposure matches the population that sees it.
	 *
	 * Anything other than `cards2`/`cards4` renders control — which is why the
	 * flag must not go live before a build carrying those arms ships, or older
	 * builds would be assigned a card arm and shown rows.
	 *
	 * Eligibility (new accounts only) is a release condition on the flag, not
	 * code: a `created_at` person property cutoff, which the renderer sends with
	 * flag requests at identify time. Existing accounts get `false` back and
	 * render the rows exactly as they do today, with no exposure recorded.
	 */
	NEW_WORKSPACE_PROMPT_CARDS: "new-workspace-prompt-cards",
	/**
	 * Boolean override that forces the `cards2` arm without evaluating the
	 * experiment flag — no exposure event, so team and dev accounts can look at
	 * the cards without entering the analysis. Checked before the experiment
	 * flag, same as NEW_WORKSPACE_SCREEN_OVERRIDE.
	 */
	NEW_WORKSPACE_PROMPT_CARDS_OVERRIDE: "new-workspace-prompt-cards-override",
	/**
	 * Shows the rebuilt chat pane (ChatV3Pane). UI-only: host-service always
	 * serves its `/chat-v3/*` routes, so this flag decides who sees the pane,
	 * not what the host can do — flips take effect live, with no host restart.
	 */
	CHAT_V3: "chat-v3",
	/**
	 * Shows the cloud-workspace option in the create picker. The API gates
	 * these to @superset.sh accounts independently, so the flag controls
	 * visibility rather than access.
	 */
	CLOUD_WORKSPACES: "cloud-workspaces",
	/**
	 * Shows the Plugins page in the v2 dashboard sidebar. Audience is a
	 * release condition on the flag (email contains @superset.sh, plus an
	 * override for the local dev account, which is not on that domain) so
	 * widening the rollout never needs a release. Everything the page does is
	 * desktop-local; the flag controls visibility, not capability.
	 */
	PLUGINS: "plugins",
	PAGES: "pages",
} as const;

/**
 * The trigger kinds the server accepts on save. The AUTOMATION_EVENT_TRIGGERS
 * flag payload gates which of these each user's Add Trigger menu offers;
 * flipping a provider off for everyone is deleting its line here.
 */
export const LAUNCHED_TRIGGER_KINDS = [
	"schedule",
	"webhook",
	"github",
	"slack",
	"linear",
	"sentry",
	"notion",
	"microsoft_teams",
	"google_calendar",
	"gmail",
] as const satisfies readonly TriggerConfigInput["kind"][];

/**
 * What a cloud workspace sandbox holds in place of a real model API key. The
 * provider's egress proxy substitutes the real one after the request leaves,
 * so this is the only credential-shaped string inside a sandbox.
 *
 * Shared because two places must agree on it byte-for-byte: the sandbox spec
 * that sets it as an env var, and the image's pre-seeded Claude config, which
 * pre-approves it by its last 20 characters.
 */
export const SANDBOX_CREDENTIAL_PLACEHOLDER =
	"proxy-injected-see-network-routing";

/**
 * Where a cloud workspace's checkout lives. The sandbox's checkout *is* the
 * workspace, so this is both the clone target and the path the image marks as
 * trusted ahead of time.
 */
export const SANDBOX_WORKSPACE_PATH = "/workspace";

/**
 * host.db inside a sandbox. Separate from the checkout so a persistent volume
 * can mount over it without touching the workspace, and so the image can ship
 * a pre-migrated template alongside it.
 */
export const SANDBOX_HOST_DB_PATH = "/data/host.db";

export const SANDBOX_IMAGE_NAME = "superset-hostsvc";

export const SHARED_ENVIRONMENT_ORGANIZATION_ID =
	"00000000-0000-0000-0000-000000000000";

export const SHARED_ENVIRONMENT_NAME = "Default";

/**
 * Every cloud workspace clones this. Environments cannot carry repositories yet,
 * so there is nothing per-workspace to resolve and no project to pick.
 */
export const CLOUD_WORKSPACE_REPO = {
	owner: "superset-sh",
	name: "superset",
} as const;

// Terminal identity presented to shell programs via TERM_PROGRAM. kitty:
// agent TUIs (claude-code especially) tune wheel-scroll compensation per
// TERM_PROGRAM, and our terminals install the full-fidelity wheel handler
// (@superset/shared/terminal-wheel-handler) that produces a native
// kitty/iTerm-grade report stream. Under kitty-class identities TUIs trust
// that stream as-is; a vscode identity would make claude-code amplify each
// report (its compensation for xterm.js's damped stock stream) and
// over-scroll ~3x. The identity and the wheel handler must ship together —
// reverting one without the other reintroduces slow or runaway scrolling.
// Kitty *keyboard protocol* support is advertised separately via the CSI-u
// capability probe.
export const TERMINAL_TERM_PROGRAM = "kitty";
// A plausible kitty version: TUIs may version-gate quirk handling against
// real kitty releases, so keep this roughly current when touching terminal code.
export const TERMINAL_TERM_PROGRAM_VERSION = "0.42.0";
