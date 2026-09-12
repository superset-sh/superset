import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
	buildWrapperScript,
	createWrapper,
	getManagedNotifyHookCommand,
	writeFileIfChanged,
} from "./agent-wrappers-common";
import { buildNestedDesiredEntries } from "./managed-json-hooks";
import { getHooksDir } from "./paths";

/** Muse Code reads its user settings from `$XDG_CONFIG_HOME/muse/settings.json`
 * (`~/.config/muse/settings.json` by default). */
export function getMuseSettingsJsonPath(): string {
	const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
	const configHome = xdgConfigHome?.length
		? xdgConfigHome
		: path.join(os.homedir(), ".config");
	return path.join(configHome, "muse", "settings.json");
}

/** The Superset-owned hooks file Muse loads through `managed_hooks_path`. */
export function getMuseManagedHooksPath(): string {
	return path.join(getHooksDir(), "muse", "hooks.json");
}

// Muse runs every hook with a cleared environment. Hooks declared in the
// settings `hooks` block never see SUPERSET_*, so the notify command would
// no-op; hooks loaded from `managed_hooks_path` get exactly the variables
// named in `managed_hooks_env_vars` (verified against Muse Code 1.1.1). These
// are the ones the notify script reads; HOME is in Muse's own allowlist.
export const MUSE_HOOK_ENV_VARS = [
	"SUPERSET_HOME_DIR",
	"SUPERSET_TERMINAL_ID",
	"SUPERSET_TAB_ID",
	"SUPERSET_PANE_ID",
	"SUPERSET_WORKSPACE_ID",
	"SUPERSET_AGENT_ID",
	"SUPERSET_PORT",
	"SUPERSET_HOOK_VERSION",
	"SUPERSET_HOST_AGENT_HOOK_URL",
	"SUPERSET_ENV",
	"SUPERSET_DEBUG_HOOKS",
	"SUPERSET_HOOK_DEBUG_LOG",
	"NODE_ENV",
] as const;

// Muse's hook events and payload are Claude Code's contract (hook_event_name,
// session_id, cwd). StopFailure is admitted alongside Stop; the file layout is
// the same nested map Claude's settings use.
const MUSE_MANAGED_EVENTS: Record<string, { matcher?: string }> = {
	SessionStart: {},
	SessionEnd: {},
	UserPromptSubmit: {},
	Stop: {},
	StopFailure: {},
	PostToolUse: {},
	PermissionRequest: {},
};

export function getMuseManagedHooksContent(): string {
	const hooks = buildNestedDesiredEntries(
		MUSE_MANAGED_EVENTS,
		getManagedNotifyHookCommand("muse"),
	);
	return `${JSON.stringify({ hooks }, null, 2)}\n`;
}

export function createMuseManagedHooksFile(): void {
	const filePath = getMuseManagedHooksPath();
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	const changed = writeFileIfChanged(
		filePath,
		getMuseManagedHooksContent(),
		0o644,
	);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Muse managed hooks file`,
	);
}

const SUPERSET_OWNED_MUSE_HOOKS_PATTERN =
	/\/(?:\.superset(?:-[^/'"\s\\]+)?|superset-dev-data)\/hooks\/muse\/hooks\.json$/;

function isSupersetOwnedMuseHooksPath(value: unknown): value is string {
	return (
		typeof value === "string" && SUPERSET_OWNED_MUSE_HOOKS_PATTERN.test(value)
	);
}

function parseSettingsRoot(raw: string | null): Record<string, unknown> | null {
	if (raw === null) return {};
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === "object" &&
			parsed !== null &&
			!Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

/**
 * Merges Superset's `managed_hooks_path` and env allowlist into an existing
 * settings document, preserving everything else. Returns null when the file
 * is unparseable or `managed_hooks_path` already points at a file Superset
 * does not own — that slot is single-valued and a user's or enterprise's
 * managed hooks must not be replaced.
 */
export function getMuseSettingsJsonContent(
	existingRaw: string | null,
	managedHooksPath: string,
): string | null {
	const root = parseSettingsRoot(existingRaw);
	if (root === null) return null;
	const current = root.managed_hooks_path;
	if (
		typeof current === "string" &&
		current !== managedHooksPath &&
		!isSupersetOwnedMuseHooksPath(current)
	) {
		return null;
	}
	if (!root.schema_version) root.schema_version = 1;
	root.managed_hooks_path = managedHooksPath;
	const envVars = stringList(root.managed_hooks_env_vars);
	for (const name of MUSE_HOOK_ENV_VARS) {
		if (!envVars.includes(name)) envVars.push(name);
	}
	root.managed_hooks_env_vars = envVars;
	return `${JSON.stringify(root, null, 2)}\n`;
}

/** The inverse of getMuseSettingsJsonContent; null when nothing changes. */
export function getMuseSettingsJsonWithoutManagedHooks(
	existingRaw: string,
): string | null {
	const root = parseSettingsRoot(existingRaw);
	if (root === null) return null;
	let changed = false;
	if (isSupersetOwnedMuseHooksPath(root.managed_hooks_path)) {
		delete root.managed_hooks_path;
		changed = true;
	}
	if (Array.isArray(root.managed_hooks_env_vars)) {
		const ours = new Set<string>(MUSE_HOOK_ENV_VARS);
		const kept = stringList(root.managed_hooks_env_vars).filter(
			(name) => !ours.has(name),
		);
		if (kept.length !== root.managed_hooks_env_vars.length) {
			changed = true;
			if (kept.length === 0) delete root.managed_hooks_env_vars;
			else root.managed_hooks_env_vars = kept;
		}
	}
	return changed ? `${JSON.stringify(root, null, 2)}\n` : null;
}

export function createMuseSettingsJson(): void {
	const settingsPath = getMuseSettingsJsonPath();
	let raw: string | null = null;
	try {
		raw = fs.readFileSync(settingsPath, "utf-8");
	} catch {
		// Absent — a fresh settings file is created below.
	}
	const content = getMuseSettingsJsonContent(raw, getMuseManagedHooksPath());
	if (content === null) {
		console.warn(
			`[agent-setup] Skipping Muse settings.json: unparseable, or managed_hooks_path already points elsewhere`,
		);
		return;
	}
	const changed = writeFileIfChanged(settingsPath, content, 0o644);
	console.log(
		`[agent-setup] ${changed ? "Updated" : "Verified"} Muse settings.json`,
	);
}

/** Drops Superset's pointer and env names from settings.json; the hooks file
 * under Superset home stays, inert without the pointer. No-op when the file
 * does not exist — teardown must never create config files. */
export function removeMuseManagedHooks(): void {
	const settingsPath = getMuseSettingsJsonPath();
	let raw: string;
	try {
		raw = fs.readFileSync(settingsPath, "utf-8");
	} catch {
		return;
	}
	const content = getMuseSettingsJsonWithoutManagedHooks(raw);
	if (content === null) return;
	fs.writeFileSync(settingsPath, content, { mode: 0o644 });
	console.log("[agent-setup] Removed Superset hooks from Muse settings.json");
}

/** Forwards SUPERSET_* env into the agent process tree; hooks live in the
 * managed hooks file (createMuseManagedHooksFile). */
export function createMuseWrapper(): void {
	const script = buildWrapperScript("muse", 'exec "$REAL_BIN" "$@"', {
		agentId: "muse",
	});
	createWrapper("muse", script);
}
