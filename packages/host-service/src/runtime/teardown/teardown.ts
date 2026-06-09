import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { TEARDOWN_TIMEOUT_MS } from "@superset/shared/constants";
import { getKnownShell } from "@superset/shared/shell";
import type { HostDb } from "../../db";
import { getTerminalBaseEnv } from "../../terminal/env";
import { resolveLaunchShell } from "../../terminal/shell-launch";
import {
	createTerminalSessionInternal,
	disposeSession,
} from "../../terminal/terminal";

export { TEARDOWN_TIMEOUT_MS };

export const TEARDOWN_SCRIPT_REL_PATH = ".superset/teardown.sh";
export const PORTABLE_TEARDOWN_SCRIPT_REL_PATH = ".superset/teardown.ts";
export const WINDOWS_TEARDOWN_SCRIPT_REL_PATHS = [
	".superset/teardown.cmd",
	".superset/teardown.bat",
	".superset/teardown.ps1",
] as const;
const OUTPUT_TAIL_BYTES = 4096;
const KILL_GRACE_MS = 2_000;

export type TeardownResult =
	| { status: "ok"; output?: string }
	| { status: "skipped" }
	| {
			status: "failed";
			exitCode: number | null;
			/** Unix signal number, or null on normal exit. */
			signal: number | null;
			timedOut: boolean;
			/** Raw PTY bytes — shell output including ANSI. Renderer strips for display. */
			outputTail: string;
	  };

interface RunTeardownOptions {
	db: HostDb;
	workspaceId: string;
	worktreePath: string;
	timeoutMs?: number;
}

/**
 * Runs the workspace teardown script inside the workspace, reusing the same
 * terminal primitive v2 uses for interactive sessions. This gives the
 * script full environment parity with the user's terminals (login shell
 * rcfiles, PATH, nvm/rbenv, etc.), matching how setup runs.
 *
 * Silent by design — the PTY session is transient and not surfaced as a
 * visible pane. The renderer only sees the output tail on failure.
 */
export async function runTeardown({
	db,
	workspaceId,
	worktreePath,
	timeoutMs = TEARDOWN_TIMEOUT_MS,
}: RunTeardownOptions): Promise<TeardownResult> {
	const scriptPath = resolveTeardownScriptPath(worktreePath);
	if (!scriptPath) return { status: "skipped" };

	const terminalId = randomUUID();
	const shell = resolveTeardownShell();
	const initialCommand = buildTeardownInitialCommand(
		scriptPath,
		shell,
		process.platform,
	);

	const session = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db,
		initialCommand,
		listed: false,
	});
	if ("error" in session) {
		return {
			status: "failed",
			exitCode: null,
			signal: null,
			timedOut: false,
			outputTail: `Failed to start teardown session: ${session.error}`,
		};
	}

	let tail = "";
	const appendTail = (chunk: string) => {
		tail += chunk;
		if (tail.length > OUTPUT_TAIL_BYTES) {
			tail = tail.slice(-OUTPUT_TAIL_BYTES);
		}
	};
	const dataDisposer = session.pty.onData(appendTail);

	return new Promise<TeardownResult>((resolve) => {
		let settled = false;
		let timedOut = false;

		const settle = (result: TeardownResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				dataDisposer.dispose();
			} catch {
				// already disposed
			}
			disposeSession(terminalId, db);
			resolve(result);
		};

		session.pty.onExit(({ exitCode, signal }) => {
			if (exitCode === 0 && !timedOut) {
				settle({ status: "ok", output: tail || undefined });
				return;
			}
			settle({
				status: "failed",
				exitCode: exitCode ?? null,
				signal: signal ?? null,
				timedOut,
				outputTail: tail,
			});
		});

		const timer = setTimeout(() => {
			if (settled) return;
			timedOut = true;
			appendTail(`\n[teardown timed out after ${timeoutMs}ms]\n`);
			try {
				void session.pty.kill().catch(() => {});
			} catch {
				// PTY may already be dead
			}
			// Hard-stop: if onExit doesn't fire shortly after kill (zombie PTY),
			// settle the promise directly so workspaceCleanup.destroy never hangs.
			setTimeout(() => {
				settle({
					status: "failed",
					exitCode: null,
					signal: null,
					timedOut: true,
					outputTail: tail,
				});
			}, KILL_GRACE_MS).unref();
		}, timeoutMs);
		timer.unref();
	});
}

export function resolveTeardownScriptPath(
	worktreePath: string,
	platform: NodeJS.Platform = process.platform,
): string | null {
	const portableScript = join(worktreePath, PORTABLE_TEARDOWN_SCRIPT_REL_PATH);
	const shellScript = join(worktreePath, TEARDOWN_SCRIPT_REL_PATH);
	if (platform === "win32") {
		if (existsSync(portableScript)) return portableScript;
		for (const relPath of WINDOWS_TEARDOWN_SCRIPT_REL_PATHS) {
			const scriptPath = join(worktreePath, relPath);
			if (existsSync(scriptPath)) return scriptPath;
		}
	}
	if (existsSync(shellScript)) return shellScript;
	if (existsSync(portableScript)) return portableScript;
	return null;
}

export function buildTeardownInitialCommand(
	scriptPath: string,
	shell?: string,
	platform: NodeJS.Platform = process.platform,
): string {
	if (scriptPath.endsWith(".ts")) {
		const knownShell = shell ? getKnownShell(shell) : "unknown";
		if (knownShell === "cmd") {
			return `bun ${doubleQuote(scriptPath)} && exit /b 0 || exit /b 1`;
		}
		if (knownShell === "powershell" || knownShell === "pwsh") {
			return `bun ${powershellSingleQuote(scriptPath)}; exit $LASTEXITCODE`;
		}
		return `exec bun ${singleQuote(scriptPath)}`;
	}

	if (platform === "win32") {
		const knownShell = shell ? getKnownShell(shell) : "unknown";
		const lowerScriptPath = scriptPath.toLowerCase();
		if (lowerScriptPath.endsWith(".cmd") || lowerScriptPath.endsWith(".bat")) {
			if (knownShell === "powershell" || knownShell === "pwsh") {
				return `cmd.exe /d /s /c ${powershellSingleQuote(doubleQuote(scriptPath))}; exit $LASTEXITCODE`;
			}
			return `${doubleQuote(scriptPath)} && exit /b 0 || exit /b 1`;
		}
		if (lowerScriptPath.endsWith(".ps1")) {
			if (knownShell === "cmd" || knownShell === "unknown") {
				return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${doubleQuote(scriptPath)} && exit /b 0 || exit /b 1`;
			}
			return `powershell.exe -NoProfile -ExecutionPolicy Bypass -File ${powershellSingleQuote(scriptPath)}; exit $LASTEXITCODE`;
		}
	}

	// `exec` replaces the user's login shell with the teardown process. That
	// avoids shell-specific exit-status syntax like `$?`, which breaks in fish
	// and leaves the hidden teardown terminal open until timeout.
	return `exec bash ${singleQuote(scriptPath)}`;
}

/** POSIX single-quote escape: safe for any byte sequence in a path. */
function singleQuote(s: string): string {
	return `'${s.replaceAll("'", "'\\''")}'`;
}

function powershellSingleQuote(s: string): string {
	return `'${s.replaceAll("'", "''")}'`;
}

function doubleQuote(s: string): string {
	return `"${s.replaceAll('"', '\\"')}"`;
}

function resolveTeardownShell(): string | undefined {
	try {
		return resolveLaunchShell(getTerminalBaseEnv());
	} catch {
		return undefined;
	}
}
