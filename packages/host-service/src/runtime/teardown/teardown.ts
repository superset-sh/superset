import { randomUUID } from "node:crypto";
import { TEARDOWN_TIMEOUT_MS } from "@superset/shared/constants";
import type { HostDb } from "../../db";
import {
	createTerminalSessionInternal,
	disposeSession,
} from "../../terminal/terminal";
import { resolveScript, shellSingleQuote } from "../setup/config";

export { TEARDOWN_TIMEOUT_MS };

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
	/** Main repo path — source of truth for `.superset/config.json`. */
	repoPath: string;
	projectId: string;
	timeoutMs?: number;
	/** Override $HOME for tests. Defaults to `os.homedir()`. */
	homeDir?: string;
}

/**
 * Runs the workspace's teardown, reusing the same terminal primitive v2 uses
 * for interactive sessions. This gives it full environment parity with the
 * user's terminals (login shell rcfiles, PATH, nvm/rbenv, etc.), matching how
 * setup runs.
 *
 * The teardown to run is resolved by {@link resolveTeardownCommand}: the
 * configured `teardown` commands from `.superset/config.json` take precedence,
 * falling back to a `.superset/teardown.sh` script (worktree first, then main
 * repo). Skipped (as a success) when no source resolves to anything runnable.
 *
 * Silent by design — the PTY session is transient and not surfaced as a
 * visible pane. The renderer only sees the output tail on failure.
 */
export async function runTeardown({
	db,
	workspaceId,
	worktreePath,
	repoPath,
	projectId,
	timeoutMs = TEARDOWN_TIMEOUT_MS,
	homeDir,
}: RunTeardownOptions): Promise<TeardownResult> {
	const resolved = resolveTeardownCommand({
		repoPath,
		projectId,
		worktreePath,
		homeDir,
	});
	if (resolved === null) return { status: "skipped" };

	const terminalId = randomUUID();

	const session = await createTerminalSessionInternal({
		terminalId,
		workspaceId,
		db,
		initialCommand: resolved.initialCommand,
		...(resolved.cwd && { cwd: resolved.cwd }),
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

/**
 * Resolve the teardown command for a workspace, if any. Uses the shared
 * lifecycle-script posture (see `resolveScript`): configured `teardown`
 * commands — joined with ` && ` so a failing command short-circuits, worktree
 * config overriding the main repo's — then a `teardown.sh` script, worktree
 * first (state generated during the session must win) and main repo second
 * (gitignored scripts don't exist in worktrees).
 *
 * Returns null when no source resolves to anything runnable, which the
 * caller treats as a skipped (successful) teardown.
 *
 * Exported for tests.
 */
export function resolveTeardownCommand(args: {
	repoPath: string;
	projectId: string;
	worktreePath: string;
	/** Override $HOME for tests. */
	homeDir?: string;
}): { initialCommand: string; cwd?: string } | null {
	const resolved = resolveScript("teardown", args);
	if (!resolved) return null;

	const initialCommand =
		resolved.kind === "commands"
			? buildTeardownCommandFromShell(resolved.commands.join(" && "))
			: buildTeardownInitialCommand(resolved.scriptPath);
	return { initialCommand, ...(resolved.cwd && { cwd: resolved.cwd }) };
}

export function buildTeardownInitialCommand(scriptPath: string): string {
	// `exec` replaces the user's login shell with the teardown process. That
	// avoids shell-specific exit-status syntax like `$?`, which breaks in fish
	// and leaves the hidden teardown terminal open until timeout.
	return `exec bash ${shellSingleQuote(scriptPath)}`;
}

/**
 * Build the initial command for configured `teardown` commands. The joined
 * command runs via `bash -c` so multiple `&&`-chained entries execute in one
 * shell; `exec` still replaces the login shell so the hidden PTY exits with
 * the teardown status (and avoids fish `$?` breakage), matching the script
 * form above.
 */
export function buildTeardownCommandFromShell(shellCommand: string): string {
	return `exec bash -c ${shellSingleQuote(shellCommand)}`;
}
