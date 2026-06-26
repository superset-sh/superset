import { execFile } from "node:child_process";
import { z } from "zod";
import { publicProcedure, router } from "../../..";
import { resolveGatedWorkspaceCardConfig } from "../../config/workspace-card-trust";
import { getWorkspace } from "../utils/db-helpers";
import { getWorkspacePath } from "../utils/worktree";

const COMMAND_TIMEOUT_MS = 5_000;
const OUTPUT_MAX_CHARS = 200;
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
	at: number;
	value: CardLineResult;
}

export interface CardLineResult {
	output: string | null;
	error: string | null;
}

export interface WidgetCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number | null;
	error: string | null;
}

// Dampens refetch storms: many card mounts can ask for the same line.
const cache = new Map<string, CacheEntry>();

function runCommand(command: string, cwd: string): Promise<CardLineResult> {
	return new Promise((resolve) => {
		execFile(
			"/bin/sh",
			["-c", command],
			{ cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 64 * 1024 },
			(error, stdout, stderr) => {
				if (error) {
					resolve({
						output: null,
						error: (stderr || error.message).slice(0, OUTPUT_MAX_CHARS),
					});
					return;
				}
				const firstLine = stdout.split("\n").find((line) => line.trim());
				resolve({
					output: (firstLine ?? "").trim().slice(0, OUTPUT_MAX_CHARS),
					error: null,
				});
			},
		);
	});
}

/**
 * Full one-shot runner for widget click actions: returns trimmed stdout/stderr
 * plus the exit code. Same shell, cwd, timeout, and buffer cap as the card-line
 * poll runner — widgets get no more reach than command lines do.
 */
function runWidgetShellCommand(
	command: string,
	cwd: string,
): Promise<WidgetCommandResult> {
	return new Promise((resolve) => {
		execFile(
			"/bin/sh",
			["-c", command],
			{ cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 64 * 1024 },
			(error, stdout, stderr) => {
				const code =
					error && typeof error.code === "number" ? error.code : error ? 1 : 0;
				resolve({
					stdout: stdout.trim().slice(0, OUTPUT_MAX_CHARS),
					stderr: stderr.trim().slice(0, OUTPUT_MAX_CHARS),
					exitCode: code,
					error: error ? error.message.slice(0, OUTPUT_MAX_CHARS) : null,
				});
			},
		);
	});
}

/**
 * Verifies that `lineId` names an enabled WIDGET line in the workspace
 * project's currently-TRUSTED gated config, and resolves the workspace cwd.
 * Returns null (a failure shape) when the workspace is missing, the line isn't
 * a trusted widget line, or the cwd can't be resolved. The trust hash covers
 * widget file contents, so commands issued by trusted widget code are as
 * trusted as command lines — but they still must originate from a widget line
 * that actually exists in the trusted config.
 */
function resolveTrustedWidgetCwd(
	workspaceId: string,
	lineId: string,
): { cwd: string } | { error: string } {
	const workspace = getWorkspace(workspaceId);
	if (!workspace) {
		return { error: "Workspace folder not found" };
	}
	const config = resolveGatedWorkspaceCardConfig(workspace.projectId);
	const line = config.customLines.find(
		(l) => l.id === lineId && l.type === "widget" && l.enabled,
	);
	if (!line || line.type !== "widget") {
		return { error: "Unknown or untrusted widget line" };
	}
	const cwd = getWorkspacePath(workspace);
	if (!cwd) {
		return { error: "Workspace folder not found" };
	}
	return { cwd };
}

/**
 * Runs a user-defined card-line command in the workspace folder and returns
 * the first line of output. The command is resolved by lineId from the
 * project's gated config -- the renderer never sends a raw command string.
 * Results cache briefly per (workspace, lineId).
 *
 * Widget commands are different: a trusted widget's TSX may issue arbitrary
 * shell commands (the command string IS part of the trusted, hash-covered
 * widget source), so getWidgetCommandOutput / runWidgetCommand accept a command
 * string but gate on the lineId being a trusted widget line for the workspace.
 */
export const createCardLinesProcedures = () => {
	return router({
		getCardLineOutput: publicProcedure
			.input(z.object({ workspaceId: z.string(), lineId: z.string() }))
			.query(async ({ input }): Promise<CardLineResult> => {
				const key = `${input.workspaceId} ${input.lineId}`;
				const cached = cache.get(key);
				if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
					return cached.value;
				}

				const workspace = getWorkspace(input.workspaceId);
				if (!workspace) {
					return { output: null, error: "Workspace folder not found" };
				}

				// Resolve command from the gated config -- untrusted repo command
				// lines are absent, so unknown lineId means "not permitted here".
				const config = resolveGatedWorkspaceCardConfig(workspace.projectId);
				const line = config.customLines.find(
					(l) => l.id === input.lineId && l.type === "command" && l.enabled,
				);
				if (!line || line.type !== "command") {
					return { output: null, error: "Unknown card line" };
				}

				const cwd = getWorkspacePath(workspace);
				if (!cwd) {
					return { output: null, error: "Workspace folder not found" };
				}

				const value = await runCommand(line.command, cwd);
				cache.set(key, { at: Date.now(), value });
				return value;
			}),

		// Poll-style command output for a trusted widget. The widget's TSX picks
		// the command string; the server only verifies the lineId is a trusted
		// widget line for this workspace, then runs it (same shell/timeout/cache
		// as command lines). Returns the first non-empty stdout line.
		getWidgetCommandOutput: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					lineId: z.string(),
					command: z.string(),
				}),
			)
			.query(async ({ input }): Promise<CardLineResult> => {
				const key = `widget ${input.workspaceId} ${input.lineId} ${input.command}`;
				const cached = cache.get(key);
				if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
					return cached.value;
				}

				const resolved = resolveTrustedWidgetCwd(
					input.workspaceId,
					input.lineId,
				);
				if ("error" in resolved) {
					return { output: null, error: resolved.error };
				}

				const value = await runCommand(input.command, resolved.cwd);
				cache.set(key, { at: Date.now(), value });
				return value;
			}),

		// One-shot command for a widget click action. Bypasses the cache (each
		// click should re-run) and returns full stdout/stderr + exit code so the
		// widget can surface success/failure. Gated identically to the poll query.
		runWidgetCommand: publicProcedure
			.input(
				z.object({
					workspaceId: z.string(),
					lineId: z.string(),
					command: z.string(),
				}),
			)
			.mutation(async ({ input }): Promise<WidgetCommandResult> => {
				const resolved = resolveTrustedWidgetCwd(
					input.workspaceId,
					input.lineId,
				);
				if ("error" in resolved) {
					return {
						stdout: "",
						stderr: "",
						exitCode: null,
						error: resolved.error,
					};
				}
				return runWidgetShellCommand(input.command, resolved.cwd);
			}),
	});
};
