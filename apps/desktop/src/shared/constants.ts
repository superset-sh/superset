import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import { env } from "./env.shared";

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

// Ports - different for dev vs prod to allow running both simultaneously
export const PORTS = {
	VITE_DEV_SERVER: env.NODE_ENV === "development" ? 5927 : 4927,
	NOTIFICATIONS: env.NODE_ENV === "development" ? 31416 : 31415,
	// Electric SQL proxy port (local-first sync)
	ELECTRIC: env.NODE_ENV === "development" ? 31418 : 31417,
};

// Note: For environment-aware paths, use main/lib/app-environment.ts instead.
// Paths require Node.js/Electron APIs that aren't available in renderer.
export const SUPERSET_DIR_NAMES = {
	DEV: ".superset-dev",
	PROD: ".superset",
} as const;
export const SUPERSET_DIR_NAME =
	env.NODE_ENV === "development"
		? SUPERSET_DIR_NAMES.DEV
		: SUPERSET_DIR_NAMES.PROD;

// Deep link protocol scheme (environment-aware)
export const PROTOCOL_SCHEME =
	env.NODE_ENV === "development" ? PROTOCOL_SCHEMES.DEV : PROTOCOL_SCHEMES.PROD;
// Project-level directory name (always .superset, not conditional)
export const PROJECT_SUPERSET_DIR_NAME = ".superset";
export const WORKTREES_DIR_NAME = "worktrees";
export const CONFIG_FILE_NAME = "config.json";
export const PORTS_FILE_NAME = "ports.json";

export const CONFIG_TEMPLATE = `{
  "setup": [],
  "teardown": []
}`;

export const NOTIFICATION_EVENTS = {
	AGENT_LIFECYCLE: "agent-lifecycle",
	FOCUS_TAB: "focus-tab",
	TERMINAL_EXIT: "terminal-exit",
} as const;

// Development/testing mock values (used when SKIP_ENV_VALIDATION is set)
export const MOCK_ORG_ID = "mock-org-id";

// Default user preference values
export const DEFAULT_CONFIRM_ON_QUIT = true;
export const DEFAULT_TERMINAL_LINK_BEHAVIOR = "external-editor" as const;
export const DEFAULT_AUTO_APPLY_DEFAULT_PRESET = true;

// Font size constraints
export const MIN_TERMINAL_FONT_SIZE = 8;
export const MAX_TERMINAL_FONT_SIZE = 24;
export const DEFAULT_TERMINAL_FONT_SIZE = 14;

// Available font options for the editor font selector
export const EDITOR_FONT_OPTIONS = [
	{ value: "default", label: "Default" },
	{ value: "Berkeley Mono", label: "Berkeley Mono" },
	{ value: "iA Writer Mono", label: "iA Writer Mono" },
] as const;

// Available font options for the terminal font selector
export const TERMINAL_FONT_OPTIONS = [
	{ value: "default", label: "Default" },
	{ value: "Berkeley Mono", label: "Berkeley Mono" },
	{ value: "JetBrains Mono", label: "JetBrains Mono" },
] as const;

// Default font family stacks
export const DEFAULT_TERMINAL_FONT_FAMILY = [
	"MesloLGM Nerd Font",
	"MesloLGM NF",
	"Menlo",
	"Monaco",
	"Consolas",
	"Liberation Mono",
	"Courier New",
	"monospace",
].join(", ");

export const DEFAULT_EDITOR_FONT_FAMILY =
	"ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace";

// Default font settings
export const DEFAULT_FONT_SETTINGS = {
	editorFont: null as string | null,
	terminalFont: null as string | null,
	terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
};

// External links (documentation, help resources, etc.)
export const EXTERNAL_LINKS = {
	SETUP_TEARDOWN_SCRIPTS: `${process.env.NEXT_PUBLIC_DOCS_URL}/setup-teardown-scripts`,
} as const;
