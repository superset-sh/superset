import { ROOT_DOMAIN } from "./app-identity";
import type { TriggerConfigInput } from "./automation-triggers";

export { CANONICAL_URLS, IOS_APP } from "./app-identity";

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
// nothing changes until NEXT_PUBLIC_ROOT_DOMAIN is set. All
// domain-derived URLs below build off this; social handles / GitHub / Discord
// are external identities and are updated by hand on rebrand.
const SUPPORT_EMAIL = `support@${ROOT_DOMAIN}`;
const MARKETING_URL =
	process.env.NEXT_PUBLIC_MARKETING_URL || `https://${ROOT_DOMAIN}`;
const APP_STORE_ID = "6788926383";

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
	SUPPORT_EMAIL,
	MAIL_TO: `mailto:${SUPPORT_EMAIL}`,
	TEAM_EMAIL: `team@${ROOT_DOMAIN}`,
	TEAM_MAIL_TO: `mailto:team@${ROOT_DOMAIN}`,
	REPORT_ISSUE_URL: "https://github.com/superset-sh/superset/issues/new",
	DISCORD_URL: "https://discord.gg/cZeD9WYcV7",
	APP_STORE_ID,
	APP_STORE_URL: `https://apps.apple.com/app/id${APP_STORE_ID}`,
	STATUS_URL: `https://status.${ROOT_DOMAIN}`,
	TRUST_URL: `https://trust.${ROOT_DOMAIN}`,
	JOIN_US_URL: `${MARKETING_URL}/careers`,
	/** The formal YC listing; product surfaces link here. `JOIN_US_URL` is our own marketing page. */
	CAREERS_URL: "https://www.ycombinator.com/companies/superset/jobs",
} as const;

// Staff keep their @superset.sh accounts after the root domain changes.
export const STAFF_EMAIL_DOMAINS = [
	...new Set([COMPANY.EMAIL_DOMAIN, "@superset.sh"]),
];

export function isStaffEmail(email: string): boolean {
	return STAFF_EMAIL_DOMAINS.some((domain) => email.endsWith(domain));
}

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
	/**
	 * The public Superset Mobile launch. Off, unloaded, or unreachable all mean
	 * "not launched": the marketing site hides /mobile from navigation and the
	 * sitemap and disables indexing. Evaluated per site, not per
	 * visitor, so keep it a plain on/off flag — a percentage rollout would
	 * hash the site's single distinct id to one side.
	 */
	MOBILE_LAUNCH: "mobile-launch",
	/** Gates access to Cloud features (environment variables, sandboxes). */
	CLOUD_ACCESS: "cloud-access",
	/** Allowlist for mobile voice mode: shows the entry and authorizes `voice.createSession`. */
	MOBILE_VOICE_MODE: "mobile-voice-mode",
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
	 * Three-arm experiment flag nested inside the shipped new-workspace screen,
	 * testing form factor only: `control` keeps the inline sample-prompt rows,
	 * `cards2` shows two cards above the composer, `cards4` shows four in a 2x2
	 * grid. Every arm slices a nested prefix of one fixed prompt pool and shares
	 * the same selection rule, so content is identical and only layout and count
	 * vary. Evaluated when the screen opens, so exposure matches the population
	 * that sees it.
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
	 * flag.
	 */
	NEW_WORKSPACE_PROMPT_CARDS_OVERRIDE: "new-workspace-prompt-cards-override",
	/**
	 * Shows the rebuilt chat pane (ChatV3Pane). UI-only: host-service always
	 * serves its `/chat-v3/*` routes, so this flag decides who sees the pane,
	 * not what the host can do — flips take effect live, with no host restart.
	 */
	CHAT_V3: "chat-v3",
	/**
	 * Replaces the v2 workspace's right sidebar with a second pane area that
	 * holds Files, Changes, Review, Browser and Chat panes.
	 */
	RIGHT_PANE_AREA: "right-pane-area",
	/**
	 * Who may use cloud sandboxes: shows the option in the create picker, and
	 * gates the cloud procedures server-side (`assertCloudAccess`). The release
	 * conditions are the allowlist, so access changes without a deploy.
	 */
	CLOUD_WORKSPACES: "cloud-workspaces",
	/**
	 * Renders cloud workspaces as rows of their GitHub repo's project in the
	 * desktop sidebar instead of in a separate Cloud section. UI-only and
	 * renderer-local: off, unloaded, or offline all keep the Cloud section, so
	 * flips take effect live and nothing on a host changes.
	 */
	SIDEBAR_INLINE_CLOUD_WORKSPACES: "sidebar-inline-cloud-workspaces",
	/**
	 * Lets the Slack agent answer replies in a thread it has already replied
	 * in without an @-mention. Evaluated per Slack team; off, unloaded or
	 * offline all mean mention-only.
	 */
	SLACK_THREAD_FOLLOW_UPS: "slack-thread-follow-ups",
	/**
	 * Shows the Plugins page in the v2 dashboard sidebar. Audience is a
	 * release condition on the flag (email contains @superset.sh, plus an
	 * override for the local dev account, which is not on that domain) so
	 * widening the rollout never needs a release. Everything the page does is
	 * desktop-local; the flag controls visibility, not capability.
	 */
	PLUGINS: "plugins",
	/**
	 * Lock Screen / Dynamic Island agent card on iOS. Off by default while the
	 * card is still being worked on; the flag's release conditions decide who
	 * sees it, so a new build ships with it dark and no release widens it.
	 */
	MOBILE_LIVE_ACTIVITY: "mobile-live-activity",
	/**
	 * Shows the ACP chat pane: a chat UI that attaches to a Claude/Codex
	 * session in the workspace over the Agent Client Protocol. UI-only: the
	 * flag decides who sees the pane, not what the host can do. Off, unloaded,
	 * or offline all mean "no pane" — flips take effect live. Audience is a
	 * release condition on the flag, so widening never needs a release.
	 */
	ACP_CHAT: "acp-chat",
	/**
	 * Shows the `pdev` agent: in the agent catalog, agent pickers
	 * and, with ACP_CHAT, as a chat harness (`pdev acp`). Off, unloaded or
	 * offline all hide it. Hosts never seed it, so a user only gets it by
	 * adding it while the flag is on.
	 */
	PDEV_AGENT: "pdev-agent",
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
	"gmail",
] as const satisfies readonly TriggerConfigInput["kind"][];

/**
 * A run that tried and broke. Separate from MISSED_RUN_STATUSES because most
 * of what used to read as "failed" was a schedule firing at a sleeping
 * laptop, which is not a failure and is rarely worth retrying hours later.
 */
export const FAILED_RUN_STATUSES = ["dispatch_failed"] as const;

/** A run that never started: no host was online when its schedule came due. */
export const MISSED_RUN_STATUSES = ["skipped_offline"] as const;

/** Everything that did not produce a workspace, failed or missed. */
export const UNSUCCESSFUL_RUN_STATUSES = [
	...FAILED_RUN_STATUSES,
	...MISSED_RUN_STATUSES,
] as const;

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

export const SANDBOX_IMAGE_NAME = "superset-hostsvc";

/** The one transaction the API traces: the cloud workspace provision job. */
export const CLOUD_WORKSPACE_PROVISION_TRANSACTION =
	"cloud-workspace.provision";

export const SHARED_ENVIRONMENT_ORGANIZATION_ID =
	"00000000-0000-0000-0000-000000000000";

export const SHARED_ENVIRONMENT_NAME = "Default";

// Terminals set no TERM_PROGRAM, like xterm. Agents take kitty-only paths
// under "kitty" that xterm.js cannot serve, and under "vscode" Claude Code
// amplifies the full-fidelity wheel stream ~2x. Without it, agents identify
// the terminal from its XTVERSION reply ("Superset (xterm.js)", see the
// desktop terminal-version-reply) and the CSI-u probe.
export const TERMINAL_IDENTITY_ENV_KEYS = [
	"TERM_PROGRAM",
	"TERM_PROGRAM_VERSION",
] as const;
