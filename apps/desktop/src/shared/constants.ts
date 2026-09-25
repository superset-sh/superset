import { PROTOCOL_SCHEMES } from "@superset/shared/constants";
import { getWorkspaceName } from "./env.shared";

export const PLATFORM = {
	IS_MAC: process.platform === "darwin",
	IS_WINDOWS: process.platform === "win32",
	IS_LINUX: process.platform === "linux",
};

const workspace = getWorkspaceName();
export const SUPERSET_DIR_NAME = workspace
	? `.superset-${workspace}`
	: ".superset";
export const PROTOCOL_SCHEME = workspace
	? `superset-${workspace}`
	: PROTOCOL_SCHEMES.PROD;

export const NOTIFICATION_EVENTS = {
	FOCUS_NOTIFICATION_SOURCE: "focus-notification-source",
	SETTINGS_EXTERNAL_CHANGE: "settings-external-change",
} as const;

// Development/testing mock values (used when SKIP_ENV_VALIDATION is set)
export const MOCK_ORG_ID = "mock-org-id";

// Terminal defaults
export const DEFAULT_TERMINAL_SCROLLBACK = 5000;

// Hidden (parked) xterm instances kept fully alive before LRU eviction. (SUPER-1545)
import {
	DEFAULT_TERMINAL_PARKED_RUNTIME_CAP as SHARED_DEFAULT_PARKED_CAP,
	TERMINAL_PARKED_RUNTIME_CAP_LIMITS,
} from "@superset/shared/settings-constraints";

export const DEFAULT_TERMINAL_PARKED_RUNTIME_CAP = SHARED_DEFAULT_PARKED_CAP;
export const MIN_TERMINAL_PARKED_RUNTIME_CAP =
	TERMINAL_PARKED_RUNTIME_CAP_LIMITS.min;
export const MAX_TERMINAL_PARKED_RUNTIME_CAP =
	TERMINAL_PARKED_RUNTIME_CAP_LIMITS.max;

// Default user preference values
export const DEFAULT_CONFIRM_ON_QUIT = true;
export const DEFAULT_TERMINAL_COPY_ON_SELECT = false;
export const DEFAULT_WAIT_FOR_SETUP_BEFORE_AGENT = false;
export const DEFAULT_TELEMETRY_ENABLED = true;
export const DEFAULT_SHOW_RESOURCE_MONITOR = true;
export const DEFAULT_SHOW_USAGE_IN_SIDEBAR = false;
export const DEFAULT_EXPOSE_HOST_SERVICE_VIA_RELAY = false;
