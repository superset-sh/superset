import type { SettingsSection } from "renderer/stores";

/**
 * Typed setting item IDs for type-safe references across components.
 * When adding a new setting, add its ID here first.
 */
export const SETTING_ITEM_ID = {
	// Account
	ACCOUNT_PROFILE: "account-profile",
	ACCOUNT_VERSION: "account-version",
	ACCOUNT_SIGNOUT: "account-signout",
	// Appearance
	APPEARANCE_THEME: "appearance-theme",
	APPEARANCE_MARKDOWN: "appearance-markdown",
	APPEARANCE_CUSTOM_THEMES: "appearance-custom-themes",
	// Ringtones
	RINGTONES_NOTIFICATION: "ringtones-notification",
	// Keyboard
	KEYBOARD_SHORTCUTS: "keyboard-shortcuts",
	// Presets
	PRESETS_TERMINAL: "presets-terminal",
	// Behavior
	BEHAVIOR_CONFIRM_QUIT: "behavior-confirm-quit",
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
		keywords: ["name", "email", "avatar", "user"],
	},
	{
		id: SETTING_ITEM_ID.ACCOUNT_VERSION,
		section: "account",
		title: "Version",
		description: "App version and updates",
		keywords: ["version", "update", "check for updates", "app version"],
	},
	{
		id: SETTING_ITEM_ID.ACCOUNT_SIGNOUT,
		section: "account",
		title: "Sign Out",
		description: "Sign out of your account",
		keywords: ["sign out", "logout", "log out"],
	},

	// Appearance
	{
		id: SETTING_ITEM_ID.APPEARANCE_THEME,
		section: "appearance",
		title: "Theme",
		description: "Choose your theme",
		keywords: ["theme", "dark", "light", "dark mode", "light mode", "colors"],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_MARKDOWN,
		section: "appearance",
		title: "Markdown Style",
		description: "Rendering style for markdown files",
		keywords: ["markdown", "style", "tufte", "rendering"],
	},
	{
		id: SETTING_ITEM_ID.APPEARANCE_CUSTOM_THEMES,
		section: "appearance",
		title: "Custom Themes",
		description: "Import custom theme files",
		keywords: ["custom", "themes", "import", "json"],
	},

	// Ringtones
	{
		id: SETTING_ITEM_ID.RINGTONES_NOTIFICATION,
		section: "ringtones",
		title: "Notification Sound",
		description: "Choose the notification sound for completed tasks",
		keywords: [
			"notification",
			"sound",
			"ringtone",
			"audio",
			"alert",
			"bell",
			"tone",
		],
	},

	// Keyboard Shortcuts
	{
		id: SETTING_ITEM_ID.KEYBOARD_SHORTCUTS,
		section: "keyboard",
		title: "Keyboard Shortcuts",
		description: "View all available keyboard shortcuts",
		keywords: [
			"keyboard",
			"shortcuts",
			"hotkeys",
			"keys",
			"bindings",
			"terminal",
			"workspace",
			"window",
		],
	},

	// Presets
	{
		id: SETTING_ITEM_ID.PRESETS_TERMINAL,
		section: "presets",
		title: "Terminal Presets",
		description: "Pre-configured terminal commands",
		keywords: [
			"preset",
			"terminal",
			"commands",
			"claude",
			"codex",
			"gemini",
			"cursor",
			"opencode",
			"agent",
			"launch",
		],
	},

	// Behavior
	{
		id: SETTING_ITEM_ID.BEHAVIOR_CONFIRM_QUIT,
		section: "behavior",
		title: "Confirm before quitting",
		description: "Show a confirmation dialog when quitting the app",
		keywords: ["confirm", "quit", "quitting", "exit", "close", "dialog"],
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
): Record<SettingsSection, number> {
	const matches = searchSettings(query);
	const counts: Record<string, number> = {};

	for (const item of matches) {
		counts[item.section] = (counts[item.section] || 0) + 1;
	}

	return counts as Record<SettingsSection, number>;
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
