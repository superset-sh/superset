/**
 * Centralized hotkey definitions for the desktop app.
 * Used both for registering shortcuts and displaying in the hotkey modal.
 */

import { PLATFORM } from "./constants";

export type HotkeyPlatform = "darwin" | "win32" | "linux";

export type HotkeyCategory =
	| "Workspace"
	| "Layout"
	| "Terminal"
	| "Window"
	| "Help";

export interface HotkeyDefinition {
	/** Human-readable label for display */
	label: string;
	/** Category for grouping in the modal */
	category: HotkeyCategory;
	/** Optional description for more detail */
	description?: string;
	/** Per-platform defaults */
	defaults: Record<HotkeyPlatform, string | null>;
	/** Hide from settings list (reserved for future use) */
	isHidden?: boolean;
}

export type HotkeyId = keyof typeof HOTKEYS;

export type HotkeyWithId = HotkeyDefinition & { id: HotkeyId };

export interface HotkeysState {
	version: number;
	byPlatform: Record<HotkeyPlatform, Partial<Record<HotkeyId, string | null>>>;
}

export interface HotkeysExportFile {
	schemaVersion: number;
	exportedAt: string;
	app: string;
	hotkeys: Record<HotkeyPlatform, Partial<Record<HotkeyId, string | null>>>;
}

export const HOTKEYS_STATE_VERSION = 1;

const MODIFIER_ORDER: Array<"meta" | "ctrl" | "alt" | "shift"> = [
	"meta",
	"ctrl",
	"alt",
	"shift",
];

const KEY_ALIAS_MAP: Record<string, string> = {
	cmd: "meta",
	command: "meta",
	opt: "alt",
	option: "alt",
	control: "ctrl",
	ctl: "ctrl",
	esc: "escape",
	return: "enter",
	arrowleft: "left",
	arrowright: "right",
	arrowup: "up",
	arrowdown: "down",
	" ": "space",
	spacebar: "space",
	slash: "slash",
	"/": "slash",
	"?": "slash",
};

const MODIFIER_DISPLAY_MAP: Record<HotkeyPlatform, Record<string, string>> = {
	darwin: { meta: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" },
	win32: { meta: "Win", ctrl: "Ctrl", alt: "Alt", shift: "Shift" },
	linux: { meta: "Super", ctrl: "Ctrl", alt: "Alt", shift: "Shift" },
};

const KEY_DISPLAY_MAP: Record<string, string> = {
	enter: "↵",
	backspace: "⌫",
	delete: "⌦",
	escape: "⎋",
	tab: "⇥",
	up: "↑",
	down: "↓",
	left: "←",
	right: "→",
	space: "␣",
	slash: "/",
};

const ELECTRON_KEY_MAP: Record<string, string> = {
	enter: "Enter",
	backspace: "Backspace",
	delete: "Delete",
	escape: "Escape",
	tab: "Tab",
	up: "Up",
	down: "Down",
	left: "Left",
	right: "Right",
	space: "Space",
	slash: "/",
};

const TERMINAL_RESERVED_CHORDS = new Set<string>([
	"ctrl+c",
	"ctrl+d",
	"ctrl+z",
	"ctrl+s",
	"ctrl+q",
	"ctrl+\\",
]);

const OS_RESERVED_CHORDS: Record<HotkeyPlatform, string[]> = {
	darwin: ["meta+q", "meta+space", "meta+tab"],
	win32: ["alt+f4", "alt+tab", "ctrl+alt+delete"],
	linux: ["alt+f4", "alt+tab"],
};

export interface KeyboardEventLike {
	key: string;
	code?: string;
	ctrlKey: boolean;
	shiftKey: boolean;
	altKey: boolean;
	metaKey: boolean;
}

function normalizeKey(raw: string): string {
	const trimmed = raw.trim();
	const lower = trimmed === "" && raw !== "" ? raw : trimmed.toLowerCase();
	return KEY_ALIAS_MAP[lower] ?? lower;
}

function parseHotkeyString(keys: string): {
	modifiers: Set<string>;
	key: string | null;
} {
	const parts = keys
		.split("+")
		.map((part) => normalizeKey(part))
		.filter(Boolean);
	const modifiers = new Set<string>();
	let primary: string | null = null;

	for (const part of parts) {
		if (MODIFIER_ORDER.includes(part as (typeof MODIFIER_ORDER)[number])) {
			modifiers.add(part);
			continue;
		}
		if (primary) {
			return { modifiers, key: null };
		}
		primary = part;
	}

	return { modifiers, key: primary };
}

function formatHotkeyString(modifiers: Set<string>, key: string): string {
	const ordered = MODIFIER_ORDER.filter((modifier) => modifiers.has(modifier));
	return [...ordered, key].join("+");
}

export function getCurrentPlatform(): HotkeyPlatform {
	if (PLATFORM.IS_MAC) return "darwin";
	if (PLATFORM.IS_WINDOWS) return "win32";
	return "linux";
}

export function canonicalizeHotkey(keys: string): string | null {
	const parsed = parseHotkeyString(keys);
	if (!parsed.key) return null;
	return formatHotkeyString(parsed.modifiers, parsed.key);
}

export function canonicalizeHotkeyForPlatform(
	keys: string,
	platform: HotkeyPlatform,
): string | null {
	const canonical = canonicalizeHotkey(keys);
	if (!canonical) return null;
	if (platform !== "darwin" && canonical.includes("meta+")) return null;
	return canonical;
}

export function formatHotkeyDisplay(
	keys: string | null,
	platform: HotkeyPlatform,
): string[] {
	if (!keys) return ["Unassigned"];
	const canonical = canonicalizeHotkey(keys);
	if (!canonical) return ["Unassigned"];

	const { modifiers, key } = parseHotkeyString(canonical);
	if (!key) return ["Unassigned"];

	const modifierSymbols = MODIFIER_ORDER.filter((modifier) =>
		modifiers.has(modifier),
	).map((modifier) => MODIFIER_DISPLAY_MAP[platform][modifier]);

	const keyDisplay = KEY_DISPLAY_MAP[key] ?? key.toUpperCase();
	return [...modifierSymbols, keyDisplay];
}

export function formatHotkeyText(
	keys: string | null,
	platform: HotkeyPlatform,
): string {
	const display = formatHotkeyDisplay(keys, platform);
	if (display.length === 1 && display[0] === "Unassigned") {
		return "Unassigned";
	}
	return platform === "darwin" ? display.join("") : display.join("+");
}

export function matchesHotkeyEvent(
	event: KeyboardEventLike,
	keys: string,
): boolean {
	const canonical = canonicalizeHotkey(keys);
	if (!canonical) return false;

	const { modifiers, key } = parseHotkeyString(canonical);
	if (!key) return false;

	const requiresMeta = modifiers.has("meta");
	const requiresCtrl = modifiers.has("ctrl");
	const requiresAlt = modifiers.has("alt");
	const requiresShift = modifiers.has("shift");

	if (requiresMeta !== event.metaKey) return false;
	if (requiresCtrl !== event.ctrlKey) return false;
	if (requiresAlt !== event.altKey) return false;
	if (requiresShift !== event.shiftKey) return false;

	const eventKey = normalizeKey(event.key);
	const eventCode = event.code ? normalizeKey(event.code) : "";

	if (key === "slash" && (eventKey === "slash" || eventCode === "slash")) {
		return true;
	}

	if (key === "left" && eventKey === "arrowleft") return true;
	if (key === "right" && eventKey === "arrowright") return true;
	if (key === "up" && eventKey === "arrowup") return true;
	if (key === "down" && eventKey === "arrowdown") return true;

	return eventKey === key;
}

export function hotkeyFromKeyboardEvent(
	event: KeyboardEventLike,
	platform: HotkeyPlatform,
): string | null {
	const normalizedKey = normalizeKey(event.key);
	if (
		normalizedKey === "shift" ||
		normalizedKey === "ctrl" ||
		normalizedKey === "alt" ||
		normalizedKey === "meta"
	) {
		return null;
	}
	if (normalizedKey === "dead" || normalizedKey === "unidentified") {
		return null;
	}

	// App hotkeys must include ctrl or meta to avoid conflicts with terminal input
	if (!event.ctrlKey && !event.metaKey) {
		return null;
	}

	const primary = normalizedKey;

	const modifiers = new Set<string>();
	if (event.metaKey) modifiers.add("meta");
	if (event.ctrlKey) modifiers.add("ctrl");
	if (event.altKey) modifiers.add("alt");
	if (event.shiftKey) modifiers.add("shift");

	const canonical = formatHotkeyString(modifiers, primary);
	return canonicalizeHotkeyForPlatform(canonical, platform);
}

export function isTerminalReservedHotkey(keys: string): boolean {
	const canonical = canonicalizeHotkey(keys);
	if (!canonical) return false;
	return TERMINAL_RESERVED_CHORDS.has(canonical);
}

export function isTerminalReservedEvent(event: KeyboardEventLike): boolean {
	for (const reserved of TERMINAL_RESERVED_CHORDS) {
		if (matchesHotkeyEvent(event, reserved)) return true;
	}
	return false;
}

export function isOsReservedHotkey(
	keys: string,
	platform: HotkeyPlatform,
): boolean {
	const canonical = canonicalizeHotkey(keys);
	if (!canonical) return false;
	return OS_RESERVED_CHORDS[platform].includes(canonical);
}

/**
 * Checks if a hotkey includes a primary modifier (ctrl or meta).
 * App hotkeys must include ctrl or meta to avoid conflicts with terminal input
 * and to ensure they work when the terminal is focused.
 */
export function hasPrimaryModifier(keys: string): boolean {
	const parsed = parseHotkeyString(keys);
	return parsed.modifiers.has("ctrl") || parsed.modifiers.has("meta");
}

export function deriveNonMacDefault(keys: string | null): string | null {
	if (!keys) return null;
	const canonical = canonicalizeHotkey(keys);
	if (!canonical) return null;
	const parsed = parseHotkeyString(canonical);
	if (!parsed.key) return null;
	const modifiers = new Set(parsed.modifiers);
	const hadMeta = modifiers.delete("meta");
	if (!hadMeta) {
		return formatHotkeyString(modifiers, parsed.key);
	}
	modifiers.add("ctrl");
	modifiers.add("shift");
	if (parsed.modifiers.has("shift")) {
		modifiers.add("alt");
	}
	return formatHotkeyString(modifiers, parsed.key);
}

function defineHotkey(def: {
	keys: string | null;
	label: string;
	category: HotkeyCategory;
	description?: string;
	defaults?: Partial<Record<HotkeyPlatform, string | null>>;
	isHidden?: boolean;
}): HotkeyDefinition {
	const darwin = def.keys;
	const win32 = def.defaults?.win32 ?? deriveNonMacDefault(darwin);
	const linux = def.defaults?.linux ?? deriveNonMacDefault(darwin);
	return {
		label: def.label,
		category: def.category,
		description: def.description,
		defaults: {
			darwin,
			win32: win32 ?? null,
			linux: linux ?? null,
		},
		isHidden: def.isHidden,
	};
}

export const HOTKEYS = {
	// Workspace - switch with ⌘+1-9
	JUMP_TO_WORKSPACE_1: defineHotkey({
		keys: "meta+1",
		label: "Switch to Workspace 1",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_2: defineHotkey({
		keys: "meta+2",
		label: "Switch to Workspace 2",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_3: defineHotkey({
		keys: "meta+3",
		label: "Switch to Workspace 3",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_4: defineHotkey({
		keys: "meta+4",
		label: "Switch to Workspace 4",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_5: defineHotkey({
		keys: "meta+5",
		label: "Switch to Workspace 5",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_6: defineHotkey({
		keys: "meta+6",
		label: "Switch to Workspace 6",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_7: defineHotkey({
		keys: "meta+7",
		label: "Switch to Workspace 7",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_8: defineHotkey({
		keys: "meta+8",
		label: "Switch to Workspace 8",
		category: "Workspace",
	}),
	JUMP_TO_WORKSPACE_9: defineHotkey({
		keys: "meta+9",
		label: "Switch to Workspace 9",
		category: "Workspace",
	}),
	PREV_WORKSPACE: defineHotkey({
		keys: "meta+alt+up",
		label: "Previous Workspace",
		category: "Workspace",
	}),
	NEXT_WORKSPACE: defineHotkey({
		keys: "meta+alt+down",
		label: "Next Workspace",
		category: "Workspace",
	}),

	// Layout
	TOGGLE_SIDEBAR: defineHotkey({
		keys: "meta+l",
		label: "Toggle Changes Tab",
		category: "Layout",
	}),
	TOGGLE_EXPAND_SIDEBAR: defineHotkey({
		keys: "meta+shift+l",
		label: "Toggle Expand Sidebar",
		category: "Layout",
	}),
	TOGGLE_WORKSPACE_SIDEBAR: defineHotkey({
		keys: "meta+b",
		label: "Toggle Workspaces Sidebar",
		category: "Layout",
	}),
	SPLIT_RIGHT: defineHotkey({
		keys: "meta+d",
		label: "Split Right",
		category: "Layout",
		description: "Split the current pane to the right",
	}),
	SPLIT_DOWN: defineHotkey({
		keys: "meta+shift+d",
		label: "Split Down",
		category: "Layout",
		description: "Split the current pane downward",
	}),
	SPLIT_AUTO: defineHotkey({
		keys: "meta+e",
		label: "Split Pane Auto",
		category: "Layout",
		description: "Split the current pane along its longer side",
	}),
	CLOSE_PANE: defineHotkey({
		keys: "meta+w",
		label: "Close Pane",
		category: "Layout",
		description: "Close the current pane",
	}),

	// Terminal
	FIND_IN_TERMINAL: defineHotkey({
		keys: "meta+f",
		label: "Find in Terminal",
		category: "Terminal",
		description: "Search text in the active terminal",
	}),
	NEW_GROUP: defineHotkey({
		keys: "meta+t",
		label: "New Tab",
		category: "Terminal",
	}),
	CLOSE_TERMINAL: defineHotkey({
		keys: "meta+w",
		label: "Close Terminal",
		category: "Terminal",
	}),
	CLEAR_TERMINAL: defineHotkey({
		keys: "meta+k",
		label: "Clear Terminal",
		category: "Terminal",
	}),
	SCROLL_TO_BOTTOM: defineHotkey({
		keys: "meta+shift+down",
		label: "Scroll to Bottom",
		category: "Terminal",
		description: "Scroll the active terminal to the bottom",
	}),
	PREV_TAB: defineHotkey({
		keys: "meta+alt+left",
		label: "Previous Tab",
		category: "Terminal",
	}),
	NEXT_TAB: defineHotkey({
		keys: "meta+alt+right",
		label: "Next Tab",
		category: "Terminal",
	}),
	PREV_PANE: defineHotkey({
		keys: "meta+shift+left",
		label: "Previous Pane",
		category: "Terminal",
		description: "Focus the previous pane in the current tab",
	}),
	NEXT_PANE: defineHotkey({
		keys: "meta+shift+right",
		label: "Next Pane",
		category: "Terminal",
		description: "Focus the next pane in the current tab",
	}),
	OPEN_PRESET_1: defineHotkey({
		keys: "ctrl+1",
		label: "Open Preset 1",
		category: "Terminal",
	}),
	OPEN_PRESET_2: defineHotkey({
		keys: "ctrl+2",
		label: "Open Preset 2",
		category: "Terminal",
	}),
	OPEN_PRESET_3: defineHotkey({
		keys: "ctrl+3",
		label: "Open Preset 3",
		category: "Terminal",
	}),
	OPEN_PRESET_4: defineHotkey({
		keys: "ctrl+4",
		label: "Open Preset 4",
		category: "Terminal",
	}),
	OPEN_PRESET_5: defineHotkey({
		keys: "ctrl+5",
		label: "Open Preset 5",
		category: "Terminal",
	}),
	OPEN_PRESET_6: defineHotkey({
		keys: "ctrl+6",
		label: "Open Preset 6",
		category: "Terminal",
	}),
	OPEN_PRESET_7: defineHotkey({
		keys: "ctrl+7",
		label: "Open Preset 7",
		category: "Terminal",
	}),
	OPEN_PRESET_8: defineHotkey({
		keys: "ctrl+8",
		label: "Open Preset 8",
		category: "Terminal",
	}),
	OPEN_PRESET_9: defineHotkey({
		keys: "ctrl+9",
		label: "Open Preset 9",
		category: "Terminal",
	}),

	// Workspace creation
	NEW_WORKSPACE: defineHotkey({
		keys: "meta+n",
		label: "New Workspace",
		category: "Workspace",
		description: "Open the new workspace modal",
	}),
	QUICK_CREATE_WORKSPACE: defineHotkey({
		keys: "meta+shift+n",
		label: "Quick Create Workspace",
		category: "Workspace",
		description: "Quickly create a workspace in the current project",
	}),
	FOCUS_TASK_SEARCH: defineHotkey({
		keys: "meta+f",
		label: "Focus Task Search",
		category: "Workspace",
		description: "Focus the search input in the tasks view",
	}),
	OPEN_PROJECT: defineHotkey({
		keys: "meta+shift+o",
		label: "Open Project",
		category: "Workspace",
		description: "Open an existing project folder",
	}),

	// Window
	NEW_WINDOW: defineHotkey({
		keys: null,
		label: "New Window",
		category: "Window",
		isHidden: true,
	}),
	CLOSE_WINDOW: defineHotkey({
		keys: "meta+shift+w",
		label: "Close Window",
		category: "Window",
	}),
	OPEN_IN_APP: defineHotkey({
		keys: "meta+o",
		label: "Open in App",
		category: "Window",
		description: "Open workspace in external app (Cursor, VS Code, etc.)",
	}),
	COPY_PATH: defineHotkey({
		keys: "meta+shift+c",
		label: "Copy Path",
		category: "Window",
		description: "Copy the workspace path to the clipboard",
	}),

	// Help
	OPEN_SETTINGS: defineHotkey({
		keys: "meta+,",
		label: "Open Settings",
		category: "Help",
		defaults: {
			darwin: "meta+,",
			win32: "ctrl+,",
			linux: "ctrl+,",
		},
	}),
	SHOW_HOTKEYS: defineHotkey({
		keys: "meta+slash",
		label: "Show Keyboard Shortcuts",
		category: "Help",
	}),
} as const satisfies Record<string, HotkeyDefinition>;

export function getVisibleHotkeys(): HotkeyId[] {
	return (Object.keys(HOTKEYS) as HotkeyId[]).filter(
		(id) => !HOTKEYS[id].isHidden,
	);
}

export function getHotkeysByCategory(options?: {
	includeHidden?: boolean;
}): Record<HotkeyCategory, HotkeyWithId[]> {
	const grouped: Record<HotkeyCategory, HotkeyWithId[]> = {
		Workspace: [],
		Layout: [],
		Terminal: [],
		Window: [],
		Help: [],
	};

	for (const [id, hotkey] of Object.entries(HOTKEYS)) {
		if (!options?.includeHidden && hotkey.isHidden) continue;
		grouped[hotkey.category].push({ id: id as HotkeyId, ...hotkey });
	}

	return grouped;
}

export function getDefaultHotkey(
	id: HotkeyId,
	platform: HotkeyPlatform,
): string | null {
	return HOTKEYS[id].defaults[platform];
}

/**
 * Get the hotkey binding for the current platform.
 * Convenience wrapper around getDefaultHotkey.
 * Returns empty string if no hotkey is defined (safe for useHotkeys).
 */
export function getHotkey(id: HotkeyId): string {
	return getDefaultHotkey(id, getCurrentPlatform()) ?? "";
}

export function getEffectiveHotkey(
	id: HotkeyId,
	overrides: Partial<Record<HotkeyId, string | null>>,
	platform: HotkeyPlatform,
): string | null {
	if (overrides[id] !== undefined) return overrides[id] ?? null;
	return getDefaultHotkey(id, platform);
}

export function getEffectiveHotkeysMap(
	overrides: Partial<Record<HotkeyId, string | null>>,
	platform: HotkeyPlatform,
): Record<HotkeyId, string | null> {
	const map = {} as Record<HotkeyId, string | null>;
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		map[id] = getEffectiveHotkey(id, overrides, platform);
	}
	return map;
}

export function buildOverridesFromBindings(
	bindings: Partial<Record<HotkeyId, string | null>>,
	platform: HotkeyPlatform,
): Partial<Record<HotkeyId, string | null>> {
	const overrides: Partial<Record<HotkeyId, string | null>> = {};
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		if (!(id in bindings)) continue;
		const value = bindings[id];
		if (value === undefined) continue;
		const canonical =
			value === null ? null : canonicalizeHotkeyForPlatform(value, platform);
		if (canonical === null && value !== null) {
			continue;
		}
		// App hotkeys must include ctrl or meta to work in terminal
		if (canonical !== null && !hasPrimaryModifier(canonical)) {
			continue;
		}
		const defaultValue = getDefaultHotkey(id, platform);
		if (canonical === defaultValue) continue;
		overrides[id] = canonical;
	}
	return overrides;
}

export function normalizeBindingsWithDefaults(
	bindings: Partial<Record<HotkeyId, string | null>>,
	platform: HotkeyPlatform,
): Record<HotkeyId, string | null> {
	const map = getEffectiveHotkeysMap({}, platform);
	for (const id of Object.keys(HOTKEYS) as HotkeyId[]) {
		if (!(id in bindings)) continue;
		const value = bindings[id];
		if (value === undefined) continue;
		if (value === null) {
			map[id] = null;
			continue;
		}
		const canonical = canonicalizeHotkeyForPlatform(value, platform);
		if (canonical) {
			map[id] = canonical;
		}
	}
	return map;
}

export function createDefaultHotkeysState(): HotkeysState {
	return {
		version: HOTKEYS_STATE_VERSION,
		byPlatform: {
			darwin: {},
			win32: {},
			linux: {},
		},
	};
}

export function createHotkeysExport(
	hotkeysState: HotkeysState,
): HotkeysExportFile {
	return {
		schemaVersion: HOTKEYS_STATE_VERSION,
		exportedAt: new Date().toISOString(),
		app: "@superset/desktop",
		hotkeys: {
			darwin: getEffectiveHotkeysMap(hotkeysState.byPlatform.darwin, "darwin"),
			win32: getEffectiveHotkeysMap(hotkeysState.byPlatform.win32, "win32"),
			linux: getEffectiveHotkeysMap(hotkeysState.byPlatform.linux, "linux"),
		},
	};
}

export function buildHotkeysStateFromExport(
	exportFile: HotkeysExportFile,
): HotkeysState {
	return {
		version: HOTKEYS_STATE_VERSION,
		byPlatform: {
			darwin: buildOverridesFromBindings(
				exportFile.hotkeys.darwin ?? {},
				"darwin",
			),
			win32: buildOverridesFromBindings(
				exportFile.hotkeys.win32 ?? {},
				"win32",
			),
			linux: buildOverridesFromBindings(
				exportFile.hotkeys.linux ?? {},
				"linux",
			),
		},
	};
}

export function getHotkeysSummary(bindings: Record<HotkeyId, string | null>): {
	assigned: number;
	disabled: number;
} {
	let assigned = 0;
	let disabled = 0;
	for (const id of Object.keys(bindings) as HotkeyId[]) {
		const value = bindings[id];
		if (value === null) {
			disabled += 1;
		} else {
			assigned += 1;
		}
	}
	return { assigned, disabled };
}

export function toElectronAccelerator(
	keys: string | null,
	platform: HotkeyPlatform,
): string | null {
	if (!keys) return null;
	const canonical = canonicalizeHotkey(keys);
	if (!canonical) return null;
	if (platform !== "darwin" && canonical.includes("meta+")) return null;

	const { modifiers, key } = parseHotkeyString(canonical);
	if (!key) return null;

	const modifierTokens = MODIFIER_ORDER.filter((modifier) =>
		modifiers.has(modifier),
	).map((modifier) => {
		if (modifier === "meta") return "Command";
		if (modifier === "ctrl") return "Ctrl";
		if (modifier === "alt") return "Alt";
		return "Shift";
	});

	const mappedKey =
		ELECTRON_KEY_MAP[key] ??
		(key.length === 1
			? key.toUpperCase()
			: `${key.charAt(0).toUpperCase()}${key.slice(1)}`);

	return [...modifierTokens, mappedKey].join("+");
}
