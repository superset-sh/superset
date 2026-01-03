import fs from "node:fs/promises";
import path from "node:path";
import { projects, workspaces, worktrees } from "@superset/local-db";
import { observable } from "@trpc/server/observable";
import { eq } from "drizzle-orm";
import { localDb } from "main/lib/local-db";
import { terminalManager } from "main/lib/terminal";
import { z } from "zod";
import { publicProcedure, router } from "../..";
import { assertWorkspaceUsable } from "../workspaces/utils/usability";
import { getWorkspacePath } from "../workspaces/utils/worktree";
import { resolveCwd } from "./utils";

/**
 * Terminal router using TerminalManager with node-pty
 * Sessions are keyed by paneId and linked to workspaces for cwd resolution
 *
 * Environment variables set for terminal sessions:
 * - PATH: Prepends ~/.superset/bin so wrapper scripts intercept agent commands
 * - SUPERSET_PANE_ID: The pane ID (used by notification hooks, session key)
 * - SUPERSET_TAB_ID: The tab ID (parent of pane, used by notification hooks)
 * - SUPERSET_WORKSPACE_ID: The workspace ID (used by notification hooks)
 * - SUPERSET_WORKSPACE_NAME: The workspace name (used by setup/teardown scripts)
 * - SUPERSET_WORKSPACE_PATH: The worktree path (used by setup/teardown scripts)
 * - SUPERSET_ROOT_PATH: The main repo path (used by setup/teardown scripts)
 * - SUPERSET_PORT: The hooks server port for agent completion notifications
 */
export const createTerminalRouter = () => {
	return router({
		createOrAttach: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					tabId: z.string(),
					workspaceId: z.string(),
					cols: z.number().optional(),
					rows: z.number().optional(),
					cwd: z.string().optional(),
					initialCommands: z.array(z.string()).optional(),
				}),
			)
			.mutation(async ({ input }) => {
				const {
					paneId,
					tabId,
					workspaceId,
					cols,
					rows,
					cwd: cwdOverride,
					initialCommands,
				} = input;

				// Resolve cwd: absolute paths stay as-is, relative paths resolve against workspace path
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, workspaceId))
					.get();
				const workspacePath = workspace
					? (getWorkspacePath(workspace) ?? undefined)
					: undefined;

				// Guard: For worktree workspaces, ensure the workspace is ready
				// (not still initializing or failed). Branch workspaces use the main
				// repo path which always exists, so no guard needed.
				if (workspace?.type === "worktree") {
					assertWorkspaceUsable(workspaceId, workspacePath);
				}

				const cwd = resolveCwd(cwdOverride, workspacePath);

				// Get project info for environment variables
				const project = workspace
					? localDb
							.select()
							.from(projects)
							.where(eq(projects.id, workspace.projectId))
							.get()
					: undefined;

				const result = await terminalManager.createOrAttach({
					paneId,
					tabId,
					workspaceId,
					workspaceName: workspace?.name,
					workspacePath,
					rootPath: project?.mainRepoPath,
					cwd,
					cols,
					rows,
					initialCommands,
				});

				return {
					paneId,
					isNew: result.isNew,
					scrollback: result.scrollback,
					wasRecovered: result.wasRecovered,
				};
			}),

		write: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					data: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.write(input);
			}),

		resize: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					cols: z.number(),
					rows: z.number(),
					seq: z.number().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.resize(input);
			}),

		signal: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					signal: z.string().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.signal(input);
			}),

		kill: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
					deleteHistory: z.boolean().optional(),
				}),
			)
			.mutation(async ({ input }) => {
				await terminalManager.kill(input);
			}),

		/**
		 * Detach from terminal (keep session alive)
		 */
		detach: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				terminalManager.detach(input);
			}),

		/**
		 * Clear scrollback buffer for terminal (used by Cmd+K / clear command)
		 * This clears both in-memory scrollback and persistent history file
		 */
		clearScrollback: publicProcedure
			.input(
				z.object({
					paneId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				await terminalManager.clearScrollback(input);
			}),

		getSession: publicProcedure
			.input(z.string())
			.query(async ({ input: paneId }) => {
				return terminalManager.getSession(paneId);
			}),

		/**
		 * Get the current working directory for a workspace
		 * This is used for resolving relative file paths in terminal output
		 */
		getWorkspaceCwd: publicProcedure
			.input(z.string())
			.query(({ input: workspaceId }) => {
				const workspace = localDb
					.select()
					.from(workspaces)
					.where(eq(workspaces.id, workspaceId))
					.get();
				if (!workspace) {
					return undefined;
				}

				if (!workspace.worktreeId) {
					return undefined;
				}

				const worktree = localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.id, workspace.worktreeId))
					.get();
				return worktree?.path;
			}),

		/**
		 * List directory contents for navigation
		 * Returns directories and files in the specified path
		 */
		listDirectory: publicProcedure
			.input(
				z.object({
					dirPath: z.string(),
				}),
			)
			.query(async ({ input }) => {
				const { dirPath } = input;

				try {
					const entries = await fs.readdir(dirPath, { withFileTypes: true });

					const items = entries
						.filter((entry) => !entry.name.startsWith("."))
						.map((entry) => ({
							name: entry.name,
							path: path.join(dirPath, entry.name),
							isDirectory: entry.isDirectory(),
						}))
						.sort((a, b) => {
							// Directories first, then alphabetical
							if (a.isDirectory && !b.isDirectory) return -1;
							if (!a.isDirectory && b.isDirectory) return 1;
							return a.name.localeCompare(b.name);
						});

					// Get parent directory
					const parentPath = path.dirname(dirPath);
					const hasParent = parentPath !== dirPath;

					return {
						currentPath: dirPath,
						parentPath: hasParent ? parentPath : null,
						items,
					};
				} catch {
					return {
						currentPath: dirPath,
						parentPath: null,
						items: [],
						error: "Unable to read directory",
					};
				}
			}),

		stream: publicProcedure
			.input(z.string())
			.subscription(({ input: paneId }) => {
				return observable<
					| { type: "data"; data: string }
					| { type: "exit"; exitCode: number; signal?: number }
				>((emit) => {
					const onData = (data: string) => {
						emit.next({ type: "data", data });
					};

					const onExit = (exitCode: number, signal?: number) => {
						emit.next({ type: "exit", exitCode, signal });
						emit.complete();
					};

					terminalManager.on(`data:${paneId}`, onData);
					terminalManager.on(`exit:${paneId}`, onExit);

					// Cleanup on unsubscribe
					return () => {
						terminalManager.off(`data:${paneId}`, onData);
						terminalManager.off(`exit:${paneId}`, onExit);
					};
				});
			}),
	});
};
