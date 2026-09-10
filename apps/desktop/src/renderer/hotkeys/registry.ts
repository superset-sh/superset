import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type {
	HotkeyCategory,
	HotkeyDefinition,
	Platform,
	PlatformKey,
	ShortcutBinding,
} from "./types";

interface HotkeyRegistryDefinition {
	key: PlatformKey;
	label: MessageDescriptor;
	category: HotkeyCategory;
	description?: MessageDescriptor;
}

function detectPlatform(): Platform {
	if (typeof navigator === "undefined") return "mac";
	const p = navigator.platform.toLowerCase();
	if (p.includes("mac")) return "mac";
	if (p.includes("win")) return "windows";
	return "linux";
}

export const PLATFORM: Platform = detectPlatform();

/**
 * Mark a printable chord as logical so it follows the labeled key on
 * non-US layouts (e.g. on QWERTZ ⌘Z fires on the key printed "Z" — physical
 * KeyY — instead of physical KeyZ). Honored when `adaptiveLayoutEnabled`
 * is on; falls through to the original chord otherwise (matching physical
 * dispatch). Use bare strings only for chords whose terminal token is a
 * named key (arrows, Enter, Escape, F1–F12, …) — those are layout-stable
 * and `defaultModeForChord` classifies them as "named" automatically.
 */
const L = (chord: string): ShortcutBinding => ({
	version: 2,
	mode: "logical",
	chord,
});

// ---------------------------------------------------------------------------
// Hotkey definitions
// ---------------------------------------------------------------------------

export const HOTKEYS_REGISTRY = {
	// Navigation
	NAVIGATE_BACK: {
		key: {
			mac: L("meta+bracketleft"),
			windows: L("ctrl+shift+bracketleft"),
			linux: L("ctrl+shift+bracketleft"),
		},
		label: msg({ message: "Navigate Back" }),
		category: "Navigation",
		description: msg({
			message: "Go back to the previous page in history",
		}),
	},
	NAVIGATE_FORWARD: {
		key: {
			mac: L("meta+bracketright"),
			windows: L("ctrl+shift+bracketright"),
			linux: L("ctrl+shift+bracketright"),
		},
		label: msg({
			message: "Navigate Forward",
		}),
		category: "Navigation",
		description: msg({
			message: "Go forward to the next page in history",
		}),
	},
	QUICK_OPEN: {
		key: {
			mac: L("meta+p"),
			windows: L("ctrl+shift+p"),
			linux: L("ctrl+shift+p"),
		},
		label: msg({ message: "Quick Open File" }),
		category: "Navigation",
		description: msg({
			message: "Search and open files in the current workspace",
		}),
	},

	// Workspace switching
	JUMP_TO_WORKSPACE_1: {
		key: {
			mac: L("meta+1"),
			windows: L("ctrl+shift+1"),
			linux: L("ctrl+shift+1"),
		},
		label: msg({
			message: "Switch to Workspace 1",
		}),
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_2: {
		key: {
			mac: L("meta+2"),
			windows: L("ctrl+shift+2"),
			linux: L("ctrl+shift+2"),
		},
		label: msg({
			message: "Switch to Workspace 2",
		}),
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_3: {
		key: {
			mac: L("meta+3"),
			windows: L("ctrl+shift+3"),
			linux: L("ctrl+shift+3"),
		},
		label: msg({
			message: "Switch to Workspace 3",
		}),
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_4: {
		key: {
			mac: L("meta+4"),
			windows: L("ctrl+shift+4"),
			linux: L("ctrl+shift+4"),
		},
		label: msg({
			message: "Switch to Workspace 4",
		}),
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_5: {
		key: {
			mac: L("meta+5"),
			windows: L("ctrl+shift+5"),
			linux: L("ctrl+shift+5"),
		},
		label: msg({
			message: "Switch to Workspace 5",
		}),
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_6: {
		key: {
			mac: L("meta+6"),
			windows: L("ctrl+shift+6"),
			linux: L("ctrl+shift+6"),
		},
		label: msg({
			message: "Switch to Workspace 6",
		}),
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_7: {
		key: {
			mac: L("meta+7"),
			windows: L("ctrl+shift+7"),
			linux: L("ctrl+shift+7"),
		},
		label: msg({
			message: "Switch to Workspace 7",
		}),
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_8: {
		key: {
			mac: L("meta+8"),
			windows: L("ctrl+shift+8"),
			linux: L("ctrl+shift+8"),
		},
		label: msg({
			message: "Switch to Workspace 8",
		}),
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_9: {
		key: {
			mac: L("meta+9"),
			windows: L("ctrl+shift+9"),
			linux: L("ctrl+shift+9"),
		},
		label: msg({
			message: "Switch to Workspace 9",
		}),
		category: "Workspace",
	},
	PREV_WORKSPACE: {
		key: {
			mac: "meta+alt+up",
			windows: "ctrl+shift+alt+up",
			linux: "ctrl+shift+alt+up",
		},
		label: msg({
			message: "Previous Workspace",
		}),
		category: "Workspace",
		description: msg({
			message: "Navigate to the previous workspace in the sidebar",
		}),
	},
	NEXT_WORKSPACE: {
		key: {
			mac: "meta+alt+down",
			windows: "ctrl+shift+alt+down",
			linux: "ctrl+shift+alt+down",
		},
		label: msg({
			message: "Next Workspace",
		}),
		category: "Workspace",
		description: msg({
			message: "Navigate to the next workspace in the sidebar",
		}),
	},
	CLOSE_WORKSPACE: {
		key: {
			mac: "meta+shift+backspace",
			windows: "ctrl+shift+backspace",
			linux: "ctrl+shift+backspace",
		},
		label: msg({
			message: "Close Workspace",
		}),
		category: "Workspace",
		description: msg({
			message: "Close or delete the current workspace",
		}),
	},
	NEW_WORKSPACE: {
		key: {
			mac: L("meta+n"),
			windows: L("ctrl+shift+n"),
			linux: L("ctrl+shift+n"),
		},
		label: msg({ message: "New Workspace" }),
		category: "Workspace",
		description: msg({
			message: "Open the new workspace modal",
		}),
	},
	QUICK_CREATE_WORKSPACE: {
		key: {
			mac: L("meta+shift+n"),
			windows: L("ctrl+shift+alt+n"),
			linux: L("ctrl+shift+alt+n"),
		},
		label: msg({
			message: "Quick Create Workspace",
		}),
		category: "Workspace",
		description: msg({
			message: "Quickly create a workspace in the current project",
		}),
	},
	RUN_WORKSPACE_COMMAND: {
		key: {
			mac: L("meta+g"),
			windows: L("ctrl+shift+g"),
			linux: L("ctrl+shift+g"),
		},
		label: msg({
			message: "Run Workspace Command",
		}),
		category: "Workspace",
		description: msg({
			message: "Start or stop the workspace run command",
		}),
	},
	FOCUS_TASK_SEARCH: {
		key: {
			mac: L("meta+f"),
			windows: L("ctrl+shift+f"),
			linux: L("ctrl+shift+f"),
		},
		label: msg({
			message: "Focus Task Search",
		}),
		category: "Workspace",
		description: msg({
			message: "Focus the search input in the tasks view",
		}),
	},
	OPEN_PROJECT: {
		key: {
			mac: L("meta+shift+o"),
			windows: L("ctrl+shift+alt+o"),
			linux: L("ctrl+shift+alt+o"),
		},
		label: msg({ message: "Open Project" }),
		category: "Workspace",
		description: msg({
			message: "Open an existing project folder",
		}),
	},
	OPEN_PR: {
		key: {
			mac: L("meta+shift+p"),
			windows: L("ctrl+shift+alt+p"),
			linux: L("ctrl+shift+alt+p"),
		},
		label: msg({ message: "Open Pull Request" }),
		category: "Workspace",
		description: msg({
			message: "Open existing PR or create a new one on GitHub",
		}),
	},

	// Layout
	TOGGLE_SIDEBAR: {
		key: {
			mac: L("meta+l"),
			windows: L("ctrl+shift+l"),
			linux: L("ctrl+shift+l"),
		},
		label: msg({
			message: "Toggle Sidebar",
		}),
		category: "Layout",
	},
	OPEN_DIFF_VIEWER: {
		key: {
			mac: L("meta+shift+l"),
			windows: L("ctrl+shift+alt+l"),
			linux: L("ctrl+shift+alt+l"),
		},
		label: msg({
			message: "Open Changes",
		}),
		category: "Layout",
		description: msg({
			message: "Open the Changes pane in a new tab, or focus the existing one",
		}),
	},
	TOGGLE_WORKSPACE_SIDEBAR: {
		key: {
			mac: L("meta+b"),
			windows: L("ctrl+shift+b"),
			linux: L("ctrl+shift+b"),
		},
		label: msg({
			message: "Toggle Workspaces Sidebar",
		}),
		category: "Layout",
	},
	SPLIT_RIGHT: {
		key: {
			mac: L("meta+d"),
			windows: L("ctrl+shift+d"),
			linux: L("ctrl+shift+d"),
		},
		label: msg({ message: "Split Right" }),
		category: "Layout",
		description: msg({
			message: "Split the current pane to the right",
		}),
	},
	SPLIT_DOWN: {
		key: {
			mac: L("meta+shift+d"),
			windows: L("ctrl+shift+alt+d"),
			linux: L("ctrl+shift+alt+d"),
		},
		label: msg({ message: "Split Down" }),
		category: "Layout",
		description: msg({
			message: "Split the current pane downward",
		}),
	},
	SPLIT_AUTO: {
		key: {
			mac: L("meta+e"),
			windows: L("ctrl+shift+e"),
			linux: L("ctrl+shift+e"),
		},
		label: msg({ message: "Split Pane Auto" }),
		category: "Layout",
		description: msg({
			message: "Split the current pane along its longer side",
		}),
	},
	SPLIT_WITH_BROWSER: {
		key: {
			mac: L("meta+shift+s"),
			windows: L("ctrl+shift+alt+s"),
			linux: L("ctrl+shift+alt+s"),
		},
		label: msg({
			message: "Split with New Browser",
		}),
		category: "Layout",
		description: msg({
			message: "Split the current pane and open a new browser pane",
		}),
	},
	SPLIT_WITH_DESKTOP: {
		key: {
			mac: L("meta+shift+y"),
			windows: L("ctrl+shift+alt+y"),
			linux: L("ctrl+shift+alt+y"),
		},
		label: msg({
			message: "Split with Desktop",
		}),
		category: "Layout",
		description: msg({
			message: "Split the current pane and open the sandbox desktop",
		}),
	},
	EQUALIZE_PANE_SPLITS: {
		key: {
			mac: L("meta+shift+0"),
			windows: L("ctrl+shift+0"),
			linux: L("ctrl+shift+0"),
		},
		label: msg({
			message: "Equalize Pane Splits",
		}),
		category: "Layout",
		description: msg({
			message: "Make all panes equal size",
		}),
	},
	CLOSE_PANE: {
		key: {
			mac: L("meta+w"),
			windows: L("ctrl+shift+w"),
			linux: L("ctrl+shift+w"),
		},
		label: msg({ message: "Close Pane" }),
		category: "Layout",
		description: msg({
			message: "Close the current pane",
		}),
	},

	// Terminal
	FIND_IN_TERMINAL: {
		key: {
			mac: L("meta+f"),
			windows: L("ctrl+shift+f"),
			linux: L("ctrl+shift+f"),
		},
		label: msg({
			message: "Find in Terminal",
		}),
		category: "Terminal",
		description: msg({
			message: "Search text in the active terminal",
		}),
	},
	TOGGLE_TERMINAL_RICH_INPUT: {
		key: {
			mac: L("meta+i"),
			// Ctrl+Shift+I is the Electron devtools accelerator; use +M instead.
			windows: L("ctrl+shift+m"),
			linux: L("ctrl+shift+m"),
		},
		label: msg({
			message: "Toggle Terminal Rich Input",
		}),
		category: "Terminal",
		description: msg({
			message: "Open a multiline prompt composer for the active terminal",
		}),
	},
	FIND_IN_FILE_VIEWER: {
		key: {
			mac: L("meta+f"),
			windows: L("ctrl+shift+f"),
			linux: L("ctrl+shift+f"),
		},
		label: msg({
			message: "Find in File Viewer",
		}),
		category: "Terminal",
		description: msg({
			message: "Search text in the rendered file viewer",
		}),
	},
	FIND_IN_CHAT: {
		key: {
			mac: L("meta+f"),
			windows: L("ctrl+shift+f"),
			linux: L("ctrl+shift+f"),
		},
		label: msg({ message: "Find in Chat" }),
		category: "Terminal",
		description: msg({
			message: "Search text in the active chat",
		}),
	},
	FIND_IN_CHANGES: {
		key: {
			mac: L("meta+f"),
			windows: L("ctrl+shift+f"),
			linux: L("ctrl+shift+f"),
		},
		label: msg({
			message: "Find in Changes",
		}),
		category: "Terminal",
		description: msg({
			message: "Search text in the changes diff",
		}),
	},
	NEW_GROUP: {
		key: {
			mac: L("meta+t"),
			windows: L("ctrl+shift+t"),
			linux: L("ctrl+shift+t"),
		},
		label: msg({ message: "New Terminal" }),
		category: "Terminal",
	},
	REOPEN_TAB: {
		key: {
			mac: L("meta+shift+r"),
			windows: L("ctrl+shift+alt+r"),
			linux: L("ctrl+shift+alt+r"),
		},
		label: msg({ message: "Reopen Closed Tab" }),
		category: "Terminal",
	},
	NEW_BROWSER: {
		key: {
			mac: L("meta+shift+b"),
			windows: L("ctrl+shift+alt+b"),
			linux: L("ctrl+shift+alt+b"),
		},
		label: msg({ message: "New Browser" }),
		category: "Terminal",
	},
	CLOSE_TERMINAL: {
		key: {
			mac: L("meta+w"),
			windows: L("ctrl+shift+w"),
			linux: L("ctrl+shift+w"),
		},
		label: msg({
			message: "Close Terminal",
		}),
		category: "Terminal",
	},
	CLOSE_TAB: {
		key: {
			mac: L("meta+shift+w"),
			windows: L("ctrl+shift+alt+w"),
			linux: L("ctrl+shift+alt+w"),
		},
		label: msg({ message: "Close Tab" }),
		category: "Terminal",
		description: msg({
			message: "Close the current tab",
		}),
	},
	CLEAR_TERMINAL: {
		key: {
			mac: L("meta+k"),
			windows: L("ctrl+shift+k"),
			linux: L("ctrl+shift+k"),
		},
		label: msg({
			message: "Clear Terminal",
		}),
		category: "Terminal",
	},
	SCROLL_TO_BOTTOM: {
		key: {
			mac: "meta+shift+down",
			windows: "ctrl+end",
			linux: "ctrl+end",
		},
		label: msg({
			message: "Scroll to Bottom",
		}),
		category: "Terminal",
		description: msg({
			message: "Scroll the active terminal to the bottom",
		}),
	},
	PREV_TAB_ALT: {
		key: {
			mac: "ctrl+shift+tab",
			windows: "ctrl+shift+tab",
			linux: "ctrl+shift+tab",
		},
		label: msg({
			message: "Previous Tab (Alt)",
		}),
		category: "Terminal",
	},
	NEXT_TAB_ALT: {
		key: { mac: "ctrl+tab", windows: "ctrl+tab", linux: "ctrl+tab" },
		label: msg({ message: "Next Tab (Alt)" }),
		category: "Terminal",
	},
	PREV_TAB: {
		key: {
			mac: "meta+alt+left",
			windows: "ctrl+shift+alt+left",
			linux: "ctrl+shift+alt+left",
		},
		label: msg({ message: "Previous Tab" }),
		category: "Terminal",
		description: msg({
			message: "Focus the previous tab in the active workspace",
		}),
	},
	NEXT_TAB: {
		key: {
			mac: "meta+alt+right",
			windows: "ctrl+shift+alt+right",
			linux: "ctrl+shift+alt+right",
		},
		label: msg({ message: "Next Tab" }),
		category: "Terminal",
		description: msg({
			message: "Focus the next tab in the active workspace",
		}),
	},
	FOCUS_PANE_LEFT: {
		key: { mac: null, windows: null, linux: null },
		label: msg({
			message: "Focus Pane Left",
		}),
		category: "Terminal",
		description: msg({
			message: "Focus the pane to the left of the active pane",
		}),
	},
	FOCUS_PANE_RIGHT: {
		key: { mac: null, windows: null, linux: null },
		label: msg({
			message: "Focus Pane Right",
		}),
		category: "Terminal",
		description: msg({
			message: "Focus the pane to the right of the active pane",
		}),
	},
	FOCUS_PANE_UP: {
		key: { mac: null, windows: null, linux: null },
		label: msg({ message: "Focus Pane Up" }),
		category: "Terminal",
		description: msg({
			message: "Focus the pane above the active pane",
		}),
	},
	FOCUS_PANE_DOWN: {
		key: { mac: null, windows: null, linux: null },
		label: msg({
			message: "Focus Pane Down",
		}),
		category: "Terminal",
		description: msg({
			message: "Focus the pane below the active pane",
		}),
	},
	JUMP_TO_TAB_1: {
		key: {
			mac: L("meta+alt+1"),
			windows: L("ctrl+shift+alt+1"),
			linux: L("ctrl+shift+alt+1"),
		},
		label: msg({ message: "Switch to Tab 1" }),
		category: "Terminal",
	},
	JUMP_TO_TAB_2: {
		key: {
			mac: L("meta+alt+2"),
			windows: L("ctrl+shift+alt+2"),
			linux: L("ctrl+shift+alt+2"),
		},
		label: msg({ message: "Switch to Tab 2" }),
		category: "Terminal",
	},
	JUMP_TO_TAB_3: {
		key: {
			mac: L("meta+alt+3"),
			windows: L("ctrl+shift+alt+3"),
			linux: L("ctrl+shift+alt+3"),
		},
		label: msg({ message: "Switch to Tab 3" }),
		category: "Terminal",
	},
	JUMP_TO_TAB_4: {
		key: {
			mac: L("meta+alt+4"),
			windows: L("ctrl+shift+alt+4"),
			linux: L("ctrl+shift+alt+4"),
		},
		label: msg({ message: "Switch to Tab 4" }),
		category: "Terminal",
	},
	JUMP_TO_TAB_5: {
		key: {
			mac: L("meta+alt+5"),
			windows: L("ctrl+shift+alt+5"),
			linux: L("ctrl+shift+alt+5"),
		},
		label: msg({ message: "Switch to Tab 5" }),
		category: "Terminal",
	},
	JUMP_TO_TAB_6: {
		key: {
			mac: L("meta+alt+6"),
			windows: L("ctrl+shift+alt+6"),
			linux: L("ctrl+shift+alt+6"),
		},
		label: msg({ message: "Switch to Tab 6" }),
		category: "Terminal",
	},
	JUMP_TO_TAB_7: {
		key: {
			mac: L("meta+alt+7"),
			windows: L("ctrl+shift+alt+7"),
			linux: L("ctrl+shift+alt+7"),
		},
		label: msg({ message: "Switch to Tab 7" }),
		category: "Terminal",
	},
	JUMP_TO_TAB_8: {
		key: {
			mac: L("meta+alt+8"),
			windows: L("ctrl+shift+alt+8"),
			linux: L("ctrl+shift+alt+8"),
		},
		label: msg({ message: "Switch to Tab 8" }),
		category: "Terminal",
	},
	JUMP_TO_TAB_9: {
		key: {
			mac: L("meta+alt+9"),
			windows: L("ctrl+shift+alt+9"),
			linux: L("ctrl+shift+alt+9"),
		},
		label: msg({ message: "Switch to Tab 9" }),
		category: "Terminal",
	},
	OPEN_PRESET_1: {
		key: { mac: L("ctrl+1"), windows: L("ctrl+1"), linux: L("ctrl+1") },
		label: msg({
			message: "Open Terminal Script 1",
		}),
		category: "Terminal",
	},
	OPEN_PRESET_2: {
		key: { mac: L("ctrl+2"), windows: L("ctrl+2"), linux: L("ctrl+2") },
		label: msg({
			message: "Open Terminal Script 2",
		}),
		category: "Terminal",
	},
	OPEN_PRESET_3: {
		key: { mac: L("ctrl+3"), windows: L("ctrl+3"), linux: L("ctrl+3") },
		label: msg({
			message: "Open Terminal Script 3",
		}),
		category: "Terminal",
	},
	OPEN_PRESET_4: {
		key: { mac: L("ctrl+4"), windows: L("ctrl+4"), linux: L("ctrl+4") },
		label: msg({
			message: "Open Terminal Script 4",
		}),
		category: "Terminal",
	},
	OPEN_PRESET_5: {
		key: { mac: L("ctrl+5"), windows: L("ctrl+5"), linux: L("ctrl+5") },
		label: msg({
			message: "Open Terminal Script 5",
		}),
		category: "Terminal",
	},
	OPEN_PRESET_6: {
		key: { mac: L("ctrl+6"), windows: L("ctrl+6"), linux: L("ctrl+6") },
		label: msg({
			message: "Open Terminal Script 6",
		}),
		category: "Terminal",
	},
	OPEN_PRESET_7: {
		key: { mac: L("ctrl+7"), windows: L("ctrl+7"), linux: L("ctrl+7") },
		label: msg({
			message: "Open Terminal Script 7",
		}),
		category: "Terminal",
	},
	OPEN_PRESET_8: {
		key: { mac: L("ctrl+8"), windows: L("ctrl+8"), linux: L("ctrl+8") },
		label: msg({
			message: "Open Terminal Script 8",
		}),
		category: "Terminal",
	},
	OPEN_PRESET_9: {
		key: { mac: L("ctrl+9"), windows: L("ctrl+9"), linux: L("ctrl+9") },
		label: msg({
			message: "Open Terminal Script 9",
		}),
		category: "Terminal",
	},

	// Chat
	FOCUS_CHAT_INPUT: {
		key: {
			mac: L("meta+j"),
			windows: L("ctrl+shift+j"),
			linux: L("ctrl+shift+j"),
		},
		label: msg({
			message: "Focus Chat Input",
		}),
		category: "Terminal",
	},
	CHAT_ADD_ATTACHMENT: {
		key: {
			mac: L("meta+u"),
			windows: L("ctrl+shift+u"),
			linux: L("ctrl+shift+u"),
		},
		label: msg({
			message: "Add Attachment",
		}),
		category: "Terminal",
	},

	// Window
	ZOOM_IN: {
		key: {
			mac: L("meta+equal"),
			windows: L("ctrl+equal"),
			linux: L("ctrl+equal"),
		},
		label: msg({ message: "Zoom In" }),
		category: "Window",
		description: msg({
			message:
				"Terminal font size when a terminal is focused, page zoom in a browser pane, otherwise the whole app",
		}),
	},
	ZOOM_OUT: {
		key: {
			mac: L("meta+minus"),
			windows: L("ctrl+minus"),
			linux: L("ctrl+minus"),
		},
		label: msg({ message: "Zoom Out" }),
		category: "Window",
		description: msg({
			message:
				"Terminal font size when a terminal is focused, page zoom in a browser pane, otherwise the whole app",
		}),
	},
	ZOOM_RESET: {
		key: {
			mac: L("meta+0"),
			windows: L("ctrl+0"),
			linux: L("ctrl+0"),
		},
		label: msg({ message: "Reset Zoom" }),
		category: "Window",
		description: msg({
			message:
				"Terminal font size when a terminal is focused, page zoom in a browser pane, otherwise the whole app",
		}),
	},
	OPEN_IN_APP: {
		key: {
			mac: L("meta+o"),
			windows: L("ctrl+shift+o"),
			linux: L("ctrl+shift+o"),
		},
		label: msg({ message: "Open in App" }),
		category: "Window",
		description: msg({
			message: "Open workspace in external app (Cursor, VS Code, etc.)",
		}),
	},
	COPY_PATH: {
		key: {
			mac: L("meta+shift+c"),
			windows: L("ctrl+shift+alt+c"),
			linux: L("ctrl+shift+alt+c"),
		},
		label: msg({ message: "Copy Path" }),
		category: "Window",
		description: msg({
			message: "Copy the workspace path to the clipboard",
		}),
	},

	// Help
	OPEN_SETTINGS: {
		key: {
			mac: L("meta+comma"),
			windows: L("ctrl+comma"),
			linux: L("ctrl+comma"),
		},
		label: msg({ message: "Open Settings" }),
		category: "Help",
	},
	SHOW_HOTKEYS: {
		key: {
			mac: L("meta+shift+slash"),
			windows: L("ctrl+shift+slash"),
			linux: L("ctrl+shift+slash"),
		},
		label: msg({
			message: "Show Keyboard Shortcuts",
		}),
		category: "Help",
	},
	OPEN_COMMAND_PALETTE: {
		key: {
			mac: L("meta+shift+k"),
			windows: L("ctrl+shift+k"),
			linux: L("ctrl+shift+k"),
		},
		label: msg({
			message: "Open Command Palette",
		}),
		category: "Help",
		description: msg({
			message: "Open the global command palette",
		}),
	},
	CHECK_RESOURCES: {
		key: {
			mac: L("meta+shift+u"),
			windows: L("ctrl+shift+alt+u"),
			linux: L("ctrl+shift+alt+u"),
		},
		label: msg({
			message: "Check Resources",
		}),
		category: "Help",
		description: msg({
			message: "Open the resource usage view in the command palette",
		}),
	},
} as const satisfies Record<string, HotkeyRegistryDefinition>;

export type HotkeyId = keyof typeof HOTKEYS_REGISTRY;

/** Hotkey definitions resolved for the current platform (computed once at import time) */
export const HOTKEYS = Object.fromEntries(
	Object.entries(HOTKEYS_REGISTRY).map(([id, def]) => [
		id,
		{ ...def, key: def.key[PLATFORM] },
	]),
) as Record<HotkeyId, HotkeyDefinition>;
