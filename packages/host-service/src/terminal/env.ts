/**
 * V2 terminal environment contract.
 *
 * PTY env is built from a preserved shell snapshot resolved by the host-service
 * at startup — never from desktop main or the live host-service process.env.
 */

export { stripTerminalRuntimeEnv } from "./env-strip";
export type { ShellBootstrapParams, ShellLaunchParams } from "./shell-launch";
export {
	getShellBootstrapEnv,
	getShellLaunchArgs,
	getSupersetShellPaths,
	resolveLaunchShell,
} from "./shell-launch";

import fs from "node:fs";
import os from "node:os";
import {
	clearStrictShellEnvCache,
	getStrictShellEnvironment,
} from "./clean-shell-env";
import { stripTerminalRuntimeEnv } from "./env-strip";
import { getShellBootstrapEnv } from "./shell-launch";

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
 */
export async function resolveTerminalBaseEnv(): Promise<
	Record<string, string>
> {
	return getStrictShellEnvironment();
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
	hostServiceVersion: string;
	supersetEnv: "development" | "production";
	agentHookPort: string;
	agentHookVersion: string;
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
		hostServiceVersion,
		supersetEnv,
		agentHookPort,
		agentHookVersion,
	} = params;

	// Defense in depth — baseEnv is pre-stripped at init, but strip again
	// to guarantee no runtime keys reach PTYs regardless of call site
	const env = stripTerminalRuntimeEnv(baseEnv);

	Object.assign(env, getShellBootstrapEnv({ shell, baseEnv, supersetHomeDir }));

	env.TERM = "xterm-256color";
	// claude-code and similar chat TUIs only parse kitty CSI-u (e.g. Shift+Enter
	// → \x1b[13;2u) when TERM_PROGRAM ∈ {ghostty, kitty, iTerm.app, WezTerm,
	// WarpTerminal}. xterm.js already emits the right bytes — claim kitty so
	// they're parsed instead of submitted as plain Enter.
	env.TERM_PROGRAM = "kitty";
	env.TERM_PROGRAM_VERSION = hostServiceVersion;
	env.COLORTERM = "truecolor";
	env.COLORFGBG = themeType === "light" ? "0;15" : "15;0";
	env.LANG = normalizeUtf8Locale(baseEnv);
	env.PWD = cwd;

	env.SUPERSET_TERMINAL_ID = terminalId;
	env.SUPERSET_WORKSPACE_ID = workspaceId;
	env.SUPERSET_WORKSPACE_PATH = workspacePath;
	env.SUPERSET_ROOT_PATH = rootPath;
	env.SUPERSET_ENV = supersetEnv;
	env.SUPERSET_AGENT_HOOK_PORT = agentHookPort;
	env.SUPERSET_AGENT_HOOK_VERSION = agentHookVersion;

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
