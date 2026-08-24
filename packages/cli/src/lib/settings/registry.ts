import { CLIError } from "@superset/cli-framework";
import type { InsertSettings } from "@superset/local-db/schema";
import {
	BRANCH_PREFIX_MODES,
	EXTERNAL_APPS,
	FILE_OPEN_MODES,
	NON_EDITOR_APPS,
	TERMINAL_LINK_BEHAVIORS,
} from "@superset/local-db/schema/zod";
import { RINGTONES } from "@superset/shared/ringtones";
import {
	FONT_FAMILY_MAX_LENGTH,
	FONT_SIZE_LIMITS,
	FONT_WEIGHT_LIMITS,
	LETTER_SPACING_LIMITS,
	LINE_HEIGHT_LIMITS,
	NOTIFICATION_VOLUME_LIMITS,
	TERMINAL_CURSOR_STYLES,
	TERMINAL_MINIMUM_CONTRAST_CHOICES,
	TERMINAL_PARKED_RUNTIME_CAP_LIMITS,
} from "@superset/shared/settings-constraints";

export type SettingValue = string | number | boolean;

export type SettingsColumn = Exclude<keyof InsertSettings, "id"> & string;

export interface SettingDefinition {
	key: SettingsColumn;
	type: "boolean" | "string" | "number" | "enum";
	section: string;
	description: string;
	enumValues?: readonly string[];
	/** Discrete numeric choices (e.g. terminal minimum contrast). */
	numberChoices?: readonly number[];
	min?: number;
	max?: number;
	/** Value must be a multiple of this step. */
	step?: number;
	integer?: boolean;
	maxLength?: number;
	/** What the desktop app uses when the setting is unset (null in local.db). */
	defaultValue: SettingValue | null;
	/**
	 * Where the setting lives. Git settings are host-wide: the v2 UI reads
	 * them from the host service's host_settings table, so the CLI writes
	 * there (and mirrors to the legacy local.db columns).
	 */
	store?: "localDb" | "hostService";
}

const EDITOR_APPS = EXTERNAL_APPS.filter(
	(app) => !NON_EDITOR_APPS.includes(app),
);

// The "custom" ringtone is excluded: it requires a file uploaded through the app.
const RINGTONE_IDS = RINGTONES.map((ringtone) => ringtone.id);

const FONT_SIZE = FONT_SIZE_LIMITS;
const LINE_HEIGHT = LINE_HEIGHT_LIMITS;
const LETTER_SPACING = LETTER_SPACING_LIMITS;
const FONT_WEIGHT = { ...FONT_WEIGHT_LIMITS, integer: true };

export const SETTINGS: SettingDefinition[] = [
	// Behavior
	{
		key: "confirmOnQuit",
		type: "boolean",
		section: "behavior",
		description: "Ask for confirmation before quitting the app",
		defaultValue: true,
	},
	{
		key: "fileOpenMode",
		type: "enum",
		section: "behavior",
		enumValues: FILE_OPEN_MODES,
		description: "How files open from the sidebar and terminal links",
		defaultValue: "split-pane",
	},
	{
		key: "showResourceMonitor",
		type: "boolean",
		section: "behavior",
		description: "Show the CPU/memory resource monitor",
		defaultValue: true,
	},
	{
		key: "openLinksInApp",
		type: "boolean",
		section: "behavior",
		description: "Open http(s) links in an in-app browser pane",
		defaultValue: false,
	},
	{
		key: "browserHomepageUrl",
		type: "string",
		section: "behavior",
		description: "URL new in-app browser tabs open to (unset = about:blank)",
		defaultValue: null,
	},
	{
		key: "defaultEditor",
		type: "enum",
		section: "behavior",
		enumValues: EDITOR_APPS,
		description: "External editor used to open files and workspaces",
		defaultValue: null,
	},
	// Git (host-wide; requires the host service to be running)
	{
		key: "branchPrefixMode",
		type: "enum",
		section: "git",
		store: "hostService",
		enumValues: BRANCH_PREFIX_MODES,
		description: "Prefix applied to generated workspace branch names",
		defaultValue: "none",
	},
	{
		key: "branchPrefixCustom",
		type: "string",
		section: "git",
		store: "hostService",
		description:
			'Custom branch prefix (used when branchPrefixMode is "custom")',
		defaultValue: null,
	},
	{
		key: "worktreeBaseDir",
		type: "string",
		section: "git",
		store: "hostService",
		description:
			"Directory where workspace worktrees are created (default: ~/.superset/worktrees)",
		defaultValue: null,
	},
	// Notifications
	{
		key: "selectedRingtoneId",
		type: "enum",
		section: "notifications",
		enumValues: RINGTONE_IDS,
		description: "Sound played when an agent finishes",
		defaultValue: "arcade",
	},
	{
		key: "notificationSoundsMuted",
		type: "boolean",
		section: "notifications",
		description: "Mute notification sounds",
		defaultValue: false,
	},
	{
		key: "notificationVolume",
		type: "number",
		section: "notifications",
		...NOTIFICATION_VOLUME_LIMITS,
		integer: true,
		description: "Notification volume (0-100)",
		defaultValue: 100,
	},
	// Terminal
	{
		key: "terminalLinkBehavior",
		type: "enum",
		section: "terminal",
		enumValues: TERMINAL_LINK_BEHAVIORS,
		description: "Where file paths clicked in a terminal open",
		defaultValue: "file-viewer",
	},
	{
		key: "terminalParkedRuntimeCap",
		type: "number",
		section: "terminal",
		...TERMINAL_PARKED_RUNTIME_CAP_LIMITS,
		integer: true,
		description: "Max number of background terminals kept running",
		defaultValue: 12,
	},
	{
		key: "showPresetsBar",
		type: "boolean",
		section: "terminal",
		description: "Show the terminal presets bar",
		defaultValue: true,
	},
	{
		key: "useCompactTerminalAddButton",
		type: "boolean",
		section: "terminal",
		description: "Use the compact new-terminal button",
		defaultValue: true,
	},
	{
		key: "autoApplyDefaultPreset",
		type: "boolean",
		section: "terminal",
		description: "Apply the default terminal preset to new workspaces",
		defaultValue: true,
	},
	{
		key: "waitForSetupBeforeAgent",
		type: "boolean",
		section: "terminal",
		description: "Wait for workspace setup to finish before starting agents",
		defaultValue: false,
	},
	// Terminal appearance
	{
		key: "terminalFontFamily",
		type: "string",
		section: "terminal appearance",
		maxLength: FONT_FAMILY_MAX_LENGTH,
		description: "Terminal font family (unset = app default)",
		defaultValue: null,
	},
	{
		key: "terminalFontSize",
		type: "number",
		section: "terminal appearance",
		...FONT_SIZE,
		description: "Terminal font size in px (10-24, 0.5 steps)",
		defaultValue: 14,
	},
	{
		key: "terminalLineHeight",
		type: "number",
		section: "terminal appearance",
		...LINE_HEIGHT,
		description: "Terminal line height (1-2.5, 0.1 steps)",
		defaultValue: 1,
	},
	{
		key: "terminalLetterSpacing",
		type: "number",
		section: "terminal appearance",
		...LETTER_SPACING,
		description: "Terminal letter spacing in px (-2-4, 0.1 steps)",
		defaultValue: 0,
	},
	{
		key: "terminalFontWeight",
		type: "number",
		section: "terminal appearance",
		...FONT_WEIGHT,
		description: "Terminal font weight (100-900, hundreds)",
		defaultValue: null,
	},
	{
		key: "terminalLigatures",
		type: "boolean",
		section: "terminal appearance",
		description: "Enable terminal font ligatures",
		defaultValue: true,
	},
	{
		key: "terminalMinimumContrast",
		type: "number",
		section: "terminal appearance",
		numberChoices: TERMINAL_MINIMUM_CONTRAST_CHOICES,
		description: "Minimum terminal color contrast ratio (1, 3, 4.5, or 7)",
		defaultValue: 1,
	},
	{
		key: "terminalCursorStyle",
		type: "enum",
		section: "terminal appearance",
		enumValues: TERMINAL_CURSOR_STYLES,
		description: "Terminal cursor style",
		defaultValue: "block",
	},
	{
		key: "terminalCursorBlink",
		type: "boolean",
		section: "terminal appearance",
		description: "Blink the terminal cursor",
		defaultValue: true,
	},
	// Editor appearance
	{
		key: "editorFontFamily",
		type: "string",
		section: "editor appearance",
		maxLength: FONT_FAMILY_MAX_LENGTH,
		description: "File editor font family (unset = app default)",
		defaultValue: null,
	},
	{
		key: "editorFontSize",
		type: "number",
		section: "editor appearance",
		...FONT_SIZE,
		description: "File editor font size in px (10-24, 0.5 steps)",
		defaultValue: 13,
	},
	{
		key: "editorLineHeight",
		type: "number",
		section: "editor appearance",
		...LINE_HEIGHT,
		description: "File editor line height (1-2.5, 0.1 steps)",
		defaultValue: 1.5,
	},
	{
		key: "editorLetterSpacing",
		type: "number",
		section: "editor appearance",
		...LETTER_SPACING,
		description: "File editor letter spacing in px (-2-4, 0.1 steps)",
		defaultValue: 0,
	},
	{
		key: "editorFontWeight",
		type: "number",
		section: "editor appearance",
		...FONT_WEIGHT,
		description: "File editor font weight (100-900, hundreds)",
		defaultValue: null,
	},
	{
		key: "editorLigatures",
		type: "boolean",
		section: "editor appearance",
		description: "Enable file editor font ligatures",
		defaultValue: true,
	},
];

/**
 * settings-table columns deliberately NOT exposed by the CLI, with the reason.
 * The registry coverage test asserts every column is either in SETTINGS or
 * here — a new desktop column fails the test until someone decides.
 */
export const EXCLUDED_SETTINGS_COLUMNS: Record<string, string> = {
	lastActiveWorkspaceId: "internal navigation state, not a preference",
	activeOrganizationId: "internal session state, managed by sign-in",
	terminalPresets: "structured JSON; use the app UI or superset agents",
	terminalPresetsInitialized: "internal seeding flag",
	agentPresetOverrides: "structured JSON; use superset agents",
	agentCustomDefinitions: "structured JSON; use superset agents",
	agentPresetPermissionsMigratedAt: "internal migration marker",
	disabledAgentHooks: "agent-id list; use the app UI",
	disabledSkills: "skill-name list; use the app's Plugins page",
	installedPlugins: "structured install records; use the app's Plugins page",
	terminalPersistence: "dead column; nothing reads it, retained for rollback",
	deleteLocalBranch: "v2 reads renderer localStorage, unreachable externally",
	exposeHostServiceViaRelay:
		"security-sensitive; app gates it behind plan check + confirm dialog",
};

export function getSettingDefinition(key: string): SettingDefinition {
	const def = SETTINGS.find((setting) => setting.key === key);
	if (!def) {
		throw new CLIError(
			`Unknown setting: ${key}`,
			"Run: superset settings list",
		);
	}
	return def;
}

/** Human-readable summary of the values a setting accepts. */
export function allowedValues(def: SettingDefinition): string {
	switch (def.type) {
		case "boolean":
			return "true | false";
		case "enum":
			return (def.enumValues ?? []).join(" | ");
		case "number": {
			if (def.numberChoices) return def.numberChoices.join(" | ");
			const kind = def.integer ? "integer" : "number";
			const range =
				def.min !== undefined || def.max !== undefined
					? ` ${def.min ?? "-inf"}..${def.max ?? "inf"}`
					: "";
			const step = def.step !== undefined ? ` (step ${def.step})` : "";
			return `${kind}${range}${step}`;
		}
		case "string":
			return def.maxLength ? `string (max ${def.maxLength} chars)` : "string";
	}
}

export function parseSettingValue(
	def: SettingDefinition,
	raw: string,
): SettingValue {
	switch (def.type) {
		case "boolean": {
			const normalized = raw.toLowerCase();
			if (["true", "1", "on", "yes"].includes(normalized)) return true;
			if (["false", "0", "off", "no"].includes(normalized)) return false;
			throw new CLIError(`${def.key} expects true or false, got "${raw}"`);
		}
		case "enum": {
			if (!def.enumValues?.includes(raw)) {
				throw new CLIError(
					`Invalid value "${raw}" for ${def.key}`,
					`Allowed: ${allowedValues(def)}`,
				);
			}
			return raw;
		}
		case "number": {
			if (raw.trim() === "") {
				throw new CLIError(`${def.key} expects a number, got ""`);
			}
			const value = Number(raw);
			if (!Number.isFinite(value)) {
				throw new CLIError(`${def.key} expects a number, got "${raw}"`);
			}
			if (def.numberChoices && !def.numberChoices.includes(value)) {
				throw new CLIError(
					`Invalid value "${raw}" for ${def.key}`,
					`Allowed: ${allowedValues(def)}`,
				);
			}
			if (def.integer && !Number.isInteger(value)) {
				throw new CLIError(`${def.key} expects an integer, got "${raw}"`);
			}
			if (
				(def.min !== undefined && value < def.min) ||
				(def.max !== undefined && value > def.max)
			) {
				throw new CLIError(
					`${def.key} must be between ${def.min} and ${def.max}, got "${raw}"`,
				);
			}
			if (
				def.step !== undefined &&
				Math.abs(value / def.step - Math.round(value / def.step)) > 1e-9
			) {
				throw new CLIError(
					`${def.key} must be a multiple of ${def.step}, got "${raw}"`,
				);
			}
			return value;
		}
		case "string": {
			if (def.maxLength !== undefined && raw.length > def.maxLength) {
				throw new CLIError(
					`${def.key} must be at most ${def.maxLength} characters`,
				);
			}
			return raw;
		}
	}
}

export function formatSettingValue(value: SettingValue | null): string {
	if (value === null || value === undefined) return "";
	return String(value);
}
