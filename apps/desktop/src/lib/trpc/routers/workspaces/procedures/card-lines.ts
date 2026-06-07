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
 * Runs a user-defined card-line command in the workspace folder and returns
 * the first line of output. The command is resolved by lineId from the
 * project's gated config -- the renderer never sends a raw command string.
 * Results cache briefly per (workspace, lineId).
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
	});
};
