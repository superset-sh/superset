import type {
	HotkeyCategory,
	HotkeyDefinition,
	Platform,
	PlatformKey,
} from "./types";

interface HotkeyRegistryDefinition {
	key: PlatformKey;
	label: string;
	category: HotkeyCategory;
	description?: string;
}

function detectPlatform(): Platform {
	if (typeof navigator === "undefined") return "mac";
	const p = navigator.platform.toLowerCase();
	if (p.includes("mac")) return "mac";
	if (p.includes("win")) return "windows";
	return "linux";
}

export const PLATFORM: Platform = detectPlatform();

// ---------------------------------------------------------------------------
// Hotkey definitions
// ---------------------------------------------------------------------------

export const HOTKEYS_REGISTRY = {
	// Navigation
	NAVIGATE_BACK: {
		key: {
			mac: "meta+bracketleft",
			windows: "ctrl+shift+bracketleft",
			linux: "ctrl+shift+bracketleft",
		},
		label: "Navigate Back",
		category: "Navigation",
		description: "Go back to the previous page in history",
	},
	NAVIGATE_FORWARD: {
		key: {
			mac: "meta+bracketright",
			windows: "ctrl+shift+bracketright",
			linux: "ctrl+shift+bracketright",
		},
		label: "Navigate Forward",
		category: "Navigation",
		description: "Go forward to the next page in history",
	},
	QUICK_OPEN: {
		key: { mac: "meta+p", windows: "ctrl+shift+p", linux: "ctrl+shift+p" },
		label: "Quick Open File",
		category: "Navigation",
		description: "Search and open files in the current workspace",
	},

	// Workspace switching
	JUMP_TO_WORKSPACE_1: {
		key: { mac: "meta+1", windows: "ctrl+shift+1", linux: "ctrl+shift+1" },
		label: "Switch to Workspace 1",
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_2: {
		key: { mac: "meta+2", windows: "ctrl+shift+2", linux: "ctrl+shift+2" },
		label: "Switch to Workspace 2",
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_3: {
		key: { mac: "meta+3", windows: "ctrl+shift+3", linux: "ctrl+shift+3" },
		label: "Switch to Workspace 3",
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_4: {
		key: { mac: "meta+4", windows: "ctrl+shift+4", linux: "ctrl+shift+4" },
		label: "Switch to Workspace 4",
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_5: {
		key: { mac: "meta+5", windows: "ctrl+shift+5", linux: "ctrl+shift+5" },
		label: "Switch to Workspace 5",
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_6: {
		key: { mac: "meta+6", windows: "ctrl+shift+6", linux: "ctrl+shift+6" },
		label: "Switch to Workspace 6",
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_7: {
		key: { mac: "meta+7", windows: "ctrl+shift+7", linux: "ctrl+shift+7" },
		label: "Switch to Workspace 7",
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_8: {
		key: { mac: "meta+8", windows: "ctrl+shift+8", linux: "ctrl+shift+8" },
		label: "Switch to Workspace 8",
		category: "Workspace",
	},
	JUMP_TO_WORKSPACE_9: {
		key: { mac: "meta+9", windows: "ctrl+shift+9", linux: "ctrl+shift+9" },
		label: "Switch to Workspace 9",
		category: "Workspace",
	},
	PREV_WORKSPACE: {
		key: {
			mac: "meta+alt+up",
			windows: "ctrl+shift+alt+up",
			linux: "ctrl+shift+alt+up",
		},
		label: "Previous Workspace",
		category: "Workspace",
		description: "Navigate to the previous workspace in the sidebar",
	},
	NEXT_WORKSPACE: {
		key: {
			mac: "meta+alt+down",
			windows: "ctrl+shift+alt+down",
			linux: "ctrl+shift+alt+down",
		},
		label: "Next Workspace",
		category: "Workspace",
		description: "Navigate to the next workspace in the sidebar",
	},
	CLOSE_WORKSPACE: {
		key: {
			mac: "meta+shift+backspace",
			windows: "ctrl+shift+backspace",
			linux: "ctrl+shift+backspace",
		},
		label: "Close Workspace",
		category: "Workspace",
		description: "Close or delete the current workspace",
	},
	NEW_WORKSPACE: {
		key: { mac: "meta+n", windows: "ctrl+shift+n", linux: "ctrl+shift+n" },
		label: "New Workspace",
		category: "Workspace",
		description: "Open the new workspace modal",
	},
	QUICK_CREATE_WORKSPACE: {
		key: {
			mac: "meta+shift+n",
			windows: "ctrl+shift+alt+n",
			linux: "ctrl+shift+alt+n",
		},
		label: "Quick Create Workspace",
		category: "Workspace",
		description: "Quickly create a workspace in the current project",
	},
	RUN_WORKSPACE_COMMAND: {
		key: { mac: "meta+g", windows: "ctrl+shift+g", linux: "ctrl+shift+g" },
		label: "Run Workspace Command",
		category: "Workspace",
		description: "Start or stop the workspace run command",
	},
	FOCUS_TASK_SEARCH: {
		key: { mac: "meta+f", windows: "ctrl+shift+f", linux: "ctrl+shift+f" },
		label: "Focus Task Search",
		category: "Workspace",
		description: "Focus the search input in the tasks view",
	},
	OPEN_PROJECT: {
		key: {
			mac: "meta+shift+o",
			windows: "ctrl+shift+alt+o",
			linux: "ctrl+shift+alt+o",
		},
		label: "Open Project",
		category: "Workspace",
		description: "Open an existing project folder",
	},
	OPEN_PR: {
		key: {
			mac: "meta+shift+p",
			windows: "ctrl+shift+alt+p",
			linux: "ctrl+shift+alt+p",
		},
		label: "Open Pull Request",
		category: "Workspace",
		description: "Open existing PR or create a new one on GitHub",
	},

	// Layout
	TOGGLE_SIDEBAR: {
		key: { mac: "meta+l", windows: "ctrl+shift+l", linux: "ctrl+shift+l" },
		label: "Toggle Changes Tab",
		category: "Layout",
	},
	OPEN_DIFF_VIEWER: {
		key: {
			mac: "meta+shift+l",
			windows: "ctrl+shift+alt+l",
			linux: "ctrl+shift+alt+l",
		},
		label: "Open Diff Viewer",
		category: "Layout",
		description:
			"Open the diff viewer in a new tab, or focus the existing diff viewer",
	},
	TOGGLE_WORKSPACE_SIDEBAR: {
		key: { mac: "meta+b", windows: "ctrl+shift+b", linux: "ctrl+shift+b" },
		label: "Toggle Workspaces Sidebar",
		category: "Layout",
	},
	SPLIT_RIGHT: {
		key: { mac: "meta+d", windows: "ctrl+shift+d", linux: "ctrl+shift+d" },
		label: "Split Right",
		category: "Layout",
		description: "Split the current pane to the right",
	},
	SPLIT_DOWN: {
		key: {
			mac: "meta+shift+d",
			windows: "ctrl+shift+alt+d",
			linux: "ctrl+shift+alt+d",
		},
		label: "Split Down",
		category: "Layout",
		description: "Split the current pane downward",
	},
	SPLIT_AUTO: {
		key: { mac: "meta+e", windows: "ctrl+shift+e", linux: "ctrl+shift+e" },
		label: "Split Pane Auto",
		category: "Layout",
		description: "Split the current pane along its longer side",
	},
	SPLIT_WITH_CHAT: {
		key: { mac: "meta+shift+e", windows: "ctrl+alt+e", linux: "ctrl+alt+e" },
		label: "Split with New Chat",
		category: "Layout",
		description: "Split the current pane and open a new chat pane",
	},
	SPLIT_WITH_BROWSER: {
		key: {
			mac: "meta+shift+s",
			windows: "ctrl+shift+alt+s",
			linux: "ctrl+shift+alt+s",
		},
		label: "Split with New Browser",
		category: "Layout",
		description: "Split the current pane and open a new browser pane",
	},
	EQUALIZE_PANE_SPLITS: {
		key: {
			mac: "meta+shift+0",
			windows: "ctrl+shift+0",
			linux: "ctrl+shift+0",
		},
		label: "Equalize Pane Splits",
		category: "Layout",
		description: "Make all panes equal size",
	},
	CLOSE_PANE: {
		key: { mac: "meta+w", windows: "ctrl+shift+w", linux: "ctrl+shift+w" },
		label: "Close Pane",
		category: "Layout",
		description: "Close the current pane",
	},

	// Terminal
	FIND_IN_TERMINAL: {
		key: { mac: "meta+f", windows: "ctrl+shift+f", linux: "ctrl+shift+f" },
		label: "Find in Terminal",
		category: "Terminal",
		description: "Search text in the active terminal",
	},
	FIND_IN_FILE_VIEWER: {
		key: { mac: "meta+f", windows: "ctrl+shift+f", linux: "ctrl+shift+f" },
		label: "Find in File Viewer",
		category: "Terminal",
		description: "Search text in the rendered file viewer",
	},
	FIND_IN_CHAT: {
		key: { mac: "meta+f", windows: "ctrl+shift+f", linux: "ctrl+shift+f" },
		label: "Find in Chat",
		category: "Terminal",
		description: "Search text in the active chat",
	},
	NEW_GROUP: {
		key: { mac: "meta+t", windows: "ctrl+shift+t", linux: "ctrl+shift+t" },
		label: "New Terminal",
		category: "Terminal",
	},
	NEW_CHAT: {
		key: {
			mac: "meta+shift+t",
			windows: "ctrl+shift+alt+t",
			linux: "ctrl+shift+alt+t",
		},
		label: "New Chat",
		category: "Terminal",
	},
	REOPEN_TAB: {
		key: {
			mac: "meta+shift+r",
			windows: "ctrl+shift+alt+r",
			linux: "ctrl+shift+alt+r",
		},
		label: "Reopen Closed Tab",
		category: "Terminal",
	},
	NEW_BROWSER: {
		key: {
			mac: "meta+shift+b",
			windows: "ctrl+shift+alt+b",
			linux: "ctrl+shift+alt+b",
		},
		label: "New Browser",
		category: "Terminal",
	},
	CLOSE_TERMINAL: {
		key: { mac: "meta+w", windows: "ctrl+shift+w", linux: "ctrl+shift+w" },
		label: "Close Terminal",
		category: "Terminal",
	},
	CLOSE_TAB: {
		key: {
			mac: "meta+shift+w",
			windows: "ctrl+shift+alt+w",
			linux: "ctrl+shift+alt+w",
		},
		label: "Close Tab",
		category: "Terminal",
		description: "Close the current tab",
	},
	CLEAR_TERMINAL: {
		key: { mac: "meta+k", windows: "ctrl+shift+k", linux: "ctrl+shift+k" },
		label: "Clear Terminal",
		category: "Terminal",
	},
	SCROLL_TO_BOTTOM: {
		key: {
			mac: "meta+shift+down",
			windows: "ctrl+end",
			linux: "ctrl+end",
		},
		label: "Scroll to Bottom",
		category: "Terminal",
		description: "Scroll the active terminal to the bottom",
	},
	PREV_TAB_ALT: {
		key: {
			mac: "ctrl+shift+tab",
			windows: "ctrl+shift+tab",
			linux: "ctrl+shift+tab",
		},
		label: "Previous Tab (Alt)",
		category: "Terminal",
	},
	NEXT_TAB_ALT: {
		key: { mac: "ctrl+tab", windows: "ctrl+tab", linux: "ctrl+tab" },
		label: "Next Tab (Alt)",
		category: "Terminal",
	},
	PREV_TAB: {
		key: {
			mac: "meta+alt+left",
			windows: "ctrl+shift+alt+left",
			linux: "ctrl+shift+alt+left",
		},
		label: "Previous Tab",
		category: "Terminal",
		description: "Focus the previous tab in the active workspace",
	},
	NEXT_TAB: {
		key: {
			mac: "meta+alt+right",
			windows: "ctrl+shift+alt+right",
			linux: "ctrl+shift+alt+right",
		},
		label: "Next Tab",
		category: "Terminal",
		description: "Focus the next tab in the active workspace",
	},
	FOCUS_PANE_LEFT: {
		key: { mac: null, windows: null, linux: null },
		label: "Focus Pane Left",
		category: "Terminal",
		description: "Focus the pane to the left of the active pane",
	},
	FOCUS_PANE_RIGHT: {
		key: { mac: null, windows: null, linux: null },
		label: "Focus Pane Right",
		category: "Terminal",
		description: "Focus the pane to the right of the active pane",
	},
	FOCUS_PANE_UP: {
		key: { mac: null, windows: null, linux: null },
		label: "Focus Pane Up",
		category: "Terminal",
		description: "Focus the pane above the active pane",
	},
	FOCUS_PANE_DOWN: {
		key: { mac: null, windows: null, linux: null },
		label: "Focus Pane Down",
		category: "Terminal",
		description: "Focus the pane below the active pane",
	},
	JUMP_TO_TAB_1: {
		key: {
			mac: "meta+alt+1",
			windows: "ctrl+shift+alt+1",
			linux: "ctrl+shift+alt+1",
		},
		label: "Switch to Tab 1",
		category: "Terminal",
	},
	JUMP_TO_TAB_2: {
		key: {
			mac: "meta+alt+2",
			windows: "ctrl+shift+alt+2",
			linux: "ctrl+shift+alt+2",
		},
		label: "Switch to Tab 2",
		category: "Terminal",
	},
	JUMP_TO_TAB_3: {
		key: {
			mac: "meta+alt+3",
			windows: "ctrl+shift+alt+3",
			linux: "ctrl+shift+alt+3",
		},
		label: "Switch to Tab 3",
		category: "Terminal",
	},
	JUMP_TO_TAB_4: {
		key: {
			mac: "meta+alt+4",
			windows: "ctrl+shift+alt+4",
			linux: "ctrl+shift+alt+4",
		},
		label: "Switch to Tab 4",
		category: "Terminal",
	},
	JUMP_TO_TAB_5: {
		key: {
			mac: "meta+alt+5",
			windows: "ctrl+shift+alt+5",
			linux: "ctrl+shift+alt+5",
		},
		label: "Switch to Tab 5",
		category: "Terminal",
	},
	JUMP_TO_TAB_6: {
		key: {
			mac: "meta+alt+6",
			windows: "ctrl+shift+alt+6",
			linux: "ctrl+shift+alt+6",
		},
		label: "Switch to Tab 6",
		category: "Terminal",
	},
	JUMP_TO_TAB_7: {
		key: {
			mac: "meta+alt+7",
			windows: "ctrl+shift+alt+7",
			linux: "ctrl+shift+alt+7",
		},
		label: "Switch to Tab 7",
		category: "Terminal",
	},
	JUMP_TO_TAB_8: {
		key: {
			mac: "meta+alt+8",
			windows: "ctrl+shift+alt+8",
			linux: "ctrl+shift+alt+8",
		},
		label: "Switch to Tab 8",
		category: "Terminal",
	},
	JUMP_TO_TAB_9: {
		key: {
			mac: "meta+alt+9",
			windows: "ctrl+shift+alt+9",
			linux: "ctrl+shift+alt+9",
		},
		label: "Switch to Tab 9",
		category: "Terminal",
	},
	OPEN_PRESET_1: {
		key: { mac: "ctrl+1", windows: "ctrl+1", linux: "ctrl+1" },
		label: "Open Preset 1",
		category: "Terminal",
	},
	OPEN_PRESET_2: {
		key: { mac: "ctrl+2", windows: "ctrl+2", linux: "ctrl+2" },
		label: "Open Preset 2",
		category: "Terminal",
	},
	OPEN_PRESET_3: {
		key: { mac: "ctrl+3", windows: "ctrl+3", linux: "ctrl+3" },
		label: "Open Preset 3",
		category: "Terminal",
	},
	OPEN_PRESET_4: {
		key: { mac: "ctrl+4", windows: "ctrl+4", linux: "ctrl+4" },
		label: "Open Preset 4",
		category: "Terminal",
	},
	OPEN_PRESET_5: {
		key: { mac: "ctrl+5", windows: "ctrl+5", linux: "ctrl+5" },
		label: "Open Preset 5",
		category: "Terminal",
	},
	OPEN_PRESET_6: {
		key: { mac: "ctrl+6", windows: "ctrl+6", linux: "ctrl+6" },
		label: "Open Preset 6",
		category: "Terminal",
	},
	OPEN_PRESET_7: {
		key: { mac: "ctrl+7", windows: "ctrl+7", linux: "ctrl+7" },
		label: "Open Preset 7",
		category: "Terminal",
	},
	OPEN_PRESET_8: {
		key: { mac: "ctrl+8", windows: "ctrl+8", linux: "ctrl+8" },
		label: "Open Preset 8",
		category: "Terminal",
	},
	OPEN_PRESET_9: {
		key: { mac: "ctrl+9", windows: "ctrl+9", linux: "ctrl+9" },
		label: "Open Preset 9",
		category: "Terminal",
	},

	// Chat
	FOCUS_CHAT_INPUT: {
		key: { mac: "meta+j", windows: "ctrl+shift+j", linux: "ctrl+shift+j" },
		label: "Focus Chat Input",
		category: "Terminal",
	},
	CHAT_ADD_ATTACHMENT: {
		key: { mac: "meta+u", windows: "ctrl+shift+u", linux: "ctrl+shift+u" },
		label: "Add Attachment",
		category: "Terminal",
	},

	// Window
	OPEN_IN_APP: {
		key: { mac: "meta+o", windows: "ctrl+shift+o", linux: "ctrl+shift+o" },
		label: "Open in App",
		category: "Window",
		description: "Open workspace in external app (Cursor, VS Code, etc.)",
	},
	COPY_PATH: {
		key: {
			mac: "meta+shift+c",
			windows: "ctrl+shift+alt+c",
			linux: "ctrl+shift+alt+c",
		},
		label: "Copy Path",
		category: "Window",
		description: "Copy the workspace path to the clipboard",
	},

	// Help
	OPEN_SETTINGS: {
		key: { mac: "meta+comma", windows: "ctrl+comma", linux: "ctrl+comma" },
		label: "Open Settings",
		category: "Help",
	},
	SHOW_HOTKEYS: {
		key: {
			mac: "meta+shift+slash",
			windows: "ctrl+shift+slash",
			linux: "ctrl+shift+slash",
		},
		label: "Show Keyboard Shortcuts",
		category: "Help",
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
