import {
	INTEGRATIONS,
	type IntegrationProvider,
} from "@superset/shared/integrations";
import type { SettingsSection } from "renderer/stores/settings-state";

export const SETTING_ITEM_ID = {
	ACCOUNT_PROFILE: "account-profile",
	ACCOUNT_SIGNOUT: "account-signout",
	ACCOUNT_DELETE: "account-delete",
	ACCOUNT_LEADERBOARD: "account-leaderboard",

	ORGANIZATION_LOGO: "organization-logo",
	ORGANIZATION_NAME: "organization-name",
	ORGANIZATION_SLUG: "organization-slug",
	ORGANIZATION_ID: "organization-id",
	ORGANIZATION_MEMBERS_LIST: "organization-members-list",
	ORGANIZATION_MEMBERS_INVITE: "organization-members-invite",
	ORGANIZATION_MEMBERS_PENDING_INVITATIONS:
		"organization-members-pending-invitations",
	ORGANIZATION_DELETE: "organization-delete",

	TEAMS_LIST: "teams-list",

	APPEARANCE_THEME: "appearance-theme",
	APPEARANCE_LANGUAGE: "appearance-language",
	APPEARANCE_MARKDOWN: "appearance-markdown",
	APPEARANCE_CUSTOM_THEMES: "appearance-custom-themes",
	APPEARANCE_EDITOR_FONT: "appearance-editor-font",
	APPEARANCE_TERMINAL_FONT: "appearance-terminal-font",

	RINGTONES_NOTIFICATION: "ringtones-notification",

	USAGE_TOKENS: "usage-tokens",
	USAGE_RESOURCES: "usage-resources",

	KEYBOARD_SHORTCUTS: "keyboard-shortcuts",
	BEHAVIOR_CONFIRM_QUIT: "behavior-confirm-quit",
	BEHAVIOR_FILE_OPEN_MODE: "behavior-file-open-mode",
	BEHAVIOR_CHANGES_OPEN_TARGET: "behavior-changes-open-target",
	BEHAVIOR_RESOURCE_MONITOR: "behavior-resource-monitor",
	BEHAVIOR_OPEN_LINKS_IN_APP: "behavior-open-links-in-app",
	BEHAVIOR_STAR_GITHUB: "behavior-star-github",

	BROWSER_HOMEPAGE: "browser-homepage",
	BROWSER_IMPORT_HISTORY: "browser-import-history",

	GIT_BRANCH_PREFIX: "git-branch-prefix",
	GIT_DELETE_LOCAL_BRANCH: "git-delete-local-branch",
	GIT_WORKTREE_LOCATION: "git-worktree-location",

	AGENTS_ENABLED: "agents-enabled",
	AGENTS_COMMANDS: "agents-commands",
	AGENTS_TASK_PROMPTS: "agents-task-prompts",

	TERMINAL_PRESETS: "terminal-presets",
	TERMINAL_QUICK_ADD: "terminal-quick-add",
	TERMINAL_SESSIONS: "terminal-sessions",
	TERMINAL_LINK_BEHAVIOR: "terminal-link-behavior",
	TERMINAL_BACKGROUND_LIMIT: "terminal-background-limit",
	TERMINAL_COPY_ON_SELECT: "terminal-copy-on-select",

	LINKS_FILE: "links-file",
	LINKS_FOLDER: "links-folder",
	LINKS_URL: "links-url",
	LINKS_SIDEBAR_FILE: "links-sidebar-file",
	LINKS_PORT: "links-port",

	EXPERIMENTAL_SUPERSET_V2: "experimental-superset-v2",
	EXPERIMENTAL_V1_MIGRATION: "experimental-v1-migration",
	EXPERIMENTAL_INLINE_WORKSPACE_PORTS: "experimental-inline-workspace-ports",
	EXPERIMENTAL_WORKSPACE_AGENTS: "experimental-workspace-agents",
	EXPERIMENTAL_WAIT_FOR_SETUP_BEFORE_AGENT:
		"experimental-wait-for-setup-before-agent",

	BILLING_OVERVIEW: "billing-overview",
	BILLING_PLANS: "billing-plans",
	BILLING_USAGE: "billing-usage",

	PROJECT_NAME: "project-name",
	PROJECT_PATH: "project-path",
	PROJECT_SCRIPTS: "project-scripts",
	PROJECT_BRANCH_PREFIX: "project-branch-prefix",
	PROJECT_WORKTREE_LOCATION: "project-worktree-location",
	PROJECT_SPARSE_CHECKOUT: "project-sparse-checkout",
	PROJECT_IMPORT_WORKTREES: "project-import-worktrees",

	API_KEYS_LIST: "api-keys-list",
	API_KEYS_GENERATE: "api-keys-generate",

	PERMISSIONS_FULL_DISK_ACCESS: "permissions-full-disk-access",
	PERMISSIONS_ACCESSIBILITY: "permissions-accessibility",
	PERMISSIONS_MICROPHONE: "permissions-microphone",
	PERMISSIONS_APPLE_EVENTS: "permissions-apple-events",
	PERMISSIONS_LOCAL_NETWORK: "permissions-local-network",

	SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY:
		"security-expose-host-service-via-relay",

	HOST_MEMBERS: "host-members",
	ENVIRONMENTS_LIST: "environments-list",
	ENVIRONMENTS_SECRETS: "environments-secrets",
	HOST_INVITE_MEMBER: "host-invite-member",
	HOST_MEMBER_ROLE: "host-member-role",
	HOST_WORKTREE_LOCATION: "host-worktree-location",
	HOST_DELETE: "host-delete",
} as const;

/** One settings-search row per roster entry, id derived from the provider. */
export function integrationSettingItemId<P extends IntegrationProvider>(
	provider: P,
): `integrations-${P}` {
	return `integrations-${provider}`;
}

type IntegrationSettingItemId = `integrations-${IntegrationProvider}`;

export type SettingItemId =
	| (typeof SETTING_ITEM_ID)[keyof typeof SETTING_ITEM_ID]
	| IntegrationSettingItemId;

export interface SettingsItem {
	id: SettingItemId;
	section: SettingsSection;
	title: string;
	description: string;
	keywords: string[];
}

/**
 * Which v1/v2 variant of the desktop UI a setting applies to.
 * - "v1": only used by the legacy desktop UI; hide when the user is on v2.
 * - "v2": only meaningful in the v2 desktop UI; hide when the user is on v1.
 * - "shared": applies to both (or is provided by a global/cloud surface).
 *
 * Source of truth for the v1/v2 settings audit. When adding a new setting,
 * pick a variant or it will fail typecheck on the registry below.
 */
export type SettingVariant = "v1" | "v2" | "shared";

const INTEGRATION_ITEM_VARIANTS = Object.fromEntries(
	INTEGRATIONS.map((integration) => [
		integrationSettingItemId(integration.provider),
		"shared",
	]),
) as Record<IntegrationSettingItemId, SettingVariant>;

export const SETTING_ITEM_VARIANT: Record<SettingItemId, SettingVariant> = {
	...INTEGRATION_ITEM_VARIANTS,

	[SETTING_ITEM_ID.ACCOUNT_PROFILE]: "shared",
	[SETTING_ITEM_ID.ACCOUNT_SIGNOUT]: "shared",
	[SETTING_ITEM_ID.ACCOUNT_DELETE]: "shared",
	[SETTING_ITEM_ID.ACCOUNT_LEADERBOARD]: "shared",

	[SETTING_ITEM_ID.ORGANIZATION_LOGO]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_NAME]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_SLUG]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_ID]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_MEMBERS_LIST]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_MEMBERS_INVITE]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_MEMBERS_PENDING_INVITATIONS]: "shared",
	[SETTING_ITEM_ID.ORGANIZATION_DELETE]: "shared",

	[SETTING_ITEM_ID.TEAMS_LIST]: "shared",

	[SETTING_ITEM_ID.APPEARANCE_THEME]: "shared",
	[SETTING_ITEM_ID.APPEARANCE_LANGUAGE]: "shared",
	[SETTING_ITEM_ID.APPEARANCE_MARKDOWN]: "shared",
	[SETTING_ITEM_ID.APPEARANCE_CUSTOM_THEMES]: "shared",
	[SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT]: "v2",
	[SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT]: "v2",

	[SETTING_ITEM_ID.RINGTONES_NOTIFICATION]: "shared",

	[SETTING_ITEM_ID.USAGE_TOKENS]: "shared",
	[SETTING_ITEM_ID.USAGE_RESOURCES]: "shared",

	[SETTING_ITEM_ID.KEYBOARD_SHORTCUTS]: "shared",

	[SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT]: "shared",
	[SETTING_ITEM_ID.BEHAVIOR_FILE_OPEN_MODE]: "v1",
	// The top-bar Changes control is a v2-only surface.
	[SETTING_ITEM_ID.BEHAVIOR_CHANGES_OPEN_TARGET]: "v2",
	[SETTING_ITEM_ID.BEHAVIOR_RESOURCE_MONITOR]: "shared",
	[SETTING_ITEM_ID.BEHAVIOR_OPEN_LINKS_IN_APP]: "v1",
	[SETTING_ITEM_ID.BEHAVIOR_STAR_GITHUB]: "shared",

	// The in-app browser pane is a v2-only surface.
	[SETTING_ITEM_ID.BROWSER_HOMEPAGE]: "v2",
	[SETTING_ITEM_ID.BROWSER_IMPORT_HISTORY]: "v2",

	// Branch prefix exists in both UIs — v1 `GitSettings`, v2 `V2GitSettings`.
	[SETTING_ITEM_ID.GIT_BRANCH_PREFIX]: "shared",
	[SETTING_ITEM_ID.GIT_DELETE_LOCAL_BRANCH]: "v1",
	[SETTING_ITEM_ID.GIT_WORKTREE_LOCATION]: "shared",

	[SETTING_ITEM_ID.AGENTS_ENABLED]: "shared",
	[SETTING_ITEM_ID.AGENTS_COMMANDS]: "shared",
	[SETTING_ITEM_ID.AGENTS_TASK_PROMPTS]: "shared",

	[SETTING_ITEM_ID.TERMINAL_PRESETS]: "shared",
	[SETTING_ITEM_ID.TERMINAL_QUICK_ADD]: "shared",
	[SETTING_ITEM_ID.TERMINAL_SESSIONS]: "shared",
	[SETTING_ITEM_ID.TERMINAL_LINK_BEHAVIOR]: "v1",
	[SETTING_ITEM_ID.TERMINAL_BACKGROUND_LIMIT]: "v2",
	[SETTING_ITEM_ID.TERMINAL_COPY_ON_SELECT]: "v2",

	[SETTING_ITEM_ID.LINKS_FILE]: "v2",
	[SETTING_ITEM_ID.LINKS_FOLDER]: "v2",
	[SETTING_ITEM_ID.LINKS_URL]: "v2",
	[SETTING_ITEM_ID.LINKS_SIDEBAR_FILE]: "v2",
	[SETTING_ITEM_ID.LINKS_PORT]: "v2",

	[SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2]: "shared",
	[SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION]: "v2",
	[SETTING_ITEM_ID.EXPERIMENTAL_INLINE_WORKSPACE_PORTS]: "v2",
	[SETTING_ITEM_ID.EXPERIMENTAL_WORKSPACE_AGENTS]: "v2",
	// Gates both the v1 renderer launch and the v2 host-side launch.
	[SETTING_ITEM_ID.EXPERIMENTAL_WAIT_FOR_SETUP_BEFORE_AGENT]: "shared",

	[SETTING_ITEM_ID.BILLING_OVERVIEW]: "shared",
	[SETTING_ITEM_ID.BILLING_PLANS]: "shared",
	[SETTING_ITEM_ID.BILLING_USAGE]: "shared",

	[SETTING_ITEM_ID.PROJECT_NAME]: "shared",
	[SETTING_ITEM_ID.PROJECT_PATH]: "shared",
	[SETTING_ITEM_ID.PROJECT_SCRIPTS]: "shared",
	[SETTING_ITEM_ID.PROJECT_BRANCH_PREFIX]: "v1",
	[SETTING_ITEM_ID.PROJECT_WORKTREE_LOCATION]: "shared",
	[SETTING_ITEM_ID.PROJECT_SPARSE_CHECKOUT]: "v2",
	[SETTING_ITEM_ID.PROJECT_IMPORT_WORKTREES]: "v1",

	[SETTING_ITEM_ID.API_KEYS_LIST]: "shared",
	[SETTING_ITEM_ID.API_KEYS_GENERATE]: "shared",

	[SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS]: "shared",
	[SETTING_ITEM_ID.PERMISSIONS_ACCESSIBILITY]: "shared",
	[SETTING_ITEM_ID.PERMISSIONS_MICROPHONE]: "shared",
	[SETTING_ITEM_ID.PERMISSIONS_APPLE_EVENTS]: "shared",
	[SETTING_ITEM_ID.PERMISSIONS_LOCAL_NETWORK]: "shared",

	[SETTING_ITEM_ID.SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY]: "shared",

	[SETTING_ITEM_ID.HOST_MEMBERS]: "shared",
	[SETTING_ITEM_ID.ENVIRONMENTS_LIST]: "v2",
	[SETTING_ITEM_ID.ENVIRONMENTS_SECRETS]: "v2",
	[SETTING_ITEM_ID.HOST_INVITE_MEMBER]: "shared",
	[SETTING_ITEM_ID.HOST_MEMBER_ROLE]: "shared",
	[SETTING_ITEM_ID.HOST_WORKTREE_LOCATION]: "v2",
	[SETTING_ITEM_ID.HOST_DELETE]: "shared",
};

export function isItemAllowedForVariant(
	itemId: SettingItemId,
	isV2: boolean,
): boolean {
	const variant = SETTING_ITEM_VARIANT[itemId];
	if (variant === "shared") return true;
	return isV2 ? variant === "v2" : variant === "v1";
}

/**
 * Search keywords per integration; everything else (title, description, id)
 * comes from the shared roster. Exhaustive so a new roster entry fails
 * typecheck until it gets keywords.
 */
const INTEGRATION_KEYWORDS: Record<IntegrationProvider, string[]> = {
	linear: ["issues", "tasks", "sync", "project management"],
	github: [
		"repos",
		"repositories",
		"pull requests",
		"pr",
		"sync",
		"version control",
		"git",
	],
	slack: [
		"messages",
		"conversations",
		"tasks",
		"chat",
		"sync",
		"communication",
	],
	notion: [
		"pages",
		"databases",
		"data sources",
		"comments",
		"docs",
		"knowledge",
	],
	microsoft_teams: [
		"teams",
		"microsoft",
		"channels",
		"messages",
		"chat",
		"communication",
	],
	sentry: ["errors", "issues", "monitoring", "alerts", "triage"],
	google: [
		"calendar",
		"gmail",
		"email",
		"mail",
		"events",
		"triggers",
		"automations",
	],
};

const INTEGRATION_SEARCH_ITEMS: SettingsItem[] = INTEGRATIONS.map(
	(integration) => ({
		id: integrationSettingItemId(integration.provider),
		section: "integrations",
		title: integration.label,
		description: integration.description(),
		keywords: [
			"integrations",
			integration.label.toLowerCase(),
			...INTEGRATION_KEYWORDS[integration.provider],
			"connect",
			"connected",
		],
	}),
);

export const SETTINGS_ITEMS: SettingsItem[] = [
	{
		id: SETTING_ITEM_ID.ACCOUNT_PROFILE,
		section: "account",
		title: "Profile",
		description: "Your profile information",
		keywords: [
			"account",
			"name",
			"email",
			"avatar",
			"user",
			"profile",
			"picture",
			"photo",
			"me",
		],
	},
	{
		id: SETTING_ITEM_ID.ACCOUNT_SIGNOUT,
		section: "account",
		title: "Sign Out",
		description: "Sign out of your account",
		keywords: [
			"account",
			"sign out",
			"logout",
			"log out",
			"disconnect",
			"leave",
		],
	},
	{
		id: SETTING_ITEM_ID.ACCOUNT_DELETE,
		section: "account",
		title: "Delete Account",
		description: "Permanently delete your account",
		keywords: [
			"account",
			"delete",
			"remove",
			"close",
			"deactivate",
			"gdpr",
			"erase",
		],
	},
	{
		id: SETTING_ITEM_ID.ACCOUNT_LEADERBOARD,
		section: "account",
		title: "Leaderboard",
		description: "Publish your agent usage to the public leaderboard",
		keywords: [
			"leaderboard",
			"rank",
			"ranking",
			"public",
			"share",
			"usage",
			"tokens",
			"stats",
			"opt in",
			"opt out",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_LOGO,
		section: "organization",
		title: "Organization Logo",
		description: "Upload and manage your organization's logo",
		keywords: [
			"organization",
			"logo",
			"image",
			"branding",
			"upload",
			"icon",
			"picture",
			"avatar",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_NAME,
		section: "organization",
		title: "Organization Name",
		description: "Change your organization's display name",
		keywords: [
			"organization",
			"name",
			"rename",
			"title",
			"company",
			"team name",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_SLUG,
		section: "organization",
		title: "Organization Slug",
		description: "Your organization's unique identifier",
		keywords: [
			"organization",
			"slug",
			"url",
			"identifier",
			"subdomain",
			"link",
			"unique",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_ID,
		section: "organization",
		title: "Organization ID",
		description: "Your organization's unique identifier",
		keywords: [
			"organization",
			"id",
			"identifier",
			"uuid",
			"unique",
			"copy",
			"api",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_MEMBERS_LIST,
		section: "organization",
		title: "Team Members",
		description: "View and manage team members and their roles",
		keywords: [
			"organization",
			"members",
			"team",
			"users",
			"roles",
			"people",
			"collaborators",
			"permissions",
			"access",
			"admin",
			"owner",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_MEMBERS_INVITE,
		section: "organization",
		title: "Invite Members",
		description: "Invite new members to your organization",
		keywords: [
			"organization",
			"members",
			"invite",
			"add",
			"new member",
			"team",
			"share",
			"collaborate",
			"email",
			"send invite",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_MEMBERS_PENDING_INVITATIONS,
		section: "organization",
		title: "Pending Invitations",
		description: "View and manage pending organization invitations",
		keywords: [
			"organization",
			"members",
			"invite",
			"invitation",
			"pending",
			"team",
			"waiting",
			"sent",
			"cancel",
			"resend",
			"email",
		],
	},
	{
		id: SETTING_ITEM_ID.ORGANIZATION_DELETE,
		section: "organization",
		title: "Delete Organization",
		description: "Permanently delete this organization",
		keywords: [
			"organization",
			"delete",
			"remove",
			"close",
			"disband",
			"danger",
		],
	},
	{
		id: SETTING_ITEM_ID.TEAMS_LIST,
		section: "teams",
		title: "Teams",
		description: "Create, rename, and delete teams within your organization",
		keywords: [
			"teams",
			"team",
			"group",
			"create team",
			"rename team",
			"delete team",
			"organize",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_LANGUAGE,
		section: "appearance",
		title: "Language",
		description: "App display language",
		keywords: [
			"appearance",
			"language",
			"locale",
			"translation",
			"i18n",
			"english",
			"international",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_THEME,
		section: "appearance",
		title: "Theme",
		description: "Choose your theme",
		keywords: [
			"appearance",
			"theme",
			"dark",
			"light",
			"dark mode",
			"light mode",
			"colors",
			"night",
			"system",
			"visual",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_MARKDOWN,
		section: "appearance",
		title: "Markdown Style",
		description: "Rendering style for markdown files",
		keywords: [
			"appearance",
			"markdown",
			"style",
			"tufte",
			"rendering",
			"preview",
			"format",
			"display",
			"md",
			"readme",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_CUSTOM_THEMES,
		section: "appearance",
		title: "Custom Themes",
		description: "Import custom theme files",
		keywords: [
			"appearance",
			"custom",
			"themes",
			"import",
			"json",
			"color scheme",
			"upload",
			"personalize",
			"customize",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_EDITOR_FONT,
		section: "appearance",
		title: "Editor Typography",
		description: "Typography used in V2 diff views and file editors",
		keywords: [
			"appearance",
			"font",
			"family",
			"size",
			"editor",
			"diff",
			"mono",
			"monospace",
			"typography",
			"line height",
			"spacing",
			"letter spacing",
			"weight",
			"ligatures",
			"custom",
		],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_TERMINAL_FONT,
		section: "appearance",
		title: "Terminal Typography",
		description: "Typography and cursor behavior used in V2 terminal panels",
		keywords: [
			"appearance",
			"font",
			"family",
			"size",
			"terminal",
			"mono",
			"monospace",
			"typography",
			"line height",
			"spacing",
			"letter spacing",
			"weight",
			"ligatures",
			"contrast",
			"minimum contrast",
			"cursor",
			"blink",
			"custom",
			"nerd",
		],
	},
	{
		id: SETTING_ITEM_ID.RINGTONES_NOTIFICATION,
		section: "ringtones",
		title: "Notification Sound",
		description: "Choose the notification sound for completed tasks",
		keywords: [
			"notifications",
			"notification",
			"sound",
			"ringtone",
			"audio",
			"alert",
			"bell",
			"tone",
			"complete",
			"done",
			"finished",
			"chime",
			"mute",
			"volume",
		],
	},
	{
		id: SETTING_ITEM_ID.USAGE_TOKENS,
		section: "usage",
		title: "Token usage",
		description: "Track per-account token usage, quotas, and model spend",
		keywords: [
			"usage",
			"tokens",
			"token",
			"cost",
			"spend",
			"quota",
			"limit",
			"plan",
			"model",
			"models",
			"claude",
			"account",
			"history",
		],
	},
	{
		id: SETTING_ITEM_ID.USAGE_RESOURCES,
		section: "usage",
		title: "Machine resources",
		description: "Monitor live CPU and memory usage on this machine",
		keywords: [
			"usage",
			"resources",
			"cpu",
			"memory",
			"ram",
			"processor",
			"machine",
			"performance",
			"monitor",
		],
	},
	{
		id: SETTING_ITEM_ID.KEYBOARD_SHORTCUTS,
		section: "keyboard",
		title: "Keyboard Shortcuts",
		description: "View and customize keyboard shortcuts",
		keywords: [
			"keyboard",
			"shortcuts",
			"hotkeys",
			"keys",
			"bindings",
			"keybindings",
			"commands",
			"ctrl",
			"cmd",
			"alt",
			"customize",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT,
		section: "behavior",
		title: "Confirm before quitting",
		description: "Show a confirmation dialog when quitting the app",
		keywords: [
			"features",
			"confirm",
			"quit",
			"quitting",
			"exit",
			"close",
			"dialog",
			"warning",
			"prompt",
			"unsaved",
		],
	},
	{
		id: SETTING_ITEM_ID.GIT_DELETE_LOCAL_BRANCH,
		section: "git",
		title: "Delete local branch on workspace removal",
		description:
			"Also delete the local git branch when deleting a worktree workspace",
		keywords: [
			"git",
			"delete",
			"branch",
			"local",
			"worktree",
			"workspace",
			"remove",
			"cleanup",
		],
	},
	{
		id: SETTING_ITEM_ID.GIT_BRANCH_PREFIX,
		section: "git",
		title: "Branch Prefix",
		description: "Default prefix for new branch names",
		keywords: [
			"git",
			"branch",
			"prefix",
			"naming",
			"worktree",
			"author",
			"github",
			"username",
			"feat",
			"custom",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_FILE_OPEN_MODE,
		section: "behavior",
		title: "File open mode",
		description:
			"Choose how files open when clicked in the file tree or changes view",
		keywords: [
			"file",
			"open",
			"mode",
			"split",
			"pane",
			"tab",
			"new tab",
			"split pane",
			"viewer",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_CHANGES_OPEN_TARGET,
		section: "behavior",
		title: "Changes open target",
		description:
			"Open the Changes view as a pane in the current tab or as its own tab",
		keywords: [
			"changes",
			"diff",
			"open",
			"pane",
			"tab",
			"split",
			"new tab",
			"viewer",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_RESOURCE_MONITOR,
		section: "behavior",
		title: "Resource monitor",
		description:
			"Show CPU and memory usage for workspaces and terminal sessions in the top bar",
		keywords: [
			"features",
			"resource",
			"monitor",
			"cpu",
			"memory",
			"ram",
			"usage",
			"performance",
			"process",
			"terminal",
		],
	},
	{
		id: SETTING_ITEM_ID.GIT_WORKTREE_LOCATION,
		section: "git",
		title: "Worktree location",
		description: "User-level base directory where new worktrees are created",
		keywords: [
			"git",
			"worktree",
			"location",
			"directory",
			"path",
			"folder",
			"storage",
			"base",
			"default",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_OPEN_LINKS_IN_APP,
		section: "behavior",
		title: "Open links in the in-app browser",
		description:
			"Open links from chat and terminal in the in-app browser instead of your default browser",
		keywords: [
			"browser",
			"links",
			"in-app",
			"external",
			"open",
			"chat",
			"terminal",
			"url",
		],
	},
	{
		id: SETTING_ITEM_ID.BEHAVIOR_STAR_GITHUB,
		section: "behavior",
		title: "Star Superset on GitHub",
		description: "Support the project with a GitHub star",
		keywords: [
			"star",
			"github",
			"support",
			"feedback",
			"open source",
			"repo",
			"repository",
		],
	},
	{
		id: SETTING_ITEM_ID.BROWSER_HOMEPAGE,
		section: "browser",
		title: "Browser homepage",
		description: "The page new in-app browser tabs open to",
		keywords: [
			"browser",
			"homepage",
			"home",
			"start page",
			"default url",
			"new tab",
			"landing",
		],
	},
	{
		id: SETTING_ITEM_ID.BROWSER_IMPORT_HISTORY,
		section: "browser",
		title: "Import settings from another browser",
		description:
			"Copy browsing history and logins from Chrome, Brave, Arc, or another Chromium browser",
		keywords: [
			"browser",
			"import",
			"history",
			"logins",
			"cookies",
			"chrome",
			"brave",
			"arc",
			"chromium",
			"migrate",
		],
	},
	{
		id: SETTING_ITEM_ID.AGENTS_ENABLED,
		section: "agents",
		title: "Enabled agents",
		description: "Control which agents appear in workspace launchers",
		keywords: [
			"agents",
			"enabled",
			"launcher",
			"dropdown",
			"visible",
			"show",
			"hide",
			"superset chat",
			"claude",
			"codex",
			"pi",
		],
	},
	{
		id: SETTING_ITEM_ID.AGENTS_COMMANDS,
		section: "agents",
		title: "Agent commands",
		description: "Configure no-prompt and prompt launch commands",
		keywords: [
			"agents",
			"commands",
			"prompt command",
			"terminal",
			"claude",
			"codex",
			"gemini",
			"opencode",
			"pi",
			"copilot",
			"cursor",
			"vibe",
			"mistral",
			"kimi",
			"moonshot",
			"grok",
			"xai",
			"hermes",
			"nous",
			"fx",
			"vercel",
			"antigravity",
			"agy",
			"google",
			"kiro",
			"aws",
		],
	},
	{
		id: SETTING_ITEM_ID.AGENTS_TASK_PROMPTS,
		section: "agents",
		title: "Task prompt templates",
		description: "Configure task prompt templates for agent launches",
		keywords: [
			"agents",
			"task prompt",
			"template",
			"variables",
			"prompt",
			"task",
			"superset chat",
			"launch",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_PRESETS,
		section: "terminal",
		title: "Terminal Scripts",
		description: "Manage reusable commands that launch in terminals",
		keywords: [
			"terminal",
			"preset",
			"presets",
			"scripts",
			"terminal scripts",
			"commands",
			"agent",
			"launch",
			"default",
			"startup",
			"config",
			"shell",
			"run",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_QUICK_ADD,
		section: "terminal",
		title: "Quick Add Templates",
		description: "Pre-configured terminal scripts",
		keywords: [
			"terminal",
			"quick",
			"add",
			"template",
			"claude",
			"codex",
			"gemini",
			"cursor",
			"opencode",
			"pi",
			"ai",
			"assistant",
			"vibe",
			"mistral",
			"kimi",
			"moonshot",
			"grok",
			"xai",
			"hermes",
			"nous",
			"fx",
			"vercel",
			"antigravity",
			"agy",
			"google",
			"kiro",
			"aws",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_SESSIONS,
		section: "terminal",
		title: "Terminal Daemon",
		description: "Manage the terminal daemon and active sessions",
		keywords: [
			"terminal",
			"daemon",
			"pty daemon",
			"supervisor",
			"restart daemon",
			"update daemon",
			"background",
			"sessions",
			"active",
			"running",
			"kill",
			"terminate",
			"process",
			"stop",
			"manage",
			"pty",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_BACKGROUND_LIMIT,
		section: "terminal",
		title: "Background terminal memory",
		description: "How many hidden terminals stay fully loaded",
		keywords: [
			"terminal",
			"memory",
			"background",
			"hidden",
			"parked",
			"limit",
			"cap",
			"performance",
			"ram",
			"scrollback",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_COPY_ON_SELECT,
		section: "terminal",
		title: "Copy on select",
		description: "Copy selected terminal text to the clipboard right away",
		keywords: [
			"terminal",
			"copy",
			"select",
			"selection",
			"clipboard",
			"ghostty",
			"iterm",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_LINK_BEHAVIOR,
		section: "terminal",
		title: "Link Behavior",
		description: "How to open links from terminal",
		keywords: [
			"terminal",
			"link",
			"click",
			"open",
			"external",
			"editor",
			"file",
			"url",
			"path",
			"cmd",
			"ctrl",
			"browser",
		],
	},
	{
		id: SETTING_ITEM_ID.LINKS_FILE,
		section: "links",
		title: "File links",
		description:
			"How file paths open when clicked in terminals, chat, and tasks",
		keywords: [
			"links",
			"file",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"pane",
			"editor",
			"external",
			"open",
			"terminal",
			"chat",
			"markdown",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.LINKS_FOLDER,
		section: "links",
		title: "Folder links",
		description:
			"How folder paths open when clicked in terminals: reveal in sidebar, editor, or Finder",
		keywords: [
			"links",
			"folder",
			"directory",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"finder",
			"reveal",
			"sidebar",
			"editor",
			"external",
			"open",
			"terminal",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.LINKS_URL,
		section: "links",
		title: "URL links",
		description: "How URLs open when clicked in terminals, chat, and tasks",
		keywords: [
			"links",
			"url",
			"link",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"browser",
			"in-app",
			"system",
			"external",
			"open",
			"terminal",
			"chat",
			"markdown",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.LINKS_SIDEBAR_FILE,
		section: "links",
		title: "Sidebar file rows",
		description:
			"How file rows in the file tree, changes list, and diff header open when clicked",
		keywords: [
			"links",
			"sidebar",
			"file tree",
			"changes",
			"diff",
			"file",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"new tab",
			"editor",
			"external",
			"open",
			"select",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.LINKS_PORT,
		section: "links",
		title: "Ports",
		description:
			"How detected-port badges in the sidebar open when clicked (in-app or system browser)",
		keywords: [
			"links",
			"port",
			"ports",
			"badge",
			"localhost",
			"server",
			"forwarded",
			"click",
			"cmd",
			"ctrl",
			"shift",
			"meta",
			"browser",
			"in-app",
			"system",
			"external",
			"open",
			"behavior",
		],
	},
	{
		id: SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2,
		section: "experimental",
		title: "Try Superset Version 2 (Early Access)",
		description: "Switch between Superset V1 and the new V2 experience",
		keywords: [
			"experimental",
			"experiments",
			"v2",
			"v1",
			"version",
			"early access",
			"beta",
			"preview",
			"workspace",
			"workspaces",
			"toggle",
			"switch",
		],
	},
	{
		id: SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
		section: "experimental",
		title: "V1 to V2 Migration",
		description: "Rerun the V1 to V2 data migration",
		keywords: [
			"experimental",
			"migration",
			"migrate",
			"rerun",
			"retry",
			"recover",
			"v1",
			"v2",
			"projects",
			"workspaces",
		],
	},
	{
		id: SETTING_ITEM_ID.EXPERIMENTAL_INLINE_WORKSPACE_PORTS,
		section: "experimental",
		title: "Ports in top bar dropdown",
		description:
			"Show detected ports as a dropdown in the top bar instead of a chip under each workspace",
		keywords: [
			"experimental",
			"ports",
			"port",
			"inline",
			"sidebar",
			"topbar",
			"top bar",
			"dropdown",
			"workspace",
			"workspaces",
			"dev server",
			"toggle",
			"switch",
		],
	},
	{
		id: SETTING_ITEM_ID.EXPERIMENTAL_WORKSPACE_AGENTS,
		section: "experimental",
		title: "Workspace agents",
		description:
			"Show running agents under each workspace in the sidebar, with their live status",
		keywords: [
			"experimental",
			"agents",
			"agent",
			"running",
			"inline",
			"sidebar",
			"workspace",
			"workspaces",
			"status",
			"toggle",
			"switch",
		],
	},
	{
		id: SETTING_ITEM_ID.EXPERIMENTAL_WAIT_FOR_SETUP_BEFORE_AGENT,
		section: "experimental",
		title: "Wait for workspace setup before starting agents",
		description:
			"Run the agent in the Workspace Setup terminal once setup finishes instead of starting a second terminal alongside it",
		keywords: [
			"experimental",
			"workspace",
			"setup",
			"script",
			"agent",
			"terminal",
			"wait",
			"gate",
			"complete",
			"finish",
			"reuse",
			"sequential",
			"install",
		],
	},
	...INTEGRATION_SEARCH_ITEMS,
	{
		id: SETTING_ITEM_ID.BILLING_OVERVIEW,
		section: "billing",
		title: "Current plan",
		description: "View your current subscription and usage",
		keywords: [
			"billing",
			"plan",
			"subscription",
			"pro",
			"free",
			"enterprise",
			"current",
			"payment",
		],
	},
	{
		id: SETTING_ITEM_ID.BILLING_PLANS,
		section: "billing",
		title: "All plans",
		description: "Compare and upgrade plans",
		keywords: [
			"billing",
			"upgrade",
			"pricing",
			"plans",
			"pro",
			"enterprise",
			"compare",
			"features",
		],
	},
	{
		id: SETTING_ITEM_ID.BILLING_USAGE,
		section: "billing",
		title: "Usage limits",
		description: "Track workspace and user limits",
		keywords: [
			"billing",
			"usage",
			"limits",
			"workspaces",
			"users",
			"quota",
			"seats",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_NAME,
		section: "project",
		title: "Project Name",
		description: "The name of this project",
		keywords: ["project", "name", "rename", "title", "label"],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_PATH,
		section: "project",
		title: "Repository Path",
		description: "The file path to this project",
		keywords: [
			"project",
			"path",
			"repository",
			"folder",
			"directory",
			"location",
			"git",
			"repo",
			"root",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_SCRIPTS,
		section: "project",
		title: "Project Lifecycle Scripts",
		description: "Setup, teardown, and run lifecycle scripts for workspaces",
		keywords: [
			"project",
			"scripts",
			"setup",
			"teardown",
			"run",
			"bash",
			"shell",
			"automation",
			"hooks",
			"init",
			"initialize",
			"cleanup",
			"onboarding",
			"config",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_BRANCH_PREFIX,
		section: "project",
		title: "Branch Prefix",
		description: "Override the default branch prefix for this project",
		keywords: [
			"project",
			"branch",
			"prefix",
			"naming",
			"git",
			"worktree",
			"author",
			"github",
			"username",
			"feat",
			"custom",
			"override",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_WORKTREE_LOCATION,
		section: "project",
		title: "Worktree Location",
		description: "Override the host worktree directory for this project",
		keywords: [
			"project",
			"worktree",
			"location",
			"directory",
			"path",
			"folder",
			"storage",
			"override",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_SPARSE_CHECKOUT,
		section: "project",
		title: "Sparse Checkout",
		description: "Limit new worktrees to specific folders of the repository",
		keywords: [
			"project",
			"sparse",
			"checkout",
			"cone",
			"worktree",
			"folders",
			"directories",
			"subset",
			"partial",
			"monorepo",
			"size",
		],
	},
	{
		id: SETTING_ITEM_ID.PROJECT_IMPORT_WORKTREES,
		section: "project",
		title: "Import Worktrees",
		description: "Import existing worktrees from disk into Superset",
		keywords: [
			"project",
			"import",
			"worktree",
			"worktrees",
			"workspace",
			"workspaces",
			"external",
			"existing",
			"disk",
			"add",
		],
	},
	{
		id: SETTING_ITEM_ID.API_KEYS_LIST,
		section: "apikeys",
		title: "API Keys",
		description: "Manage API keys for MCP server access",
		keywords: [
			"api",
			"key",
			"keys",
			"mcp",
			"claude",
			"integration",
			"external",
			"access",
			"token",
			"authentication",
		],
	},
	{
		id: SETTING_ITEM_ID.API_KEYS_GENERATE,
		section: "apikeys",
		title: "Generate API Key",
		description: "Create new API keys for external integrations",
		keywords: [
			"api",
			"key",
			"generate",
			"create",
			"new",
			"mcp",
			"claude desktop",
			"claude code",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_FULL_DISK_ACCESS,
		section: "permissions",
		title: "Full Disk Access",
		description:
			"Persistent access to Documents, Downloads, Desktop, and iCloud from terminal sessions",
		keywords: [
			"permissions",
			"full disk access",
			"fda",
			"files",
			"documents",
			"downloads",
			"desktop",
			"icloud",
			"macos",
			"security",
			"privacy",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_ACCESSIBILITY,
		section: "permissions",
		title: "Accessibility",
		description:
			"Send keystrokes, manage windows, and control other applications",
		keywords: [
			"permissions",
			"accessibility",
			"a11y",
			"keystrokes",
			"window management",
			"macos",
			"security",
			"privacy",
			"trusted",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_MICROPHONE,
		section: "permissions",
		title: "Microphone",
		description: "Use voice transcription and push-to-talk features",
		keywords: [
			"permissions",
			"microphone",
			"mic",
			"voice",
			"transcription",
			"audio",
			"recording",
			"push to talk",
			"codex",
			"privacy",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_APPLE_EVENTS,
		section: "permissions",
		title: "Automation",
		description: "Run terminal commands and interact with other applications",
		keywords: [
			"permissions",
			"automation",
			"apple events",
			"applescript",
			"macos",
			"security",
			"privacy",
			"system events",
		],
	},
	{
		id: SETTING_ITEM_ID.PERMISSIONS_LOCAL_NETWORK,
		section: "permissions",
		title: "Local Network",
		description: "Discover and connect to development servers on your network",
		keywords: [
			"permissions",
			"local network",
			"bonjour",
			"mdns",
			"macos",
			"security",
			"privacy",
			"development servers",
		],
	},
	{
		id: SETTING_ITEM_ID.SECURITY_EXPOSE_HOST_SERVICE_VIA_RELAY,
		section: "security",
		title: "Allow remote access to this device via relay",
		description:
			"Controls whether other devices can reach your local host service through the Superset relay",
		keywords: [
			"security",
			"relay",
			"remote",
			"remote access",
			"workspace",
			// The section was called Remote Workspaces until the rename; keep the
			// old name searchable for anyone who still reaches for it.
			"workspaces",
			"expose",
			"lockdown",
			"network",
			"inbound",
			"host service",
			"tunnel",
			"attack surface",
		],
	},
	{
		id: SETTING_ITEM_ID.ENVIRONMENTS_LIST,
		section: "environments",
		title: "Environments",
		description: "Starting points a cloud workspace boots from",
		keywords: [
			"environment",
			"environments",
			"sandbox",
			"cloud",
			"image",
			"fork",
			"base",
			"template",
		],
	},
	{
		id: SETTING_ITEM_ID.ENVIRONMENTS_SECRETS,
		section: "environments",
		title: "Environment variables",
		description: "Variables set on every sandbox started from an environment",
		keywords: [
			"environment",
			"variable",
			"variables",
			"secret",
			"secrets",
			"env",
			"dotenv",
			"key",
			"credential",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_MEMBERS,
		section: "hosts",
		title: "Host members",
		description: "View who has access to a host in your organization",
		keywords: [
			"host",
			"hosts",
			"member",
			"members",
			"access",
			"team",
			"share",
			"machine",
			"device",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_WORKTREE_LOCATION,
		section: "hosts",
		title: "Worktree location",
		description: "Default location for new worktree workspaces on this host",
		keywords: [
			"host",
			"hosts",
			"worktree",
			"worktrees",
			"location",
			"directory",
			"path",
			"folder",
			"storage",
			"default",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_INVITE_MEMBER,
		section: "hosts",
		title: "Grant access to a host",
		description: "Add an organization member to a host",
		keywords: [
			"host",
			"hosts",
			"invite",
			"add",
			"grant",
			"member",
			"access",
			"share",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_MEMBER_ROLE,
		section: "hosts",
		title: "Host member role",
		description: "Change a member's role on a host (owner or member)",
		keywords: [
			"host",
			"hosts",
			"role",
			"owner",
			"member",
			"permission",
			"admin",
		],
	},
	{
		id: SETTING_ITEM_ID.HOST_DELETE,
		section: "hosts",
		title: "Delete host",
		description:
			"Remove a host and its synced workspace records from the organization",
		keywords: [
			"host",
			"hosts",
			"delete",
			"remove",
			"machine",
			"device",
			"workspace",
			"owner",
			"danger zone",
		],
	},
];

export function splitSearchTerms(query: string): string[] {
	return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

export function searchSettings(query: string): SettingsItem[] {
	const terms = splitSearchTerms(query);
	if (terms.length === 0) return SETTINGS_ITEMS;

	return SETTINGS_ITEMS.filter((item) => {
		const searchableText = [item.title, item.description, ...item.keywords]
			.join(" ")
			.toLowerCase();

		return terms.every((term) => searchableText.includes(term));
	});
}

export function getMatchCountBySection(
	query: string,
): Partial<Record<SettingsSection, number>> {
	const matches = searchSettings(query);
	const counts: Partial<Record<SettingsSection, number>> = {};

	for (const item of matches) {
		counts[item.section] = (counts[item.section] || 0) + 1;
	}

	return counts;
}

export function getMatchingItemsForSection(
	query: string,
	section: SettingsSection,
): SettingsItem[] {
	return searchSettings(query).filter((item) => item.section === section);
}

export function isItemVisible(
	itemId: SettingItemId,
	visibleItems: SettingItemId[] | null | undefined,
): boolean {
	return !visibleItems || visibleItems.includes(itemId);
}

/**
 * Items in `section` that are allowed for the active v1/v2 variant and
 * (if a search query is provided) also match the query. Returns an array
 * suitable for passing to `isItemVisible` at the leaf — never `null`, so
 * variant-hidden items are always excluded.
 */
export function getVisibleItemsForSection(params: {
	section: SettingsSection;
	searchQuery: string;
	isV2: boolean;
}): SettingItemId[] {
	const { section, searchQuery, isV2 } = params;
	const matched = searchQuery.trim()
		? getMatchingItemsForSection(searchQuery, section)
		: SETTINGS_ITEMS.filter((item) => item.section === section);
	return matched
		.filter((item) => isItemAllowedForVariant(item.id, isV2))
		.map((item) => item.id);
}

/**
 * Like `getMatchCountBySection`, but excludes items that are hidden by the
 * active v1/v2 variant. Used by the sidebar so search counts and section
 * visibility agree.
 */
export function getVisibleMatchCountBySection(
	query: string,
	isV2: boolean,
): Partial<Record<SettingsSection, number>> {
	const matches = searchSettings(query).filter((item) =>
		isItemAllowedForVariant(item.id, isV2),
	);
	const counts: Partial<Record<SettingsSection, number>> = {};
	for (const item of matches) {
		counts[item.section] = (counts[item.section] || 0) + 1;
	}
	return counts;
}

/**
 * Sections that contain at least one item allowed for the active variant.
 * Sections with no allowed items (e.g. `git` in v2, `links` in v1) should
 * be hidden from the sidebar entirely.
 */
export function getAllowedSectionsForVariant(
	isV2: boolean,
): Set<SettingsSection> {
	const sections = new Set<SettingsSection>();
	for (const item of SETTINGS_ITEMS) {
		if (isItemAllowedForVariant(item.id, isV2)) sections.add(item.section);
	}
	return sections;
}
