import type { SettingsSection } from "renderer/stores/settings-state";

/**
 * Typed setting item IDs for type-safe references across components.
 * When adding a new setting, add its ID here first.
 */
export const SETTING_ITEM_ID = {
	// Account
	ACCOUNT_PROFILE: "account-profile",
	ACCOUNT_VERSION: "account-version",
	ACCOUNT_SIGNOUT: "account-signout",

	// Organization
	ORGANIZATION_LOGO: "organization-logo",
	ORGANIZATION_NAME: "organization-name",
	ORGANIZATION_SLUG: "organization-slug",

	// Members
	MEMBERS_LIST: "members-list",
	MEMBERS_INVITE: "members-invite",

	// Appearance
	APPEARANCE_THEME: "appearance-theme",
	APPEARANCE_MARKDOWN: "appearance-markdown",
	APPEARANCE_CUSTOM_THEMES: "appearance-custom-themes",

	// Ringtones (Notifications)
	RINGTONES_NOTIFICATION: "ringtones-notification",

	// Keyboard Shortcuts
	KEYBOARD_SHORTCUTS: "keyboard-shortcuts",

	// Behavior (Features)
	BEHAVIOR_CONFIRM_QUIT: "behavior-confirm-quit",

	// Terminal (includes presets)
	TERMINAL_PRESETS: "terminal-presets",
	TERMINAL_QUICK_ADD: "terminal-quick-add",
	TERMINAL_PERSISTENCE: "terminal-persistence",
	TERMINAL_SESSIONS: "terminal-sessions",
	TERMINAL_LINK_BEHAVIOR: "terminal-link-behavior",

	// Project
	PROJECT_NAME: "project-name",
	PROJECT_PATH: "project-path",
	PROJECT_SCRIPTS: "project-scripts",

	// Workspace
	WORKSPACE_NAME: "workspace-name",
	WORKSPACE_BRANCH: "workspace-branch",
	WORKSPACE_PATH: "workspace-path",
} as const;

export type SettingItemId =
	(typeof SETTING_ITEM_ID)[keyof typeof SETTING_ITEM_ID];

export interface SettingsItem {
	id: SettingItemId;
	section: SettingsSection;
	title: string;
	description: string;
	keywords: string[];
}

/**
 * Single source of truth for all searchable settings items.
 * To add a new setting:
 * 1. Add the ID to SETTING_ITEM_ID above
 * 2. Add the item definition here
 * 3. Use the ID in the corresponding component's visibility check
 */
export const SETTINGS_ITEMS: SettingsItem[] = [
	// Account
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
		id: SETTING_ITEM_ID.ACCOUNT_VERSION,
		section: "account",
		title: "Version",
		description: "App version and updates",
		keywords: [
			"account",
			"version",
			"update",
			"check for updates",
			"app version",
			"release",
			"about",
			"upgrade",
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

	// Organization
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

	// Members
	{
		id: SETTING_ITEM_ID.MEMBERS_LIST,
		section: "members",
		title: "Team Members",
		description: "View and manage team members and their roles",
		keywords: [
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
		id: SETTING_ITEM_ID.MEMBERS_INVITE,
		section: "members",
		title: "Invite Members",
		description: "Invite new members to your organization",
		keywords: [
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

	// Appearance
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

	// Ringtones (sidebar label: Notifications)
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

	// Keyboard Shortcuts
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

	// Behavior (sidebar label: Features)
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

	// Terminal (includes presets)
	{
		id: SETTING_ITEM_ID.TERMINAL_PRESETS,
		section: "terminal",
		title: "Terminal Presets",
		description: "Manage your terminal presets",
		keywords: [
			"terminal",
			"preset",
			"presets",
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
		description: "Pre-configured terminal presets",
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
			"ai",
			"assistant",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_PERSISTENCE,
		section: "terminal",
		title: "Terminal Persistence",
		description: "Keep terminal sessions running in background",
		keywords: [
			"terminal",
			"persistence",
			"background",
			"daemon",
			"session",
			"keep alive",
			"restore",
			"resume",
			"reconnect",
			"restart",
		],
	},
	{
		id: SETTING_ITEM_ID.TERMINAL_SESSIONS,
		section: "terminal",
		title: "Active Sessions",
		description: "View and manage active terminal sessions",
		keywords: [
			"terminal",
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

	// Project
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
		title: "Scripts",
		description: "Setup and teardown scripts for workspaces",
		keywords: [
			"project",
			"scripts",
			"setup",
			"teardown",
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

	// Workspace
	{
		id: SETTING_ITEM_ID.WORKSPACE_NAME,
		section: "workspace",
		title: "Workspace Name",
		description: "The name of this workspace",
		keywords: ["workspace", "name", "rename", "title", "label"],
	},
	{
		id: SETTING_ITEM_ID.WORKSPACE_BRANCH,
		section: "workspace",
		title: "Branch",
		description: "The git branch for this workspace",
		keywords: [
			"workspace",
			"branch",
			"git",
			"worktree",
			"checkout",
			"switch",
			"feature",
		],
	},
	{
		id: SETTING_ITEM_ID.WORKSPACE_PATH,
		section: "workspace",
		title: "File Path",
		description: "The file path to this workspace",
		keywords: ["workspace", "path", "folder", "directory", "location", "root"],
	},
];

/**
 * Search settings by query string.
 * Matches against title, description, and keywords.
 */
export function searchSettings(query: string): SettingsItem[] {
	if (!query.trim()) return SETTINGS_ITEMS;

	const q = query.toLowerCase();
	return SETTINGS_ITEMS.filter(
		(item) =>
			item.title.toLowerCase().includes(q) ||
			item.description.toLowerCase().includes(q) ||
			item.keywords.some((kw) => kw.toLowerCase().includes(q)),
	);
}

/**
 * Get count of matching items per section for sidebar display.
 */
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

/**
 * Get matching items for a specific section.
 */
export function getMatchingItemsForSection(
	query: string,
	section: SettingsSection,
): SettingsItem[] {
	return searchSettings(query).filter((item) => item.section === section);
}

/**
 * Helper to check if an item should be visible based on search results.
 * Returns true if no search filter is active OR if the item is in the visible list.
 */
export function isItemVisible(
	itemId: SettingItemId,
	visibleItems: SettingItemId[] | null | undefined,
): boolean {
	return !visibleItems || visibleItems.includes(itemId);
}
