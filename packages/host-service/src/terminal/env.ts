/**
 * V2 terminal environment contract.
 *
 * PTY env is built from a preserved shell snapshot resolved by the host-service
 * at startup — never from desktop main or the live host-service process.env.
 */

export { stripTerminalRuntimeEnv } from "./env-strip.ts";
export type {
	ShellBootstrapParams,
	ShellLaunchParams,
} from "./shell-launch.ts";
export {
	getShellBootstrapEnv,
	getShellLaunchArgs,
	getSupersetShellPaths,
	resolveLaunchShell,
} from "./shell-launch.ts";

import fs from "node:fs";
import os from "node:os";
import {
	TERMINAL_TERM_PROGRAM,
	TERMINAL_TERM_PROGRAM_VERSION,
} from "@superset/shared/constants";
import {
	augmentPathForMacOS,
	clearStrictShellEnvCache,
	getStrictShellEnvironment,
} from "./clean-shell-env.ts";
import { stripTerminalRuntimeEnv } from "./env-strip.ts";
import { getShellBootstrapEnv } from "./shell-launch.ts";

const MACOS_SYSTEM_CERT_FILE = "/etc/ssl/cert.pem";
let cachedMacosSystemCertAvailable: boolean | null = null;

function hasMacosSystemCertBundle(): boolean {
	if (cachedMacosSystemCertAvailable !== null) {
		return cachedMacosSystemCertAvailable;
	}
	cachedMacosSystemCertAvailable = fs.existsSync(MACOS_SYSTEM_CERT_FILE);
	return cachedMacosSystemCertAvailable;
}

// ── Shell snapshot preservation ──────────────────────────────────────

let _terminalBaseEnv: Record<string, string> | null = null;

function snapshotStringEnv(
	baseEnv: NodeJS.ProcessEnv | Record<string, string> = process.env,
): Record<string, string> {
	const snapshot: Record<string, string> = {};
	for (const [key, value] of Object.entries(baseEnv)) {
		if (typeof value === "string") {
			snapshot[key] = value;
		}
	}
	return snapshot;
}

/**
 * Resolve the shell-derived terminal base env inside the host-service process.
 * Desktop main should not construct or own this snapshot.
 *
 * Falls back to a process.env snapshot if the user's login shell can't be
 * probed — crashing host-service startup over a degraded PTY env strands
 * users on v2. v1 desktop main does the same in apps/desktop shell-env.ts.
 */
export async function resolveTerminalBaseEnv(): Promise<
	Record<string, string>
> {
	try {
		return await getStrictShellEnvironment();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(
			`[host-service] Shell env snapshot failed, falling back to process.env: ${message}`,
		);
		const fallback = snapshotStringEnv(process.env);
		augmentPathForMacOS(fallback);
		return fallback;
	}
}

/**
 * Capture the terminal base env at host-service startup.
 *
 * Accepts an explicit shell snapshot for the real startup path, but retains a
 * process.env fallback for tests and local helpers.
 */
export function initTerminalBaseEnv(baseEnv?: Record<string, string>): void {
	_terminalBaseEnv = stripTerminalRuntimeEnv(snapshotStringEnv(baseEnv));
}

export function getTerminalBaseEnv(): Record<string, string> {
	if (!_terminalBaseEnv) {
		throw new Error(
			"Terminal base env not initialized. Call initTerminalBaseEnv() at host-service startup.",
		);
	}
	return { ..._terminalBaseEnv };
}

export function resetTerminalBaseEnvForTests(): void {
	_terminalBaseEnv = null;
	cachedMacosSystemCertAvailable = null;
	clearStrictShellEnvCache();
}

// ── Locale ───────────────────────────────────────────────────────────

const UTF8_RE = /utf-?8/i;

/** POSIX precedence: LC_ALL overrides LANG. Matches utf8/UTF-8/UTF8. */
export function normalizeUtf8Locale(baseEnv: Record<string, string>): string {
	if (baseEnv.LC_ALL && UTF8_RE.test(baseEnv.LC_ALL)) return baseEnv.LC_ALL;
	if (baseEnv.LANG && UTF8_RE.test(baseEnv.LANG)) return baseEnv.LANG;
	return "en_US.UTF-8";
}

// ── V2 terminal env construction ─────────────────────────────────────

interface BuildV2TerminalEnvParams {
	baseEnv: Record<string, string>;
	shell: string;
	supersetHomeDir: string;
	themeType?: "dark" | "light";
	cwd: string;
	terminalId: string;
	workspaceId: string;
	workspacePath: string;
	rootPath: string;
	supersetEnv: "development" | "production";
	agentHookPort: string;
	agentHookVersion: string;
	/**
	 * tRPC URL for the host-service notifications.hook mutation.
	 * Endpoint is unauthenticated by design — it only broadcasts chimes,
	 * no state change. See the router for rationale.
	 */
	hostAgentHookUrl?: string;
}

/**
 * Build the final v2 PTY environment.
 * baseEnv must be the preserved shell snapshot from getTerminalBaseEnv().
 */
export function buildV2TerminalEnv(
	params: BuildV2TerminalEnvParams,
): Record<string, string> {
	const {
		baseEnv,
		shell,
		supersetHomeDir,
		themeType,
		cwd,
		terminalId,
		workspaceId,
		workspacePath,
		rootPath,
		supersetEnv,
		agentHookPort,
		agentHookVersion,
		hostAgentHookUrl,
	} = params;

	// Defense in depth — baseEnv is pre-stripped at init, but strip again
	// to guarantee no runtime keys reach PTYs regardless of call site
	const env = stripTerminalRuntimeEnv(baseEnv);

	Object.assign(env, getShellBootstrapEnv({ shell, baseEnv, supersetHomeDir }));

	env.TERM = "xterm-256color";
	env.SHELL = shell;
	// See TERMINAL_TERM_PROGRAM for why we identify as vscode. The previous
	// "kitty" claim made claude-code suppress its wheel-scroll compensation and
	// transcript scrolling crawled at ~1/3 speed. Shift+Enter does NOT depend
	// on this: line-edit-translations.ts sends ESC+CR directly.
	env.TERM_PROGRAM = TERMINAL_TERM_PROGRAM;
	env.TERM_PROGRAM_VERSION = TERMINAL_TERM_PROGRAM_VERSION;
	env.COLORTERM = "truecolor";
	env.COLORFGBG = themeType === "light" ? "0;15" : "15;0";
	// TERM_THEME is an explicit light/dark hint that cursor-agent (and other
	// TUIs) read before falling back to an OSC 11 background probe. Our PTY
	// output round-trips through the renderer's xterm, so that probe routinely
	// exceeds cursor-agent's ~100ms timeout and defaults to dark on a light
	// theme. Setting it here resolves the theme without the probe race.
	env.TERM_THEME = themeType === "light" ? "light" : "dark";
	env.LANG = normalizeUtf8Locale(baseEnv);
	env.PWD = cwd;

	env.SUPERSET_TERMINAL_ID = terminalId;
	env.SUPERSET_WORKSPACE_ID = workspaceId;
	env.SUPERSET_WORKSPACE_PATH = workspacePath;
	env.SUPERSET_ROOT_PATH = rootPath;
	env.SUPERSET_ENV = supersetEnv;
	env.SUPERSET_AGENT_HOOK_PORT = agentHookPort;
	env.SUPERSET_AGENT_HOOK_VERSION = agentHookVersion;
	// v2 — agent posts to host-service so the renderer can play the sound
	// client-side. No auth token: the endpoint is unauthenticated by design
	// (it only broadcasts chimes). The notify-hook script falls back to
	// the electron endpoint when this URL isn't set.
	if (hostAgentHookUrl) {
		env.SUPERSET_HOST_AGENT_HOOK_URL = hostAgentHookUrl;
	}

	if (supersetHomeDir) {
		env.SUPERSET_HOME_DIR = supersetHomeDir;
	}

	// Electron child processes can't access macOS Keychain for TLS cert verification,
	// causing "x509: OSStatus -26276" in Go binaries like `gh`. File-based fallback.
	if (
		os.platform() === "darwin" &&
		!env.SSL_CERT_FILE &&
		hasMacosSystemCertBundle()
	) {
		env.SSL_CERT_FILE = MACOS_SYSTEM_CERT_FILE;
	}

	return env;
}
